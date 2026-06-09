import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { Job, JobStatus } from '../database/entities/job.entity';
import { EventsService } from '../events/events.service';
import { QueueService } from '../queue/queue.service';
import { handleSendEmail } from '../handlers/email.handler';

@Injectable()
export class DlqService {
  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly logger: StructuredLogger,
  ) {}

  async findAll(): Promise<Job[]> {
    return this.repo.find({ where: { inDlq: true }, order: { updatedAt: 'DESC' } });
  }

  async enterDlq(job: Job, error: string): Promise<Job> {
    job.inDlq = true;
    job.status = JobStatus.FAILED;
    job.lastError = error;
    job.lockedBy = null;
    job.lockedAt = null;
    const saved = await this.repo.save(job);
    this.queue.remove(job.id);
    this.logger.jobEvent('dlq.entered', { jobId: job.id, error });
    await this.checkAlertThreshold();
    this.events.emit({ type: 'job.updated', job: saved });
    return saved;
  }

  async manualRetry(id: string): Promise<Job> {
    const job = await this.repo.findOneBy({ id, inDlq: true });
    if (!job) throw new Error(`Job ${id} not in DLQ`);

    job.inDlq = false;
    job.status = JobStatus.PENDING;
    job.retryCount = 0;
    job.lastError = null;
    job.lockedBy = null;
    job.lockedAt = null;
    const saved = await this.repo.save(job);
    await this.queue.maybeEnqueue(saved);
    this.logger.jobEvent('dlq.retry', { jobId: id });
    this.events.emit({ type: 'job.updated', job: saved });
    return saved;
  }

  private async checkAlertThreshold() {
    const count = await this.repo.count({ where: { inDlq: true } });
    if (count >= config.scheduler.dlqAlertThreshold) {
      this.logger.jobEvent('dlq.alert', {
        dlqCount: count,
        threshold: config.scheduler.dlqAlertThreshold,
      });
      await this.sendDlqAlert(count);
      this.events.emit({
        type: 'dlq.alert',
        message: `DLQ threshold reached: ${count} jobs (threshold: ${config.scheduler.dlqAlertThreshold})`,
        stats: { dlq: count },
      });
    }
  }

  /** Simulated alert email when DLQ crosses threshold (default: 10 jobs) */
  private async sendDlqAlert(count: number) {
    await handleSendEmail({
      to: 'ops@dilamme.com',
      subject: `[ALERT] DLQ threshold reached: ${count} jobs`,
      body: `Dead-letter queue has ${count} jobs. Threshold: ${config.scheduler.dlqAlertThreshold}. Investigate immediately.`,
    });
  }
}
