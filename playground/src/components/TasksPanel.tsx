import { useState } from 'react';
import type { Id } from 'convoy';
import type { ConvoyClient } from 'convoy/client';
import { useMutation } from 'convoy/react';
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
  const [taskTitle, setTaskTitle] = useState('Write kickoff brief');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo');

  const createTask = useMutation(api.tasks.createTask, { client });
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus, { client });

  const canCreateTask = Boolean(hasSession && selectedProjectId && taskTitle.trim().length > 0);

  async function handleCreateTask() {
    if (!selectedProjectId) {
      return;
    }
    setError(null);
    setStatus('Creating task...');
    try {
      await createTask({
        projectId: selectedProjectId,
        title: taskTitle.trim(),
        priority: taskPriority,
        status: taskStatus,
      });
      await refreshTasks();
      setTaskTitle('Next milestone');
      setTaskPriority('medium');
      setTaskStatus('todo');
      setStatus('Task created');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleUpdateTaskStatus(taskId: Id<'tasks'>, nextStatus: TaskStatus) {
    setError(null);
    setStatus('Updating task...');
    try {
      await updateTaskStatus({ taskId, status: nextStatus });
      await refreshTasks();
      setStatus('Task updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  const columns: Array<{ key: TaskStatus; label: string }> = [
    { key: 'todo', label: 'To do' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'done', label: 'Done' },
  ];

  const priorityStyles: Record<TaskPriority, string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-100 text-amber-900',
    high: 'bg-rose-100 text-rose-900',
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
      <div className="rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cards</h2>
            <p className="text-xs text-slate-500">
              {selectedProject ? (
                <>
                  Viewing <span className="font-semibold text-slate-700">{selectedProject.name}</span>
                </>
              ) : (
                'Select a board to view cards.'
              )}
            </p>
          </div>
          <span className="text-xs text-slate-500">{tasksLoading ? 'Syncing...' : `${tasks.length} card(s)`}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1.6fr_0.8fr_0.9fr_auto]">
          <input
            className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Card title"
          />
          <select
            className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            value={taskPriority}
            onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                Priority: {value}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            value={taskStatus}
            onChange={(event) => setTaskStatus(event.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                Column: {value.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreateTask}
            disabled={!canCreateTask}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Add card
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnTasks = tasksByStatus[column.key] ?? [];
          return (
            <div key={column.key} className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{column.label}</h3>
                <span className="text-xs text-slate-500">{columnTasks.length}</span>
              </div>
              <div className="mt-3 space-y-3">
                {!selectedProjectId ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                    Select a board to see cards.
                  </div>
                ) : columnTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                    No cards here yet.
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <div key={task.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${priorityStyles[task.priority]}`}
                            >
                              {task.priority}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={task.status}
                          onChange={(event) => handleUpdateTaskStatus(task.id, event.target.value as TaskStatus)}
                        >
                          {TASK_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              Move to {value.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-2 text-[10px] font-mono text-slate-400">{task.id}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
