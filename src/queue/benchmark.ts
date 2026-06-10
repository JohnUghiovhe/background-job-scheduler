/**
 * Benchmark: Heap vs Timing Wheel
 * Run: npm run benchmark
 */
import { HeapPriorityQueue, QueueJob } from './heap-queue';
import { TimingWheelQueue } from './timing-wheel-queue';

interface BenchResult {
  benchmark: string;
  avgMs: number;
  opsPerSecond: number;
  iterations: number;
  operations: number;
}

function makeJobs(n: number, due = false): QueueJob[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `job-${i}`,
    priority: (i % 3) + 1,
    scheduledAt: due ? now - i : now + (i % 100) * 1000,
    createdAt: now + i,
  }));
}

function bench(name: string, operations: number, fn: () => void, iterations = 5): BenchResult {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const result = {
    benchmark: name,
    avgMs: Number(avg.toFixed(3)),
    opsPerSecond: Number(((operations / avg) * 1000).toFixed(0)),
    iterations,
    operations,
  };
  console.log(JSON.stringify(result));
  return result;
}

const INSERT_N = 2000;
const POP_N = 500;
const insertJobs = makeJobs(INSERT_N);
const popJobs = makeJobs(POP_N, true);
const now = Date.now();

console.log(JSON.stringify({ event: 'benchmark.start', insertN: INSERT_N, popN: POP_N }));

const heapInsert = bench('heap.insert', INSERT_N, () => {
  const q = new HeapPriorityQueue();
  for (const j of insertJobs) q.insert(j, now);
});

const wheelInsert = bench('timing_wheel.insert', INSERT_N, () => {
  const q = new TimingWheelQueue();
  for (const j of insertJobs) q.insert(j, now);
});

const heapPop = bench('heap.pop', POP_N, () => {
  const q = new HeapPriorityQueue();
  for (const j of popJobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

const wheelPop = bench('timing_wheel.pop', POP_N, () => {
  const q = new TimingWheelQueue();
  for (const j of popJobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

const heapSizeProbe = new HeapPriorityQueue();
const wheelSizeProbe = new TimingWheelQueue();
for (const j of insertJobs) {
  heapSizeProbe.insert(j, now);
  wheelSizeProbe.insert(j, now);
}

const summary = {
  event: 'benchmark.summary',
  insertN: INSERT_N,
  popN: POP_N,
  insertWinner: heapInsert.avgMs < wheelInsert.avgMs ? 'heap' : 'timing_wheel',
  popWinner: heapPop.avgMs < wheelPop.avgMs ? 'heap' : 'timing_wheel',
  queues: {
    heap: {
      insertAvgMs: heapInsert.avgMs,
      insertOpsPerSecond: heapInsert.opsPerSecond,
      popAvgMs: heapPop.avgMs,
      popOpsPerSecond: heapPop.opsPerSecond,
      sizeAfterInsertProbe: heapSizeProbe.size,
    },
    timingWheel: {
      insertAvgMs: wheelInsert.avgMs,
      insertOpsPerSecond: wheelInsert.opsPerSecond,
      popAvgMs: wheelPop.avgMs,
      popOpsPerSecond: wheelPop.opsPerSecond,
      sizeAfterInsertProbe: wheelSizeProbe.size,
    },
  },
  tradeoffs: {
    heap: 'O(log n) insert/pop, best general-purpose priority ordering',
    timingWheel: 'O(1) bucket insert; pop scans buckets, better for dense time schedules',
  },
};

console.log(JSON.stringify(summary));
