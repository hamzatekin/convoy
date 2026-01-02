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

## Mental model

- Define tables + indexes once in `convoy/schema.ts`.
- Write pure `query` functions and side-effecting `mutation` functions.
- The server validates inputs, injects context (db + auth), and executes functions.
- Clients call generated refs; `useQuery` stays subscribed and gets server-pushed updates.

## Data flow (simplified)

```
Client useQuery  ->  /api/query/:name  ->  run query  ->  SSE stream
Client mutation  ->  /api/mutation/:name  ->  write DB  ->  NOTIFY -> refresh SSE
```

## What Convoy is / is not

Convoy is:

- A typed function runtime (query/mutation) on top of your Postgres.
- A reactive layer that keeps clients in sync via SSE.
- A schema-first JSONB model optimized for iteration.

Convoy is not:

- A hosted backend or auth provider.
- A replacement for all of your backend code (you can mix it).
- A migration engine that drops/renames tables for you.

## Comparison (short)

vs REST:

- Convoy gives end-to-end types and reactive subscriptions; REST gives full manual control.
- Convoy hides routing; REST exposes explicit endpoints and verbs.

vs Convex:

- Convoy runs on your Postgres; Convex runs on hosted infra.
- Convoy uses JSONB + SQL; Convex uses its own storage/engine.
- Convoy is bring-your-own-auth; Convex provides hosted auth integrations.

## Tradeoffs & limitations

- SSE only (no WebSocket transport yet).
- JSONB-first model
- No destructive migrations (tables/indexes are created only).
- Long-lived server process required (not serverless-friendly out of the box).

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

For local development of this repo, use `npm run convoy:dev` or `bun run convoy:dev` (bunx installs from the registry unless you add a local `file:` dependency).

This will:

- create the database if needed
- create tables + JSONB indexes
- generate `convoy/_generated/api.ts`, `convoy/_generated/functions.ts`, and `convoy/_generated/server.ts`
- generate `convoy/_generated/http.ts` (HTTP + SSE subscriptions)
- start the local Convoy HTTP server

If `convoy/server.ts` exists, its `createContext` (and optional `configureServer`) is used automatically.

Production workflow (explicit, safe):

```bash
convoy migrate
```

`convoy migrate` runs schema sync once, emits warnings for destructive or incompatible changes, and never drops tables or indexes. Use this in deploy pipelines (alias: `convoy deploy`).

### 4) Use it on the client (React)

```ts
import { useMutation, useQuery } from 'convoy/react';
import { api } from '../convoy/_generated/api';

const createProject = useMutation(api.projects.createProject);
const { data, connectionState, isReconnecting, isStale } = useQuery(api.projects.listProjects, { userId });
```

Direct client usage (non-React)

```ts
import { createConvoyClient } from 'convoy/client';
import { api } from '../convoy/_generated/api';

const client = createConvoyClient();
await client.mutation(api.projects.createProject, { userId, name: 'My App' });
```

Structured errors and mutation state:

```ts
import { ConvoyError } from 'convoy/client';
import { useMutationState } from 'convoy/react';

const { mutate, isLoading, error } = useMutationState(api.projects.createProject);

try {
  await mutate({ userId, name: 'My App' });
} catch (err) {
  if (err instanceof ConvoyError) {
    console.log(err.code, err.message);
  }
}
```

---

## Auth via request context

Convoy treats auth as **request-scoped data on your context**. Export `createContext(req, base)` from `convoy/server.ts` and `convoy dev` will pick it up automatically.

```ts
// convoy/server.ts
import type { IncomingMessage } from 'node:http';
import type { ServerContext } from './_generated/server';
import { convoyError } from 'convoy';

export async function createContext(req: IncomingMessage, base: ServerContext) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) {
    throw convoyError('UNAUTHORIZED', 'Missing token');
  }
  const user = await verifyJwt(token);
  return { ...base, auth: { userId: user.sub } };
}
```

Cookie session example:

```ts
export async function createContext(req: IncomingMessage, base: ServerContext) {
  const cookie = req.headers.cookie ?? '';
  const sessionId = cookie.split('session=')[1]?.split(';')[0];
  if (!sessionId) {
    throw convoyError('UNAUTHORIZED', 'Missing session');
  }
  const session = await loadSession(sessionId);
  return { ...base, auth: { userId: session.userId } };
}
```

Optional server hook:

```ts
export function configureServer({ server }) {
  server.on('request', (_req, _res) => {
    // add custom logging or headers
  });
}
```

Best DX pattern (recommended):

1. Default: generated server entry (zero config). CLI generates `convoy/_generated/http.ts` with a default `createContext` that wires the DB, and `npx convoy dev` just works.
2. Optional: user-defined server entry (advanced). Create `convoy/server.ts` and export `createContext(req, base)` (and optionally `configureServer`); the CLI auto-detects it and uses it.

Best practices:

- Resolve auth once per request (or once per SSE subscription connection) and attach it to context.
- Throw `convoyError('UNAUTHORIZED', ...)` or `convoyError('FORBIDDEN', ...)` to return structured errors.
- If you use header-based auth, note that SSE cannot send custom headers; prefer cookie sessions or set `subscribe: false`.
- Bring your own auth — Convoy does not require a hosted auth provider.

Typed auth helpers:

```ts
// convoy/functions/_auth.ts
import { convoyError, createFunctionHelpers, type Id } from 'convoy';
import type { ServerContext } from '../_generated/server';

export type AuthContext = ServerContext & { auth: { userId: Id<'users'> } | null };

const helpers = createFunctionHelpers<AuthContext>();
export const authQuery = helpers.query;
export const authMutation = helpers.mutation;

export function requireAuth(ctx: AuthContext) {
  if (!ctx.auth?.userId) {
    throw convoyError('UNAUTHORIZED', 'Missing session');
  }
  return ctx.auth;
}
```

---

### How reactivity works (high level)

1. useQuery opens an SSE subscription
2. The server runs the query and streams the initial result
3. A mutation runs and writes to Postgres
4. Postgres emits NOTIFY
5. The server refreshes affected subscriptions
6. Updated query results are pushed to clients

The server is always the source of truth.

### Escape hatches

Raw SQL:

```ts
import { sql } from 'drizzle-orm';

const rows = await ctx.db.raw<{ total: number }>(sql`select count(*) as total from users`);
```

Opt out of table management:

```ts
import { defineSchema, defineTable } from 'convoy';
import { z } from 'zod';

export default defineSchema({
  audit_log: defineTable({ event: z.string() }).unmanaged(),
});
```

Mixing Convoy with traditional backends:

- Use Convoy for realtime slices (collab, dashboards) while keeping REST/GraphQL for everything else.
- Point both systems at the same database; Convoy never drops tables and only creates what it manages.
- You can call existing services from Convoy functions (e.g. via HTTP or shared modules).

Eject story:

- Your data stays in Postgres; you can stop the Convoy server without losing any rows.
- Queries and mutations are just TypeScript functions — move them into another backend or reuse them in APIs.
- You can keep generated types (`convoy/_generated`) or replace them with your own client logic.

### Roadmap (high level)

Near-term (v1):

- runtime hardening and reconnect guarantees
- structured error handling
- auth patterns via request context
- clear dev vs deploy workflows
- escape hatches (raw SQL, interop)

---

License

MIT (planned once APIs stabilize)
