import { mutation } from '../_generated/server';
import { z } from 'zod';

export const createUser = mutation({
  input: { deviceId: z.string() },
  handler: async (ctx, input) => {
    return ctx.db.insert('users', { deviceId: input.deviceId, createdAt: Date.now() });
  },
});
