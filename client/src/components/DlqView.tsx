import type { Job } from '../types';

export function DlqView({
  jobs,
  onRetry,
}: {
  jobs: Job[];
  onRetry: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-purple-300">Dead-Letter Queue</h2>
      <p className="text-sm text-slate-400">
        Jobs that exhausted 3 retries. Alert fires when DLQ reaches 10 jobs.
      </p>
      {jobs.length === 0 ? (
        <p className="text-slate-500 py-4">DLQ is empty</p>
      ) : (
        jobs.map((job) => (
          <div
            key={job.id}
            className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="font-mono text-xs text-slate-400">{job.id}</p>
                <p className="font-medium mt-1">
                  {job.type} · {job.retryCount} retries
                </p>
                <p className="text-red-400 text-sm mt-2 font-mono break-all">
                  {job.lastError ?? 'Unknown error'}
                </p>
              </div>
              <button
                onClick={() => onRetry(job.id)}
                className="shrink-0 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
