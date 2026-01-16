import type { ConvoyClient } from '@avvos/convoy/client';
import { useMutationState } from '@avvos/convoy/react';
import { api } from '../../convoy/_generated/api.ts';

type OnboardingHeroProps = {
  onUserCreated: (userId: string) => void;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
  client: ConvoyClient;
};

export default function OnboardingHero({ onUserCreated, setStatus, setError, client }: OnboardingHeroProps) {
  const { mutate: createUser, isLoading } = useMutationState(api.users.createUser, { client });

  async function handleGetStarted() {
    const deviceId = `device-${Date.now()}`;
    setError(null);
    setStatus('Creating workspace...');
    try {
      const id = await createUser({ deviceId });
      onUserCreated(id);
      setStatus('Workspace ready!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-3xl bg-white/90 p-10 shadow-xl ring-1 ring-slate-200/70 backdrop-blur-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl shadow-lg">
          🚀
        </div>

        <h2 className="text-2xl font-bold text-slate-900">Welcome to Convoy Playground</h2>

        <p className="mt-3 max-w-md text-slate-600">
          Experience realtime database sync with typed queries and mutations. Create a workspace to start building your
          board.
        </p>

        <button
          onClick={handleGetStarted}
          disabled={isLoading}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating...
            </>
          ) : (
            'Get Started'
          )}
        </button>

        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Realtime sync
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Type-safe API
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            PostgreSQL
          </span>
        </div>
      </div>
    </div>
  );
}
