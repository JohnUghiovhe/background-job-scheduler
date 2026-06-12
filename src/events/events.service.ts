import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JobData } from '../jobs/job.interface';

export interface JobEvent {
  type: 'job.updated' | 'job.created' | 'stats.updated' | 'dlq.alert';
  job?: JobData;
  stats?: Record<string, number>;
  message?: string;
}

@Injectable()
export class EventsService {
  private readonly subject = new Subject<JobEvent>();

  emit(event: JobEvent) {
    this.subject.next(event);
  }

  stream(): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      map((event) => ({ data: JSON.stringify(event) }) as MessageEvent),
    );
  }
}
