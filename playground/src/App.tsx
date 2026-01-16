// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Id } from '@avvos/convoy';
import { createConvoyClient } from '@avvos/convoy/client';
import { skipToken, useQuery } from '@avvos/convoy/react';
import { api } from '../convoy/_generated/api.ts';
import type { Doc } from '../convoy/_generated/dataModel';
import OnboardingHero from './components/OnboardingHero';
import SessionPanel from './components/SessionPanel';
import ProjectsPanel from './components/ProjectsPanel';
import TasksPanel from './components/TasksPanel';
import StatusPanel from './components/StatusPanel';

export default function App() {
  // Load session from localStorage on mount
  const [sessionUserId, setSessionUserIdState] = useState<Id<'users'> | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('convoy_session');
    return stored ? (stored as Id<'users'>) : null;
  });
  const [selectedProjectId, setSelectedProjectId] = useState<Id<'projects'> | null>(null);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'header' | 'cookie'>('cookie');

  // Persist session to localStorage
  const setSessionUserId = (id: Id<'users'> | null) => {
    setSessionUserIdState(id);
    if (id) {
      localStorage.setItem('convoy_session', id);
    } else {
      localStorage.removeItem('convoy_session');
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (authMode !== 'cookie') {
      document.cookie = 'convoy_user=; Max-Age=0; path=/; SameSite=Lax';
      return;
    }
    if (sessionUserId) {
      document.cookie = `convoy_user=${encodeURIComponent(sessionUserId)}; path=/; SameSite=Lax`;
      return;
    }
    document.cookie = 'convoy_user=; Max-Age=0; path=/; SameSite=Lax';
  }, [authMode, sessionUserId]);

  const client = useMemo(() => {
    return createConvoyClient({
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (authMode === 'header' && sessionUserId) {
          headers.set('x-convoy-user', sessionUserId);
        }
        return fetch(input, { ...init, headers, credentials: init?.credentials ?? 'same-origin' });
      },
    });
  }, [authMode, sessionUserId]);

  const anonymousClient = useMemo(() => {
    return createConvoyClient({
      fetch: (input, init) => fetch(input, { ...init, credentials: 'omit' }),
    });
  }, []);

  const shouldSubscribe = authMode === 'cookie';

  const {
    data: projects,
    error: projectsError,
    isLoading: projectsLoading,
    connectionState: projectsConnection,
    isReconnecting: projectsReconnecting,
    isStale: projectsStale,
    refetch: refetchProjects,
  } = useQuery(
    api.projects.listProjects,
    {},
    {
      client,
      enabled: Boolean(sessionUserId),
      subscribe: shouldSubscribe,
    },
  );

  const tasksArgs = selectedProjectId ? { projectId: selectedProjectId } : skipToken;

  const {
    data: tasks,
    error: tasksError,
    isLoading: tasksLoading,
    connectionState: tasksConnection,
    isReconnecting: tasksReconnecting,
    isStale: tasksStale,
    refetch: refetchTasks,
  } = useQuery(api.tasks.listTasks, tasksArgs, {
    client,
    enabled: Boolean(sessionUserId && selectedProjectId),
    subscribe: shouldSubscribe,
  });

  const {
    data: sqlStats,
    error: statsError,
    isLoading: statsLoading,
  } = useQuery(api.stats.overview, {}, { client, enabled: Boolean(sessionUserId), subscribe: shouldSubscribe });

  const {
    data: authUserId,
    error: authError,
    isLoading: authLoading,
  } = useQuery(api.users.whoami, {}, { client, enabled: Boolean(sessionUserId), subscribe: false });

  const projectsData: Array<Doc<'projects'>> = projects ?? [];
  const tasksData: Array<Doc<'tasks'>> = tasks ?? [];
  const selectedProject = projectsData.find((project) => project.id === selectedProjectId) ?? null;
  const combinedError =
    error ?? projectsError?.message ?? tasksError?.message ?? statsError?.message ?? authError?.message ?? null;
  const authStatus = sessionUserId
    ? authLoading
      ? 'Verifying session...'
      : authError
        ? 'Session rejected'
        : `Signed in as ${authUserId ?? sessionUserId}`
    : 'No active session';

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-32 right-8 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgb(var(--convoy-amber) / 0.6)' }}
        />
        <div
          className="absolute top-12 left-10 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgb(var(--convoy-sky) / 0.6)' }}
        />
        <div
          className="absolute bottom-12 right-1/3 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgb(var(--convoy-emerald) / 0.5)' }}
        />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        {/* Show onboarding hero when no session */}
        {!sessionUserId ? (
          <OnboardingHero
            onUserCreated={(id) => setSessionUserId(id as Id<'users'>)}
            setStatus={setStatus}
            setError={setError}
            client={anonymousClient}
          />
        ) : (
          <>
            {/* Header */}
            <header className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-500">Convoy Playground</span>
                  <h1 className="mt-2 text-3xl font-bold text-slate-900">Project Board</h1>
                  <p className="mt-1 text-sm text-slate-600">Realtime boards and cards powered by Convoy</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {projectsLoading ? 'Syncing' : `${projectsData.length} boards`}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {tasksLoading ? 'Syncing' : `${tasksData.length} cards`}
                  </span>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              <aside className="space-y-6">
                <SessionPanel
                  sessionUserId={sessionUserId}
                  setSessionUserId={setSessionUserId}
                  authStatus={authStatus}
                  setStatus={setStatus}
                  setError={setError}
                  client={client}
                  anonymousClient={anonymousClient}
                  authMode={authMode}
                  setAuthMode={setAuthMode}
                />
                <ProjectsPanel
                  hasSession={Boolean(sessionUserId)}
                  projects={projectsData}
                  projectsLoading={projectsLoading}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={setSelectedProjectId}
                  setStatus={setStatus}
                  setError={setError}
                  client={client}
                  refreshProjects={refetchProjects}
                />
              </aside>
              <section className="space-y-6">
                <TasksPanel
                  selectedProject={selectedProject}
                  selectedProjectId={selectedProjectId}
                  tasks={tasksData}
                  tasksLoading={tasksLoading}
                  setStatus={setStatus}
                  setError={setError}
                  hasSession={Boolean(sessionUserId)}
                  client={client}
                  refreshTasks={refetchTasks}
                />
                <StatusPanel
                  status={status}
                  error={combinedError}
                  streams={[
                    {
                      label: 'Boards feed',
                      state: projectsConnection,
                      isReconnecting: projectsReconnecting,
                      isStale: projectsStale,
                    },
                    {
                      label: 'Cards feed',
                      state: tasksConnection,
                      isReconnecting: tasksReconnecting,
                      isStale: tasksStale,
                    },
                  ]}
                  sqlStats={sqlStats ?? null}
                  sqlStatsLoading={statsLoading}
                  unmanagedTables={['audit_log']}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
