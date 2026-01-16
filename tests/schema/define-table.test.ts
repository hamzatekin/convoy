import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTable } from '../../src/schema/define-table.ts';

describe('defineTable', () => {
  it('validates and returns typed rows', () => {
    const table = defineTable({
      name: z.string(),
      count: z.number(),
    });

    expect(table.isValid({ name: 'ok', count: 1 })).toBe(true);
    expect(table.isValid({ name: 'ok', count: '1' })).toBe(false);

    const parsed = table.validate({ name: 'row', count: 2 });
    expect(parsed).toEqual({ name: 'row', count: 2 });
  });

  it('registers indexes', () => {
    const table = defineTable({
      name: z.string(),
      count: z.number(),
    }).index('by_name', ['name']);

    expect(table.indexes).toEqual({
      by_name: ['name'],
    });
  });

  it('supports chained index declarations', () => {
    const table = defineTable({
      name: z.string(),
      count: z.number(),
    })
      .index('by_name', ['name'])
      .index('by_count', ['count']);

    expect(table.indexes).toEqual({
      by_name: ['name'],
      by_count: ['count'],
    });
  });

  it('marks tables as unmanaged when opted out', () => {
    const table = defineTable({
      name: z.string(),
    }).unmanaged();

    expect(table.managed).toBe(false);
  });

  // === Edge Case Tests ===

  it('handles optional fields', () => {
    const table = defineTable({
      name: z.string(),
      nickname: z.string().optional(),
    });

    expect(table.isValid({ name: 'Ada' })).toBe(true);
    expect(table.isValid({ name: 'Ada', nickname: 'Lady L' })).toBe(true);
    expect(table.isValid({ nickname: 'Lady L' })).toBe(false); // name is required
  });

  it('handles nullable fields', () => {
    const table = defineTable({
      name: z.string(),
      email: z.string().nullable(),
    });

    expect(table.isValid({ name: 'Ada', email: null })).toBe(true);
    expect(table.isValid({ name: 'Ada', email: 'ada@example.com' })).toBe(true);
  });

  it('handles default values', () => {
    const table = defineTable({
      name: z.string(),
      role: z.string().default('user'),
    });

    const parsed = table.validate({ name: 'Ada' });
    expect(parsed).toEqual({ name: 'Ada', role: 'user' });
  });

  it('handles nested objects', () => {
    const table = defineTable({
      name: z.string(),
      address: z.object({
        city: z.string(),
        zip: z.string(),
      }),
    });

    expect(table.isValid({ name: 'Ada', address: { city: 'London', zip: '12345' } })).toBe(true);
    expect(table.isValid({ name: 'Ada', address: { city: 'London' } })).toBe(false);
  });

  it('handles arrays', () => {
    const table = defineTable({
      name: z.string(),
      tags: z.array(z.string()),
    });

    expect(table.isValid({ name: 'Ada', tags: ['math', 'computing'] })).toBe(true);
    expect(table.isValid({ name: 'Ada', tags: [] })).toBe(true);
    expect(table.isValid({ name: 'Ada', tags: [1, 2] })).toBe(false);
  });

  it('handles enums', () => {
    const table = defineTable({
      name: z.string(),
      status: z.enum(['active', 'inactive', 'pending']),
    });

    expect(table.isValid({ name: 'Ada', status: 'active' })).toBe(true);
    expect(table.isValid({ name: 'Ada', status: 'unknown' })).toBe(false);
  });

  it('supports composite indexes', () => {
    const table = defineTable({
      userId: z.string(),
      projectId: z.string(),
      role: z.string(),
    }).index('by_user_project', ['userId', 'projectId']);

    expect(table.indexes).toEqual({
      by_user_project: ['userId', 'projectId'],
    });
  });
});
