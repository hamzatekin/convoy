import type { Id } from 'convoy';
import { useMutation } from 'convoy/react';
import { api } from '../../convoy/_generated/api.ts';

type SessionPanelProps = {
  userId: Id<'users'> | null;
  setUserId: (value: Id<'users'> | null) => void;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
};

export default function SessionPanel({ userId, setUserId, setStatus, setError }: SessionPanelProps) {
  const createUser = useMutation(api.users.createUser);

  async function handleCreateUser() {
    const deviceId = `device-${Date.now()}`;
    setError(null);
    setStatus('Creating user...');
    try {
      const id = await createUser({ deviceId });
      setUserId(id);
      setStatus('User created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  return (
    <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
          <p className="mt-1 text-xs text-slate-500">Provision a local user to start creating boards.</p>
        </div>
        <button
          onClick={handleCreateUser}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Create user
        </button>
      </div>
      <div className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-xs font-mono text-slate-600">
        {userId ?? 'No user yet'}
      </div>
    </section>
  );
}
