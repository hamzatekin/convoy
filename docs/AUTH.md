# Auth Integration Examples

Convoy uses a flexible `createContext(req, base)` pattern for authentication. Here are examples with popular auth libraries.

---

## Better Auth

```typescript
// convoy/server.ts
import { betterAuth } from 'better-auth';

const auth = betterAuth({
  /* your config */
});

export async function createContext(req: IncomingMessage, base: ServerContext) {
  const session = await auth.api.getSession({ headers: req.headers });
  return {
    ...base,
    user: session?.user ?? null,
    session: session?.session ?? null,
  };
}
```

---

## Lucia Auth

```typescript
// convoy/server.ts
import { lucia } from './lucia'; // your lucia instance

export async function createContext(req: IncomingMessage, base: ServerContext) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const sessionId = cookies[lucia.sessionCookieName];

  if (!sessionId) {
    return { ...base, user: null, session: null };
  }

  const { session, user } = await lucia.validateSession(sessionId);
  return { ...base, user, session };
}
```

---

## Auth.js (NextAuth)

```typescript
// convoy/server.ts
import { getToken } from 'next-auth/jwt';

export async function createContext(req: IncomingMessage, base: ServerContext) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  return {
    ...base,
    user: token ? { id: token.sub, email: token.email } : null,
  };
}
```

---

## Using Auth in Mutations

```typescript
// convoy/functions/posts.ts
import { mutation } from '../_generated/server';
import { z } from 'zod';

export const create = mutation({
  input: { title: z.string(), content: z.string() },
  handler: async (ctx, { title, content }) => {
    if (!ctx.user) {
      throw new Error('Unauthorized');
    }
    return ctx.db.insert('posts', {
      title,
      content,
      authorId: ctx.user.id,
    });
  },
});
```

---

## Protected Query Helper

```typescript
// convoy/lib/auth.ts
export function requireAuth<T>(ctx: ServerContext, fn: (user: User) => T | Promise<T>): Promise<T> {
  if (!ctx.user) {
    throw new Error('Unauthorized');
  }
  return Promise.resolve(fn(ctx.user));
}

// Usage
export const myPosts = query({
  input: {},
  handler: (ctx) =>
    requireAuth(ctx, (user) =>
      ctx.db
        .query('posts')
        .withIndex('by_author', (q) => q.eq('authorId', user.id))
        .collect(),
    ),
});
```
