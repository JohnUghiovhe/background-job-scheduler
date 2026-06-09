import { DataSource } from 'typeorm';
import { config } from '../common/config';
import { Job } from './entities/job.entity';

export default new DataSource({
  type: 'postgres',
  url: config.database.url,
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  entities: [Job],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: config.env !== 'production',
  ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
});
