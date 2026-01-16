# Convoy

**Move fast with schemaless. Graduate to relational when you're ready. Never leave Postgres.**

Convoy is a self-hosted backend runtime for indie hackers and small teams who want to validate ideas fast—without painting themselves into a corner.

Start with **JSONB documents** for rapid iteration. Get **typed React hooks** and **reactive queries** out of the box. When you find product-market fit and need migrations, foreign keys, and data integrity—you're already on Postgres. Just graduate your schema.

**No database migration. No vendor lock-in. Lock-out from day 1.**

```bash
npm install @avvos/convoy zod
```

**Status:** `0.0.x` — MVP (core ideas working, APIs stabilizing)

---

## The Problem

You're building something new. You don't know your schema yet. You need to move fast.

**Option A: Firebase/MongoDB**

- ✅ Fast to start, no schema decisions
- ❌ When you need relational? Painful migration to Postgres

**Option B: Supabase/Drizzle**

- ✅ Proper relational from day 1
- ❌ Slow to start, migrations before you even have users

**Option C: Convex**

- ✅ Amazing DX, reactive queries
- ❌ Proprietary storage, "open source" that's not really self-hostable

**Convoy:**

- ✅ Schemaless speed (JSONB documents)
- ✅ Already on Postgres (no migration later)
- ✅ Graduate to relational when ready
- ✅ Actually self-hostable

---

## How It Works

### 1. Define your schema with Zod

```ts
// convoy/schema.ts
import { defineSchema, defineTable, defineRef } from '@avvos/convoy';
import { z } from 'zod';

export const schema = defineSchema({
  users: defineTable({
    name: z.string(),
    email: z.string(),
    createdAt: z.number(),
  }),
  projects: defineTable({
    name: z.string(),
    userId: defineRef('users'),
    status: z.enum(['draft', 'active', 'archived']),
    createdAt: z.number(),
  }).index('by_userId', ['userId']),
});
```

This creates JSONB tables in Postgres. Fast to change, no migrations needed during development.

### 2. Write queries and mutations

```ts
// convoy/functions/projects.ts
import { mutation, query } from '../_generated/server';
import { defineRef } from '@avvos/convoy';
import { z } from 'zod';

export const createProject = mutation({
  input: { userId: defineRef('users'), name: z.string() },
  handler: async (ctx, input) => {
    return ctx.db.insert('projects', {
      userId: input.userId,
      name: input.name,
      status: 'draft',
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

### 3. Run the dev server

```bash
npx @avvos/convoy dev
```

This:

- Creates tables and indexes in Postgres
- Generates typed client APIs
- Starts the HTTP + SSE server

### 4. Use typed React hooks

```tsx
import { useQuery, useMutation, skipToken } from '@avvos/convoy/react';
import { api } from '../convoy/_generated/api';

function ProjectList({ userId }) {
  const { data: projects, isLoading } = useQuery(api.projects.listProjects, { userId });
  const createProject = useMutation(api.projects.createProject);

  // UI updates automatically when data changes—no refetch needed
}
```

That's it. End-to-end type safety. Reactive updates. On your own Postgres.

---

## Why Postgres JSONB?

Postgres JSONB gives you the best of both worlds:

| Schemaless Benefits      | Postgres Benefits                     |
| ------------------------ | ------------------------------------- |
| No upfront schema design | ACID transactions                     |
| Add fields anytime       | Battle-tested reliability             |
| Fast iteration           | Already deployed everywhere           |
| No migrations during dev | Rich ecosystem (Supabase, Neon, etc.) |

**And when you're ready to graduate:**

Your data is already in Postgres. Add proper tables, foreign keys, and migrations using standard tools (Drizzle, Prisma, raw SQL). Convoy never locks you in—it's designed for you to lock _out_.

---

## The Graduation Path

**Day 1: Validate fast**

```ts
// JSONB document - flexible, no schema commitment
defineTable({
  name: z.string(),
  settings: z.object({}).passthrough(), // throw anything in here
  createdAt: z.number(),
});
```

**Day 30: You have users, things are working**

```ts
// Tighten the schema
defineTable({
  name: z.string(),
  settings: z.object({
    theme: z.enum(['light', 'dark']),
    notifications: z.boolean(),
  }),
  createdAt: z.number(),
});
```

**Day 90: You need real data integrity**

```sql
-- Graduate to relational tables
-- Your data is already in Postgres—just transform it
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES users(id);
UPDATE projects SET user_id = (data->>'userId')::uuid;
```

Convoy gets out of your way. Your data, your database, your choice.

---

## Features

### Reactive Queries

Queries automatically update when data changes. No manual refetching.

```tsx
const { data, isLoading, isStale, connectionState } = useQuery(api.projects.list, { userId });
// data updates automatically when any mutation affects this query
```

### End-to-End Type Safety

Schema → Server → Client. No manual type definitions.

```ts
// Type errors if you pass wrong args
const project = await client.mutation(api.projects.create, {
  userId: 'users:abc123', // ✅ typed as Id<'users'>
  name: 'My Project', // ✅ typed as string
});
```

### Structured Errors

```ts
import { ConvoyError } from '@avvos/convoy/client';

try {
  await mutate({ name: '' });
} catch (err) {
  if (err instanceof ConvoyError) {
    console.log(err.code); // 'INVALID_ARGS' | 'UNAUTHORIZED' | ...
    console.log(err.message); // Human-readable message
  }
}
```

### Bring Your Own Auth

```ts
// convoy/server.ts
export async function createContext(req, base) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const user = await verifyJwt(token);
  return { ...base, auth: { userId: user.sub } };
}
```

### Escape Hatches

**Raw SQL when you need it:**

```ts
const rows = await ctx.db.raw<{ count: number }>(sql`
  SELECT COUNT(*) as count FROM projects WHERE status = 'active'
`);
```

**Unmanaged tables for existing data:**

```ts
defineTable({ event: z.string() }).unmanaged();
```

**Mix with existing backends:**

```ts
// Call your REST API from a mutation
const result = await fetch('https://api.stripe.com/...');
```

---

## Self-Hosting

Convoy runs on any server with Node.js and Postgres.

```bash
# Set your database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/myapp"

# Run the server
npx @avvos/convoy dev
```

**Production:**

```bash
# Sync schema (safe, non-destructive)
npx @avvos/convoy migrate

# Run your server however you want
node convoy/_generated/http.js
```

Works with Railway, Fly.io, Docker, VPS—anywhere you can run Node.js.

---

## What Convoy Is / Is Not

**Convoy is:**

- A typed function runtime (query/mutation) on your Postgres
- A reactive layer that keeps clients in sync
- A fast iteration tool for validating ideas
- A bridge from schemaless to relational

**Convoy is not:**

- A hosted backend (self-host it yourself)
- A replacement for all backend code (mix it with REST/GraphQL)
- A migration engine (it creates tables, doesn't drop them)
- An auth provider (bring your own)

---

## Tradeoffs

Be aware of these limitations:

- **SSE only** — No WebSocket transport (works fine for web, less ideal for mobile)
- **JSONB-first** — Not traditional relational tables (that's the point)
- **Long-lived process** — Needs a server, not serverless-friendly
- **Early stage** — APIs may change before v1.0

---

## Comparison

|                    | Convoy  | Firebase | Convex  | Supabase              |
| ------------------ | ------- | -------- | ------- | --------------------- |
| Self-hosted        | ✅ Easy | ❌       | ⚠️ Hard | ✅                    |
| Schemaless start   | ✅      | ✅       | ✅      | ❌                    |
| Path to relational | ✅      | ❌       | ❌      | ✅ Already relational |
| Reactive queries   | ✅      | ✅       | ✅      | ⚠️ Realtime channels  |
| Typed hooks        | ✅      | ❌       | ✅      | ❌                    |
| Own your data      | ✅      | ❌       | ⚠️      | ✅                    |

---

## Getting Started

```bash
# Install
npm install @avvos/convoy zod

# Create convoy/schema.ts and convoy/functions/*.ts

# Run dev server
npx @avvos/convoy dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it works under the hood.

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what's coming in v1.0:

- `db.delete()` and transaction support
- `create-convoy-app` CLI for instant setup
- One-click deploy templates (Docker, Railway)
- Graduation tooling (JSONB → relational)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up the dev environment and submit PRs.

---

## License

MIT
