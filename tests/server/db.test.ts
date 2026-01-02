import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { defineSchema } from '../../src/schema/define-schema.ts';
import { defineTable } from '../../src/schema/define-table.ts';
import { createDb } from '../../src/server.ts';
import { encodeId } from '../../src/schema/ids.ts';
import { TEST_UUID } from '../utils.ts';

const schema = defineSchema({
  users: defineTable({
    name: z.string(),
    age: z.number(),
  }).index('by_name', ['name']),
});

function createRunner(result: unknown[] | { rows: unknown[] }) {
  const calls: unknown[] = [];
  const runner = {
    execute: async (query: unknown) => {
      calls.push(query);
      return result;
    },
  };
  return { runner, calls };
}

describe('createDb', () => {
  it('inserts rows and encodes ids', async () => {
    const { runner, calls } = createRunner({ rows: [{ id: TEST_UUID }] });
    const db = createDb(runner, schema);

    const id = await db.insert('users', { name: 'Ada', age: 32 });

    expect(id).toBe(`users:${TEST_UUID}`);
    expect(calls).toHaveLength(1);
  });

  it('validates insert input', async () => {
    const { runner, calls } = createRunner({ rows: [{ id: TEST_UUID }] });
    const db = createDb(runner, schema);

    await expect(db.insert('users', { name: 'Ada', age: 'old' as any })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('gets rows by table and id', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }] });
    const db = createDb(runner, schema);

    const row = await db.get('users', encodeId('users', TEST_UUID));

    expect(row).toEqual({ id: `users:${TEST_UUID}`, name: 'Ada', age: 32 });
  });

  it('gets rows by id only', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }] });
    const db = createDb(runner, schema);

    const row = await db.get(encodeId('users', TEST_UUID));

    expect(row).toEqual({ id: `users:${TEST_UUID}`, name: 'Ada', age: 32 });
  });

  it('rejects mismatched ids', async () => {
    const { runner, calls } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }] });
    const db = createDb(runner, schema);

    await expect(db.get('users', `projects:${TEST_UUID}` as any)).rejects.toThrow(
      'id belongs to "projects", not "users"',
    );
    expect(calls).toHaveLength(0);
  });

  it('rejects invalid id formats', async () => {
    const { runner, calls } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }] });
    const db = createDb(runner, schema);

    await expect(db.get('users', 'users:not-a-uuid' as any)).rejects.toThrow('Invalid id format');
    expect(calls).toHaveLength(0);
  });

  it('patches rows and returns updated data', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 33 } }] });
    const db = createDb(runner, schema);

    const row = await db.patch('users', encodeId('users', TEST_UUID), { age: 33 });

    expect(row).toEqual({ id: `users:${TEST_UUID}`, name: 'Ada', age: 33 });
  });

  it('collects query results with encoded ids', async () => {
    const { runner } = createRunner([
      { id: TEST_UUID, data: { name: 'Ada', age: 32 } },
      { id: TEST_UUID, data: { name: 'Ada', age: 33 } },
    ]);
    const db = createDb(runner, schema);

    const rows = await db.query('users').collect();

    expect(rows).toEqual([
      { id: `users:${TEST_UUID}`, name: 'Ada', age: 32 },
      { id: `users:${TEST_UUID}`, name: 'Ada', age: 33 },
    ]);
  });

  it('returns null for empty first() results', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const row = await db.query('users').first();

    expect(row).toBeNull();
  });

  it('rejects unknown indexes and fields', () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    expect(() => db.query('users').withIndex('by_age' as any, () => undefined)).toThrow('Unknown index "by_age"');
    expect(() => db.query('users').withIndex('by_name', (q) => q.eq('age' as any, 1))).toThrow(
      'Field "age" is not part of index "by_name"',
    );
    expect(() => db.query('users').order('asc', 'unknown' as any)).toThrow('Unknown field "unknown"');
  });

  it('executes raw queries', async () => {
    const { runner, calls } = createRunner({ rows: [{ total: 2 }] });
    const db = createDb(runner, schema);

    const rows = await db.raw<{ total: number }>(sql`select 2 as total`);

    expect(rows).toEqual([{ total: 2 }]);
    expect(calls).toHaveLength(1);
  });
});
