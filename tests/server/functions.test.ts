import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createContext, createFunctionHelpers, mutation, query } from '../../src/server.ts';

describe('server functions', () => {
  it('parses query input and returns handler result', async () => {
    const fn = query({
      input: { count: z.number() },
      handler: (_ctx, input) => input.count + 1,
    });

    const ctx = createContext({});
    await expect(fn.run(ctx, { count: 2 })).resolves.toBe(3);
    await expect(fn.run(ctx, { count: '2' })).rejects.toThrow();
  });

  it('parses mutation input and returns handler result', async () => {
    const fn = mutation({
      input: { name: z.string() },
      handler: (_ctx, input) => input.name.toUpperCase(),
    });

    const ctx = createContext({});
    await expect(fn.run(ctx, { name: 'alpha' })).resolves.toBe('ALPHA');
    await expect(fn.run(ctx, { name: 123 })).rejects.toThrow();
  });

  it('createContext enforces query/mutation kinds', async () => {
    const ctx = createContext({ flag: true });
    const q = query({
      input: { value: z.number() },
      handler: (context, input) => (context.db.flag ? input.value : 0),
    });
    const m = mutation({
      input: { value: z.number() },
      handler: (_ctx, input) => input.value + 1,
    });

    await expect(ctx.runQuery(q, { value: 5 })).resolves.toBe(5);
    await expect(ctx.runMutation(m, { value: 5 })).resolves.toBe(6);
    await expect(ctx.runQuery(m as any, { value: 1 })).rejects.toThrow('runQuery expects a query function');
    await expect(ctx.runMutation(q as any, { value: 1 })).rejects.toThrow('runMutation expects a mutation function');
  });

  it('createFunctionHelpers returns correctly typed helpers', () => {
    const helpers = createFunctionHelpers<{ db: { id: string } }>();
    const q = helpers.query({
      input: { id: z.string() },
      handler: (_ctx, input) => input.id,
    });
    const m = helpers.mutation({
      input: { id: z.string() },
      handler: (_ctx, input) => input.id,
    });

    expect(q.kind).toBe('query');
    expect(m.kind).toBe('mutation');
  });
});
