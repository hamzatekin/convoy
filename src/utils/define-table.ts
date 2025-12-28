import { z } from "zod";
import type { TableDefinition, TableIndexes, TableShape } from "../types";

export type TableBuilder<
  TShape extends TableShape,
  TIndexes extends TableIndexes<TShape> = {},
> = TableDefinition<TShape, TIndexes> & {
  index: <
    TName extends string,
    TFields extends readonly (keyof TShape & string)[],
  >(
    name: TName,
    fields: TFields,
  ) => TableBuilder<TShape, TIndexes & Record<TName, TFields>>;
};

export function defineTable<TShape extends TableShape>(
  shape: TShape,
): TableBuilder<TShape, {}> {
  const schema = z.object(shape);
  const indexes: Record<string, readonly (keyof TShape & string)[]> = {};
  const table: TableBuilder<TShape, {}> = {
    schema,
    indexes,
    validate: (value) => schema.parse(value),
    isValid: (value): value is z.output<typeof schema> =>
      schema.safeParse(value).success,
    index: <
      TName extends string,
      TFields extends readonly (keyof TShape & string)[],
    >(
      name: TName,
      fields: TFields,
    ) => {
      indexes[name] = fields;
      return table as TableBuilder<TShape, Record<TName, TFields>>;
    },
  };
  return table;
}
