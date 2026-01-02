import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineSchema, defineTable } from '../../src/index.ts';
import { buildSchemaSnapshot, diffSchemaSnapshots, parseArgs } from '../../scripts/convoy-dev.ts';

describe('schema workflow helpers', () => {
  it('defaults migrate to one-shot (no watch, no serve)', () => {
    const options = parseArgs(['migrate']);
    expect(options.command).toBe('migrate');
    expect(options.watch).toBe(false);
    expect(options.serve).toBe(false);
  });

  it('defaults deploy to one-shot (no watch, no serve)', () => {
    const options = parseArgs(['deploy']);
    expect(options.command).toBe('deploy');
    expect(options.watch).toBe(false);
    expect(options.serve).toBe(false);
  });

  it('warns on removed tables and changed indexes', () => {
    const schemaV1 = defineSchema({
      projects: defineTable({ name: z.string(), status: z.string() }).index('by_name', ['name']),
    });
    const schemaV2 = defineSchema({
      projects: defineTable({ name: z.string(), status: z.string() }).index('by_name', ['status']),
    });
    const schemaV3 = defineSchema({});

    const warningsChanged = diffSchemaSnapshots(buildSchemaSnapshot(schemaV1), buildSchemaSnapshot(schemaV2));
    expect(warningsChanged.some((warning) => warning.includes('projects.by_name'))).toBe(true);

    const warningsRemoved = diffSchemaSnapshots(buildSchemaSnapshot(schemaV1), buildSchemaSnapshot(schemaV3));
    expect(warningsRemoved.some((warning) => warning.includes('Table \"projects\"'))).toBe(true);
  });

  it('does not warn on new tables or indexes', () => {
    const schemaEmpty = defineSchema({});
    const schemaNext = defineSchema({
      users: defineTable({ name: z.string() }).index('by_name', ['name']),
    });

    const warnings = diffSchemaSnapshots(buildSchemaSnapshot(schemaEmpty), buildSchemaSnapshot(schemaNext));
    expect(warnings).toEqual([]);
  });
});
