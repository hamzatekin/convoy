# Migrating from Convex to Convoy

Convoy is inspired by Convex's developer experience. Here's how to migrate.

---

## Concepts Mapping

| Convex                          | Convoy                          |
| ------------------------------- | ------------------------------- |
| `convex/` directory             | `convoy/` directory             |
| `convex.json`                   | `.env` with `DATABASE_URL`      |
| `npx convex dev`                | `npx convoy dev`                |
| `api.users.get`                 | `api.users.get` (same!)         |
| `useQuery(api.users.get)`       | `useQuery(api.users.get)`       |
| `useMutation(api.users.create)` | `useMutation(api.users.create)` |
| Convex Cloud                    | Self-hosted Postgres            |

---

## Schema Migration

**Convex:**

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index('by_email', ['email']),
});
```

**Convoy:**

```typescript
// convoy/schema.ts
import { defineSchema, defineTable } from '@avvos/convoy';
import { z } from 'zod';

export default defineSchema({
  users: defineTable({
    name: z.string(),
    email: z.string(),
  }).index('by_email', ['email']),
});
```

**Key differences:**

- Replace `v.string()` with `z.string()` (Zod instead of Convex validators)
- Same `defineSchema` / `defineTable` API

---

## Query Migration

**Convex:**

```typescript
// convex/users.ts
import { query } from './_generated/server';
import { v } from 'convex/values';

export const get = query({
  args: { id: v.id('users') },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
```

**Convoy:**

```typescript
// convoy/functions/users.ts
import { query } from '../_generated/server';
import { z } from 'zod';

export const get = query({
  input: { id: z.string() }, // 'args' → 'input'
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id); // Same API!
  },
});
```

---

## Mutation Migration

**Convex:**

```typescript
export const create = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    return await ctx.db.insert('users', { name, email });
  },
});
```

**Convoy:**

```typescript
export const create = mutation({
  input: { name: z.string(), email: z.string() },
  handler: async (ctx, { name, email }) => {
    return await ctx.db.insert('users', { name, email });
  },
});
```

---

## Database API Comparison

| Operation | Convex                         | Convoy                               |
| --------- | ------------------------------ | ------------------------------------ |
| Insert    | `ctx.db.insert("users", data)` | Same ✓                               |
| Get       | `ctx.db.get(id)`               | Same ✓                               |
| Patch     | `ctx.db.patch(id, data)`       | Same ✓                               |
| Delete    | `ctx.db.delete(id)`            | Same ✓                               |
| Query     | `ctx.db.query("users")`        | Same ✓                               |
| Filter    | `.filter(q => q.eq(...))`      | `.withIndex("name", q => q.eq(...))` |
| Raw SQL   | N/A                            | `ctx.db.raw(sql\`...\`)`             |

---

## React Hooks

**Convex:**

```typescript
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

const user = useQuery(api.users.get, { id: '123' });
const createUser = useMutation(api.users.create);
```

**Convoy:**

```typescript
import { useQuery, useMutation } from '@avvos/convoy/react';
import { api } from '../convoy/_generated/api';

const { data: user } = useQuery(api.users.get, { id: '123' });
const { mutate: createUser } = useMutation(api.users.create);
```

**Differences:**

- `useQuery` returns `{ data, loading, error }` instead of just the data
- `useMutation` returns `{ mutate, loading, error }` instead of just the function

---

## What's Different in Convoy

1. **Self-hosted** — You run your own Postgres, not a managed service
2. **Zod validation** — Use Zod instead of Convex validators
3. **SSE transport** — Server-Sent Events instead of WebSockets
4. **Raw SQL** — Escape hatch for complex queries
5. **Transactions** — `ctx.db.transaction()` for atomic operations

---

## Migration Checklist

- [ ] Install: `npm install @avvos/convoy zod`
- [ ] Rename `convex/` → `convoy/`
- [ ] Update schema: `v.` → `z.`
- [ ] Update functions: `args` → `input`
- [ ] Update React imports
- [ ] Set up Postgres and `DATABASE_URL`
- [ ] Run `npx convoy dev`
