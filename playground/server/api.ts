import { createContext, createDb } from "../../src/index.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import schema from "../convoy/schema";
import { mutations, queries } from "../convoy/_generated/functions.ts";

type Api = {
  runMutation: (name: string, args: unknown) => Promise<unknown>;
  runQuery: (name: string, args: unknown) => Promise<unknown>;
  close: () => Promise<void>;
};

export function createApi(): Api {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing in playground/.env");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const drizzleDb = drizzle(pool);
  const db = createDb(drizzleDb, schema);
  const ctx = createContext(db);

  return {
    runMutation: async (name, args) => {
      const fn = mutations[name as keyof typeof mutations];
      if (!fn) {
        throw new Error(`Unknown mutation "${name}"`);
      }
      return fn.run(ctx, args);
    },
    runQuery: async (name, args) => {
      const fn = queries[name as keyof typeof queries];
      if (!fn) {
        throw new Error(`Unknown query "${name}"`);
      }
      return fn.run(ctx, args);
    },
    close: async () => {
      await pool.end();
    },
  };
}
