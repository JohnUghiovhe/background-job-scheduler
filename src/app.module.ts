import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { config } from './common/config';
import { Job } from './database/entities/job.entity';
import { DlqModule } from './dlq/dlq.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.database.url,
      host: config.database.host,
      port: config.database.port,
      username: config.database.username,
      password: config.database.password,
      database: config.database.database,
      entities: [Job],
      synchronize: config.env !== 'production',
      ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
    }),
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
