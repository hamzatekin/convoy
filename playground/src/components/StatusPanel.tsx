import type { QueryConnectionState } from 'convoy/react';

type StatusStream = {
  label: string;
  state: QueryConnectionState;
  isReconnecting: boolean;
  isStale: boolean;
};

type StatusPanelProps = {
  status: string;
  error: string | null;
  streams: StatusStream[];
};

const stateStyles: Record<QueryConnectionState, string> = {
  open: 'bg-emerald-100 text-emerald-900',
  connecting: 'bg-amber-100 text-amber-900',
  closed: 'bg-rose-100 text-rose-900',
  disabled: 'bg-slate-200 text-slate-700',
};

export default function StatusPanel({ status, error, streams }: StatusPanelProps) {
  return (
    <footer className="rounded-2xl bg-white/90 p-5 text-sm shadow-sm ring-1 ring-slate-200/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Live status</p>
          <p className="mt-1 font-semibold text-slate-900">{status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {streams.map((stream) => (
            <div key={stream.label} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
              <span className="text-slate-500">{stream.label}</span>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stateStyles[stream.state]}`}>
                {stream.state}
              </span>
              {stream.isReconnecting ? <span className="text-[10px] text-amber-700">reconnecting</span> : null}
              {stream.isStale ? <span className="text-[10px] text-slate-500">stale</span> : null}
            </div>
          ))}
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}
    </footer>
  );
}
