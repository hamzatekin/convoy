/* @vitest-environment happy-dom */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import { makeQueryRef } from '../../src/client.ts';
import { useQuery } from '../../src/react.ts';

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];

  url: string;
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emitOpen() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  emitError(state = FakeEventSource.CLOSED) {
    this.readyState = state;
    this.onerror?.();
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

describe('useQuery SSE reconnect', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    const window = new Window();
    window.location.href = 'http://localhost/';
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).navigator = window.navigator;
    (globalThis as any).EventSource = FakeEventSource;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as any).EventSource;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).navigator;
  });

  it('refetches after reconnecting', async () => {
    const client = {
      baseUrl: '',
      query: vi.fn().mockResolvedValue('ok'),
      mutation: vi.fn(),
    };
    const ref = makeQueryRef(
      'users.list',
      null as unknown as { handler: (ctx: unknown, args: { id: string }) => string },
    );

    const Component = () => {
      useQuery(ref, { id: '1' }, { client, subscribe: true, subscribeUrl: 'http://localhost/api/subscribe' });
      return null;
    };

    await act(async () => {
      render(React.createElement(Component));
    });

    const firstSource = FakeEventSource.instances[0];
    expect(firstSource).toBeTruthy();

    await act(async () => {
      firstSource.emitOpen();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.query).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSource.emitError(FakeEventSource.CLOSED);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    const nextSource = FakeEventSource.instances[1];
    expect(nextSource).toBeTruthy();

    await act(async () => {
      nextSource.emitOpen();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
