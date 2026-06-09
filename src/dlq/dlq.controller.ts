import { Controller, Get, Param, Post } from '@nestjs/common';
import { DlqService } from './dlq.service';

@Controller('dlq')
export class DlqController {
  constructor(private readonly dlq: DlqService) {}

  @Get()
  findAll() {
    return this.dlq.findAll();
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.dlq.manualRetry(id);
  }
}
