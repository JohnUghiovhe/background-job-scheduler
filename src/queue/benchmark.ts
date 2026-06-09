/**
 * Benchmark: Heap vs Timing Wheel
 * Run: npm run benchmark
 */
import { HeapPriorityQueue } from './heap-queue';
import { TimingWheelQueue } from './timing-wheel-queue';
import { QueueJob } from './heap-queue';

function makeJobs(n: number): QueueJob[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `job-${i}`,
    priority: (i % 3) + 1,
    scheduledAt: now + (i % 100) * 1000,
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

const N = 10000;
const jobs = makeJobs(N);
const now = Date.now();

console.log(JSON.stringify({ event: 'benchmark.start', jobCount: N }));

const heapInsert = bench('heap.insert', () => {
  const q = new HeapPriorityQueue();
  for (const j of jobs) q.insert(j, now);
});

const wheelInsert = bench('timing_wheel.insert', () => {
  const q = new TimingWheelQueue();
  for (const j of jobs) q.insert(j, now);
});

const heapPop = bench('heap.pop', () => {
  const q = new HeapPriorityQueue();
  for (const j of jobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

const wheelPop = bench('timing_wheel.pop', () => {
  const q = new TimingWheelQueue();
  for (const j of jobs) q.insert(j, now);
  while (q.size > 0) q.pop(now);
});

console.log(
  JSON.stringify({
    event: 'benchmark.summary',
    insertWinner: heapInsert < wheelInsert ? 'heap' : 'timing_wheel',
    popWinner: heapPop < wheelPop ? 'heap' : 'timing_wheel',
    heapInsertMs: heapInsert.toFixed(3),
    wheelInsertMs: wheelInsert.toFixed(3),
    heapPopMs: heapPop.toFixed(3),
    wheelPopMs: wheelPop.toFixed(3),
    tradeoffs: {
      heap: 'O(log n) insert/pop, best general-purpose priority ordering',
      timing_wheel: 'O(1) insert into slot, better for time-dense schedules; peek/pop scans all slots',
    },
  }),
);
