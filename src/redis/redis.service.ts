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

  async hset(key: string, data: Record<string, string | number | boolean>): Promise<number> {
    const entries = Object.entries(data);
    if (entries.length === 0) return 0;
    const multi = this.client.multi();
    for (const [k, v] of entries) {
      multi.hSet(key, k, String(v));
    }
    const results = await multi.exec();
    return results ? results.filter((r) => r !== null).length : 0;
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.client.hGetAll(key);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hGet(key, field);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hDel(key, fields);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sAdd(key, members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.sRem(key, members);
  }

  async smove(source: string, destination: string, member: string): Promise<boolean> {
    const res = await this.client.sMove(source, destination, member);
    return res === 1;
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.sCard(key);
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(keys);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }
}
