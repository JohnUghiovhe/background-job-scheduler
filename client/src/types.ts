export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  retryCount: number;
  scheduledAt: string | null;
  interval: string | null;
  lastError: string | null;
  dependencyIds: string[];
  inDlq: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  dlq: number;
}

export interface CreateJobInput {
  type: string;
  priority?: number;
  payload?: Record<string, unknown>;
  scheduled_at?: string;
  interval?: string;
  dependency_ids?: string[];
}
