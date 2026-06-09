import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { Job, JobStatus } from '../database/entities/job.entity';
import { DlqService } from '../dlq/dlq.service';
import { EventsService } from '../events/events.service';
import { HandlerRegistry } from '../handlers/handler.registry';
import { JobsService } from '../jobs/jobs.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = `worker-${uuidv4().slice(0, 8)}`;
  private running = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
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

    const job = await this.repo.findOneBy({ id: next.id });
    if (!job || job.inDlq || job.status === JobStatus.CANCELLED) {
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
    job.lockedAt = new Date();
    job.startedAt = new Date();
    await this.repo.save(job);
    this.logger.jobEvent('job.started', { jobId: job.id, workerId: this.workerId });
    this.events.emit({ type: 'job.updated', job });
    await this.jobs.emitStats();

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) throw new Error(`No handler for type ${job.type}`);

      await handler(job.payload);

      const fresh = await this.repo.findOneBy({ id: job.id });
      if (fresh?.status === JobStatus.CANCELLED) {
        this.logger.jobEvent('job.cancelled', {
          jobId: job.id,
          note: 'Cancelled while processing; handler finished but job not marked completed',
        });
        await this.redis.releaseLock(lockKey);
        await this.jobs.emitStats();
        return;
      }

      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      job.lockedBy = null;
      job.lockedAt = null;
      job.lastError = null;
      const saved = await this.repo.save(job);
      this.logger.jobEvent('job.completed', { jobId: job.id });
      this.events.emit({ type: 'job.updated', job: saved });
      await this.jobs.scheduleRecurring(saved);

      const dependents = await this.repo
        .createQueryBuilder('j')
        .where('j.status = :status', { status: JobStatus.PENDING })
        .andWhere(':id = ANY(j.dependencyIds)', { id: job.id })
        .getMany();
      for (const dep of dependents) {
        await this.queue.maybeEnqueue(dep);
      }
    } catch (err) {
      await this.handleFailure(job, err instanceof Error ? err.message : String(err));
    } finally {
      await this.redis.releaseLock(lockKey);
      await this.jobs.emitStats();
    }
  }

  private async handleFailure(job: Job, error: string) {
    job.retryCount += 1;
    job.lastError = error;
    job.lockedBy = null;
    job.lockedAt = null;

    if (job.retryCount > config.scheduler.maxRetries) {
      this.logger.jobEvent('job.failed', { jobId: job.id, error, final: true });
      await this.dlq.enterDlq(job, error);
      return;
    }

    this.logger.jobEvent('job.retry', {
      jobId: job.id,
      attempt: job.retryCount,
      error,
    });

    job.status = JobStatus.PENDING;
    const delay = this.jobs.jitteredDelay(job.retryCount - 1);
    job.scheduledAt = new Date(Date.now() + delay);
    await this.repo.save(job);
    this.events.emit({ type: 'job.updated', job });

    setTimeout(() => this.queue.maybeEnqueue(job), delay);
  }
}
