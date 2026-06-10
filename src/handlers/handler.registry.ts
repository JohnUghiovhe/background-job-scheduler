import { Injectable } from '@nestjs/common';
import { handleSendEmail } from './email.handler';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class HandlerRegistry {
  private readonly handlers: Record<string, JobHandler> = {
    send_email: handleSendEmail,
  };

  get(type: string): JobHandler | undefined {
    return this.handlers[type];
  }

  listTypes(): string[] {
    return Object.keys(this.handlers);
  }
}
