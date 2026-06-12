import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { DlqService } from '../dlq/dlq.service';
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
import { JobsService } from '../jobs/jobs.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = `worker-${uuidv4().slice(0, 8)}`;
  private running = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly queue: QueueService,
    private readonly jobs: JobsService,
    private readonly dlq: DlqService,
    private readonly redis: RedisService,
    private readonly handlers: HandlerRegistry,
    private readonly logger: StructuredLogger,
    private readonly events: EventsService,
  ) {}

  onModuleInit() {
    this.running = true;
    this.timer = setInterval(() => this.poll(), config.worker.pollIntervalMs);
    this.logger.log('worker.started', { workerId: this.workerId });
  }

  onModuleDestroy() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async poll() {
    if (!this.running) return;
    try {
      await this.processNext();
    } catch (err) {
      this.logger.error('worker.error', {
        workerId: this.workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async processNext() {
    const next = this.queue.popNext();
    if (!next) return;

    const lockKey = `job:lock:${next.id}`;
    const acquired = await this.redis.acquireLock(lockKey, config.worker.lockTtlSeconds);
    if (!acquired) {
      this.queue.requeue(next);
      return;
    }

    const hash = await this.redis.hgetall(jobKey(next.id));
    if (!hash) {
      await this.redis.releaseLock(lockKey);
      return;
    }
    const job = jobFromHash(next.id, hash);

    if (job.inDlq || job.status === JobStatus.CANCELLED) {
      await this.redis.releaseLock(lockKey);
      return;
    }
    if (job.status !== JobStatus.PENDING) {
      await this.redis.releaseLock(lockKey);
      return;
    }

    if (!(await this.jobs.dependenciesMet(job))) {
      await this.redis.releaseLock(lockKey);
      await this.queue.maybeEnqueue(job);
      return;
    }

    job.status = JobStatus.PROCESSING;
    job.lockedBy = this.workerId;
    job.lockedAt = new Date().toISOString();
    job.startedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    await this.redis.hset(jobKey(job.id), jobToHash(job));
    await this.redis.srem(statusSetKey(JobStatus.PENDING), job.id);
    await this.redis.sadd(statusSetKey(JobStatus.PROCESSING), job.id);

    this.logger.jobEvent('job.started', { jobId: job.id, workerId: this.workerId });
    this.events.emit({ type: 'job.updated', job: job as any });
    await this.jobs.emitStats();

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) throw new Error(`No handler for type ${job.type}`);

      await handler(job.payload);

      const freshHash = await this.redis.hgetall(jobKey(job.id));
      if (freshHash) {
        const fresh = jobFromHash(job.id, freshHash);
        if (fresh.status === JobStatus.CANCELLED) {
          this.logger.jobEvent('job.cancelled', {
            jobId: job.id,
            note: 'Cancelled while processing; handler finished but job not marked completed',
          });
          await this.redis.releaseLock(lockKey);
          await this.jobs.emitStats();
          return;
        }
      }

      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date().toISOString();
      job.lockedBy = null;
      job.lockedAt = null;
      job.lastError = null;
      job.updatedAt = new Date().toISOString();

      await this.redis.hset(jobKey(job.id), jobToHash(job));
      await this.redis.srem(statusSetKey(JobStatus.PROCESSING), job.id);
      await this.redis.sadd(statusSetKey(JobStatus.COMPLETED), job.id);

      this.logger.jobEvent('job.completed', { jobId: job.id });
      this.events.emit({ type: 'job.updated', job: job as any });
      await this.jobs.scheduleRecurring(job);

      const pendingIds = await this.redis.smembers(statusSetKey(JobStatus.PENDING));
      for (const depId of pendingIds) {
        const depHash = await this.redis.hgetall(jobKey(depId));
        if (!depHash) continue;
        const depJob = jobFromHash(depId, depHash);
        if (depJob.dependencyIds.includes(job.id)) {
          await this.queue.maybeEnqueue(depJob);
        }
      }
    } catch (err) {
      await this.handleFailure(job, err instanceof Error ? err.message : String(err));
    } finally {
      await this.redis.releaseLock(lockKey);
      await this.jobs.emitStats();
    }
  }

  private async handleFailure(job: JobData, error: string) {
    job.lastError = error;
    job.lockedBy = null;
    job.lockedAt = null;
    job.updatedAt = new Date().toISOString();

    if (job.retryCount >= config.scheduler.maxRetries) {
      this.logger.jobEvent('job.failed', { jobId: job.id, error, final: true });
      await this.dlq.enterDlq(job, error);
      return;
    }

    job.retryCount += 1;
    this.logger.jobEvent('job.retry', {
      jobId: job.id,
      attempt: job.retryCount,
      error,
    });

    job.status = JobStatus.PENDING;
    const delay = this.jobs.jitteredDelay(job.retryCount - 1);
    job.scheduledAt = new Date(Date.now() + delay).toISOString();

    await this.redis.hset(jobKey(job.id), jobToHash(job));
    await this.redis.srem(statusSetKey(JobStatus.PROCESSING), job.id);
    await this.redis.sadd(statusSetKey(JobStatus.PENDING), job.id);

    this.events.emit({ type: 'job.updated', job: job as any });

    setTimeout(() => this.queue.maybeEnqueue(job), delay);
  }
}
