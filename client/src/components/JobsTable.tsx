import type { Job } from '../types';

const PRIORITY_LABEL: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300',
  processing: 'bg-blue-500/20 text-blue-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-slate-500/20 text-slate-300',
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function isRetrying(job: Job): boolean {
  return job.status === 'processing' && job.retryCount > 0;
}

function isFailedMax(job: Job, maxRetries: number): boolean {
  return job.status === 'failed' && job.retryCount >= maxRetries;
}

export function JobsTable({
  jobs,
  onCancel,
  maxRetries = 3,
}: {
  jobs: Job[];
  onCancel: (id: string) => void;
  maxRetries?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/80 text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left">ID</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Retries Left</th>
            <th className="px-3 py-2 text-left">Scheduled</th>
            <th className="px-3 py-2 text-left">Interval</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-left"></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className={`border-t border-slate-800 hover:bg-slate-900/50 ${isRetrying(job) ? 'animate-pulse-retry' : ''}`}
            >
              <td className="px-3 py-2 font-mono text-xs">{job.id.slice(0, 8)}…</td>
              <td className="px-3 py-2">{job.type}</td>
              <td className="px-3 py-2">{PRIORITY_LABEL[job.priority] ?? job.priority}</td>
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[job.status]}`}>
                  {isFailedMax(job, maxRetries) ? 'Failed (max)' : job.status}
                </span>
              </td>
              <td className={`px-3 py-2 ${isFailedMax(job, maxRetries) ? 'text-red-400 font-semibold' : ''}`}>
                {Math.max(0, maxRetries - job.retryCount)}
              </td>
              <td className="px-3 py-2">{fmt(job.scheduledAt)}</td>
              <td className="px-3 py-2">{job.interval ?? '—'}</td>
              <td className="px-3 py-2">{fmt(job.createdAt)}</td>
              <td className="px-3 py-2">
                {['pending', 'processing'].includes(job.status) && (
                  <button
                    onClick={() => onCancel(job.id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && (
        <p className="p-6 text-center text-slate-500">No jobs yet</p>
      )}
    </div>
  );
}
