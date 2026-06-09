import type { Job } from '../types';

const PRIORITY_LABEL: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-amber-400',
  processing: 'text-blue-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-slate-400',
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export function JobsTable({
  jobs,
  onCancel,
}: {
  jobs: Job[];
  onCancel: (id: string) => void;
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
            <th className="px-3 py-2 text-left">Retries</th>
            <th className="px-3 py-2 text-left">Scheduled</th>
            <th className="px-3 py-2 text-left">Interval</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-left"></th>
          </tr>
        </thead>
        <tbody>
          {jobs.filter((j) => !j.inDlq).map((job) => (
            <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/50">
              <td className="px-3 py-2 font-mono text-xs">{job.id.slice(0, 8)}…</td>
              <td className="px-3 py-2">{job.type}</td>
              <td className="px-3 py-2">{PRIORITY_LABEL[job.priority] ?? job.priority}</td>
              <td className={`px-3 py-2 capitalize ${STATUS_COLOR[job.status]}`}>{job.status}</td>
              <td className="px-3 py-2">{job.retryCount}</td>
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
      {jobs.filter((j) => !j.inDlq).length === 0 && (
        <p className="p-6 text-center text-slate-500">No jobs yet</p>
      )}
    </div>
  );
}
