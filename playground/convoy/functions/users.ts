import { mutation, query } from '../_generated/server';
import { z } from 'zod';
import { requireAuth } from './_auth';

export const createUser = mutation({
  input: { deviceId: z.string() },
  handler: async (ctx, input) => {
    return ctx.db.insert('users', { deviceId: input.deviceId, createdAt: Date.now() });
  },
});

export const whoami = query({
  input: {},
  handler: (ctx) => {
    const auth = requireAuth(ctx as any);
    return auth.userId;
  },
});
