import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ConvoyFunction } from './server';

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type FunctionMap<TContext> = Record<string, ConvoyFunction<TContext, any, any>>;

export type ConvoyNodeHandlerOptions<TContext> = {
  queries: FunctionMap<TContext>;
  mutations: FunctionMap<TContext>;
  createContext?: (req: IncomingMessage) => TContext | Promise<TContext>;
  context?: TContext;
  basePath?: string;
  maxBodySize?: number;
  subscribePath?: string;
  onSubscribe?: (req: IncomingMessage, res: ServerResponse) => void;
  onMutation?: (event: ConvoyMutationEvent<TContext>) => void | Promise<void>;
};

export type ConvoyNodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

type UnhandledRequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

export type ConvoyMutationEvent<TContext> = {
  name: string;
  args: unknown;
  result: unknown;
  context: TContext;
};

function normalizeBasePath(basePath: string): string {
  const withSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

async function notifyMutation<TContext>(
  options: ConvoyNodeHandlerOptions<TContext>,
  event: ConvoyMutationEvent<TContext>,
): Promise<void> {
  if (!options.onMutation) {
    return;
  }
  try {
    await options.onMutation(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mutation hook failed';
    console.error(message);
  }
}

function sendJson(res: ServerResponse, status: number, payload: ApiResponse<unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage, maxBodySize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length ?? 0;
      if (maxBodySize > 0 && size > maxBodySize) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function resolveContext<TContext>(
  options: ConvoyNodeHandlerOptions<TContext>,
  req: IncomingMessage,
): TContext | Promise<TContext> {
  if (options.createContext) {
    return options.createContext(req);
  }
  if (options.context !== undefined) {
    return options.context;
  }
  throw new Error('Convoy handler requires a context or createContext option');
}

export function createNodeHandler<TContext>(options: ConvoyNodeHandlerOptions<TContext>): ConvoyNodeHandler {
  const basePath = normalizeBasePath(options.basePath ?? '/api');
  const subscribePath = options.onSubscribe
    ? normalizeBasePath(options.subscribePath ?? `${basePath}/subscribe`)
    : null;
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const { queries, mutations } = options;

  return async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { ok: false, error: 'Missing URL' });
      return true;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    if (subscribePath && path === subscribePath) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Only GET supported' });
        return true;
      }
      options.onSubscribe?.(req, res);
      return true;
    }
    const matchesBase = path === basePath || path.startsWith(`${basePath}/`);
    if (!matchesBase) {
      return false;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Only POST supported' });
      return true;
    }

    const remaining = path.slice(basePath.length).replace(/^\/+/, '');
    const segments = remaining.split('/').filter(Boolean);
    if (segments.length !== 2) {
      sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });
      return true;
    }

    const [kind, rawName] = segments;
    let name = rawName;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Invalid endpoint name' });
      return true;
    }

    let args: unknown = {};
    try {
      const body = await readBody(req, maxBodySize);
      if (body) {
        args = JSON.parse(body);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request body';
      const status = message === 'Request body too large' ? 413 : 400;
      sendJson(res, status, { ok: false, error: message });
      return true;
    }

    try {
      const ctx = await resolveContext(options, req);
      const fn = kind === 'mutation' ? mutations[name] : kind === 'query' ? queries[name] : undefined;
      if (!fn) {
        sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });
        return true;
      }
      const data = await fn.run(ctx, args);
      if (kind === 'mutation') {
        await notifyMutation(options, {
          name,
          args,
          result: data,
          context: ctx,
        });
      }
      sendJson(res, 200, { ok: true, data });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      sendJson(res, 400, { ok: false, error: message });
      return true;
    }
  };
}

export function createNodeServer<TContext>(
  options: ConvoyNodeHandlerOptions<TContext> & {
    onUnhandled?: UnhandledRequestHandler;
  },
): Server {
  const handler = createNodeHandler(options);
  const onUnhandled = options.onUnhandled;
  return createServer((req, res) => {
    handler(req, res)
      .then((handled) => {
        if (!handled) {
          if (onUnhandled) {
            onUnhandled(req, res);
            return;
          }
          res.statusCode = 404;
          res.end();
        }
      })
      .catch(() => {
        res.statusCode = 500;
        res.end();
      });
  });
}
