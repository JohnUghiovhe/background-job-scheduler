import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { CreateJobForm } from './components/CreateJobForm';
import { Dashboard } from './components/Dashboard';
import { DlqView } from './components/DlqView';
import { JobsTable } from './components/JobsTable';
import { useEventStream } from './hooks/useEventStream';
import type { Job, JobStats } from './types';

const EMPTY_STATS: JobStats = {
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  dlq: 0,
};

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dlq, setDlq] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats>(EMPTY_STATS);
  const [alert, setAlert] = useState('');
  const [tab, setTab] = useState<'jobs' | 'dlq'>('jobs');

  const refresh = useCallback(async () => {
    const [j, s, d] = await Promise.all([api.getJobs(), api.getStats(), api.getDlq()]);
    setJobs(j);
    setStats(s);
    setDlq(d);
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const upsertJob = useCallback((job: Job) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [job, ...prev];
      const next = [...prev];
      next[idx] = job;
      return next;
    });
    if (job.inDlq) {
      setDlq((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx === -1) return [job, ...prev];
        const next = [...prev];
        next[idx] = job;
        return next;
      });
    }
  }, []);

  useEventStream({
    onJobUpdate: upsertJob,
    onJobCreated: (job) => {
      upsertJob(job);
      refresh();
    },
    onStatsUpdate: setStats,
    onDlqAlert: (msg) => {
      setAlert(msg);
      refresh();
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-orange-neon">Background</span> Job Scheduler
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Dilamme · Live updates via SSE · Heap priority queue with starvation prevention
        </p>
      </header>

      {alert && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {alert}
          <button onClick={() => setAlert('')} className="ml-4 underline">dismiss</button>
        </div>
      )}

      <Dashboard stats={stats} />
      <CreateJobForm onCreated={refresh} />

      <div className="flex gap-2 border-b border-slate-800">
        {(['jobs', 'dlq'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px ${
              tab === t ? 'border-orange-neon text-orange-neon' : 'border-transparent text-slate-400'
            }`}
          >
            {t === 'dlq' ? `DLQ (${dlq.length})` : 'Jobs'}
          </button>
        ))}
      </div>

      {tab === 'jobs' ? (
        <JobsTable
          jobs={jobs}
          onCancel={async (id) => {
            await api.cancelJob(id);
            refresh();
          }}
        />
      ) : (
        <DlqView
          jobs={dlq}
          onRetry={async (id) => {
            await api.retryDlq(id);
            refresh();
          }}
        />
      )}
    </div>
  );
}
