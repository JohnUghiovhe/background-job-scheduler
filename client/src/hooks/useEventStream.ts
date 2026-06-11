import { useEffect, useRef } from 'react';
import type { Job, JobStats } from '../types';

interface StreamHandlers {
  onJobUpdate?: (job: Job) => void;
  onJobCreated?: (job: Job) => void;
  onStatsUpdate?: (stats: JobStats) => void;
  onDlqAlert?: (message: string) => void;
}

export function useEventStream(handlers: StreamHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource('/api/events/stream');

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'job.updated' && data.job) handlersRef.current.onJobUpdate?.(data.job);
        if (data.type === 'job.created' && data.job) handlersRef.current.onJobCreated?.(data.job);
        if (data.type === 'stats.updated' && data.stats) handlersRef.current.onStatsUpdate?.(data.stats);
        if (data.type === 'dlq.alert') handlersRef.current.onDlqAlert?.(data.message);
      } catch {
        /* ignore malformed */
      }
    };

    return () => es.close();
  }, []);
}
