# Convoy

Convex‑style DX, but Postgres‑native.

Convex‑style DX, but Postgres‑native. Start fast with JSONB, ship quickly, and when the product hardens you can migrate hot paths into relational tables without rewriting your app.

Status: **0.0.1-alpha** (early, fast-moving, APIs will change)

## Why Convoy

- Postgres as the source of truth (self-hostable, future-safe)
- JSONB-first schema for fast iteration
- End-to-end TypeScript types from server to client
- `query()` / `mutation()` API (no SQL in client code)

## Install

```bash
bun add convoy zod pg drizzle-orm
```

> Using Node? You can run the CLI with `node` + a TS loader (ex: `tsx`), but Bun is the easiest path right now.

## Quickstart

### 1) Define your schema

Create `convoy/schema.ts` in your project root:

```ts
import { z } from "zod";
import { defineSchema, defineTable, defineRef } from "convoy";

const schema = defineSchema({
  users: defineTable({
    deviceId: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef("users"),
    createdAt: z.number(),
  }).index("by_userId", ["userId"]),
});

export default schema;
```

### 2) Write queries + mutations

Create files under `convoy/functions`:

```ts
// convoy/functions/projects.ts
import { defineRef } from "convoy";
import { mutation, query } from "../_generated/server";
import { z } from "zod";

export const createProject = mutation({
  args: { userId: defineRef("users"), name: z.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("projects", {
      userId: args.userId,
      name: args.name,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  args: { userId: defineRef("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc", "createdAt")
      .collect();
  },
});
```

### 3) Sync and generate API bindings

Run the dev command (watches for changes by default, use `--once` for a single sync):

```bash
bun run scripts/convoy-dev.ts --root .
```

This will:
- create the database if needed
- create tables + JSONB indexes
- generate `convoy/_generated/api.ts`, `convoy/_generated/functions.ts`, and `convoy/_generated/server.ts`
- start the local Convoy HTTP server

### 4) Use it on the client

```ts
import { useMutation, useQuery } from "convoy/react";
import { api } from "../convoy/_generated/api";

const createProject = useMutation(api.projects.createProject);
const { data, refetch } = useQuery(
  api.projects.listProjects,
  { userId },
  { enabled: false },
);
```

You can also call the client directly:

```ts
import { createConvoyClient } from "convoy/client";
import { api } from "../convoy/_generated/api";

const client = createConvoyClient();
await client.mutation(api.projects.createProject, { userId, name: "My App" });
```

## CLI

Currently a single command for dev + sync (also starts the local server):

```bash
bun run scripts/convoy-dev.ts --root .
```

Flags:
- `--once` to run a single sync and exit
- `--no-serve` to skip starting the server

Config:
- `DATABASE_URL` in `.env` (required)
- assumes `convoy/schema.ts` exists

## Roadmap + vision

V1 progress: [=====-----] 50%

- [x] typed schema + references
- [x] typed queries/mutations
- [x] JSONB storage + indexes
- [ ] realtime invalidation (mutation -> event -> refetch)
- [ ] optional TanStack Query integration
- [ ] shipped CLI binary (no TS loader required)
- [ ] sync primitives (realtime + offline-ready) built on a simple invalidate/refetch core
- [ ] JSONB-to-relational migrations that keep types stable and make upgrades mechanical

---

MIT License (coming soon). Contributions welcome once the API stabilizes.
