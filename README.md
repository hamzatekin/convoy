# Convoy

**Convex-style reactive backend DX — on your own Postgres.**

Convoy is a backend runtime lets you build backends by writing **queries and mutations** and
your UI stays in sync automatically via **server-pushed updates**, while you keep full ownership of your database.

Start fast with **JSONB documents**, ship quickly, and when your product hardens, **migrate hot paths to relational tables** without rewriting your app.

**Status:** `0.0.1-alpha`

## Why Convoy

- Postgres as the source of truth (self-hostable, future-safe)
- JSONB-first schema for fast iteration
- End-to-end TypeScript types from server to client
- Realtime query subscriptions (Postgres LISTEN/NOTIFY + SSE results)
- `query()` / `mutation()` API

## Install

```bash
bun add convoy zod pg drizzle-orm
```

> Using Node? You can run the CLI with `node` + a TS loader (ex: `tsx`), but Bun is the easiest path right now.

## Quickstart

### 1) Define your schema

Create `convoy/schema.ts` in your project root:

```ts
// src/convoy/schema.ts
import { defineSchema, defineTable, defineRef } from "convoy";
import { z } from "zod";

export const schema = defineSchema({
  users: defineTable({
    name: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef("users"),
    createdAt: z.number(),
  }).index("by_userId", ["userId"]),
});
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
npx convoy-dev
```

This will:

- create the database if needed
- create tables + JSONB indexes
- generate `convoy/_generated/api.ts`, `convoy/_generated/functions.ts`, and `convoy/_generated/server.ts`
- generate `convoy/_generated/http.ts` (HTTP + SSE subscriptions)
- start the local Convoy HTTP server

### 4) Use it on the client

```ts
import { useMutation, useQuery } from "convoy/react";
import { api } from "../convoy/_generated/api";

const createProject = useMutation(api.projects.createProject);
const { data } = useQuery(
  api.projects.listProjects,
  { userId },
  { enabled: false },
);

// Subscriptions are on by default. Disable them if needed:
// useQuery(api.projects.listProjects, { userId }, { subscribe: false });
```

You can also call the client directly:

```ts
import { createConvoyClient } from "convoy/client";
import { api } from "../convoy/_generated/api";

const client = createConvoyClient();
await client.mutation(api.projects.createProject, { userId, name: "My App" });
```

### Realtime subscriptions (SSE)

Convoy uses Postgres LISTEN/NOTIFY to refresh query subscriptions. The server
listens for NOTIFY events and re-runs active queries, streaming results over SSE.
On the client, `useQuery` opens an `EventSource` to `/api/subscribe` with the
query name + args, and updates the hook state when new results arrive.

Config:

- `DATABASE_URL` in `.env` (required)
- assumes `convoy/schema.ts` exists

## Roadmap + vision

V1 progress: [======----] 60%

- [x] typed schema + references
- [x] typed queries/mutations
- [x] JSONB storage + indexes
- [x] realtime subscriptions (LISTEN/NOTIFY + SSE results)
- [ ] optional TanStack Query integration
- [ ] shipped CLI binary (no TS loader required)
- [ ] sync primitives (realtime + offline-ready) built on a simple invalidate/refetch core
- [ ] JSONB-to-relational migrations that keep types stable and make upgrades mechanical

---

MIT License (coming soon). Contributions welcome once the API stabilizes.
