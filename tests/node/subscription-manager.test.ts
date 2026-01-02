import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createQuerySubscriptionManager } from '../../src/node.ts';
import { createContext, query } from '../../src/server.ts';

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
      context: createContext({}),
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
});
