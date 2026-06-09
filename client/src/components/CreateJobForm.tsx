import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import type { CreateJobInput } from '../types';

export function CreateJobForm({ onCreated }: { onCreated: () => void }) {
  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState('send_email');
  const [priority, setPriority] = useState(2);
  const [payload, setPayload] = useState('{"to":"test@gmail.com","subject":"Welcome"}');
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState('');
  const [dependencyIds, setDependencyIds] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getJobTypes().then(setTypes).catch(() => setTypes(['send_email']));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let parsed: Record<string, unknown> = {};
      if (payload.trim()) parsed = JSON.parse(payload);

      const body: CreateJobInput = {
        type,
        priority,
        payload: parsed,
      };
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      if (interval) body.interval = interval;
      if (dependencyIds.trim()) {
        body.dependency_ids = dependencyIds.split(',').map((s) => s.trim()).filter(Boolean);
      }

      await api.createJob(body);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
  }

  async function runPipeline() {
    setLoading(true);
    try {
      await api.createReportPipeline();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-lg font-semibold">Create Job</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-400">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
          >
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-400">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
          >
            <option value={1}>High</option>
            <option value={2}>Medium</option>
            <option value={3}>Low</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm text-slate-400">Payload (JSON)</span>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-400">Scheduled At</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-400">Recurring Interval</span>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
          >
            <option value="">None</option>
            <option value="every_1_minute">Every 1 minute</option>
            <option value="every_5_minutes">Every 5 minutes</option>
            <option value="every_1_hour">Every 1 hour</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm text-slate-400">Dependency IDs (comma-separated UUIDs)</span>
          <input
            value={dependencyIds}
            onChange={(e) => setDependencyIds(e.target.value)}
            placeholder="uuid-1, uuid-2"
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create Job'}
        </button>
        <button
          type="button"
          onClick={runPipeline}
          disabled={loading}
          className="rounded-lg border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10 px-4 py-2 text-sm"
        >
          Run DAG Pipeline Demo
        </button>
      </div>
    </form>
  );
}
