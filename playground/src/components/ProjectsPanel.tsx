import { useState } from "react";
import type { Id } from "convoy";
import { useMutation } from "convoy/react";
import type { Doc } from "../../convoy/_generated/dataModel";
import { api } from "../../convoy/_generated/api.ts";

const PROJECT_STATUSES = ["planning", "active", "blocked", "done"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

type ProjectsPanelProps = {
  userId: Id<"users"> | null;
  projects: Array<Doc<"projects">>;
  projectsLoading: boolean;
  selectedProjectId: Id<"projects"> | null;
  setSelectedProjectId: (value: Id<"projects"> | null) => void;
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
  const [projectName, setProjectName] = useState("Launch roadmap");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("active");

  const createProject = useMutation(api.projects.createProject);
  const updateProjectStatus = useMutation(api.projects.updateProjectStatus);

  const canCreateProject = Boolean(userId && projectName.trim().length > 0);

  async function handleCreateProject() {
    if (!userId) {
      return;
    }
    setError(null);
    setStatus("Creating project...");
    try {
      const id = await createProject({
        userId,
        name: projectName.trim(),
        status: projectStatus,
        description: projectDescription.trim() || undefined,
      });
      setSelectedProjectId(id);
      setProjectName("New initiative");
      setProjectDescription("");
      setProjectStatus("active");
      setStatus("Project created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mutation failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  async function handleUpdateProjectStatus(
    projectId: Id<"projects">,
    nextStatus: ProjectStatus
  ) {
    setError(null);
    setStatus("Updating project status...");
    try {
      await updateProjectStatus({ projectId, status: nextStatus });
      setStatus("Project status updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mutation failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  return (
    <section className="panel">
      <h2>Projects</h2>
      <div className="row">
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
        />
        <select
          value={projectStatus}
          onChange={(event) =>
            setProjectStatus(event.target.value as ProjectStatus)
          }
        >
          {PROJECT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replace("_", " ")}
            </option>
          ))}
        </select>
        <button onClick={handleCreateProject} disabled={!canCreateProject}>
          Add project
        </button>
      </div>
      <input
        value={projectDescription}
        onChange={(event) => setProjectDescription(event.target.value)}
        placeholder="Short description (optional)"
      />
      <div className="meta-row">
        <span className="muted">
          {projectsLoading ? "Loading..." : `${projects.length} project(s)`}
        </span>
      </div>
      <ul className="list">
        {projects.length === 0 ? (
          <li className="list-item muted">No projects yet.</li>
        ) : (
          projects.map((project) => (
            <li
              key={project.id}
              className={
                project.id === selectedProjectId
                  ? "list-item active"
                  : "list-item"
              }
            >
              <div className="stack">
                <strong>{project.name}</strong>
                <span className="muted mono">{project.id}</span>
                {project.description ? (
                  <span className="muted">{project.description}</span>
                ) : null}
              </div>
              <div className="stack">
                <span className="pill">{project.status}</span>
                <div className="row">
                  <button onClick={() => setSelectedProjectId(project.id)}>
                    View tasks
                  </button>
                  <select
                    value={project.status}
                    onChange={(event) =>
                      handleUpdateProjectStatus(
                        project.id,
                        event.target.value as ProjectStatus
                      )
                    }
                  >
                    {PROJECT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
