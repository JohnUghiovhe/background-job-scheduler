import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../database/entities/job.entity';
import { EventsModule } from '../events/events.module';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueModule } from '../queue/queue.module';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), QueueModule, EventsModule],
  controllers: [DlqController],
  providers: [DlqService, HandlerRegistry],
  exports: [DlqService],
})
export class DlqModule {}
