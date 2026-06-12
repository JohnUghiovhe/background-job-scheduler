import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { DlqModule } from './dlq/dlq.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    CommonModule,
    RedisModule,
    HealthModule,
    JobsModule,
    QueueModule,
    DlqModule,
    EventsModule,
  ],
})
export class AppModule {}
