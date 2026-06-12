import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { HandlerRegistry } from '../handlers/handler.registry';
import { QueueModule } from '../queue/queue.module';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';

@Module({
  imports: [QueueModule, EventsModule],
  controllers: [DlqController],
  providers: [DlqService, HandlerRegistry],
  exports: [DlqService],
})
export class DlqModule {}
