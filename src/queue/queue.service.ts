import { Injectable, OnModuleInit } from '@nestjs/common';
import { config } from '../common/config';
import { JobData, JobStatus, jobFromHash, jobKey, statusSetKey } from '../jobs/job.interface';
import { JobsService } from '../jobs/jobs.service';
import { RedisService } from '../redis/redis.service';
import { HeapPriorityQueue, QueueJob } from './heap-queue';
import { TimingWheelQueue } from './timing-wheel-queue';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly heap = new HeapPriorityQueue();
  private readonly timingWheel = new TimingWheelQueue();
  private scheduledTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.rebuild();
    this.scheduledTimer = setInterval(() => this.promoteDueJobs(), 1000);
  }

  private toQueueJob(job: JobData): QueueJob {
    return {
      id: job.id,
      priority: job.priority,
      scheduledAt: job.scheduledAt ? new Date(job.scheduledAt).getTime() : Date.now(),
      createdAt: new Date(job.createdAt).getTime(),
    };
  }

  async rebuild() {
    const ids = await this.redis.smembers(statusSetKey(JobStatus.PENDING));
    this.heap.clear();
    this.timingWheel.clear();
    for (const id of ids) {
      const hash = await this.redis.hgetall(jobKey(id));
      if (!hash) continue;
      const job = jobFromHash(id, hash);
      if (job.inDlq) continue;
      await this.maybeEnqueue(job);
    }
  }

  requeue(qj: QueueJob) {
    const now = Date.now();
    this.heap.insert(qj, now, config.scheduler.starvationThresholdMs);
    this.timingWheel.insert(qj, now);
  }

  async maybeEnqueue(job: JobData) {
    if (job.status !== JobStatus.PENDING || job.inDlq) return;
    const now = Date.now();
    const scheduledAt = job.scheduledAt ? new Date(job.scheduledAt).getTime() : now;
    if (scheduledAt > now) return;

    const depsService = await this.getJobsService();
    if (depsService && !(await depsService.dependenciesMet(job))) return;

    const qj = this.toQueueJob(job);
    this.heap.insert(qj, now, config.scheduler.starvationThresholdMs);
    this.timingWheel.insert(qj, now);
  }

  private jobsService?: JobsService;
  setJobsService(svc: JobsService) {
    this.jobsService = svc;
  }

  private async getJobsService(): Promise<JobsService | null> {
    return this.jobsService ?? null;
  }

  remove(id: string) {
    this.heap.remove(id);
    this.timingWheel.remove(id);
  }

  peekNext(): QueueJob | undefined {
    return this.heap.peek(Date.now(), config.scheduler.starvationThresholdMs);
  }

  popNext(): QueueJob | undefined {
    return this.heap.pop(Date.now(), config.scheduler.starvationThresholdMs);
  }

  async promoteDueJobs() {
    const ids = await this.redis.smembers(statusSetKey(JobStatus.PENDING));
    for (const id of ids) {
      if (this.heap.has(id)) continue;
      const hash = await this.redis.hgetall(jobKey(id));
      if (!hash) continue;
      const job = jobFromHash(id, hash);
      if (job.inDlq) continue;
      const scheduledAt = job.scheduledAt ? new Date(job.scheduledAt).getTime() : 0;
      if (scheduledAt > Date.now()) continue;
      await this.maybeEnqueue(job);
    }
  }

  getHeapSize(): number {
    return this.heap.size;
  }

  getTimingWheelSize(): number {
    return this.timingWheel.size;
  }
}
