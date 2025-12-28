import { useState } from "react";
import { useMutation, useQuery } from "convoy/react";
import { api } from "../convoy/_generated/api.ts";

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("First project");
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

  const createUser = useMutation(api.users.createUser);
  const createProject = useMutation(api.projects.createProject);

  const queryArgs = userId ? { userId } : null;
  const {
    data: projects,
    error: queryError,
    isLoading: queryLoading,
    refetch,
  } = useQuery(api.projects.listProjects, queryArgs, { enabled: false });

  const canCreateProject = Boolean(userId && projectName.trim().length > 0);

  async function handleCreateUser() {
    const deviceId = `device-${Date.now()}`;
    setError(null);
    setStatus("Creating user...");
    try {
      const id = await createUser({ deviceId });
      setUserId(id);
      await refetch({ userId: id });
      setStatus("User created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mutation failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleCreateProject() {
    if (!userId) {
      return;
    }
    setError(null);
    setStatus("Creating project...");
    try {
      await createProject({ userId, name: projectName.trim() });
      await refetch({ userId });
      setStatus("Project created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mutation failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleRefresh() {
    if (!userId) {
      return;
    }
    setError(null);
    setStatus("Refreshing projects...");
    try {
      await refetch({ userId });
      setStatus("Projects refreshed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  const projectsData = projects ?? [];
  const combinedError = error ?? (queryError ? queryError.message : null);

  return (
    <div className="app">
      <header>
        <h1>Convoy Playground</h1>
        <p>Run typed mutations and queries with generated API helpers.</p>
      </header>

      <section className="panel">
        <h2>Session</h2>
        <div className="row">
          <button onClick={handleCreateUser}>Create user</button>
          <span className="mono">{userId ?? "No user yet"}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Projects</h2>
        <div className="row">
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Project name"
          />
          <button onClick={handleCreateProject} disabled={!canCreateProject}>
            Add project
          </button>
          <button onClick={handleRefresh} disabled={!userId}>
            Refresh
          </button>
        </div>
        <pre className="results">
          {queryLoading
            ? "Loading..."
            : projectsData.length === 0
            ? "No projects yet."
            : JSON.stringify(projectsData, null, 2)}
        </pre>
      </section>

      <footer className="panel">
        <strong>Status:</strong> {status}
        {combinedError ? <div className="error">{combinedError}</div> : null}
      </footer>
    </div>
  );
}
