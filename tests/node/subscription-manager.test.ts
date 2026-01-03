import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createQuerySubscriptionManager } from '../../src/node.ts';
import { createBaseContext, query } from '../../src/server.ts';

type MockResponse = ServerResponse & {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writableEnded: boolean;
  destroyed: boolean;
  writeHead: ServerResponse['writeHead'];
  write: ServerResponse['write'];
  end: ServerResponse['end'];
};

function createResponse(): MockResponse {
  const res = new EventEmitter() as unknown as MockResponse;
  res.statusCode = 200;
  res.headers = {};
  res.body = '';
  res.writableEnded = false;
  res.destroyed = false;
  res.writeHead = ((statusCode, headers) => {
    res.statusCode = statusCode;
    if (headers) {
      res.headers = { ...res.headers, ...headers };
    }
    return res;
  }) as MockResponse['writeHead'];
  res.write = ((chunk) => {
    res.body += String(chunk ?? '');
    return true;
  }) as MockResponse['write'];
  res.end = ((chunk) => {
    if (chunk !== undefined) {
      res.body += String(chunk);
    }
    res.writableEnded = true;
    res.emit('close');
    return res;
  }) as MockResponse['end'];
  return res;
}

function createRequest(url: string): IncomingMessage {
  return {
    url,
    headers: { host: 'localhost' },
  } as IncomingMessage;
}

describe('createQuerySubscriptionManager', () => {
  it('enforces max concurrent subscriptions', () => {
    const manager = createQuerySubscriptionManager({
      queries: {
        'users.list': query({
          input: { id: z.string() },
          handler: () => 'ok',
        }),
      },
      context: createBaseContext({}),
      maxSubscriptions: 1,
      heartbeatMs: 0,
    });

    const args = encodeURIComponent(JSON.stringify({ id: '1' }));
    const url = `/api/subscribe?name=users.list&args=${args}`;

    const res1 = createResponse();
    manager.subscribe(createRequest(url), res1);

    const res2 = createResponse();
    manager.subscribe(createRequest(url), res2);

    expect(res2.statusCode).toBe(429);
    expect(res2.body).toContain('Too many subscriptions');

    res1.end();
  });

  it('resolves auth context once per subscription', async () => {
    type AuthContext = { token: string };
    const createContext = vi.fn().mockResolvedValue({ token: 'auth-token' } satisfies AuthContext);
    const manager = createQuerySubscriptionManager<AuthContext>({
      queries: {
        'auth.me': query<AuthContext>({
          input: {},
          handler: (ctx) => ctx.token,
        }),
      },
      createContext,
      maxSubscriptions: 2,
      heartbeatMs: 0,
    });

    const url = `/api/subscribe?name=auth.me&args=${encodeURIComponent(JSON.stringify({}))}`;
    const res = createResponse();
    manager.subscribe(createRequest(url), res);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createContext).toHaveBeenCalledTimes(1);

    manager.refreshAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createContext).toHaveBeenCalledTimes(1);

    const dataLines = res.body
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length));
    const lastPayload = dataLines[dataLines.length - 1];
    expect(lastPayload).toBeTruthy();
    const parsed = JSON.parse(lastPayload);
    expect(parsed.data).toBe('auth-token');
  });
});
