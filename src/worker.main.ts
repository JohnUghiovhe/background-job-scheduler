import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { config } from './common/config';
import { WorkerBootstrapModule } from './workers/worker-bootstrap.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerBootstrapModule);
  process.stdout.write(
    JSON.stringify({
      event: 'worker.process.started',
      env: config.env,
    }) + '\n',
  );
}

bootstrap();
