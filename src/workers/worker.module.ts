import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../database/entities/job.entity';
import { DlqModule } from '../dlq/dlq.module';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { QueueModule } from '../queue/queue.module';
import { WorkerService } from './worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    QueueModule,
    JobsModule,
    DlqModule,
    EventsModule,
  ],
  providers: [WorkerService],
})
export class WorkerModule {}
