import { DataSource } from 'typeorm';
import { config } from '../common/config';
import { Job } from './entities/job.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Job],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: config.env !== 'production',
  ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
});
