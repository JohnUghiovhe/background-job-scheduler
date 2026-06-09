import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from '../common/config';
import { Job } from '../database/entities/job.entity';
import { RedisModule } from '../redis/redis.module';
import { WorkerModule } from './worker.module';

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
    RedisModule,
    WorkerModule,
  ],
})
export class WorkerBootstrapModule {}
