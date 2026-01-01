import { mutation } from '../_generated/server';
import { z } from 'zod';

export const createUser = mutation({
  args: { deviceId: z.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert('users', {
      deviceId: args.deviceId,
      createdAt: Date.now(),
    });
  },
});
