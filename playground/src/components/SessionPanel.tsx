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
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);
  const [invalidLoading, setInvalidLoading] = useState(false);

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg shadow-md">
          👤
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Workspace</h2>
          <p className="text-xs text-slate-500">{sessionUserId ? 'Active session' : 'Create a user to start'}</p>
        </div>
      </div>

      {/* Session Status */}
      {sessionUserId ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="flex-1 truncate text-xs font-medium text-emerald-800">
              {sessionUserId.slice(0, 8)}...{sessionUserId.slice(-8)}
            </span>
          </div>
          <p className="text-xs text-slate-500">{authStatus}</p>
          {mutationError ? <p className="text-xs text-rose-600">{mutationError.message}</p> : null}
          <div className="flex gap-2">
            <button
              onClick={handleCreateUser}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? 'Creating...' : 'New User'}
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            onClick={handleCreateUser}
            disabled={isLoading}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:shadow-lg hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      )}

      {/* Developer Tools (Collapsible) */}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <button
          onClick={() => setDevToolsOpen(!devToolsOpen)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-600"
        >
          <span>Developer Tools</span>
          <svg
            className={`h-4 w-4 transform transition-transform ${devToolsOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {devToolsOpen && (
          <div className="mt-4 space-y-4">
            {/* Auth Transport */}
            <div>
              <p className="text-xs font-medium text-slate-600">Auth Transport</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['header', 'cookie'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAuthMode(mode)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                      authMode === mode
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {mode === 'header' ? 'Header' : 'Cookie'}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {authMode === 'cookie' ? 'Enables SSE subscriptions' : 'POST requests only'}
              </p>
            </div>

            {/* Error Testing */}
            <div>
              <p className="text-xs font-medium text-slate-600">Error Testing</p>
              <div className="mt-2 space-y-2">
                <button
                  onClick={handleProbeAuth}
                  disabled={probeLoading}
                  className="w-full rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {probeLoading ? 'Testing...' : 'Test Unauth Request'}
                </button>
                <button
                  onClick={handleInvalidInput}
                  disabled={invalidLoading}
                  className="w-full rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {invalidLoading ? 'Testing...' : 'Test Invalid Input'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
