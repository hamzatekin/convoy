import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineSchema } from '../../src/schema/define-schema.ts';
import { defineTable } from '../../src/schema/define-table.ts';

describe('defineSchema', () => {
  it('assigns table names when missing', () => {
    const schema = defineSchema({
      users: defineTable({ name: z.string() }),
      projects: defineTable({ title: z.string() }),
    });

    expect(schema.users.name).toBe('users');
    expect(schema.projects.name).toBe('projects');
  });

  it('preserves explicit table names', () => {
    const table = defineTable({ name: z.string() });
    table.name = 'people';

    const schema = defineSchema({
      users: table,
    });

    expect(schema.users.name).toBe('people');
  });
});
