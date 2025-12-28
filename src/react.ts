import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createConvoyClient,
  type ArgsOfRef,
  type ConvoyClient,
  type MutationRef,
  type QueryRef,
  type ResultOfRef,
} from "./client";

export type UseQueryOptions = {
  enabled?: boolean;
  client?: ConvoyClient;
};

export type UseMutationOptions = {
  client?: ConvoyClient;
};

export type UseQueryResult<TRef> = {
  data: ResultOfRef<TRef> | null;
  error: Error | null;
  isLoading: boolean;
  refetch: (
    nextArgs?: ArgsOfRef<TRef> | null,
  ) => Promise<ResultOfRef<TRef> | null>;
};

const defaultClient = createConvoyClient();

export function useQuery<TRef extends QueryRef<string, any, any>>(
  ref: TRef,
  args: ArgsOfRef<TRef> | null | undefined,
  options?: UseQueryOptions,
): UseQueryResult<TRef> {
  const client = options?.client ?? defaultClient;
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<ResultOfRef<TRef> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const argsRef = useRef(args);
  const lastAutoFetchKeyRef = useRef<string | null>(null);

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
      setIsLoading(true);
      setError(null);
      try {
        const result = await client.query(ref, resolvedArgs);
        setData(result);
        return result;
      } catch (err) {
        const nextError =
          err instanceof Error ? err : new Error("Query failed");
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
          const nextError =
            err instanceof Error ? err : new Error("Query failed");
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

  return { data, error, isLoading, refetch };
}

export function useMutation<TRef extends MutationRef<string, any, any>>(
  ref: TRef,
  options?: UseMutationOptions,
): (args: ArgsOfRef<TRef>) => Promise<ResultOfRef<TRef>> {
  const client = options?.client ?? defaultClient;
  return useCallback(
    (args: ArgsOfRef<TRef>) => client.mutation(ref, args),
    [client, ref],
  );
}
