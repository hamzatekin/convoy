import { useState } from 'react';
import type { Id } from '@avvos/convoy';
import { ConvoyError, type ConvoyClient } from '@avvos/convoy/client';
import { useMutationState } from '@avvos/convoy/react';
import { api } from '../../convoy/_generated/api.ts';

type AuthMode = 'header' | 'cookie';

type SessionPanelProps = {
  sessionUserId: Id<'users'> | null;
  setSessionUserId: (value: Id<'users'> | null) => void;
  authStatus: string;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
  client: ConvoyClient;
  anonymousClient: ConvoyClient;
  authMode: AuthMode;
  setAuthMode: (value: AuthMode) => void;
};

export default function SessionPanel({
  sessionUserId,
  setSessionUserId,
  authStatus,
  setStatus,
  setError,
  client,
  anonymousClient,
  authMode,
  setAuthMode,
}: SessionPanelProps) {
  const { mutate: createUser, isLoading, error: mutationError } = useMutationState(api.users.createUser, { client });
  const [probeLoading, setProbeLoading] = useState(false);
  const [invalidLoading, setInvalidLoading] = useState(false);

  const authModeLabels: Record<AuthMode, string> = {
    header: 'Request header',
    cookie: 'Cookie session',
  };

  const authModeDescriptions: Record<AuthMode, string> = {
    header: 'Sends x-convoy-user with POST requests (SSE needs cookie mode).',
    cookie: 'Sends convoy_user cookie through the dev proxy (enables SSE).',
  };

  const formatError = (err: unknown) => {
    if (err instanceof ConvoyError) {
      return `${err.code}: ${err.message}`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Request failed';
  };

  async function handleCreateUser() {
    const deviceId = `device-${Date.now()}`;
    setError(null);
    setStatus('Creating user...');
    try {
      const id = await createUser({ deviceId });
      setSessionUserId(id);
      setStatus('User created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleProbeAuth() {
    setProbeLoading(true);
    setError(null);
    setStatus('Probing auth (expected to fail)...');
    try {
      await anonymousClient.query(api.users.whoami, {});
      setStatus('Unexpected auth success');
    } catch (err) {
      const message = formatError(err);
      setError(message);
      setStatus('Auth error captured');
    } finally {
      setProbeLoading(false);
    }
  }

  async function handleInvalidInput() {
    if (!sessionUserId) {
      setError('Create a user to test input validation.');
      setStatus('Missing session');
      return;
    }
    setInvalidLoading(true);
    setError(null);
    setStatus('Sending invalid input...');
    try {
      await client.mutation(api.projects.createProject as any, { name: 123 } as any);
      setStatus('Unexpected validation success');
    } catch (err) {
      const message = formatError(err);
      setError(message);
      setStatus('Validation error captured');
    } finally {
      setInvalidLoading(false);
    }
  }

  function handleSignOut() {
    setSessionUserId(null);
    setError(null);
    setStatus('Signed out');
  }

  return (
    <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
          <p className="mt-1 text-xs text-slate-500">Provision a local user to start creating boards.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateUser}
            disabled={isLoading}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? 'Creating...' : 'Create user'}
          </button>
          <button
            onClick={handleSignOut}
            disabled={!sessionUserId}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-mono text-slate-600">
          {sessionUserId ?? 'No user yet'}
        </div>
        <div className="text-xs text-slate-500">{authStatus}</div>
        {mutationError ? <div className="text-xs text-rose-600">{mutationError.message}</div> : null}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Auth transport</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['header', 'cookie'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAuthMode(mode)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                authMode === mode
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {authModeLabels[mode]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{authModeDescriptions[authMode]}</p>
        <p className="mt-1 text-xs text-slate-400">Resolved in convoy/server.ts createContext(req, base).</p>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">DX checks</p>
        <div className="mt-3 grid gap-2">
          <button
            onClick={handleProbeAuth}
            disabled={probeLoading}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {probeLoading ? 'Probing...' : 'Simulate unauth request'}
          </button>
          <button
            onClick={handleInvalidInput}
            disabled={invalidLoading}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {invalidLoading ? 'Sending...' : 'Send invalid input'}
          </button>
        </div>
      </div>
    </section>
  );
}
