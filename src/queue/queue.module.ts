import { Module, forwardRef } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { QueueService } from './queue.service';

@Module({
  imports: [forwardRef(() => JobsModule)],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
