import { Controller, Get } from '@nestjs/common';
import { createClient } from 'redis';
import { DataSource } from 'typeorm';
import { config } from '../common/config';

@Controller('health')
export class HealthController {
  constructor(private dataSource: DataSource) {}

  @Get('redis')
  async checkRedis() {
    try {
      const redis = createClient({ url: config.redis.url });
      await redis.connect();
      const pong = await redis.ping();
      await redis.disconnect();
      return { status: 'ok', redis: pong };
    } catch (err) {
      return { status: 'error', redis: err instanceof Error ? err.message : String(err) };
    }
  }

  @Get('db')
  async checkDatabase() {
    try {
      const result = await this.dataSource.query('SELECT NOW()');
      return { status: 'ok', database: result[0] };
    } catch (err) {
      return { status: 'error', database: err instanceof Error ? err.message : String(err) };
    }
  }

  @Get()
  async health() {
    return {
      redis: await this.checkRedis(),
      database: await this.checkDatabase(),
      env: config.env,
    };
  }
}