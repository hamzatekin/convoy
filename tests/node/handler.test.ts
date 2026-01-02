import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNodeHandler } from '../../src/node.ts';
import { mutation, query } from '../../src/server.ts';

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
  const req = new EventEmitter() as IncomingMessage;
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

describe('createNodeHandler', () => {
  it('returns false for unrelated paths', async () => {
    const handler = createNodeHandler({
      queries: {},
      mutations: {},
      context: {},
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
      context: {},
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
      context: { marker: 'ctx' },
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
        context: { marker: 'ctx' },
      }),
    );
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
      context: {},
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
    expect(payload.error).toBeTruthy();
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
      context: {},
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
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'Request body too large' });
    expect((req as any).destroy).toHaveBeenCalled();
  });

  it('routes subscribe requests', async () => {
    const onSubscribe = vi.fn();
    const handler = createNodeHandler({
      queries: {},
      mutations: {},
      context: {},
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
      context: {},
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
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'Only GET supported' });
  });
});
