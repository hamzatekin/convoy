import { useState } from 'react';
import type { Id } from '@avvos/convoy';
import type { ConvoyClient } from '@avvos/convoy/client';
import { useMutation } from '@avvos/convoy/react';
import type { Doc } from '../../convoy/_generated/dataModel';
import { api } from '../../convoy/_generated/api.ts';

const PROJECT_STATUSES = ['planning', 'active', 'blocked', 'done'] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

type ProjectsPanelProps = {
  hasSession: boolean;
  projects: Array<Doc<'projects'>>;
  projectsLoading: boolean;
  selectedProjectId: Id<'projects'> | null;
  setSelectedProjectId: (value: Id<'projects'> | null) => void;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
  client: ConvoyClient;
  refreshProjects: () => Promise<Array<Doc<'projects'>> | null>;
};

export default function ProjectsPanel({
  hasSession,
  projects,
  projectsLoading,
  selectedProjectId,
  setSelectedProjectId,
  setStatus,
  setError,
  client,
  refreshProjects,
}: ProjectsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('active');

  const createProject = useMutation(api.projects.createProject, { client });
  const updateProjectStatus = useMutation(api.projects.updateProjectStatus, { client });

  const canCreateProject = Boolean(hasSession && projectName.trim().length > 0);

  async function handleCreateProject() {
    if (!hasSession) return;
    setError(null);
    setStatus('Creating board...');
    try {
      const id = await createProject({
        name: projectName.trim(),
        status: projectStatus,
        description: projectDescription.trim() || undefined,
      });
      await refreshProjects();
      setSelectedProjectId(id);
      setProjectName('');
      setProjectDescription('');
      setProjectStatus('active');
      setShowForm(false);
      setStatus('Board created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create board';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleUpdateProjectStatus(projectId: Id<'projects'>, nextStatus: ProjectStatus) {
    setError(null);
    setStatus('Updating...');
    try {
      await updateProjectStatus({ projectId, status: nextStatus });
      await refreshProjects();
      setStatus('Updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      setError(message);
    }
  }

  const statusConfig: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
    planning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    blocked: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
    done: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  };

  return (
    <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-lg shadow-md">
            📋
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Boards</h2>
            <p className="text-xs text-slate-500">
              {projectsLoading ? 'Syncing...' : `${projects.length} board${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {hasSession && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm transition hover:bg-slate-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Add Form (Collapsible) */}
      {hasSession && showForm && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Board name"
              autoFocus
            />
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreateProject}
                disabled={!canCreateProject}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Create Board
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasSession && (
        <div className="mt-4 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">Create a workspace to start adding boards</p>
        </div>
      )}

      {/* Board List */}
      <div className="mt-4 space-y-2">
        {projects.length === 0 && hasSession && !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
          >
            + Create your first board
          </button>
        ) : (
          projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            const config = statusConfig[project.status];
            return (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className={`group w-full rounded-xl p-4 text-left transition ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-lg'
                    : 'bg-white ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {project.name}
                    </p>
                    {project.description && (
                      <p className={`mt-1 text-xs truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
                      isSelected ? 'bg-white/20 text-white' : `${config.bg} ${config.text}`
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : config.dot}`} />
                    {project.status}
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded-lg bg-white/20 px-2 py-1 text-xs text-white backdrop-blur-sm focus:outline-none"
                      value={project.status}
                      onChange={(e) => handleUpdateProjectStatus(project.id, e.target.value as ProjectStatus)}
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s} className="text-slate-900">
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
