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
});
