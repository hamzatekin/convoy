import type { IncomingMessage } from 'node:http';
import type { Id } from 'convoy';
import type { ServerContext } from './_generated/server';

type AuthContext = ServerContext & {
  auth: { userId: Id<'users'> } | null;
};

function readCookie(header: string, name: string): string | null {
  const parts = header.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      const value = rest.join('=');
      if (!value) {
        return null;
      }
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

function resolveUserId(req: IncomingMessage): string | null {
  const header = req.headers['x-convoy-user'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  if (Array.isArray(header) && header.length > 0) {
    const value = header[0]?.trim();
    if (value) {
      return value;
    }
  }
  const cookieHeader = req.headers.cookie ?? '';
  const cookieValue = readCookie(cookieHeader, 'convoy_user');
  return cookieValue && cookieValue.trim() ? cookieValue.trim() : null;
}

export function createContext(req: IncomingMessage, base: ServerContext): AuthContext {
  const userId = resolveUserId(req);
  return {
    ...base,
    auth: userId ? { userId: userId as Id<'users'> } : null,
  };
}
