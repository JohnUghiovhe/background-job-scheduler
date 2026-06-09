import { QueueJob } from './heap-queue';

/**
 * Hierarchical timing wheel for time-bucketed scheduling.
 * Jobs land in a slot based on scheduledAt; within each slot a sorted list
 * orders by priority then creation time.
 */
export class TimingWheelQueue {
  private readonly tickMs: number;
  private readonly slotCount: number;
  private slots: QueueJob[][];

  constructor(tickMs = 1000, slotCount = 3600) {
    this.tickMs = tickMs;
    this.slotCount = slotCount;
    this.slots = Array.from({ length: slotCount }, () => []);
  }

  get size(): number {
    return this.slots.reduce((sum, s) => sum + s.length, 0);
  }

  private slotIndex(scheduledAt: number, now: number): number {
    const delta = Math.max(0, scheduledAt - now);
    const ticks = Math.floor(delta / this.tickMs);
    return ticks % this.slotCount;
  }

  effectivePriority(job: QueueJob, now: number, starvationMs: number): number {
    const waitMs = Math.max(0, now - job.createdAt);
    const boost = Math.floor(waitMs / starvationMs);
    return Math.max(1, job.priority - boost);
  }

  insert(job: QueueJob, now = Date.now()): void {
    const idx = this.slotIndex(job.scheduledAt, now);
    const slot = this.slots[idx];
    slot.push(job);
    slot.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });
  }

  peek(now = Date.now(), starvationMs = 60000): QueueJob | undefined {
    let best: QueueJob | undefined;
    let bestScore = Infinity;
    for (const slot of this.slots) {
      for (const job of slot) {
        if (job.scheduledAt > now) continue;
        const eff = this.effectivePriority(job, now, starvationMs);
        const score = eff * 1e15 + job.scheduledAt * 1e3 + job.createdAt;
        if (score < bestScore) {
          bestScore = score;
          best = job;
        }
      }
    }
    return best;
  }

  pop(now = Date.now(), starvationMs = 60000): QueueJob | undefined {
    const job = this.peek(now, starvationMs);
    if (!job) return undefined;
    this.remove(job.id);
    return job;
  }

  clear(): void {
    this.slots = Array.from({ length: this.slotCount }, () => []);
  }

  remove(id: string): boolean {
    for (const slot of this.slots) {
      const idx = slot.findIndex((j) => j.id === id);
      if (idx !== -1) {
        slot.splice(idx, 1);
        return true;
      }
    }
    return false;
  }
}
