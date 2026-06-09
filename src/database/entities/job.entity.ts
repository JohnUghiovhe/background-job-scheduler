import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum JobInterval {
  EVERY_1_MINUTE = 'every_1_minute',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_1_HOUR = 'every_1_hour',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  type!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'int', default: 2 })
  priority!: number;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status!: JobStatus;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  interval!: JobInterval | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'uuid', array: true, default: '{}' })
  dependencyIds!: string[];

  @Column({ default: false })
  inDlq!: boolean;

  @Column({ type: 'varchar', nullable: true })
  lockedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
