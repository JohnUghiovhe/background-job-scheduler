import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { config } from './common/config';
import { DlqModule } from './dlq/dlq.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
     origin: [
    'https://54-234-110-16.sslip.io', 
    'http://localhost:5173', // keeps your local dev environment working
    'http://localhost:3000'
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dilemma Background Job Scheduler')
    .setDescription('Heap-based priority queue, DAG workflows, DLQ, and SSE events')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    include: [JobsModule, EventsModule, DlqModule, HealthModule],
  });
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.port);
  process.stdout.write(
    JSON.stringify({
      event: 'server.started',
      port: config.port,
      env: config.env,
    }) + '\n',
  );
}

bootstrap();
