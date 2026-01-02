import type { Id } from 'convoy';
import type { ConvoyClient } from 'convoy/client';
import { useMutationState } from 'convoy/react';
import { api } from '../../convoy/_generated/api.ts';

type SessionPanelProps = {
  sessionUserId: Id<'users'> | null;
  setSessionUserId: (value: Id<'users'> | null) => void;
  authStatus: string;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
  client: ConvoyClient;
};

export default function SessionPanel({
  sessionUserId,
  setSessionUserId,
  authStatus,
  setStatus,
  setError,
  client,
}: SessionPanelProps) {
  const { mutate: createUser, isLoading, error } = useMutationState(api.users.createUser, { client });

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
        {error ? <div className="text-xs text-rose-600">{error.message}</div> : null}
      </div>
    </section>
  );
}
