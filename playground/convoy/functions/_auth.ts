// convoy/functions/_auth.ts
import type { Id } from '../../../src/index.ts';
import { convoyError, createFunctionHelpers } from '../../../src/index.ts';
import type { ServerContext } from '../_generated/server';

export type AuthContext = ServerContext & {
  auth: { userId: Id<'users'> } | null;
};

const helpers = createFunctionHelpers<AuthContext>();
export const authQuery = helpers.query;
export const authMutation = helpers.mutation;

export function requireAuth(ctx: AuthContext): { userId: Id<'users'> } {
  if (!ctx.auth?.userId) {
    throw convoyError('UNAUTHORIZED', 'Create a session before accessing boards');
  }
  return ctx.auth;
}
