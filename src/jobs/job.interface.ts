export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum JobInterval {
  EVERY_1_MINUTE = 'every_1_minute',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_1_HOUR = 'every_1_hour',
}

export interface JobData {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  retryCount: number;
  dlqRetriesLeft: number;
  scheduledAt: string | null;
  interval: JobInterval | null;
  lastError: string | null;
  dependencyIds: string[];
  inDlq: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const REDIS_TRUE = '1';
const REDIS_FALSE = '0';

export function jobFromHash(id: string, hash: Record<string, string>): JobData {
  return {
    id,
    type: hash.type ?? '',
    payload: hash.payload ? JSON.parse(hash.payload) : {},
    priority: parseInt(hash.priority, 10) || 2,
    status: (hash.status as JobStatus) || JobStatus.PENDING,
    retryCount: parseInt(hash.retryCount, 10) || 0,
    dlqRetriesLeft: parseInt(hash.dlqRetriesLeft, 10) || 3,
    scheduledAt: hash.scheduledAt || null,
    interval: (hash.interval as JobInterval) || null,
    lastError: hash.lastError || null,
    dependencyIds: hash.dependencyIds ? JSON.parse(hash.dependencyIds) : [],
    inDlq: hash.inDlq === REDIS_TRUE,
    lockedBy: hash.lockedBy || null,
    lockedAt: hash.lockedAt || null,
    createdAt: hash.createdAt || new Date().toISOString(),
    updatedAt: hash.updatedAt || new Date().toISOString(),
    startedAt: hash.startedAt || null,
    completedAt: hash.completedAt || null,
  };
}

export function jobToHash(job: Partial<JobData>): Record<string, string> {
  const hash: Record<string, string> = {};
  if (job.type !== undefined) hash.type = job.type;
  if (job.payload !== undefined) hash.payload = JSON.stringify(job.payload);
  if (job.priority !== undefined) hash.priority = String(job.priority);
  if (job.status !== undefined) hash.status = job.status;
  if (job.retryCount !== undefined) hash.retryCount = String(job.retryCount);
  if (job.dlqRetriesLeft !== undefined) hash.dlqRetriesLeft = String(job.dlqRetriesLeft);
  if (job.scheduledAt !== undefined) hash.scheduledAt = job.scheduledAt ?? '';
  if (job.interval !== undefined) hash.interval = job.interval ?? '';
  if (job.lastError !== undefined) hash.lastError = job.lastError ?? '';
  if (job.dependencyIds !== undefined) hash.dependencyIds = JSON.stringify(job.dependencyIds);
  if (job.inDlq !== undefined) hash.inDlq = job.inDlq ? REDIS_TRUE : REDIS_FALSE;
  if (job.lockedBy !== undefined) hash.lockedBy = job.lockedBy ?? '';
  if (job.lockedAt !== undefined) hash.lockedAt = job.lockedAt ?? '';
  if (job.createdAt !== undefined) hash.createdAt = job.createdAt;
  if (job.updatedAt !== undefined) hash.updatedAt = job.updatedAt;
  if (job.startedAt !== undefined) hash.startedAt = job.startedAt ?? '';
  if (job.completedAt !== undefined) hash.completedAt = job.completedAt ?? '';
  return hash;
}

export const JOB_KEY_PREFIX = 'job:';
export const JOBS_ALL_SET = 'jobs:all';
export const JOBS_DLQ_SET = 'jobs:dlq';

export function jobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

export function statusSetKey(status: JobStatus): string {
  return `jobs:status:${status}`;
}
