import type { Id } from '../../../src/index.ts';
import { convoyError } from '../../../src/index.ts';
import type { ServerContext } from '../_generated/server';

export type AuthContext = ServerContext & {
  auth: { userId: Id<'users'> } | null;
};

export function requireAuth(ctx: AuthContext): { userId: Id<'users'> } {
  if (!ctx.auth?.userId) {
    throw convoyError('UNAUTHORIZED', 'Create a session before accessing boards');
  }
  return ctx.auth;
}
