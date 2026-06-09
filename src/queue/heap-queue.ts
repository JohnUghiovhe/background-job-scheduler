export interface QueueJob {
  id: string;
  priority: number;
  scheduledAt: number;
  createdAt: number;
}

/**
 * Min-heap ordered by:
 * 1. Effective priority (lower = higher priority)
 * 2. Scheduled time (earlier first)
 * 3. Creation time (earlier first)
 */
export class HeapPriorityQueue {
  private heap: QueueJob[] = [];

  get size(): number {
    return this.heap.length;
  }

  private compare(a: QueueJob, b: QueueJob, now: number, starvationMs: number): number {
    const effA = this.effectivePriority(a, now, starvationMs);
    const effB = this.effectivePriority(b, now, starvationMs);
    if (effA !== effB) return effA - effB;
    if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt - b.scheduledAt;
    return a.createdAt - b.createdAt;
  }

  effectivePriority(job: QueueJob, now: number, starvationMs: number): number {
    const waitMs = Math.max(0, now - job.createdAt);
    const boost = Math.floor(waitMs / starvationMs);
    return Math.max(1, job.priority - boost);
  }

  insert(job: QueueJob, now = Date.now(), starvationMs = 60000): void {
    this.heap.push(job);
    this.bubbleUp(this.heap.length - 1, now, starvationMs);
  }

  peek(now = Date.now(), starvationMs = 60000): QueueJob | undefined {
    return this.heap[0];
  }

  pop(now = Date.now(), starvationMs = 60000): QueueJob | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0, now, starvationMs);
    }
    return top;
  }

  remove(id: string, now = Date.now(), starvationMs = 60000): boolean {
    const idx = this.heap.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.bubbleDown(idx, now, starvationMs);
      this.bubbleUp(idx, now, starvationMs);
    }
    return true;
  }

  toArray(): QueueJob[] {
    return [...this.heap];
  }

  clear(): void {
    this.heap = [];
  }

  has(id: string): boolean {
    return this.heap.some((j) => j.id === id);
  }

  private parent(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  private left(i: number): number {
    return 2 * i + 1;
  }

  private right(i: number): number {
    return 2 * i + 2;
  }

  private bubbleUp(i: number, now: number, starvationMs: number): void {
    while (i > 0) {
      const p = this.parent(i);
      if (this.compare(this.heap[i], this.heap[p], now, starvationMs) >= 0) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }

  private bubbleDown(i: number, now: number, starvationMs: number): void {
    const n = this.heap.length;
    while (true) {
      const l = this.left(i);
      const r = this.right(i);
      let smallest = i;
      if (l < n && this.compare(this.heap[l], this.heap[smallest], now, starvationMs) < 0) {
        smallest = l;
      }
      if (r < n && this.compare(this.heap[r], this.heap[smallest], now, starvationMs) < 0) {
        smallest = r;
      }
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
