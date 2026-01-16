import { useState } from 'react';
import type { Id } from '@avvos/convoy';
import type { ConvoyClient } from '@avvos/convoy/client';
import { useMutation } from '@avvos/convoy/react';
import type { Doc } from '../../convoy/_generated/dataModel';
import { api } from '../../convoy/_generated/api.ts';

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskPriority = (typeof TASK_PRIORITIES)[number];

type TasksPanelProps = {
  selectedProject: Doc<'projects'> | null;
  selectedProjectId: Id<'projects'> | null;
  tasks: Array<Doc<'tasks'>>;
  tasksLoading: boolean;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
  hasSession: boolean;
  client: ConvoyClient;
  refreshTasks: () => Promise<Array<Doc<'tasks'>> | null>;
};

export default function TasksPanel({
  selectedProject,
  selectedProjectId,
  tasks,
  tasksLoading,
  setStatus,
  setError,
  hasSession,
  client,
  refreshTasks,
}: TasksPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo');

  const createTask = useMutation(api.tasks.createTask, { client });
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus, { client });

  const canCreateTask = Boolean(hasSession && selectedProjectId && taskTitle.trim().length > 0);

  async function handleCreateTask() {
    if (!selectedProjectId) return;
    setError(null);
    setStatus('Creating card...');
    try {
      await createTask({
        projectId: selectedProjectId,
        title: taskTitle.trim(),
        priority: taskPriority,
        status: taskStatus,
      });
      await refreshTasks();
      setTaskTitle('');
      setTaskPriority('medium');
      setTaskStatus('todo');
      setShowForm(false);
      setStatus('Card created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create card';
      setError(message);
    }
  }

  async function handleUpdateTaskStatus(taskId: Id<'tasks'>, nextStatus: TaskStatus) {
    setError(null);
    try {
      await updateTaskStatus({ taskId, status: nextStatus });
      await refreshTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      setError(message);
    }
  }

  const columns: Array<{ key: TaskStatus; label: string; icon: string }> = [
    { key: 'todo', label: 'To Do', icon: '○' },
    { key: 'in_progress', label: 'In Progress', icon: '◐' },
    { key: 'done', label: 'Done', icon: '●' },
  ];

  const priorityConfig: Record<TaskPriority, { bg: string; text: string; label: string }> = {
    low: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Low' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Med' },
    high: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'High' },
  };

  const tasksByStatus = TASK_STATUSES.reduce(
    (acc, status) => {
      acc[status] = tasks.filter((task) => task.status === status);
      return acc;
    },
    {} as Record<TaskStatus, Array<Doc<'tasks'>>>,
  );

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-md">
              ✓
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Cards</h2>
              <p className="text-xs text-slate-500">
                {selectedProject ? (
                  <>
                    Viewing <span className="font-medium text-slate-700">{selectedProject.name}</span>
                  </>
                ) : (
                  'Select a board to view cards'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tasksLoading && (
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Syncing
              </span>
            )}
            {selectedProjectId && hasSession && !showForm && (
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
        </div>

        {/* Add Card Form */}
        {showForm && selectedProjectId && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
            <div className="space-y-3">
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Card title"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      Priority: {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      Column: {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTask}
                  disabled={!canCreateTask}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Add Card
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
      </div>

      {/* Kanban Columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnTasks = tasksByStatus[column.key] ?? [];
          return (
            <div key={column.key} className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{column.icon}</span>
                  <h3 className="text-sm font-semibold text-slate-800">{column.label}</h3>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                  {columnTasks.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {!selectedProjectId ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                    Select a board
                  </div>
                ) : columnTasks.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                    No cards
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const priority = priorityConfig[task.priority];
                    return (
                      <div
                        key={task.id}
                        className="group rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md hover:ring-slate-300"
                      >
                        <p className="font-medium text-slate-900">{task.title}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priority.bg} ${priority.text}`}
                          >
                            {priority.label}
                          </span>
                          <select
                            className="rounded-lg border-0 bg-transparent py-1 pr-6 text-xs text-slate-500 opacity-0 transition group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-0"
                            value={task.status}
                            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                → {s.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
