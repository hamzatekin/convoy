import { z } from 'zod';
import { sql, type SQL } from 'drizzle-orm';
import type { Id, TableDefinition } from './types';
import { encodeId, isUuid, parseId } from './utils/ids';

type ArgsShape = z.ZodRawShape;
type SchemaTables = Record<string, TableDefinition<any, any>>;

type ArgsInput<TArgs extends ArgsShape> = z.input<z.ZodObject<TArgs>>;

export type ConvoyContext<TDb> = {
  db: TDb;
  runQuery: <TArgs extends ArgsShape, TResult>(
    fn: ConvoyFunction<ConvoyContext<TDb>, TArgs, TResult>,
    args: ArgsInput<TArgs>,
  ) => Promise<TResult>;
  runMutation: <TArgs extends ArgsShape, TResult>(
    fn: ConvoyFunction<ConvoyContext<TDb>, TArgs, TResult>,
    args: ArgsInput<TArgs>,
  ) => Promise<TResult>;
};

type DefaultContext = ConvoyContext<any>;

export function createContext<TDb>(db: TDb): ConvoyContext<TDb> {
  const ctx = { db } as ConvoyContext<TDb>;
  ctx.runQuery = async (fn, args) => {
    if (fn.kind !== 'query') {
      throw new Error('runQuery expects a query function');
    }
    return fn.run(ctx, args);
  };
  ctx.runMutation = async (fn, args) => {
    if (fn.kind !== 'mutation') {
      throw new Error('runMutation expects a mutation function');
    }
    return fn.run(ctx, args);
  };
  return ctx;
}

export type ConvoyFunction<TCtx, TArgs extends ArgsShape, TResult> = {
  kind: 'query' | 'mutation';
  args: TArgs;
  handler: (ctx: TCtx, args: z.infer<z.ZodObject<TArgs>>) => TResult | Promise<TResult>;
  run: (ctx: TCtx, args: unknown) => Promise<TResult>;
};

export type ConvoyFunctionDefinition<TCtx = DefaultContext, TArgs extends ArgsShape = ArgsShape, TResult = unknown> = {
  args: TArgs;
  handler: (ctx: TCtx, args: z.infer<z.ZodObject<TArgs>>) => TResult | Promise<TResult>;
};

function createFunction<TCtx, TArgs extends ArgsShape, TResult>(
  kind: 'query' | 'mutation',
  definition: ConvoyFunctionDefinition<TCtx, TArgs, TResult>,
): ConvoyFunction<TCtx, TArgs, TResult> {
  const argsSchema = z.object(definition.args);
  return {
    kind,
    args: definition.args,
    handler: definition.handler,
    run: async (ctx, args) => definition.handler(ctx, argsSchema.parse(args)),
  };
}

export function query<TCtx = DefaultContext, TArgs extends ArgsShape = ArgsShape, TResult = unknown>(
  definition: ConvoyFunctionDefinition<TCtx, TArgs, TResult>,
): ConvoyFunction<TCtx, TArgs, TResult> {
  return createFunction('query', definition);
}

export function mutation<TCtx = DefaultContext, TArgs extends ArgsShape = ArgsShape, TResult = unknown>(
  definition: ConvoyFunctionDefinition<TCtx, TArgs, TResult>,
): ConvoyFunction<TCtx, TArgs, TResult> {
  return createFunction('mutation', definition);
}

export function createFunctionHelpers<TCtx>() {
  return {
    query: <TArgs extends ArgsShape, TResult>(definition: ConvoyFunctionDefinition<TCtx, TArgs, TResult>) =>
      query<TCtx, TArgs, TResult>(definition),
    mutation: <TArgs extends ArgsShape, TResult>(definition: ConvoyFunctionDefinition<TCtx, TArgs, TResult>) =>
      mutation<TCtx, TArgs, TResult>(definition),
  };
}

type SqlRunner = {
  execute: (query: SQL) => Promise<{ rows: unknown[] } | unknown[]>;
};

type RowFor<TTables extends SchemaTables, TTableName extends keyof TTables> = z.output<
  TTables[TTableName]['schema']
> & {
  id: Id<Extract<TTableName, string>>;
};

type TableIndexesFor<TTables extends SchemaTables, TTableName extends keyof TTables> = NonNullable<
  TTables[TTableName]['indexes']
>;

type IndexNameFor<TTables extends SchemaTables, TTableName extends keyof TTables> = Extract<
  keyof TableIndexesFor<TTables, TTableName>,
  string
>;

type IndexFieldFor<
  TTables extends SchemaTables,
  TTableName extends keyof TTables,
  TIndexName extends IndexNameFor<TTables, TTableName>,
> = TableIndexesFor<TTables, TTableName>[TIndexName][number];

type TableFieldsFor<TTables extends SchemaTables, TTableName extends keyof TTables> = Extract<
  keyof z.output<TTables[TTableName]['schema']>,
  string
>;

type TableNameFromId<TTables extends SchemaTables, TId> =
  TId extends Id<infer TTable> ? Extract<TTable, keyof TTables> : never;

type QueryFilter = { field: string; value: unknown };
type QueryOrder = { field: string; direction: 'asc' | 'desc' };

type QueryBuilder<TTables extends SchemaTables, TTableName extends keyof TTables> = {
  withIndex: <TIndexName extends IndexNameFor<TTables, TTableName>>(
    index: TIndexName,
    build: (q: { eq: (field: IndexFieldFor<TTables, TTableName, TIndexName>, value: unknown) => void }) => void,
  ) => QueryBuilder<TTables, TTableName>;
  order: (
    direction: 'asc' | 'desc',
    field?: TableFieldsFor<TTables, TTableName> | 'id',
  ) => QueryBuilder<TTables, TTableName>;
  collect: () => Promise<Array<RowFor<TTables, TTableName>>>;
  first: () => Promise<RowFor<TTables, TTableName> | null>;
};

function normalizeRows<TRow extends Record<string, unknown>>(result: { rows: unknown[] } | unknown[]): TRow[] {
  const rows = Array.isArray(result) ? result : result.rows;
  return rows as TRow[];
}

function jsonField(field: string): SQL {
  return sql`data ->> ${field}`;
}

function fieldForComparison(field: string, value: unknown): SQL {
  if (typeof value === 'number') {
    return sql`${jsonField(field)}::numeric`;
  }
  if (typeof value === 'boolean') {
    return sql`${jsonField(field)}::boolean`;
  }
  return jsonField(field);
}

function buildWhere(tableKey: string, filters: QueryFilter[]): SQL {
  if (filters.length === 0) {
    return sql``;
  }
  const clauses = filters.map((filter) => {
    if (filter.field === 'id') {
      if (typeof filter.value !== 'string') {
        throw new Error('id filters must be strings');
      }
      const parsed = parseId(filter.value);
      if (parsed && parsed.table !== tableKey) {
        throw new Error(`id belongs to "${parsed.table}", not "${tableKey}"`);
      }
      if (parsed) {
        return sql`id = ${parsed.uuid}`;
      }
      if (isUuid(filter.value)) {
        return sql`id = ${filter.value}`;
      }
      throw new Error('Invalid id format');
    }
    return sql`${fieldForComparison(filter.field, filter.value)} = ${filter.value}`;
  });
  return sql`WHERE ${sql.join(clauses, sql` AND `)}`;
}

function buildOrder(order: QueryOrder | null): SQL {
  if (!order) {
    return sql``;
  }
  const orderField = order.field === 'id' ? sql`id` : fieldForComparison(order.field, '');
  const direction = order.direction === 'asc' ? 'asc' : 'desc';
  return sql`ORDER BY ${orderField} ${sql.raw(direction)}`;
}

function buildLimit(limit: number | null): SQL {
  if (!limit) {
    return sql``;
  }
  return sql`LIMIT ${limit}`;
}

export function createDb<TTables extends SchemaTables>(
  runner: SqlRunner,
  schema: TTables,
): {
  insert: <TTableName extends keyof TTables>(
    table: TTableName,
    data: z.input<TTables[TTableName]['schema']>,
  ) => Promise<Id<Extract<TTableName, string>>>;
  get: {
    <TTableName extends keyof TTables>(
      table: TTableName,
      id: Id<Extract<TTableName, string>>,
    ): Promise<RowFor<TTables, TTableName> | null>;
    <TId extends Id<Extract<keyof TTables, string>>>(
      id: TId,
    ): Promise<RowFor<TTables, TableNameFromId<TTables, TId>> | null>;
  };
  patch: {
    <TTableName extends keyof TTables>(
      table: TTableName,
      id: Id<Extract<TTableName, string>>,
      data: Partial<z.input<TTables[TTableName]['schema']>>,
    ): Promise<RowFor<TTables, TTableName> | null>;
    <TId extends Id<Extract<keyof TTables, string>>>(
      id: TId,
      data: Partial<z.input<TTables[TableNameFromId<TTables, TId>]['schema']>>,
    ): Promise<RowFor<TTables, TableNameFromId<TTables, TId>> | null>;
  };
  query: <TTableName extends keyof TTables>(table: TTableName) => QueryBuilder<TTables, TTableName>;
} {
  function tableDefinitionByKey(tableKey: string) {
    const table = schema[tableKey as keyof TTables];
    if (!table) {
      throw new Error(`Unknown table: ${tableKey}`);
    }
    return {
      tableKey,
      tableName: table.name ?? tableKey,
      definition: table,
    };
  }

  function tableInfo<TTableName extends keyof TTables>(name: TTableName) {
    const tableKey = String(name);
    return tableDefinitionByKey(tableKey);
  }

  function assertSchemaField(definition: TableDefinition<any, any>, field: string): void {
    const shape = definition.schema.shape;
    if (!shape || typeof shape !== 'object' || !(field in shape)) {
      throw new Error(`Unknown field "${field}"`);
    }
  }

  function resolveUuidForTable(tableKey: string, value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('id must be a string');
    }
    const parsed = parseId(value);
    if (parsed) {
      if (parsed.table !== tableKey) {
        throw new Error(`id belongs to "${parsed.table}", not "${tableKey}"`);
      }
      return parsed.uuid;
    }
    if (isUuid(value)) {
      return value;
    }
    throw new Error('Invalid id format');
  }

  function resolveTableFromId(value: unknown) {
    if (typeof value !== 'string') {
      throw new Error('id must be a string');
    }
    const parsed = parseId(value);
    if (!parsed) {
      throw new Error('Expected <table>:<uuid>');
    }
    return { ...tableDefinitionByKey(parsed.table), uuid: parsed.uuid };
  }

  async function run<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
    const result = await runner.execute(query);
    return normalizeRows<T>(result);
  }

  async function insert<TTableName extends keyof TTables>(
    table: TTableName,
    data: z.input<TTables[TTableName]['schema']>,
  ): Promise<Id<Extract<TTableName, string>>> {
    const { tableKey, tableName, definition } = tableInfo(table);
    const parsed = definition.schema.parse(data);
    const rows = await run<{ id: string }>(sql`
      INSERT INTO ${sql.identifier(tableName)} (data)
      VALUES (${parsed}::jsonb)
      RETURNING id
    `);
    const row = rows[0];
    if (!row) {
      throw new Error(`Insert failed for table "${tableName}"`);
    }
    return encodeId(tableKey, row.id) as Id<Extract<TTableName, string>>;
  }

  async function get<TTableName extends keyof TTables>(
    table: TTableName,
    id: Id<Extract<TTableName, string>>,
  ): Promise<RowFor<TTables, TTableName> | null>;
  async function get<TId extends Id<Extract<keyof TTables, string>>>(
    id: TId,
  ): Promise<RowFor<TTables, TableNameFromId<TTables, TId>> | null>;
  async function get(
    tableOrId: keyof TTables | Id<Extract<keyof TTables, string>>,
    maybeId?: Id<Extract<keyof TTables, string>>,
  ) {
    const resolved =
      maybeId === undefined
        ? resolveTableFromId(tableOrId)
        : {
            ...tableInfo(tableOrId as keyof TTables),
            uuid: resolveUuidForTable(String(tableOrId), maybeId),
          };
    const rows = await run<{ id: string; data: Record<string, unknown> }>(sql`
      SELECT id, data
      FROM ${sql.identifier(resolved.tableName)}
      WHERE id = ${resolved.uuid}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: encodeId(resolved.tableKey, row.id),
      ...row.data,
    };
  }

  async function patch<TTableName extends keyof TTables>(
    table: TTableName,
    id: Id<Extract<TTableName, string>>,
    data: Partial<z.input<TTables[TTableName]['schema']>>,
  ): Promise<RowFor<TTables, TTableName> | null>;
  async function patch<TId extends Id<Extract<keyof TTables, string>>>(
    id: TId,
    data: Partial<z.input<TTables[TableNameFromId<TTables, TId>]['schema']>>,
  ): Promise<RowFor<TTables, TableNameFromId<TTables, TId>> | null>;
  async function patch(
    tableOrId: keyof TTables | Id<Extract<keyof TTables, string>>,
    idOrData: Id<Extract<keyof TTables, string>> | Record<string, unknown>,
    maybeData?: Record<string, unknown>,
  ) {
    const hasExplicitTable = maybeData !== undefined;
    const resolved = hasExplicitTable
      ? {
          ...tableInfo(tableOrId as keyof TTables),
          uuid: resolveUuidForTable(String(tableOrId), idOrData),
          data: maybeData,
        }
      : {
          ...resolveTableFromId(tableOrId),
          data: idOrData,
        };
    const parsed = resolved.definition.schema.partial().parse(resolved.data);
    const rows = await run<{ id: string; data: Record<string, unknown> }>(sql`
      UPDATE ${sql.identifier(resolved.tableName)}
      SET data = data || ${parsed}::jsonb,
          updated_at = now()
      WHERE id = ${resolved.uuid}
      RETURNING id, data
    `);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: encodeId(resolved.tableKey, row.id),
      ...row.data,
    };
  }

  function queryTable<TTableName extends keyof TTables>(table: TTableName): QueryBuilder<TTables, TTableName> {
    const { tableKey, tableName, definition } = tableInfo(table);
    const shape = definition.schema.shape;
    const defaultOrderField = shape && typeof shape === 'object' && 'createdAt' in shape ? 'createdAt' : 'id';
    const filters: QueryFilter[] = [];
    let order: QueryOrder | null = null;
    let limit: number | null = null;
    const indexes = definition.indexes ?? {};

    const builder: QueryBuilder<TTables, TTableName> = {
      withIndex: (index, build) => {
        const indexFields = indexes[index as keyof typeof indexes];
        if (!indexFields) {
          throw new Error(`Unknown index "${String(index)}"`);
        }
        build({
          eq: (field, value) => {
            if (!indexFields.includes(field as string)) {
              throw new Error(`Field "${String(field)}" is not part of index "${String(index)}"`);
            }
            if (field !== 'id') {
              assertSchemaField(definition, String(field));
            }
            filters.push({ field, value });
          },
        });
        return builder;
      },
      order: (direction, field) => {
        const nextField = field ?? defaultOrderField;
        if (nextField !== 'id') {
          assertSchemaField(definition, nextField);
        }
        order = { direction, field: nextField };
        return builder;
      },
      collect: async () => {
        const rows = await run<{
          id: string;
          data: Record<string, unknown>;
        }>(sql`
          SELECT id, data
          FROM ${sql.identifier(tableName)}
          ${buildWhere(tableKey, filters)}
          ${buildOrder(order)}
          ${buildLimit(limit)}
        `);
        return rows.map((row) => {
          return {
            id: encodeId(tableKey, row.id),
            ...row.data,
          } as RowFor<TTables, TTableName>;
        });
      },
      first: async () => {
        limit = 1;
        const rows = await builder.collect();
        return rows[0] ?? null;
      },
    };

    return builder;
  }

  return {
    insert,
    get,
    patch,
    query: queryTable,
  };
}

export type DbFromSchema<TSchema extends SchemaTables> = ReturnType<typeof createDb<TSchema>>;
