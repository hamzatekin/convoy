import { z } from 'zod';
import { authMutation, authQuery, requireAuth } from './_auth';

export const createUser = authMutation({
  input: { deviceId: z.string() },
  handler: async (ctx, input) => {
    return ctx.db.insert('users', { deviceId: input.deviceId, createdAt: Date.now() });
  },
});

export const whoami = authQuery({
  input: {},
  handler: (ctx) => {
    const auth = requireAuth(ctx);
    return auth.userId;
  },
});
