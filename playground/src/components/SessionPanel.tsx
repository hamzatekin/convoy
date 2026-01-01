import type { Id } from "convoy";
import { useMutation } from "convoy/react";
import { api } from "../../convoy/_generated/api.ts";

type SessionPanelProps = {
  userId: Id<"users"> | null;
  setUserId: (value: Id<"users"> | null) => void;
  setStatus: (value: string) => void;
  setError: (value: string | null) => void;
};

export default function SessionPanel({
  userId,
  setUserId,
  setStatus,
  setError,
}: SessionPanelProps) {
  const createUser = useMutation(api.users.createUser);

  async function handleCreateUser() {
    const deviceId = `device-${Date.now()}`;
    setError(null);
    setStatus("Creating user...");
    try {
      const id = await createUser({ deviceId });
      setUserId(id);
      setStatus("User created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mutation failed";
      setError(message);
      setStatus(`Error: ${message}`);
    }
  }

  return (
    <section className="panel">
      <h2>Session</h2>
      <div className="row">
        <button onClick={handleCreateUser}>Create user</button>
        <span className="mono">{userId ?? "No user yet"}</span>
      </div>
    </section>
  );
}
