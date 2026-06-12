import { Injectable } from '@nestjs/common';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { EventsService } from '../events/events.service';
import { HandlerRegistry } from '../handlers/handler.registry';
import {
  JobData,
  JobStatus,
  jobFromHash,
  jobKey,
  jobToHash,
  JOBS_DLQ_SET,
  statusSetKey,
} from '../jobs/job.interface';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DlqService {
  constructor(
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly logger: StructuredLogger,
    private readonly handlers: HandlerRegistry,
  ) {}

  async findAll(): Promise<JobData[]> {
    const ids = await this.redis.smembers(JOBS_DLQ_SET);
    const jobs: JobData[] = [];
    for (const id of ids) {
      const hash = await this.redis.hgetall(jobKey(id));
      if (hash) {
        jobs.push(jobFromHash(id, hash));
      }
    }
    jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return jobs;
  }

  async enterDlq(job: JobData, error: string): Promise<JobData> {
    job.inDlq = true;
    job.status = JobStatus.FAILED;
    job.lastError = error;
    job.lockedBy = null;
    job.lockedAt = null;
    job.updatedAt = new Date().toISOString();
    if (job.dlqRetriesLeft == null) {
      job.dlqRetriesLeft = config.scheduler.maxRetries;
    }

    const key = jobKey(job.id);
    await this.redis.hset(key, jobToHash(job));
    await this.redis.sadd(JOBS_DLQ_SET, job.id);
    const prevStatus = JobStatus.PROCESSING;
    await this.redis.srem(statusSetKey(prevStatus), job.id);
    await this.redis.sadd(statusSetKey(JobStatus.FAILED), job.id);

    this.queue.remove(job.id);
    this.logger.jobEvent('dlq.entered', { jobId: job.id, error });
    await this.checkAlertThreshold();
    this.events.emit({ type: 'job.updated', job: job as any });
    return job;
  }

  async manualRetry(id: string): Promise<JobData> {
    const hash = await this.redis.hgetall(jobKey(id));
    if (!hash) throw new Error(`Job ${id} not found`);
    const job = jobFromHash(id, hash);
    if (!job.inDlq) throw new Error(`Job ${id} not in DLQ`);
    if (job.dlqRetriesLeft <= 0) {
      throw new Error(`Job ${id} has no remaining DLQ retries`);
    }

    job.dlqRetriesLeft -= 1;
    job.inDlq = false;
    job.status = JobStatus.PENDING;
    job.retryCount = 0;
    job.lastError = null;
    job.lockedBy = null;
    job.lockedAt = null;
    job.updatedAt = new Date().toISOString();

    const key = jobKey(id);
    await this.redis.hset(key, jobToHash(job));
    await this.redis.srem(JOBS_DLQ_SET, id);
    await this.redis.srem(statusSetKey(JobStatus.FAILED), id);
    await this.redis.sadd(statusSetKey(JobStatus.PENDING), id);

    await this.queue.maybeEnqueue(job);
    this.logger.jobEvent('dlq.retry', { jobId: id });
    this.events.emit({ type: 'job.updated', job: job as any });
    return job;
  }

  private async checkAlertThreshold() {
    const count = await this.redis.scard(JOBS_DLQ_SET);
    if (count >= config.scheduler.dlqAlertThreshold) {
      this.logger.jobEvent('dlq.alert', {
        dlqCount: count,
        threshold: config.scheduler.dlqAlertThreshold,
      });
      await this.sendDlqAlert(count).catch((err) => {
        this.logger.error('dlq.alert_email_failed', {
          dlqCount: count,
          threshold: config.scheduler.dlqAlertThreshold,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      this.events.emit({
        type: 'dlq.alert',
        message: `DLQ threshold reached: ${count} jobs (threshold: ${config.scheduler.dlqAlertThreshold})`,
        stats: { dlq: count },
      });
    }
  }

  /** Simulated alert email when DLQ crosses threshold (default: 10 jobs) */
  private async sendDlqAlert(count: number) {
    const handler = this.handlers.get('send_email');
    if (!handler) throw new Error('send_email handler is not registered');

    await handler({
      to: 'ops@dilamme.com',
      subject: `[ALERT] DLQ threshold reached: ${count} jobs`,
      body: `Dead-letter queue has ${count} jobs. Threshold: ${config.scheduler.dlqAlertThreshold}. Investigate immediately.`,
    });
  }
}
