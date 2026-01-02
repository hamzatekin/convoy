/* @vitest-environment happy-dom */
import React, { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import { makeMutationRef, makeQueryRef } from '../../src/client.ts';
import { useMutation, useQuery } from '../../src/react.ts';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useQuery execution ordering', () => {
  beforeEach(() => {
    const window = new Window();
    window.location.href = 'http://localhost/';
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).navigator = window.navigator;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    delete (globalThis as any).EventSource;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).navigator;
  });

  it('keeps the latest refetch result when responses resolve out of order', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const client = {
      baseUrl: '',
      query: vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
      mutation: vi.fn(),
    };
    const ref = makeQueryRef(
      'users.list',
      null as unknown as { handler: (ctx: unknown, args: { id: string }) => string },
    );

    const dataRef = { current: null as string | null };
    const refetchRef = { current: null as null | (() => Promise<string | null>) };

    const Component = () => {
      const { data, refetch } = useQuery(ref, { id: '1' }, { client, enabled: false });
      useEffect(() => {
        dataRef.current = data as string | null;
      }, [data]);
      useEffect(() => {
        refetchRef.current = refetch as () => Promise<string | null>;
      }, [refetch]);
      return null;
    };

    await act(async () => {
      render(React.createElement(Component));
    });

    await act(async () => {
      void refetchRef.current?.();
      void refetchRef.current?.();
    });

    await act(async () => {
      second.resolve('newer');
      await second.promise;
    });

    expect(dataRef.current).toBe('newer');

    await act(async () => {
      first.resolve('older');
      await first.promise;
    });

    expect(dataRef.current).toBe('newer');
  });

  it('does not let stale in-flight results override mutation invalidations', async () => {
    const initial = createDeferred<string>();
    const refresh = createDeferred<string>();
    const mutation = createDeferred<string>();
    const queryCalls = [initial, refresh];
    let queryIndex = 0;
    const client = {
      baseUrl: '',
      query: vi.fn().mockImplementation(() => queryCalls[queryIndex++].promise),
      mutation: vi.fn().mockImplementation(() => mutation.promise),
    };

    const queryRef = makeQueryRef(
      'projects.list',
      null as unknown as { handler: (ctx: unknown, args: { id: string }) => string },
    );
    const mutationRef = makeMutationRef(
      'projects.create',
      null as unknown as { handler: (ctx: unknown, args: { name: string }) => string },
    );

    const dataRef = { current: null as string | null };
    const mutateRef = { current: null as null | ((args: { name: string }) => Promise<string>) };

    const Component = () => {
      const { data } = useQuery(queryRef, { id: '1' }, { client });
      const mutate = useMutation(mutationRef, { client });
      useEffect(() => {
        dataRef.current = data as string | null;
      }, [data]);
      useEffect(() => {
        mutateRef.current = mutate as (args: { name: string }) => Promise<string>;
      }, [mutate]);
      return null;
    };

    await act(async () => {
      render(React.createElement(Component));
    });

    expect(client.query).toHaveBeenCalledTimes(1);

    let mutationPromise: Promise<string> | undefined;
    await act(async () => {
      mutationPromise = mutateRef.current?.({ name: 'Roadmap' });
    });

    expect(client.query).toHaveBeenCalledTimes(1);

    await act(async () => {
      mutation.resolve('done');
      await mutationPromise;
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.query).toHaveBeenCalledTimes(2);

    await act(async () => {
      refresh.resolve('fresh');
      await refresh.promise;
    });

    expect(dataRef.current).toBe('fresh');

    await act(async () => {
      initial.resolve('stale');
      await initial.promise;
    });

    expect(dataRef.current).toBe('fresh');
  });
});
