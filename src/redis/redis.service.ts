import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { config } from '../common/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClientType;

  async onModuleInit() {
    this.client = createClient({ url: config.redis.url, database: config.redis.db });
    this.client.on('error', (err) => {
      process.stderr.write(JSON.stringify({ event: 'redis.error', message: err.message }) + '\n');
    });
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', { NX: true, EX: ttlSeconds });
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    const sub = this.client.duplicate();
    await sub.connect();
    await sub.subscribe(channel, handler);
  }
}
