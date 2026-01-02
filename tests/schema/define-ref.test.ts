import { describe, expect, it } from 'vitest';
import { defineRef } from '../../src/schema/define-ref.ts';

describe('defineRef', () => {
  const uuid = '6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f';

  it('accepts ids for the correct table', () => {
    const ref = defineRef('users');
    const result = ref.safeParse(`users:${uuid}`);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(`users:${uuid}`);
    }
  });

  it('rejects ids for the wrong table or invalid format', () => {
    const ref = defineRef('users');
    expect(ref.safeParse(`projects:${uuid}`).success).toBe(false);
    expect(ref.safeParse('users:not-a-uuid').success).toBe(false);
  });
});
