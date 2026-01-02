import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNodeHandler } from '../../src/node.ts';
import { convoyError } from '../../src/errors.ts';
import { createContext, mutation, query } from '../../src/server.ts';

type MockResponse = ServerResponse & {
  body: string;
  headers: Record<string, string>;
  ended: boolean;
};

function createResponse(): MockResponse {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(key: string, value: string) {
      res.headers[key] = String(value);
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        res.body += String(chunk);
      }
      res.ended = true;
    },
  } as unknown as MockResponse;
  return res;
}

function createRequest(options: { method: string; url: string; body?: string; headers?: Record<string, string> }) {
  const req = new EventEmitter() as unknown as IncomingMessage;
  req.method = options.method;
  req.url = options.url;
  req.headers = { host: 'localhost', ...options.headers };
  (req as any).destroy = vi.fn();

  const send = () => {
    if (options.body !== undefined) {
      req.emit('data', Buffer.from(options.body));
    }
    req.emit('end');
  };

  return { req, send };
}

function createTestContext<TExtra extends Record<string, unknown>>(extra?: TExtra) {
  const ctx = createContext({});
  if (extra) {
    Object.assign(ctx as Record<string, unknown>, extra);
  }
  return ctx as typeof ctx & TExtra;
}

describe('createNodeHandler', () => {
  it('returns false for unrelated paths', async () => {
    const handler = createNodeHandler({
      queries: {},
      mutations: {},
      context: createTestContext(),
    });
    const { req } = createRequest({ method: 'GET', url: '/health' });
    const res = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(false);
  });

  it('handles query requests', async () => {
    const handler = createNodeHandler({
      queries: {
        hello: query({
          input: { name: z.string() },
          handler: (_ctx, input) => `hi ${input.name}`,
        }),
      },
      mutations: {},
      context: createTestContext(),
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/hello',
      body: JSON.stringify({ name: 'Ada' }),
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: 'hi Ada' });
  });

  it('handles mutation requests and notifies', async () => {
    const onMutation = vi.fn();
    const handler = createNodeHandler({
      queries: {},
      mutations: {
        inc: mutation({
          input: { count: z.number() },
          handler: (_ctx, input) => input.count + 1,
        }),
      },
      context: createTestContext({ marker: 'ctx' }),
      onMutation,
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/mutation/inc',
      body: JSON.stringify({ count: 2 }),
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: 3 });
    expect(onMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'inc',
        input: { count: 2 },
        result: 3,
        context: expect.objectContaining({ marker: 'ctx' }),
      }),
    );
  });

  it('resolves auth context once per request', async () => {
    const createContext = vi.fn().mockResolvedValue(createTestContext({ userId: 'user-1' }));
    const handler = createNodeHandler({
      queries: {
        whoami: query({
          input: {},
          handler: (ctx) => (ctx as { userId: string }).userId,
        }),
      },
      mutations: {},
      createContext,
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/whoami',
      body: JSON.stringify({}),
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledWith(req);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: 'user-1' });
  });

  it('rejects invalid json bodies', async () => {
    const handler = createNodeHandler({
      queries: {
        hello: query({
          input: { name: z.string() },
          handler: (_ctx, input) => `hi ${input.name}`,
        }),
      },
      mutations: {},
      context: createTestContext(),
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/hello',
      body: '{',
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(payload.error).toEqual(
      expect.objectContaining({
        code: 'INVALID_ARGS',
      }),
    );
  });

  it('rejects bodies over max size', async () => {
    const handler = createNodeHandler({
      queries: {
        hello: query({
          input: { name: z.string() },
          handler: (_ctx, input) => `hi ${input.name}`,
        }),
      },
      mutations: {},
      context: createTestContext(),
      maxBodySize: 4,
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/hello',
      body: '12345',
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    });
    expect((req as any).destroy).toHaveBeenCalled();
  });

  it('routes subscribe requests', async () => {
    const onSubscribe = vi.fn();
    const handler = createNodeHandler({
      queries: {},
      mutations: {},
      context: createTestContext(),
      onSubscribe,
    });
    const { req } = createRequest({
      method: 'GET',
      url: '/api/subscribe',
    });
    const res = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(onSubscribe).toHaveBeenCalledWith(req, res);
  });

  it('rejects non-GET subscribe requests', async () => {
    const onSubscribe = vi.fn();
    const handler = createNodeHandler({
      queries: {},
      mutations: {},
      context: createTestContext(),
      onSubscribe,
    });
    const { req } = createRequest({
      method: 'POST',
      url: '/api/subscribe',
    });
    const res = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET supported' },
    });
  });

  it('maps ConvoyError to structured responses', async () => {
    const handler = createNodeHandler({
      queries: {
        secret: query({
          input: {},
          handler: () => {
            throw convoyError('UNAUTHORIZED', 'Missing token');
          },
        }),
      },
      mutations: {},
      context: createTestContext(),
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/secret',
      body: JSON.stringify({}),
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing token' },
    });
  });

  it('maps invalid query input to INVALID_ARGS', async () => {
    const handler = createNodeHandler({
      queries: {
        hello: query({
          input: { name: z.string() },
          handler: (_ctx, input) => `hi ${input.name}`,
        }),
      },
      mutations: {},
      context: createTestContext(),
    });
    const { req, send } = createRequest({
      method: 'POST',
      url: '/api/query/hello',
      body: JSON.stringify({ name: 123 }),
    });
    const res = createResponse();

    const handledPromise = handler(req, res);
    send();
    const handled = await handledPromise;

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_ARGS' }),
    });
  });
});
