import type { Id } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedId = {
  table: string;
  uuid: string;
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseId(value: string): ParsedId | null {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }
  const table = value.slice(0, separatorIndex);
  const uuid = value.slice(separatorIndex + 1);
  if (!table || !isUuid(uuid)) {
    return null;
  }
  return { table, uuid };
}

export function encodeId<TTable extends string>(table: TTable, uuid: string): Id<TTable> {
  return `${table}:${uuid}` as Id<TTable>;
}
