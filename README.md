# Convoy

**Convex-style reactive backend DX — on your own Postgres.**

Convoy is a self-hosted backend runtime where you build your backend by writing **queries and mutations**, and your UI stays in sync automatically via **server-pushed updates**.

You keep full ownership of your database. Convoy handles execution, typing, and reactivity.

Start fast with **JSONB document tables**, iterate quickly, and keep a clear path toward stricter schemas and relational data as your product matures.

**Status:** `0.0.x` — MVP (core ideas implemented, APIs still stabilizing)

---

## Why Convoy

- **Postgres as the source of truth** (self-hosted, future-proof)
- **JSONB-first schema** for fast iteration
- **End-to-end TypeScript types** (schema → server → client)
- **Reactive queries** with server-pushed updates
- No manual cache invalidation or refetch logic
- Clear path to stronger schemas as your product grows

## Installation

```bash
npm install convoy zod
```

> Prefer Bun? `bun add convoy zod` works too. The `convoy` CLI runs on Node by default (and `bunx` works in Bun).

---

## Core Concepts

### Schema

Define your data shape once using Zod. Convoy stores rows as JSONB documents in Postgres and ensures tables and indexes exist during development.

### Queries

Queries are pure read functions. Clients subscribe to queries and receive live updates automatically.

### Mutations

Mutations are write + business logic functions. When a mutation runs, Convoy invalidates affected queries and pushes updated results to subscribed clients.

### Reactivity

Convoy uses Postgres `LISTEN / NOTIFY` for change signals and Server-Sent Events (SSE) to stream authoritative query results to clients.

---

---

## Core Concepts

### Schema

Define your data shape once using Zod. Convoy stores rows as JSONB documents in Postgres and ensures tables and indexes exist during development.

### Queries

Queries are pure read functions. Clients subscribe to queries and receive live updates automatically.

### Mutations

Mutations are write + business logic functions. When a mutation runs, Convoy invalidates affected queries and pushes updated results to subscribed clients.

### Reactivity

Convoy uses Postgres `LISTEN / NOTIFY` for change signals and Server-Sent Events (SSE) to stream authoritative query results to clients.

---

## Quickstart

### 1) Define your schema

Create `convoy/schema.ts` in your project root:

```ts
// src/convoy/schema.ts
import { defineSchema, defineTable, defineRef } from 'convoy';
import { z } from 'zod';

export const schema = defineSchema({
  users: defineTable({
    name: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef('users'),
    createdAt: z.number(),
  }).index('by_userId', ['userId']),
});
```

### 2) Write queries + mutations

Create files under `convoy/functions`:

```ts
// convoy/functions/projects.ts
import { defineRef } from 'convoy';
import { mutation, query } from '../_generated/server';
import { z } from 'zod';

export const createProject = mutation({
  input: { userId: defineRef('users'), name: z.string() },
  handler: async (ctx, input) => {
    return ctx.db.insert('projects', {
      userId: input.userId,
      name: input.name,
      createdAt: Date.now(),
    });
  },
});

export const listProjects = query({
  input: { userId: defineRef('users') },
  handler: async (ctx, input) => {
    return ctx.db
      .query('projects')
      .withIndex('by_userId', (q) => q.eq('userId', input.userId))
      .order('desc', 'createdAt')
      .collect();
  },
});
```

### 3) Sync and generate API bindings

Run the dev command (watches for changes by default, use `--once` for a single sync):

```bash
npx convoy dev
```

Other package managers:

```bash
pnpm dlx convoy dev
yarn dlx convoy dev
bunx convoy dev
```

This will:

- create the database if needed
- create tables + JSONB indexes
- generate `convoy/_generated/api.ts`, `convoy/_generated/functions.ts`, and `convoy/_generated/server.ts`
- generate `convoy/_generated/http.ts` (HTTP + SSE subscriptions)
- start the local Convoy HTTP server

### 4) Use it on the client (React)

```ts
import { useMutation, useQuery } from 'convoy/react';
import { api } from '../convoy/_generated/api';

const createProject = useMutation(api.projects.createProject);
const { data } = useQuery(api.projects.listProjects, { userId }, { enabled: false });
```

Direct client usage (non-React)

```ts
import { createConvoyClient } from 'convoy/client';
import { api } from '../convoy/_generated/api';

const client = createConvoyClient();
await client.mutation(api.projects.createProject, { userId, name: 'My App' });
```

### How reactivity works (high level)

1. useQuery opens an SSE subscription
2. The server runs the query and streams the initial result
3. A mutation runs and writes to Postgres
4. Postgres emits NOTIFY
5. The server refreshes affected subscriptions
6. Updated query results are pushed to clients

The server is always the source of truth.

### Roadmap (high level)

Near-term (v1):

- runtime hardening and reconnect guarantees
- structured error handling
- auth patterns via request context
- clear dev vs deploy workflows
- escape hatches (raw SQL, interop)

#### Later:

- WebSocket transport (alternative to SSE)
- mobile-friendly subscriptions
- optional advanced client adapters
- guided JSONB → relational migration tooling
- optional managed hosting

See ROADMAP.md for details.

---

License

MIT (planned once APIs stabilize)
