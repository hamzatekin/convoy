import type z from "zod";

export type Id<TableName extends string> = `${TableName}:${string}` & {
  __table: TableName;
};

export type TableShape = z.ZodRawShape;

export type TableIndexes<TShape extends TableShape> = Record<
  string,
  readonly (keyof TShape & string)[]
>;

export type TableDefinition<
  TShape extends TableShape,
  TIndexes extends TableIndexes<TShape> | undefined = undefined,
> = {
  name?: string;
  schema: z.ZodObject<TShape>;
  indexes?: TIndexes;
  validate: (value: unknown) => z.output<z.ZodObject<TShape>>;
  isValid: (value: unknown) => value is z.output<z.ZodObject<TShape>>;
};

export type InferTableRow<
  TTable extends TableDefinition<TableShape, any>,
> = z.infer<TTable["schema"]>;
