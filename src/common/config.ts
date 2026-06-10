import * as dotenv from 'dotenv';
import * as path from 'path';

const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'job_scheduler_dev',
  },
  env: process.env.NODE_ENV || 'development',
  worker: {
    pollIntervalMs: parseInt(process.env.WORKER_POLL_MS || '500', 10),
    lockTtlSeconds: parseInt(process.env.JOB_LOCK_TTL_SEC || '300', 10),
  },
  scheduler: {
    /** After this many ms waiting, effective priority improves by 1 level */
    starvationThresholdMs: parseInt(process.env.STARVATION_THRESHOLD_MS || '60000', 10),
    /** DLQ alert fires when count reaches this threshold */
    dlqAlertThreshold: parseInt(process.env.DLQ_ALERT_THRESHOLD || '10', 10),
    maxRetries: 3,
    retryDelaysMs: [1000, 5000, 25000],
  },
};
