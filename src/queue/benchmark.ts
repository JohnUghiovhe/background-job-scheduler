/**
 * Benchmark: Heap vs Timing Wheel
 * Run: npm run benchmark
 */
import { HeapPriorityQueue, QueueJob } from './heap-queue';
import { TimingWheelQueue } from './timing-wheel-queue';

function makeJobs(n: number, due = false): QueueJob[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `job-${i}`,
    priority: (i % 3) + 1,
    scheduledAt: due ? now - i : now + (i % 100) * 1000,
    createdAt: now + i,
  }));
}

function bench(name: string, fn: () => void, iterations = 5): number {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(JSON.stringify({ benchmark: name, avgMs: avg.toFixed(3), iterations }));
  return avg;
}

const INSERT_N = 2000;
const POP_N = 500;
const insertJobs = makeJobs(INSERT_N);
const popJobs = makeJobs(POP_N, true);
const now = Date.now();

console.log(JSON.stringify({ event: 'benchmark.start', insertN: INSERT_N, popN: POP_N }));

const heapInsert = bench('heap.insert', () => {
  const q = new HeapPriorityQueue();
  for (const j of insertJobs) q.insert(j, now);
});

const wheelInsert = bench('timing_wheel.insert', () => {
  const q = new TimingWheelQueue();
  for (const j of insertJobs) q.insert(j, now);
});

const heapPop = bench('heap.pop', () => {
  const q = new HeapPriorityQueue();
  for (const j of popJobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

const wheelPop = bench('timing_wheel.pop', () => {
  const q = new TimingWheelQueue();
  for (const j of popJobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

const summary = {
  event: 'benchmark.summary',
  insertN: INSERT_N,
  popN: POP_N,
  insertWinner: heapInsert < wheelInsert ? 'heap' : 'timing_wheel',
  popWinner: heapPop < wheelPop ? 'heap' : 'timing_wheel',
  heapInsertMs: heapInsert.toFixed(3),
  wheelInsertMs: wheelInsert.toFixed(3),
  heapPopMs: heapPop.toFixed(3),
  wheelPopMs: wheelPop.toFixed(3),
  tradeoffs: {
    heap: 'O(log n) insert/pop, best general-purpose priority ordering',
    timing_wheel: 'O(1) bucket insert; peek/pop scans buckets — better for dense time schedules',
  },
};

console.log(JSON.stringify(summary));
