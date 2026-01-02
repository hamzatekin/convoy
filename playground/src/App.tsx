import { useMemo, useState } from 'react';
import type { Id } from 'convoy';
import { createConvoyClient } from 'convoy/client';
import { useQuery } from 'convoy/react';
import { api } from '../convoy/_generated/api.ts';
import type { Doc } from '../convoy/_generated/dataModel';
import SessionPanel from './components/SessionPanel';
import ProjectsPanel from './components/ProjectsPanel';
import TasksPanel from './components/TasksPanel';
import StatusPanel from './components/StatusPanel';

export default function App() {
  const [sessionUserId, setSessionUserId] = useState<Id<'users'> | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<'projects'> | null>(null);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    return createConvoyClient({
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (sessionUserId) {
          headers.set('x-convoy-user', sessionUserId);
        }
        return fetch(input, { ...init, headers });
      },
    });
  }, [sessionUserId]);

  const {
    data: projects,
    error: projectsError,
    isLoading: projectsLoading,
    connectionState: projectsConnection,
    isReconnecting: projectsReconnecting,
    isStale: projectsStale,
  } = useQuery(api.projects.listProjects, {}, { client, enabled: Boolean(sessionUserId) });

  const tasksArgs = selectedProjectId ? { projectId: selectedProjectId } : null;

  const {
    data: tasks,
    error: tasksError,
    isLoading: tasksLoading,
    connectionState: tasksConnection,
    isReconnecting: tasksReconnecting,
    isStale: tasksStale,
  } = useQuery(api.tasks.listTasks, tasksArgs, { client, enabled: Boolean(sessionUserId && selectedProjectId) });

  const {
    data: authUserId,
    error: authError,
    isLoading: authLoading,
  } = useQuery(api.users.whoami, {}, { client, enabled: Boolean(sessionUserId), subscribe: false });

  const projectsData: Array<Doc<'projects'>> = projects ?? [];
  const tasksData: Array<Doc<'tasks'>> = tasks ?? [];
  const selectedProject = projectsData.find((project) => project.id === selectedProjectId) ?? null;
  const combinedError = error ?? projectsError?.message ?? tasksError?.message ?? authError?.message ?? null;
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
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500">Convoy playground</span>
              <h1 className="mt-2 text-4xl font-semibold text-slate-900">Trello Lite Board</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Simple boards and cards with realtime updates powered by Convoy queries, mutations, and SSE refreshes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                Boards: {projectsLoading ? 'syncing' : projectsData.length}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                Cards: {tasksLoading ? 'syncing' : tasksData.length}
              </span>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-6">
            <SessionPanel
              sessionUserId={sessionUserId}
              setSessionUserId={setSessionUserId}
              authStatus={authStatus}
              setStatus={setStatus}
              setError={setError}
              client={client}
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
            />
          </section>
        </div>
      </div>
    </div>
  );
}
