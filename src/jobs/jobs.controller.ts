import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HandlerRegistry } from '../handlers/handler.registry';
import { JobStatus } from './job.interface';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly handlers: HandlerRegistry,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a background job' })
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs, optionally filtered by status' })
  findAll(@Query('status') status?: JobStatus) {
    return this.jobs.findAll(status ? { status } : undefined);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get job counts by status plus DLQ count' })
  stats() {
    return this.jobs.getStats();
  }

  @Get('types')
  @ApiOperation({ summary: 'List registered job handler types' })
  types() {
    return this.handlers.listTypes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by id' })
  findOne(@Param('id') id: string) {
    return this.jobs.findOne(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or processing job' })
  cancel(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }
}
