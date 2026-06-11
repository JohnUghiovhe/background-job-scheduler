import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { Job, JobInterval, JobStatus } from '../database/entities/job.entity';
import { EventsService } from '../events/events.service';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueService } from '../queue/queue.service';
import { CreateJobDto } from './dto/create-job.dto';

const INTERVAL_MS: Record<JobInterval, number> = {
  [JobInterval.EVERY_1_MINUTE]: 60_000,
  [JobInterval.EVERY_5_MINUTES]: 300_000,
  [JobInterval.EVERY_1_HOUR]: 3_600_000,
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly logger: StructuredLogger,
    private readonly handlers: HandlerRegistry,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    if (!this.handlers.get(dto.type)) {
      throw new BadRequestException(`Unknown job type: ${dto.type}`);
    }

    if (dto.dependency_ids?.length) {
      const deps = await this.repo.findBy({ id: In(dto.dependency_ids) });
      if (deps.length !== dto.dependency_ids.length) {
        throw new BadRequestException('One or more dependency jobs not found');
      }
    }

    const job = this.repo.create({
      type: dto.type,
      priority: dto.priority ?? 2,
      payload: dto.payload ?? {},
      scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      interval: (dto.interval as JobInterval) ?? null,
      dependencyIds: dto.dependency_ids ?? [],
      status: JobStatus.PENDING,
    });

    const saved = await this.repo.save(job);
    this.logger.jobEvent('job.created', { jobId: saved.id, type: saved.type, priority: saved.priority });
    await this.queue.maybeEnqueue(saved);
    this.events.emit({ type: 'job.created', job: saved });
    await this.emitStats();
    return saved;
  }

  async findAll(filters?: { status?: JobStatus; inDlq?: boolean }): Promise<Job[]> {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.inDlq !== undefined) where.inDlq = filters.inDlq;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.repo.findOneBy({ id });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.findOne(id);
    if ([JobStatus.COMPLETED, JobStatus.CANCELLED].includes(job.status)) {
      throw new BadRequestException(`Cannot cancel job in status ${job.status}`);
    }

    job.status = JobStatus.CANCELLED;
    job.lockedBy = null;
    job.lockedAt = null;
    const saved = await this.repo.save(job);
    this.queue.remove(job.id);
    this.logger.jobEvent('job.cancelled', { jobId: id });
    this.events.emit({ type: 'job.updated', job: saved });
    await this.emitStats();
    return saved;
  }

  async getStats(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('j')
      .select('j.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('j.status')
      .getRawMany();

    const stats: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      stats[row.status] = parseInt(row.count, 10);
    }

    const dlqCount = await this.repo.count({ where: { inDlq: true } });
    stats.dlq = dlqCount;
    stats.maxRetries = config.scheduler.maxRetries;
    return stats;
  }

  async emitStats() {
    const stats = await this.getStats();
    this.events.emit({ type: 'stats.updated', stats });
  }

  async dependenciesMet(job: Job): Promise<boolean> {
    if (!job.dependencyIds.length) return true;
    const deps = await this.repo.findBy({ id: In(job.dependencyIds) });
    return deps.every((d) => d.status === JobStatus.COMPLETED);
  }

  async scheduleRecurring(completed: Job): Promise<Job | null> {
    if (!completed.interval) return null;
    const ms = INTERVAL_MS[completed.interval];
    if (!ms) return null;

    const next = this.repo.create({
      type: completed.type,
      priority: completed.priority,
      payload: completed.payload,
      interval: completed.interval,
      dependencyIds: [],
      scheduledAt: new Date(Date.now() + ms),
      status: JobStatus.PENDING,
    });
    const saved = await this.repo.save(next);
    this.logger.jobEvent('job.created', { jobId: saved.id, type: saved.type, recurring: true });
    await this.queue.maybeEnqueue(saved);
    this.events.emit({ type: 'job.created', job: saved });
    return saved;
  }

  jitteredDelay(attemptIndex: number): number {
    const base = config.scheduler.retryDelaysMs[attemptIndex] ?? 25000;
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(100, Math.round(base + jitter));
  }
}
