import { describe, expect, it } from 'vitest';
import { createConvoyClient, makeMutationRef, makeQueryRef } from '../src/client.ts';

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function createFetchMock(payload: unknown, ok = true) {
  const calls: FetchCall[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return {
      ok,
      json: async () => payload,
    };
  }) as typeof fetch;
  return { calls, fetchMock };
}

describe('createConvoyClient', () => {
  it('calls query endpoint with normalized baseUrl', async () => {
    const { calls, fetchMock } = createFetchMock({ ok: true, data: 'ok' });
    const client = createConvoyClient({
      baseUrl: 'http://example.com/',
      fetch: fetchMock,
    });
    const ref = makeQueryRef(
      'users.list',
      null as unknown as { handler: (ctx: unknown, args: { id: string }) => string },
    );

    const result = await client.query(ref, { id: '1' });

    expect(result).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('http://example.com/api/query/users.list');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(calls[0].init?.body).toBe(JSON.stringify({ id: '1' }));
  });

  it('calls mutation endpoint', async () => {
    const { calls, fetchMock } = createFetchMock({ ok: true, data: { id: 'm1' } });
    const client = createConvoyClient({
      baseUrl: 'http://example.com',
      fetch: fetchMock,
    });
    const ref = makeMutationRef(
      'projects.create',
      null as unknown as { handler: (ctx: unknown, args: { name: string }) => { id: string } },
    );

    const result = await client.mutation(ref, { name: 'Roadmap' });

    expect(result).toEqual({ id: 'm1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('http://example.com/api/mutation/projects.create');
  });

  it('throws when the response is not ok', async () => {
    const { fetchMock } = createFetchMock({ ok: false, error: 'Nope' }, false);
    const client = createConvoyClient({ fetch: fetchMock });
    const ref = makeQueryRef('users.list', null as unknown as { handler: (ctx: unknown, args: {}) => string });

    await expect(client.query(ref, {})).rejects.toThrow('Nope');
  });
});
