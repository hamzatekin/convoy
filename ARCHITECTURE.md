# Convoy Architecture

This document explains how Convoy is structured to help contributors understand the codebase.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User App                                │
├─────────────────────────────────────────────────────────────────┤
│  convoy/schema.ts     │  convoy/functions/*.ts                  │
│  (defineSchema)       │  (query, mutation)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLI (convoy dev)                           │
│  - Watches schema + functions                                   │
│  - Syncs database (creates tables/indexes)                      │
│  - Generates typed API bindings                                 │
│  - Starts HTTP server                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  _generated/     │ │  _generated/     │ │  _generated/     │
│  api.ts          │ │  server.ts       │ │  http.ts         │
│  (client refs)   │ │  (typed ctx)     │ │  (HTTP handler)  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     @avvos/convoy                               │
├─────────────────────────────────────────────────────────────────┤
│  client.ts   │  react.ts   │  server.ts   │  node.ts           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                               │
│  - JSONB document tables                                        │
│  - GIN indexes on JSONB fields                                  │
│  - LISTEN/NOTIFY for change signals                             │
└─────────────────────────────────────────────────────────────────┘
```

## Package Exports

Convoy exposes four entry points:

| Export                 | Purpose                                 | Environment     |
| ---------------------- | --------------------------------------- | --------------- |
| `@avvos/convoy`        | Schema definitions, core types          | Shared          |
| `@avvos/convoy/client` | HTTP client, `createConvoyClient()`     | Browser/Node    |
| `@avvos/convoy/react`  | React hooks (`useQuery`, `useMutation`) | Browser (React) |
| `@avvos/convoy/node`   | HTTP handler, SSE subscription manager  | Node.js server  |

## Source Files

### `src/schema/`

Schema definition utilities:

- **`define-table.ts`** — `defineTable()` creates a table definition with Zod schema
- **`define-schema.ts`** — `defineSchema()` combines tables into a typed schema object
- **`define-ref.ts`** — `defineRef()` creates typed foreign key references
- **`ids.ts`** — ID encoding/decoding (`table:uuid` format)

### `src/server.ts`

Server-side runtime:

- **`createDb()`** — Creates the database interface with `insert`, `get`, `patch`, `query`, `raw`
- **`query()` / `mutation()`** — Function definition factories with input validation
- **`createBaseContext()`** — Creates the base context with db + runQuery/runMutation
- **`createFunctionHelpers()`** — For custom context types (auth wrappers)

Key abstractions:

- `QueryBuilder` — Fluent API for `.withIndex()`, `.order()`, `.collect()`, `.first()`
- SQL generation via drizzle-orm's `sql` template tag

### `src/node.ts`

Node.js HTTP layer:

- **`createNodeHandler()`** — Express-compatible HTTP handler for queries/mutations
- **`createQuerySubscriptionManager()`** — Manages SSE connections and broadcasts

Key features:

- Request routing (`/api/query/:name`, `/api/mutation/:name`, `/api/subscribe`)
- Input parsing and validation
- Error serialization to structured JSON
- SSE heartbeats and reconnection handling

### `src/client.ts`

Browser/Node client:

- **`createConvoyClient()`** — HTTP client for calling queries/mutations
- **`QueryRef` / `MutationRef`** — Type-safe function references
- **`ConvoyError`** — Structured error class

### `src/react.ts`

React bindings:

- **`useQuery()`** — Subscribes to a query with SSE, manages loading/error/stale states
- **`useMutation()`** — Simple mutation caller
- **`useMutationState()`** — Mutation with loading/error state tracking
- **`skipToken`** — Skip query execution conditionally

Internal:

- `querySubscriptionSources` — Shared SSE connections (deduped by URL)
- `localInvalidationListeners` — Triggers refetch after local mutations

### `src/errors.ts`

Error handling:

- **`ConvoyError`** — Typed error with `code`, `message`, `details`
- **`convoyError()`** — Factory for throwing structured errors
- **Error codes** — `INVALID_ARGS`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL`

## Data Flow

### Query Execution

```
1. Client calls useQuery(api.projects.list, { userId })
2. Hook makes POST to /api/query/projects.list
3. Server resolves context (auth)
4. Server executes query function with ctx + validated input
5. Query uses ctx.db.query('projects').withIndex(...).collect()
6. SQL executes against Postgres
7. Results returned as JSON
8. (If subscribed) SSE connection opened to /api/subscribe
```

### Mutation + Reactivity

```
1. Client calls mutate(api.projects.create, { name: '...' })
2. Hook makes POST to /api/mutation/projects.create
3. Server executes mutation (INSERT INTO projects)
4. Postgres trigger fires NOTIFY convoy_changes
5. Server receives NOTIFY
6. All active SSE subscriptions refresh their queries
7. Updated results pushed to clients
```

## Generated Files

The CLI generates these in `convoy/_generated/`:

| File           | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `api.ts`       | Typed `QueryRef` and `MutationRef` for each function |
| `server.ts`    | Server context type, re-exports `query`/`mutation`   |
| `http.ts`      | HTTP handler with all functions wired up             |
| `functions.ts` | Re-exports all user functions                        |
| `dataModel.ts` | `Doc<TableName>` and `Id<TableName>` types           |

## Database Schema

Each table is created as:

```sql
CREATE TABLE IF NOT EXISTS table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Indexes are GIN indexes on JSONB paths:

```sql
CREATE INDEX IF NOT EXISTS idx_table_by_field
  ON table_name USING GIN ((data -> 'field'));
```

## Where to Look

| Task                       | Look Here                                          |
| -------------------------- | -------------------------------------------------- |
| Add a new db operation     | `src/server.ts` → `createDb()`                     |
| Modify SSE behavior        | `src/node.ts` → `createQuerySubscriptionManager()` |
| Change React hook behavior | `src/react.ts` → `useQuery()`                      |
| Add a new error code       | `src/errors.ts`                                    |
| Modify CLI behavior        | `bin/convoy.js` + generation logic                 |
| Add schema features        | `src/schema/define-table.ts`                       |
