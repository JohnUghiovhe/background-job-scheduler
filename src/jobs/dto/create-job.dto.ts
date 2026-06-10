import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({
    description: 'Registered job handler type.',
    enum: ['send_email'],
    example: 'send_email',
  })
  @IsString()
  type!: string;

  @ApiPropertyOptional({
    description: 'Priority level: 1 = high, 2 = medium, 3 = low.',
    minimum: 1,
    maximum: 3,
    default: 2,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Handler-specific JSON payload.',
    example: { to: 'test@example.com', subject: 'Welcome', body: 'Hello from the scheduler' },
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'ISO-8601 time when the job becomes eligible to run.',
    example: '2026-06-10T10:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  scheduled_at?: string;

  @ApiPropertyOptional({
    description: 'Recurring interval. When set, a completed job schedules the next run automatically.',
    enum: ['every_1_minute', 'every_5_minutes', 'every_1_hour'],
    example: 'every_5_minutes',
  })
  @IsOptional()
  @IsIn(['every_1_minute', 'every_5_minutes', 'every_1_hour'])
  interval?: string;

  @ApiPropertyOptional({
    description: 'UUIDs of jobs that must complete before this job can run.',
    type: [String],
    example: ['6c62af67-24da-4a6f-9948-1d35ed6b3a36'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependency_ids?: string[];
}
