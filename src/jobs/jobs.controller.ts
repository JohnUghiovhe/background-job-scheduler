import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobStatus } from '../database/entities/job.entity';
import { HandlerRegistry } from '../handlers/handler.registry';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly handlers: HandlerRegistry,
  ) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  findAll(@Query('status') status?: JobStatus) {
    return this.jobs.findAll(status ? { status } : undefined);
  }

  @Get('stats')
  stats() {
    return this.jobs.getStats();
  }

  @Get('types')
  types() {
    return this.handlers.listTypes();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobs.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }

  /** DAG demo: Generate Report → Upload File → Send Email */
  @Post('workflow/report-pipeline')
  async createReportPipeline() {
    const report = await this.jobs.create({
      type: 'generate_report',
      priority: 2,
      payload: { reportType: 'monthly_sales' },
    });
    const upload = await this.jobs.create({
      type: 'upload_file',
      priority: 2,
      payload: { filePath: '/reports/monthly_sales.pdf' },
      dependency_ids: [report.id],
    });
    const email = await this.jobs.create({
      type: 'send_email',
      priority: 1,
      payload: { to: 'test@gmail.com', subject: 'Monthly Report Ready' },
      dependency_ids: [upload.id],
    });
    return { report, upload, email };
  }
}
