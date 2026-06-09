import { useEffect } from 'react';
import type { Job, JobStats } from '../types';

interface StreamHandlers {
  onJobUpdate?: (job: Job) => void;
  onJobCreated?: (job: Job) => void;
  onStatsUpdate?: (stats: JobStats) => void;
  onDlqAlert?: (message: string) => void;
}

export function useEventStream(handlers: StreamHandlers) {
  useEffect(() => {
    const es = new EventSource('/api/events/stream');

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'job.updated' && data.job) handlers.onJobUpdate?.(data.job);
        if (data.type === 'job.created' && data.job) handlers.onJobCreated?.(data.job);
        if (data.type === 'stats.updated' && data.stats) handlers.onStatsUpdate?.(data.stats);
        if (data.type === 'dlq.alert') handlers.onDlqAlert?.(data.message);
      } catch {
        /* ignore malformed */
      }
    };

    return () => es.close();
  }, [handlers]);
}
