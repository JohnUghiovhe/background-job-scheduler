import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { QueueModule } from '../queue/queue.module';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';

@Module({
  imports: [QueueModule, EventsModule, JobsModule],
  controllers: [DlqController],
  providers: [DlqService],
  exports: [DlqService],
})
export class DlqModule {}
