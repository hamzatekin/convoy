import { describe, expect, it } from 'vitest';
import { encodeId, isUuid, parseId } from '../../src/schema/ids.ts';
import { TEST_UUID } from '../utils.ts';

describe('ids', () => {
  it('validates uuids', () => {
    expect(isUuid(TEST_UUID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('parses table-prefixed ids', () => {
    const parsed = parseId(`users:${TEST_UUID}`);
    expect(parsed).toEqual({
      table: 'users',
      uuid: TEST_UUID,
    });
  });

  it('rejects invalid ids', () => {
    expect(parseId('users:not-a-uuid')).toBeNull();
    expect(parseId(`:${TEST_UUID}`)).toBeNull();
    expect(parseId(`users${TEST_UUID}`)).toBeNull();
  });

  it('encodes ids', () => {
    const encoded = encodeId('projects', TEST_UUID);
    expect(encoded).toBe(`projects:${TEST_UUID}`);
  });
});
