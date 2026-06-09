import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../database/entities/job.entity';
import { JobsModule } from '../jobs/jobs.module';
import { QueueService } from './queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), forwardRef(() => JobsModule)],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
