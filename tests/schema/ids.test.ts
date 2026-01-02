import { describe, expect, it } from 'vitest';
import { encodeId, isUuid, parseId } from '../../src/schema/ids.ts';

describe('ids', () => {
  it('validates uuids', () => {
    expect(isUuid('6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('parses table-prefixed ids', () => {
    const parsed = parseId('users:6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f');
    expect(parsed).toEqual({
      table: 'users',
      uuid: '6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f',
    });
  });

  it('rejects invalid ids', () => {
    expect(parseId('users:not-a-uuid')).toBeNull();
    expect(parseId(':6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f')).toBeNull();
    expect(parseId('users6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f')).toBeNull();
  });

  it('encodes ids', () => {
    const encoded = encodeId('projects', '6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f');
    expect(encoded).toBe('projects:6f0a2d32-6d4a-4e2c-9e45-4b5e6e1b7a3f');
  });
});
