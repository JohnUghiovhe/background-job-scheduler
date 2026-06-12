import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';
import { WorkerModule } from './worker.module';

@Module({
  imports: [
    CommonModule,
    RedisModule,
    WorkerModule,
  ],
})
export class WorkerBootstrapModule {}
