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

  it('supports limit and offset for pagination', async () => {
    const { runner } = createRunner([{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }]);
    const db = createDb(runner, schema);

    // Verify chaining works and returns results
    const rows = await db.query('users').limit(10).offset(20).collect();

    expect(rows).toEqual([{ id: `users:${TEST_UUID}`, name: 'Ada', age: 32 }]);
  });

  it('executes raw queries', async () => {
    const { runner, calls } = createRunner({ rows: [{ total: 2 }] });
    const db = createDb(runner, schema);

    const rows = await db.raw<{ total: number }>(sql`select 2 as total`);

    expect(rows).toEqual([{ total: 2 }]);
    expect(calls).toHaveLength(1);
  });

  it('deletes rows by table and id', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID }] });
    const db = createDb(runner, schema);

    const result = await db.delete('users', encodeId('users', TEST_UUID));

    expect(result).toBe(true);
  });

  it('deletes rows by id only', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID }] });
    const db = createDb(runner, schema);

    const result = await db.delete(encodeId('users', TEST_UUID));

    expect(result).toBe(true);
  });

  it('returns false when deleting non-existent row', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const result = await db.delete('users', encodeId('users', TEST_UUID));

    expect(result).toBe(false);
  });

  it('executes operations in a transaction', async () => {
    const txCalls: unknown[] = [];
    const txRunner = {
      execute: async (query: unknown) => {
        txCalls.push(query);
        return { rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }] };
      },
    };
    const runner = {
      execute: async () => ({ rows: [] }),
      transaction: async <T>(fn: (tx: typeof txRunner) => Promise<T>) => fn(txRunner),
    };
    const db = createDb(runner, schema);

    const result = await db.transaction(async (tx) => {
      const user = await tx.get('users', encodeId('users', TEST_UUID));
      return user;
    });

    expect(result).toEqual({ id: `users:${TEST_UUID}`, name: 'Ada', age: 32 });
    expect(txCalls).toHaveLength(1);
  });

  it('throws when transaction is not supported', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(db.transaction(async () => undefined)).rejects.toThrow(
      'Transaction not supported by this database runner',
    );
  });

  it('inserts multiple rows with insertMany', async () => {
    const { runner } = createRunner({
      rows: [{ id: TEST_UUID }, { id: TEST_UUID }],
    });
    const db = createDb(runner, schema);

    const ids = await db.insertMany('users', [
      { name: 'Ada', age: 32 },
      { name: 'Bob', age: 25 },
    ]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(`users:${TEST_UUID}`);
  });

  it('returns empty array for empty insertMany', async () => {
    const { runner, calls } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const ids = await db.insertMany('users', []);

    expect(ids).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('deletes multiple rows with deleteMany', async () => {
    const { runner } = createRunner({
      rows: [{ id: TEST_UUID }, { id: TEST_UUID }],
    });
    const db = createDb(runner, schema);

    const count = await db.deleteMany('users', [encodeId('users', TEST_UUID), encodeId('users', TEST_UUID)]);

    expect(count).toBe(2);
  });

  it('returns 0 for empty deleteMany', async () => {
    const { runner, calls } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const count = await db.deleteMany('users', []);

    expect(count).toBe(0);
    expect(calls).toHaveLength(0);
  });

  // === Edge Case Tests ===

  it('returns null when get finds no row', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const row = await db.get('users', encodeId('users', TEST_UUID));

    expect(row).toBeNull();
  });

  it('returns null when patch finds no row', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const row = await db.patch('users', encodeId('users', TEST_UUID), { age: 99 });

    expect(row).toBeNull();
  });

  it('patches rows by id only', async () => {
    const { runner } = createRunner({ rows: [{ id: TEST_UUID, data: { name: 'Ada', age: 33 } }] });
    const db = createDb(runner, schema);

    const row = await db.patch(encodeId('users', TEST_UUID), { age: 33 });

    expect(row).toEqual({ id: `users:${TEST_UUID}`, name: 'Ada', age: 33 });
  });

  it('rejects patch with mismatched table id', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(db.patch('users', `projects:${TEST_UUID}` as any, { age: 1 })).rejects.toThrow(
      'id belongs to "projects", not "users"',
    );
  });

  it('validates partial patch data', async () => {
    const { runner, calls } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    // Valid partial should not throw (age is valid number)
    await db.patch('users', encodeId('users', TEST_UUID), { age: 50 });
    expect(calls).toHaveLength(1);
  });

  it('rejects delete with mismatched table id', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(db.delete('users', `projects:${TEST_UUID}` as any)).rejects.toThrow(
      'id belongs to "projects", not "users"',
    );
  });

  it('returns false when delete finds no row', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    const result = await db.delete('users', encodeId('users', TEST_UUID));

    expect(result).toBe(false);
  });

  it('validates all items in insertMany before inserting', async () => {
    const { runner, calls } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    // Second item has invalid age type
    await expect(
      db.insertMany('users', [
        { name: 'Ada', age: 32 },
        { name: 'Bob', age: 'old' as any },
      ]),
    ).rejects.toThrow();

    // No SQL should have been executed
    expect(calls).toHaveLength(0);
  });

  it('rejects deleteMany with mismatched table ids', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(
      db.deleteMany('users', [encodeId('users', TEST_UUID), `projects:${TEST_UUID}` as any]),
    ).rejects.toThrow('id belongs to "projects", not "users"');
  });

  it('handles query with chained order and limit', async () => {
    const { runner } = createRunner([{ id: TEST_UUID, data: { name: 'Ada', age: 32 } }]);
    const db = createDb(runner, schema);

    const rows = await db.query('users').order('desc', 'age').limit(5).offset(10).collect();

    expect(rows).toHaveLength(1);
  });

  it('rejects get with non-string id', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(db.get(123 as any)).rejects.toThrow('id must be a string');
  });

  it('rejects get with malformed prefixed id', async () => {
    const { runner } = createRunner({ rows: [] });
    const db = createDb(runner, schema);

    await expect(db.get('users:' as any)).rejects.toThrow();
  });
});
