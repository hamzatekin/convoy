/* @vitest-environment happy-dom */
import React, { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import { makeMutationRef } from '../../src/client.ts';
import { useMutationState } from '../../src/react.ts';

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

describe('useMutationState', () => {
  beforeEach(() => {
    const window = new Window();
    window.location.href = 'http://localhost/';
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).navigator = window.navigator;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).navigator;
  });

  it('tracks loading and error state for mutations', async () => {
    const deferred = createDeferred<string>();
    const client = {
      baseUrl: '',
      query: vi.fn(),
      mutation: vi.fn().mockImplementation(() => deferred.promise),
    };
    const ref = makeMutationRef(
      'projects.create',
      null as unknown as { handler: (ctx: unknown, args: { name: string }) => string },
    );

    const mutateRef = { current: null as null | ((args: { name: string }) => Promise<string>) };
    const loadingRef = { current: false };
    const errorRef = { current: null as Error | null };

    const Component = () => {
      const { mutate, isLoading, error } = useMutationState(ref, { client });
      useEffect(() => {
        mutateRef.current = mutate as (args: { name: string }) => Promise<string>;
      }, [mutate]);
      useEffect(() => {
        loadingRef.current = isLoading;
      }, [isLoading]);
      useEffect(() => {
        errorRef.current = error;
      }, [error]);
      return null;
    };

    await act(async () => {
      render(React.createElement(Component));
    });

    expect(loadingRef.current).toBe(false);
    expect(errorRef.current).toBeNull();

    let mutationPromise: Promise<string> | undefined;
    await act(async () => {
      mutationPromise = mutateRef.current?.({ name: 'Roadmap' });
    });

    expect(loadingRef.current).toBe(true);

    await act(async () => {
      deferred.reject(new Error('boom'));
      await mutationPromise?.catch(() => undefined);
    });

    expect(loadingRef.current).toBe(false);
    expect(errorRef.current?.message).toBe('boom');
  });
});
