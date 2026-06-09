import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../database/entities/job.entity';
import { EventsModule } from '../events/events.module';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueModule } from '../queue/queue.module';
import { QueueService } from '../queue/queue.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    EventsModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [JobsController],
  providers: [JobsService, HandlerRegistry],
  exports: [JobsService, HandlerRegistry],
})
export class JobsModule implements OnModuleInit {
  constructor(
    private readonly queue: QueueService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.queue.setJobsService(this.jobs);
  }
}
