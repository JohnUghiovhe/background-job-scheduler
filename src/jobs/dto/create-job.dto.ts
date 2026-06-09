import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateJobDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  scheduled_at?: string;

  @IsOptional()
  @IsIn(['every_1_minute', 'every_5_minutes', 'every_1_hour'])
  interval?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependency_ids?: string[];
}
