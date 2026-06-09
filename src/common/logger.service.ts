import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

export type LogEvent =
  | 'job.created'
  | 'job.started'
  | 'job.retry'
  | 'job.failed'
  | 'job.cancelled'
  | 'job.completed'
  | 'dlq.entered'
  | 'dlq.alert'
  | 'dlq.retry'
  | 'worker.claimed'
  | 'worker.error';

@Injectable()
export class StructuredLogger implements NestLoggerService {
  private emit(level: string, event: LogEvent | string, meta: Record<string, unknown> = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...meta,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  log(message: string, meta?: Record<string, unknown>) {
    this.emit('info', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.emit('error', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.emit('warn', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.emit('debug', message, meta);
  }

  jobEvent(event: LogEvent, meta: Record<string, unknown>) {
    this.emit('info', event, meta);
  }
}
