import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createConvoyClient,
  type ArgsOfRef,
  type ConvoyClient,
  type MutationRef,
  type QueryRef,
  type ResultOfRef,
} from './client';

export type UseQueryOptions = {
  enabled?: boolean;
  client?: ConvoyClient;
  subscribe?: boolean;
  subscribeUrl?: string;
};

export type UseMutationOptions = {
  client?: ConvoyClient;
};

export type UseQueryResult<TRef> = {
  data: ResultOfRef<TRef> | null;
  error: Error | null;
  isLoading: boolean;
  refetch: (nextArgs?: ArgsOfRef<TRef> | null) => Promise<ResultOfRef<TRef> | null>;
};

type InvalidationListener = () => void;
type QuerySubscriptionMessage =
  | { type: 'result'; name: string; data: unknown; ts?: number }
  | { type: 'error'; name: string; error: string; ts?: number };

type QuerySubscriptionListener = (message: QuerySubscriptionMessage) => void;
type QuerySubscriptionSource = {
  source: EventSource;
  listeners: Set<QuerySubscriptionListener>;
};

const querySubscriptionSources = new Map<string, QuerySubscriptionSource>();
const localInvalidationListeners = new Set<InvalidationListener>();
const debugEnabled =
  (typeof window !== 'undefined' && window.localStorage?.getItem('CONVOY_DEBUG') === '1') ||
  (typeof process !== 'undefined' && process.env?.CONVOY_DEBUG === '1');

function debugLog(message: string, details?: unknown): void {
  if (!debugEnabled) {
    return;
  }
  if (details === undefined) {
    console.log(`[convoy] ${message}`);
    return;
  }
  console.log(`[convoy] ${message}`, details);
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path.startsWith('/') ? path : `/${path}`;
  }
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

function buildQuerySubscribeUrl(subscribeUrl: string, name: string, args: unknown): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(subscribeUrl, base);
  url.searchParams.set('name', name);
  url.searchParams.set('args', JSON.stringify(args ?? null));
  return url.toString();
}

function notifyLocalInvalidation(): void {
  debugLog('Local invalidation');
  for (const listener of localInvalidationListeners) {
    listener();
  }
}

function subscribeToLocalInvalidations(listener: InvalidationListener): () => void {
  localInvalidationListeners.add(listener);
  debugLog('Subscribed to local invalidations', {
    count: localInvalidationListeners.size,
  });
  return () => {
    localInvalidationListeners.delete(listener);
    debugLog('Unsubscribed from local invalidations', {
      count: localInvalidationListeners.size,
    });
  };
}

function parseQueryMessage(raw: string): QuerySubscriptionMessage | null {
  try {
    const parsed = JSON.parse(raw) as QuerySubscriptionMessage;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function subscribeToQueryResults(url: string, listener: QuerySubscriptionListener): () => void {
  let entry = querySubscriptionSources.get(url);
  if (!entry) {
    const source = new EventSource(url);
    const listeners = new Set<QuerySubscriptionListener>();
    source.onopen = () => {
      debugLog('SSE connected', { url });
    };
    source.onerror = () => {
      debugLog('SSE error', { url });
    };
    source.onmessage = (event) => {
      const message = parseQueryMessage(event.data);
      if (!message) {
        debugLog('SSE message ignored', { url });
        return;
      }
      debugLog('SSE message', { url, type: message.type });
      for (const callback of listeners) {
        callback(message);
      }
    };
    entry = { source, listeners };
    querySubscriptionSources.set(url, entry);
    debugLog('SSE subscribed', { url });
  }
  entry.listeners.add(listener);
  return () => {
    entry?.listeners.delete(listener);
    if (entry && entry.listeners.size === 0) {
      entry.source.close();
      querySubscriptionSources.delete(url);
      debugLog('SSE unsubscribed', { url });
    }
  };
}

const defaultClient = createConvoyClient();

export function useQuery<TRef extends QueryRef<string, any, any>>(
  ref: TRef,
  args: ArgsOfRef<TRef> | null | undefined,
  options?: UseQueryOptions,
): UseQueryResult<TRef> {
  const client = options?.client ?? defaultClient;
  const enabled = options?.enabled ?? true;
  const subscribe = options?.subscribe ?? true;
  const subscribeUrl = options?.subscribeUrl ?? joinUrl(client.baseUrl ?? '', '/api/subscribe');
  const [data, setData] = useState<ResultOfRef<TRef> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const argsRef = useRef(args);
  const lastAutoFetchKeyRef = useRef<string | null>(null);
  const sseActiveRef = useRef(false);

  useEffect(() => {
    argsRef.current = args;
  }, [args]);

  const argsKey = useMemo(() => {
    return JSON.stringify(args ?? null);
  }, [args]);

  const refetch = useCallback(
    async (nextArgs?: ArgsOfRef<TRef> | null) => {
      const resolvedArgs = nextArgs ?? argsRef.current;
      if (resolvedArgs == null) {
        return null;
      }
      debugLog('Query refetch', { name: ref.name });
      setIsLoading(true);
      setError(null);
      try {
        const result = await client.query(ref, resolvedArgs);
        setData(result);
        return result;
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error('Query failed');
        setError(nextError);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [client, ref],
  );

  useEffect(() => {
    const resolvedArgs = argsRef.current;
    if (!enabled || resolvedArgs == null) {
      lastAutoFetchKeyRef.current = null;
      setIsLoading(false);
      return;
    }
    if (lastAutoFetchKeyRef.current === argsKey) {
      return;
    }
    lastAutoFetchKeyRef.current = argsKey;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    client
      .query(ref, resolvedArgs)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const nextError = err instanceof Error ? err : new Error('Query failed');
          setError(nextError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [argsKey, client, enabled, ref]);

  useEffect(() => {
    if (!subscribe) {
      return;
    }
    if (!enabled || argsRef.current == null) {
      return;
    }
    sseActiveRef.current = false;
    const unsubscribeLocal = subscribeToLocalInvalidations(() => {
      if (sseActiveRef.current) {
        debugLog('Local invalidation ignored (SSE active)', {
          name: ref.name,
        });
        return;
      }
      if (!enabled || argsRef.current == null) {
        return;
      }
      void refetch();
    });
    if (typeof EventSource !== 'undefined') {
      const url = buildQuerySubscribeUrl(subscribeUrl, ref.name, argsRef.current);
      const unsubscribeSse = subscribeToQueryResults(url, (message) => {
        sseActiveRef.current = true;
        if (message.type === 'result') {
          setData(message.data as ResultOfRef<TRef>);
          setError(null);
          setIsLoading(false);
          return;
        }
        setError(new Error(message.error ?? 'Query failed'));
        setIsLoading(false);
      });
      return () => {
        unsubscribeSse();
        unsubscribeLocal();
      };
    }

    return () => unsubscribeLocal();
  }, [argsKey, enabled, refetch, ref.name, subscribe, subscribeUrl]);

  return { data, error, isLoading, refetch };
}

export function useMutation<TRef extends MutationRef<string, any, any>>(
  ref: TRef,
  options?: UseMutationOptions,
): (args: ArgsOfRef<TRef>) => Promise<ResultOfRef<TRef>> {
  const client = options?.client ?? defaultClient;
  return useCallback(
    async (args: ArgsOfRef<TRef>) => {
      const result = await client.mutation(ref, args);
      notifyLocalInvalidation();
      return result;
    },
    [client, ref],
  );
}
