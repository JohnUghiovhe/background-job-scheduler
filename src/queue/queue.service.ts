import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from '../common/config';
import { Job, JobStatus } from '../database/entities/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { HeapPriorityQueue, QueueJob } from './heap-queue';
import { TimingWheelQueue } from './timing-wheel-queue';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly heap = new HeapPriorityQueue();
  private readonly timingWheel = new TimingWheelQueue();
  private scheduledTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
  ) {}

  async onModuleInit() {
    await this.rebuild();
    this.scheduledTimer = setInterval(() => this.promoteDueJobs(), 1000);
  }

  private toQueueJob(job: Job): QueueJob {
    return {
      id: job.id,
      priority: job.priority,
      scheduledAt: (job.scheduledAt ?? job.createdAt).getTime(),
      createdAt: job.createdAt.getTime(),
    };
  }

  async rebuild() {
    const pending = await this.repo.find({
      where: { status: JobStatus.PENDING, inDlq: false },
    });
    this.heap.clear();
    this.timingWheel.clear();
    for (const job of pending) {
      await this.maybeEnqueue(job);
    }
  }

  requeue(qj: QueueJob) {
    const now = Date.now();
    this.heap.insert(qj, now, config.scheduler.starvationThresholdMs);
    this.timingWheel.insert(qj, now);
  }

  async maybeEnqueue(job: Job) {
    if (job.status !== JobStatus.PENDING || job.inDlq) return;
    const now = Date.now();
    const scheduledAt = (job.scheduledAt ?? job.createdAt).getTime();
    if (scheduledAt > now) return;

    const depsService = await this.getJobsService();
    if (!(await depsService.dependenciesMet(job))) return;

    const qj = this.toQueueJob(job);
    this.heap.insert(qj, now, config.scheduler.starvationThresholdMs);
    this.timingWheel.insert(qj, now);
  }

  private jobsService?: JobsService;
  setJobsService(svc: JobsService) {
    this.jobsService = svc;
  }

  private async getJobsService(): Promise<JobsService> {
    if (!this.jobsService) throw new Error('JobsService not wired');
    return this.jobsService;
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
    const due = await this.repo
      .createQueryBuilder('j')
      .where('j.status = :status', { status: JobStatus.PENDING })
      .andWhere('j.inDlq = false')
      .andWhere('(j.scheduledAt IS NULL OR j.scheduledAt <= NOW())')
      .getMany();

    for (const job of due) {
      if (!this.heap.has(job.id)) {
        await this.maybeEnqueue(job);
      }
    }
  }

  getHeapSize(): number {
    return this.heap.size;
  }

  getTimingWheelSize(): number {
    return this.timingWheel.size;
  }
}
