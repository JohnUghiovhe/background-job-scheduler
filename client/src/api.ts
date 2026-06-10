import type { CreateJobInput, Job, JobStats } from './types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const api = {
  getJobs: () => request<Job[]>('/jobs'),
  getStats: () => request<JobStats>('/jobs/stats'),
  getJobTypes: () => request<string[]>('/jobs/types'),
  createJob: (body: CreateJobInput) =>
    request<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
  cancelJob: (id: string) => request<Job>(`/jobs/${id}/cancel`, { method: 'POST' }),
  createReportPipeline: () =>
    request<{ report: Job; upload: Job; email: Job }>('/jobs/workflow/report-pipeline', {
      method: 'POST',
    }),
  getDlq: () => request<Job[]>('/dlq'),
  retryDlq: (id: string) => request<Job>(`/dlq/${id}/retry`, { method: 'POST' }),
};
