import * as dotenv from 'dotenv';
import * as path from 'path';

const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

function buildRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  if (password) return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  return `redis://${host}:${port}`;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  redis: {
    url: buildRedisUrl(),
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  env: process.env.NODE_ENV || 'development',
  worker: {
    pollIntervalMs: parseInt(process.env.WORKER_POLL_MS || '500', 10),
    lockTtlSeconds: parseInt(process.env.JOB_LOCK_TTL_SEC || '300', 10),
  },
  scheduler: {
    starvationThresholdMs: parseInt(process.env.STARVATION_THRESHOLD_MS || '60000', 10),
    dlqAlertThreshold: parseInt(process.env.DLQ_ALERT_THRESHOLD || '10', 10),
    maxRetries: 3,
    retryDelaysMs: [1000, 5000, 25000],
  },
};
