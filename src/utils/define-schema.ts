import type { TableDefinition } from '../types';

export function defineSchema<TTables extends Record<string, TableDefinition<any, any>>>(tables: TTables): TTables {
  for (const [name, table] of Object.entries(tables)) {
    if (!table.name) {
      table.name = name;
    }
  }

  return tables;
}
