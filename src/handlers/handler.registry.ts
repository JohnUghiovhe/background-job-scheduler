import { Injectable } from '@nestjs/common';
import { handleSendEmail } from './email.handler';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class HandlerRegistry {
  private readonly handlers: Record<string, JobHandler> = {
    send_email: handleSendEmail,
    generate_report: async (payload) => {
      await new Promise((r) => setTimeout(r, 150));
      if (!payload.reportType) throw new Error('reportType required');
    },
    upload_file: async (payload) => {
      await new Promise((r) => setTimeout(r, 120));
      if (!payload.filePath) throw new Error('filePath required');
    },
  };

  get(type: string): JobHandler | undefined {
    return this.handlers[type];
  }

  listTypes(): string[] {
    return Object.keys(this.handlers);
  }
}
