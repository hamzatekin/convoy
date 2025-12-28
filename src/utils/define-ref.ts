import { z } from "zod";
import type { Id } from "../types";
import { parseId } from "./ids";

export function defineRef<TTable extends string>(
  table: TTable
): z.ZodType<Id<TTable>, string> {
  return z
    .string()
    .refine(
      (value) => {
        const parsed = parseId(value);
        return parsed?.table === table;
      },
      { message: `Expected ${table}:<uuid>` }
    )
    .transform((value) => value as Id<TTable>);
}
