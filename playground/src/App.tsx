import { useState } from "react";
import type { Id } from "convoy";
import { useQuery } from "convoy/react";
import { api } from "../convoy/_generated/api.ts";
import type { Doc } from "../convoy/_generated/dataModel";
import SessionPanel from "./components/SessionPanel";
import ProjectsPanel from "./components/ProjectsPanel";
import TasksPanel from "./components/TasksPanel";
import StatusPanel from "./components/StatusPanel";

export default function App() {
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"projects"> | null>(null);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

  const projectsArgs = userId ? { userId } : null;
  const {
    data: projects,
    error: projectsError,
    isLoading: projectsLoading,
  } = useQuery(api.projects.listProjects, projectsArgs);

  const tasksArgs = selectedProjectId ? { projectId: selectedProjectId } : null;

  const {
    data: tasks,
    error: tasksError,
    isLoading: tasksLoading,
  } = useQuery(api.tasks.listTasks, tasksArgs);

  const projectsData: Array<Doc<"projects">> = projects ?? [];
  const tasksData: Array<Doc<"tasks">> = tasks ?? [];
  const selectedProject =
    projectsData.find((project) => project.id === selectedProjectId) ?? null;
  const combinedError =
    error ?? projectsError?.message ?? tasksError?.message ?? null;

  return (
    <div className="app">
      <header>
        <h1>Convoy Project Tracker</h1>
        <p>Realtime invalidation via LISTEN/NOTIFY + SSE.</p>
      </header>

      <SessionPanel
        userId={userId}
        setUserId={setUserId}
        setStatus={setStatus}
        setError={setError}
      />
      <ProjectsPanel
        userId={userId}
        projects={projectsData}
        projectsLoading={projectsLoading}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        setStatus={setStatus}
        setError={setError}
      />
      <TasksPanel
        selectedProject={selectedProject}
        selectedProjectId={selectedProjectId}
        tasks={tasksData}
        tasksLoading={tasksLoading}
        setStatus={setStatus}
        setError={setError}
      />
      <StatusPanel status={status} error={combinedError} />
    </div>
  );
}
