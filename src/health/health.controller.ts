import { Controller, Get } from '@nestjs/common';
import { config } from '../common/config';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get('redis')
  async checkRedis() {
    try {
      const client = this.redis.getClient();
      const pong = await client.ping();
      return { status: 'ok', redis: pong };
    } catch (err) {
      return { status: 'error', redis: err instanceof Error ? err.message : String(err) };
    }
  }

  @Get()
  async health() {
    const redisResult = await this.checkRedis();
    return {
      redis: redisResult,
      env: config.env,
    };
  }
}
