import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from '../common/config';
import { StructuredLogger } from '../common/logger.service';
import { Job, JobStatus } from '../database/entities/job.entity';
import { EventsService } from '../events/events.service';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class DlqService {
  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly logger: StructuredLogger,
    private readonly handlers: HandlerRegistry,
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
    if (job.dlqRetriesLeft == null) {
      job.dlqRetriesLeft = config.scheduler.maxRetries;
    }
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
