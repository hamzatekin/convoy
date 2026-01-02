import { describe, expect, it } from 'vitest';
import { defineRef } from '../../src/schema/define-ref.ts';
import { TEST_UUID } from '../utils.ts';

describe('defineRef', () => {
  it('accepts ids for the correct table', () => {
    const ref = defineRef('users');
    const result = ref.safeParse(`users:${TEST_UUID}`);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(`users:${TEST_UUID}`);
    }
  });

  it('rejects ids for the wrong table or invalid format', () => {
    const ref = defineRef('users');
    expect(ref.safeParse(`projects:${TEST_UUID}`).success).toBe(false);
    expect(ref.safeParse('users:not-a-uuid').success).toBe(false);
  });
});
