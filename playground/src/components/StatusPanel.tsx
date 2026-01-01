type StatusPanelProps = {
  status: string;
  error: string | null;
};

export default function StatusPanel({ status, error }: StatusPanelProps) {
  return (
    <footer className="panel">
      <strong>Status:</strong> {status}
      {error ? <div className="error">{error}</div> : null}
    </footer>
  );
}
