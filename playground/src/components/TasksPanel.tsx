import { useState } from 'react';
import type { Id } from 'convoy';
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
};

export default function TasksPanel({
  selectedProject,
  selectedProjectId,
  tasks,
  tasksLoading,
  setStatus,
  setError,
}: TasksPanelProps) {
  const [taskTitle, setTaskTitle] = useState('Write kickoff brief');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');

  const createTask = useMutation(api.tasks.createTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);

  const canCreateTask = Boolean(selectedProjectId && taskTitle.trim().length > 0);

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
      });
      setTaskTitle('Next milestone');
      setTaskPriority('medium');
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
      setStatus('Task updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  return (
    <section className="panel">
      <h2>Tasks</h2>
      <div className="row">
        <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" />
        <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button onClick={handleCreateTask} disabled={!canCreateTask}>
          Add task
        </button>
      </div>
      <div className="meta-row">
        <span className="muted">
          {selectedProject ? (
            <>
              Viewing: <strong>{selectedProject.name}</strong>
            </>
          ) : (
            'Select a project to see tasks.'
          )}
        </span>
        <span className="muted">{tasksLoading ? 'Loading...' : `${tasks.length} task(s)`}</span>
      </div>
      <ul className="list">
        {!selectedProjectId ? (
          <li className="list-item muted">No project selected.</li>
        ) : tasks.length === 0 ? (
          <li className="list-item muted">No tasks yet.</li>
        ) : (
          tasks.map((task) => (
            <li key={task.id} className="list-item">
              <div className="stack">
                <strong>{task.title}</strong>
                <div className="row">
                  <span className="pill">{task.priority}</span>
                  <span className="pill">{task.status}</span>
                </div>
                <span className="muted mono">{task.id}</span>
              </div>
              <div className="row">
                {TASK_STATUSES.map((value) => (
                  <button
                    key={value}
                    onClick={() => handleUpdateTaskStatus(task.id, value)}
                    disabled={task.status === value}
                  >
                    {value.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
