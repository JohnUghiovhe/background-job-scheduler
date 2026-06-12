import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { EventsService } from '../events/events.service';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { CreateJobDto } from './dto/create-job.dto';
import {
  JobData,
  JobInterval,
  JobStatus,
  jobFromHash,
  jobKey,
  jobToHash,
  JOBS_ALL_SET,
  statusSetKey,
} from './job.interface';

const INTERVAL_MS: Record<JobInterval, number> = {
  [JobInterval.EVERY_1_MINUTE]: 60_000,
  [JobInterval.EVERY_5_MINUTES]: 300_000,
  [JobInterval.EVERY_1_HOUR]: 3_600_000,
};

@Injectable()
export class JobsService {
  constructor(
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly logger: StructuredLogger,
    private readonly handlers: HandlerRegistry,
  ) {}

  async create(dto: CreateJobDto): Promise<JobData> {
    if (!this.handlers.get(dto.type)) {
      throw new BadRequestException(`Unknown job type: ${dto.type}`);
    }

    if (dto.dependency_ids?.length) {
      for (const depId of dto.dependency_ids) {
        const depHash = await this.redis.hgetall(jobKey(depId));
        if (!depHash) {
          throw new BadRequestException(`Dependency job ${depId} not found`);
        }
      }
    }

    const now = new Date();
    const id = uuidv4();
    const job: JobData = {
      id,
      type: dto.type,
      priority: dto.priority ?? 2,
      payload: dto.payload ?? {},
      scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at).toISOString() : null,
      interval: (dto.interval as JobInterval) ?? null,
      dependencyIds: dto.dependency_ids ?? [],
      status: JobStatus.PENDING,
      retryCount: 0,
      dlqRetriesLeft: config.scheduler.maxRetries,
      lastError: null,
      inDlq: false,
      lockedBy: null,
      lockedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      startedAt: null,
      completedAt: null,
    };

    const key = jobKey(id);
    await this.redis.hset(key, jobToHash(job));
    await this.redis.sadd(JOBS_ALL_SET, id);
    await this.redis.sadd(statusSetKey(JobStatus.PENDING), id);

    this.logger.jobEvent('job.created', { jobId: id, type: job.type, priority: job.priority });
    await this.queue.maybeEnqueue(job);
    this.events.emit({ type: 'job.created', job: job as any });
    await this.emitStats();
    return job;
  }

  async findAll(filters?: { status?: JobStatus; inDlq?: boolean }): Promise<JobData[]> {
    let ids: string[];
    if (filters?.inDlq) {
      ids = await this.redis.smembers('jobs:dlq');
    } else if (filters?.status) {
      ids = await this.redis.smembers(statusSetKey(filters.status));
    } else {
      ids = await this.redis.smembers(JOBS_ALL_SET);
    }

    const jobs: JobData[] = [];
    for (const id of ids) {
      const hash = await this.redis.hgetall(jobKey(id));
      if (hash) {
        jobs.push(jobFromHash(id, hash));
      }
    }
    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jobs;
  }

  async findOne(id: string): Promise<JobData> {
    const hash = await this.redis.hgetall(jobKey(id));
    if (!hash) throw new NotFoundException(`Job ${id} not found`);
    return jobFromHash(id, hash);
  }

  async cancel(id: string): Promise<JobData> {
    const job = await this.findOne(id);
    if ([JobStatus.COMPLETED, JobStatus.CANCELLED].includes(job.status)) {
      throw new BadRequestException(`Cannot cancel job in status ${job.status}`);
    }

    const prevStatus = job.status;
    job.status = JobStatus.CANCELLED;
    job.lockedBy = null;
    job.lockedAt = null;
    job.updatedAt = new Date().toISOString();

    const key = jobKey(id);
    await this.redis.hset(key, jobToHash(job));
    if (prevStatus !== JobStatus.CANCELLED) {
      await this.redis.srem(statusSetKey(prevStatus), id);
    }
    await this.redis.sadd(statusSetKey(JobStatus.CANCELLED), id);

    this.queue.remove(id);
    this.logger.jobEvent('job.cancelled', { jobId: id });
    this.events.emit({ type: 'job.updated', job: job as any });
    await this.emitStats();
    return job;
  }

  async getStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {
      pending: await this.redis.scard(statusSetKey(JobStatus.PENDING)),
      processing: await this.redis.scard(statusSetKey(JobStatus.PROCESSING)),
      completed: await this.redis.scard(statusSetKey(JobStatus.COMPLETED)),
      failed: await this.redis.scard(statusSetKey(JobStatus.FAILED)),
      cancelled: await this.redis.scard(statusSetKey(JobStatus.CANCELLED)),
    };
    const dlqCount = await this.redis.scard('jobs:dlq');
    stats.dlq = dlqCount;
    stats.maxRetries = config.scheduler.maxRetries;
    return stats;
  }

  async emitStats() {
    const stats = await this.getStats();
    this.events.emit({ type: 'stats.updated', stats });
  }

  async dependenciesMet(job: JobData): Promise<boolean> {
    if (!job.dependencyIds.length) return true;
    for (const depId of job.dependencyIds) {
      const hash = await this.redis.hgetall(jobKey(depId));
      if (!hash) return false;
      const dep = jobFromHash(depId, hash);
      if (dep.status !== JobStatus.COMPLETED) return false;
    }
    return true;
  }

  async scheduleRecurring(completed: JobData): Promise<JobData | null> {
    if (!completed.interval) return null;
    const ms = INTERVAL_MS[completed.interval];
    if (!ms) return null;

    const now = new Date();
    const id = uuidv4();
    const job: JobData = {
      id,
      type: completed.type,
      priority: completed.priority,
      payload: completed.payload,
      interval: completed.interval,
      dependencyIds: [],
      scheduledAt: new Date(Date.now() + ms).toISOString(),
      status: JobStatus.PENDING,
      retryCount: 0,
      dlqRetriesLeft: config.scheduler.maxRetries,
      lastError: null,
      inDlq: false,
      lockedBy: null,
      lockedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      startedAt: null,
      completedAt: null,
    };

    const key = jobKey(id);
    await this.redis.hset(key, jobToHash(job));
    await this.redis.sadd(JOBS_ALL_SET, id);
    await this.redis.sadd(statusSetKey(JobStatus.PENDING), id);

    this.logger.jobEvent('job.created', { jobId: id, type: job.type, recurring: true });
    await this.queue.maybeEnqueue(job);
    this.events.emit({ type: 'job.created', job: job as any });
    return job;
  }

  jitteredDelay(attemptIndex: number): number {
    const base = config.scheduler.retryDelaysMs[attemptIndex] ?? 25000;
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(100, Math.round(base + jitter));
  }
}
