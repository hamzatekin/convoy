import { useState } from 'react';
import type { Id } from 'convoy';
import { useMutation } from 'convoy/react';
import type { Doc } from '../../convoy/_generated/dataModel';
import { api } from '../../convoy/_generated/api.ts';

const PROJECT_STATUSES = ['planning', 'active', 'blocked', 'done'] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

type ProjectsPanelProps = {
  userId: Id<'users'> | null;
  projects: Array<Doc<'projects'>>;
  projectsLoading: boolean;
  selectedProjectId: Id<'projects'> | null;
  setSelectedProjectId: (value: Id<'projects'> | null) => void;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
};

export default function ProjectsPanel({
  userId,
  projects,
  projectsLoading,
  selectedProjectId,
  setSelectedProjectId,
  setStatus,
  setError,
}: ProjectsPanelProps) {
  const [projectName, setProjectName] = useState('Launch roadmap');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('active');

  const createProject = useMutation(api.projects.createProject);
  const updateProjectStatus = useMutation(api.projects.updateProjectStatus);

  const canCreateProject = Boolean(userId && projectName.trim().length > 0);

  async function handleCreateProject() {
    if (!userId) {
      return;
    }
    setError(null);
    setStatus('Creating project...');
    try {
      const id = await createProject({
        userId,
        name: projectName.trim(),
        status: projectStatus,
        description: projectDescription.trim() || undefined,
      });
      setSelectedProjectId(id);
      setProjectName('New initiative');
      setProjectDescription('');
      setProjectStatus('active');
      setStatus('Project created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleUpdateProjectStatus(projectId: Id<'projects'>, nextStatus: ProjectStatus) {
    setError(null);
    setStatus('Updating project status...');
    try {
      await updateProjectStatus({ projectId, status: nextStatus });
      setStatus('Project status updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  const statusStyles: Record<ProjectStatus, string> = {
    planning: 'bg-amber-100 text-amber-900',
    active: 'bg-emerald-100 text-emerald-900',
    blocked: 'bg-rose-100 text-rose-900',
    done: 'bg-slate-200 text-slate-800',
  };

  return (
    <section className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Boards</h2>
          <p className="text-xs text-slate-500">Pick a board to view cards in realtime.</p>
        </div>
        <span className="text-xs text-slate-500">{projectsLoading ? 'Syncing...' : `${projects.length} board(s)`}</span>
      </div>

      {!userId ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Create a workspace user to start adding boards.
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <input
          className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Board name"
        />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          placeholder="Short description (optional)"
        />
        <div className="flex flex-wrap gap-2">
          <select
            className="flex-1 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            value={projectStatus}
            onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreateProject}
            disabled={!canCreateProject}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Add board
          </button>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {projects.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
            No boards yet. Create one to get started.
          </li>
        ) : (
          projects.map((project) => (
            <li
              key={project.id}
              className={`rounded-xl border px-3 py-4 text-sm shadow-sm transition ${
                project.id === selectedProjectId ? 'border-slate-900/80 bg-slate-900/5' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedProjectId(project.id)}
                    className="text-left text-sm font-semibold text-slate-900"
                  >
                    {project.name}
                  </button>
                  {project.description ? <p className="text-xs text-slate-500">{project.description}</p> : null}
                  <p className="text-[11px] font-mono text-slate-400">{project.id}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[project.status]}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedProjectId(project.id)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                >
                  View cards
                </button>
                <select
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  value={project.status}
                  onChange={(event) => handleUpdateProjectStatus(project.id, event.target.value as ProjectStatus)}
                >
                  {PROJECT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
