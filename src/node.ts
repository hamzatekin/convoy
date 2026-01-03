import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import type { ConvoyFunction } from './server';
import { type ConvoyErrorCode, type ConvoyErrorPayload, errorPayloadFrom, isConvoyError } from './errors';

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: ConvoyErrorPayload;
};

type FunctionMap<TContext extends object> = Record<string, ConvoyFunction<TContext, any, any>>;

type ContextProvider<TContext extends object> =
  | { createContext: (req: IncomingMessage) => TContext | Promise<TContext>; context?: never }
  | { context: TContext; createContext?: never };

export type ConvoyNodeHandlerOptions<TContext extends object> = ContextProvider<TContext> & {
  queries: FunctionMap<TContext>;
  mutations: FunctionMap<TContext>;
  basePath?: string;
  maxBodySize?: number;
  subscribePath?: string;
  onSubscribe?: (req: IncomingMessage, res: ServerResponse) => void;
  onMutation?: (event: ConvoyMutationEvent<TContext>) => void | Promise<void>;
};

export type ConvoyNodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

type UnhandledRequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;
const DEFAULT_SSE_RETRY_MS = 1000;
const DEFAULT_SSE_HEARTBEAT_MS = 25000;

export type ConvoyMutationEvent<TContext extends object> = {
  name: string;
  input: unknown;
  result: unknown;
  context: TContext;
};

type QuerySubscriptionMessage =
  | { type: 'result'; name: string; ts: number; data: unknown }
  | { type: 'error'; name: string; ts: number; error: ConvoyErrorPayload };

type QuerySubscription<TContext extends object> = {
  res: ServerResponse;
  name: string;
  args: unknown;
  fn: ConvoyFunction<TContext, any, any>;
  context: TContext;
  running: boolean;
  pending: boolean;
  heartbeat: ReturnType<typeof setInterval> | null;
};

export type ConvoyQuerySubscriptionManagerOptions<TContext extends object> = ContextProvider<TContext> & {
  queries: FunctionMap<TContext>;
  maxSubscriptions?: number;
  retryMs?: number;
  heartbeatMs?: number;
  log?: (message: string, details?: unknown) => void;
};

export type ConvoyQuerySubscriptionManager = {
  subscribe: (req: IncomingMessage, res: ServerResponse) => void;
  refreshAll: () => void;
};

function normalizeBasePath(basePath: string): string {
  const withSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

async function notifyMutation<TContext extends object>(
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

function sendError(
  res: ServerResponse,
  status: number,
  code: ConvoyErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  const error: ConvoyErrorPayload = details ? { code, message, details } : { code, message };
  sendJson(res, status, { ok: false, error });
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

function resolveContext<TContext extends object>(
  options: ContextProvider<TContext>,
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

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

function writeSse(res: ServerResponse, payload: QuerySubscriptionMessage): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeError(error: unknown): { status: number; payload: ConvoyErrorPayload } {
  if (isConvoyError(error)) {
    return { status: error.status, payload: errorPayloadFrom(error) };
  }
  if (error instanceof ZodError) {
    return { status: 400, payload: { code: 'INVALID_ARGS', message: error.message } };
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  return { status: 500, payload: { code: 'INTERNAL', message } };
}

export function createQuerySubscriptionManager<TContext extends object>(
  options: ConvoyQuerySubscriptionManagerOptions<TContext>,
): ConvoyQuerySubscriptionManager {
  const subscriptions = new Set<QuerySubscription<TContext>>();
  const maxSubscriptions = options.maxSubscriptions ?? 0;
  const retryMs = options.retryMs ?? DEFAULT_SSE_RETRY_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_SSE_HEARTBEAT_MS;
  const log = options.log;
  let pendingContexts = 0;

  const canAccept = () => {
    if (maxSubscriptions <= 0) {
      return true;
    }
    return subscriptions.size + pendingContexts < maxSubscriptions;
  };

  const runSubscription = async (subscription: QuerySubscription<TContext>) => {
    if (subscription.res.writableEnded || subscription.res.destroyed) {
      subscriptions.delete(subscription);
      return;
    }
    subscription.running = true;
    try {
      const data = await subscription.fn.run(subscription.context, subscription.args);
      writeSse(subscription.res, {
        type: 'result',
        name: subscription.name,
        ts: Date.now(),
        data,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      writeSse(subscription.res, {
        type: 'error',
        name: subscription.name,
        ts: Date.now(),
        error: normalized.payload,
      });
    } finally {
      subscription.running = false;
      if (subscription.pending) {
        subscription.pending = false;
        void runSubscription(subscription);
      }
    }
  };

  const queueRefresh = (subscription: QuerySubscription<TContext>) => {
    if (subscription.running) {
      subscription.pending = true;
      return;
    }
    void runSubscription(subscription);
  };

  const refreshAll = () => {
    for (const subscription of subscriptions) {
      queueRefresh(subscription);
    }
  };

  const subscribe = (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end('Missing URL');
      return;
    }
    if (!canAccept()) {
      res.statusCode = 429;
      res.end('Too many subscriptions');
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const name = url.searchParams.get('name');
    if (!name) {
      res.statusCode = 400;
      res.end('Missing query name');
      return;
    }

    let args: unknown = {};
    const rawArgs = url.searchParams.get('args');
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        res.statusCode = 400;
        res.end('Invalid args');
        return;
      }
    }

    const fn = options.queries[name];
    if (!fn) {
      res.statusCode = 404;
      res.end('Unknown query');
      return;
    }

    let context: TContext | Promise<TContext>;
    try {
      context = resolveContext<TContext>(options, req);
    } catch {
      res.statusCode = 500;
      res.end('Missing context');
      return;
    }

    const setupSubscription = (resolvedContext: TContext) => {
      if (!canAccept()) {
        res.statusCode = 429;
        res.end('Too many subscriptions');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (retryMs > 0) {
        res.write(`retry: ${retryMs}\n`);
      }
      res.write(': ok\n\n');

      const heartbeat =
        heartbeatMs > 0
          ? setInterval(() => {
              if (res.writableEnded || res.destroyed) {
                return;
              }
              res.write(': ping\n\n');
            }, heartbeatMs)
          : null;

      const subscription: QuerySubscription<TContext> = {
        res,
        name,
        args,
        fn,
        context: resolvedContext,
        running: false,
        pending: false,
        heartbeat,
      };
      subscriptions.add(subscription);
      log?.('Query subscribed', { name, count: subscriptions.size });

      const cleanup = () => {
        subscriptions.delete(subscription);
        if (subscription.heartbeat) {
          clearInterval(subscription.heartbeat);
        }
        log?.('Query unsubscribed', { name, count: subscriptions.size });
      };
      res.on('close', cleanup);
      res.on('error', cleanup);

      void runSubscription(subscription);
    };

    if (isThenable(context)) {
      pendingContexts += 1;
      void context
        .then((resolved) => {
          pendingContexts = Math.max(0, pendingContexts - 1);
          if (res.writableEnded || res.destroyed) {
            return;
          }
          setupSubscription(resolved);
        })
        .catch(() => {
          pendingContexts = Math.max(0, pendingContexts - 1);
          if (res.writableEnded || res.destroyed) {
            return;
          }
          res.statusCode = 500;
          res.end('Failed to create context');
        });
      return;
    }

    setupSubscription(context);
  };

  return { subscribe, refreshAll };
}

export function createNodeHandler<TContext extends object>(
  options: ConvoyNodeHandlerOptions<TContext>,
): ConvoyNodeHandler {
  const basePath = normalizeBasePath(options.basePath ?? '/api');
  const subscribePath = options.onSubscribe
    ? normalizeBasePath(options.subscribePath ?? `${basePath}/subscribe`)
    : null;
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const { queries, mutations } = options;

  return async (req, res) => {
    if (!req.url) {
      sendError(res, 400, 'INVALID_ARGS', 'Missing URL');
      return true;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    if (subscribePath && path === subscribePath) {
      if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET supported');
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
      sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST supported');
      return true;
    }

    const remaining = path.slice(basePath.length).replace(/^\/+/, '');
    const segments = remaining.split('/').filter(Boolean);
    if (segments.length !== 2) {
      sendError(res, 404, 'NOT_FOUND', 'Unknown endpoint');
      return true;
    }

    const [kind, rawName] = segments;
    let name = rawName;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      sendError(res, 400, 'INVALID_ARGS', 'Invalid endpoint name');
      return true;
    }

    let input: unknown = {};
    try {
      const body = await readBody(req, maxBodySize);
      if (body) {
        input = JSON.parse(body);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request body';
      if (message === 'Request body too large') {
        sendError(res, 413, 'PAYLOAD_TOO_LARGE', message);
      } else {
        sendError(res, 400, 'INVALID_ARGS', message);
      }
      return true;
    }

    try {
      const ctx = await resolveContext<TContext>(options, req);
      const fn = kind === 'mutation' ? mutations[name] : kind === 'query' ? queries[name] : undefined;
      if (!fn) {
        sendError(res, 404, 'NOT_FOUND', 'Unknown endpoint');
        return true;
      }
      const data = await fn.run(ctx, input);
      if (kind === 'mutation') {
        await notifyMutation(options, {
          name,
          input,
          result: data,
          context: ctx,
        });
      }
      sendJson(res, 200, { ok: true, data });
      return true;
    } catch (error) {
      const normalized = normalizeError(error);
      sendJson(res, normalized.status, { ok: false, error: normalized.payload });
      return true;
    }
  };
}

export function createNodeServer<TContext extends object>(
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
