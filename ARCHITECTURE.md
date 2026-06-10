# Architecture

## Structural Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Compose                        │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │   Redis 7     │  │        PostgreSQL 15                 │  │
│  │  (locks +     │  │  (jobs table, TypeORM, synchronize)  │  │
│  │   pub/sub)    │  └──────────────────────────────────────┘  │
│  │  port 6379    │                                           │
│  └──────┬───────┘                                           │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────┴───────────────────────────────────────────────────┐
│                    Process 1: API Server                      │
│              src/main.ts (NestJS HTTP, port 3000)            │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Jobs     │  │ DLQ      │  │ Health   │  │ Events/SSE  │  │
│  │ Controller│  │ Controller│  │ Controller│  │ Controller  │  │
│  │ jobs/*   │  │ dlq/*    │  │ health/* │  │ events/     │  │
│  └─────┬────┘  └────┬─────┘  └────┬─────┘  │ stream      │  │
│        │            │             │         └─────────────┘  │
│  ┌─────┴────────────┴─────────────┴────────────────────┐     │
│  │                 QueueService                          │     │
│  │  ┌──────────────────┐  ┌────────────────────────┐    │     │
│  │  │ HeapPriorityQueue │  │   TimingWheelQueue     │    │     │
│  │  │ (min-heap, O(log  │  │ (hierarchical buckets, │    │     │
│  │  │  n), starvation   │  │  O(1) insert, scan     │    │     │
│  │  │  boost)           │  │  for pop)              │    │     │
│  │  └──────────────────┘  └────────────────────────┘    │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Process 2: Worker (scale N)                      │
│        src/worker.main.ts (NestApplicationContext, no HTTP)   │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  WorkerService                                           │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────┐  ┌─────────────┐  │  │
│  │  │ Poll    │→ │ Lock     │→ │Execute│→ │ Retry/DLQ   │  │  │
│  │  │ Queue   │  │ (Redis)  │  │Handler│  │ Logic       │  │  │
│  │  └─────────┘  └──────────┘  └──────┘  └─────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
  HandlerRegistry                                           │
│  ┌─────────────────┐                                       │
│  │ type → handler   │  send_email                           │
│  └─────────────────┘                                       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Client (Browser, port 5173)                      │
│  React + Vite + Tailwind CSS v4                              │
│  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌──────────────┐  │
│  │Dashboard │  │ JobsTable │  │DlqView │  │CreateJobForm │  │
│  │(stats)   │  │ (list +   │  │(DLQ mgmt│  │ (modal form) │  │
│  │          │  │  cancel)  │  │ + retry)│  │              │  │
│  └──────────┘  └───────────┘  └────────┘  └──────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              useEventStream (SSE via EventSource)         │  │
│  │              /api/events/stream → live updates            │  │
│  └─────────────────────────────────────────────────────────┘  │
│  Vite proxy: /api → localhost:3000                            │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow (End-to-End)

### Job Lifecycle

```
POST /jobs  ──→  JobsController.create()
                     │
                     ▼
               JobsService.create()
                     │
                     ├── validates type against HandlerRegistry
                     ├── validates dependency_ids exist
                     ├── saves Job (status=PENDING) via TypeORM
                     ├── emits 'job.created' SSE event
                     ├── emitStats() → SSE 'stats.updated'
                     │
                     ▼
               QueueService.maybeEnqueue(job)
                     │
                     ├── checks status=PENDING && !inDlq
                     ├── checks scheduledAt ≤ now (skip if future)
                     ├── checks dependenciesMet() (all deps COMPLETED)
                     │
                     ▼
               inserts into both:
                 ├── HeapPriorityQueue (min-heap by effectivePriority)
                 └── TimingWheelQueue  (time-bucketed slot)


Worker poll loop (every WORKER_POLL_MS = 500ms):
                     │
                     ▼
               WorkerService.processNext()
                     │
                     ├── QueueService.popNext() → heap.pop()
                     │
                     ├── Redis acquireLock(`job:lock:{id}`, TTL=300s)
                     │   └── if failed → requeue(job), return
                     │
                     ├── re-fetch Job from DB (check cancelled/DLQ)
                     │
                     ├── re-check dependenciesMet()
                     │
                     ├── status = PROCESSING, lockedBy = workerId
                     │
                     ├── HandlerRegistry.get(type)(payload)
                     │   └── handler runs (async)
                     │
                     ├── if cancelled while processing → release, skip
                     │
                     ├── on success:
                     │   ├── status = COMPLETED
                     │   ├── scheduleRecurring() if interval set
                     │   ├── find dependents → maybeEnqueue each
                     │   └── emit SSE events
                     │
                     └── on failure:
                         ├── handleFailure()
                         │   ├── retryCount ≤ 3:
                         │   │   ├── set jittered delay [1s,5s,25s]
                         │   │   ├── status back to PENDING
                         │   │   ├── schedule future scheduledAt
                         │   │   └── setTimeout → maybeEnqueue(job)
                         │   └── retryCount > 3:
                         │       ├── DlqService.enterDlq()
                         │       │   ├── inDlq=true, status=FAILED
                         │       │   └── QueueService.remove(id)
                         │       └── checkAlertThreshold() → auto-email ops
                         │
                         └── finally: releaseLock, emitStats
```

## Dual Queue Mechanics

### `HeapPriorityQueue` (`src/queue/heap-queue.ts`)

- **Structure**: Array-backed binary min-heap.
- **Ordering** (`compare` at line 21):
  1. **Effective priority** (lowest first) — see starvation boost below.
  2. **Scheduled time** (earliest first).
  3. **Creation time** (earliest first) as final tiebreaker.
- **Operations**: `insert` O(log n), `pop` O(log n), `peek` O(1), `remove` O(n).
- **Starvation prevention** (`effectivePriority` at line 29):
  ```
  boost = floor((now - createdAt) / STARVATION_THRESHOLD_MS)
  effectivePriority = max(1, priority - boost)
  ```
  A job waiting 60s+ gets its effective priority boosted by 1 per threshold interval. A priority-3 job waiting 3 minutes becomes effective priority 0 (capped at 1), jumping ahead of fresh priority-1 jobs.

### `TimingWheelQueue` (`src/queue/timing-wheel-queue.ts`)

- **Structure**: Array of 3600 slots (1 slot per 1s tick), covering 1 hour of future scheduling.
- **Insert** O(1): `slotIndex = ((scheduledAt - now) / tickMs) % slotCount`, push into sorted slot.
- **Pop** O(slots × slot_size): scans all non-empty slots, finds best candidate by effective priority composite score.
- **Purpose**: Efficient for dense future-scheduled jobs where heap insertion would be wasteful. Used alongside the heap for scheduled dispatch promotion.

### Integration (`QueueService` at `src/queue/queue.service.ts`)

- Both structures are kept in-sync: every `maybeEnqueue` and `remove` touches both.
- `popNext()` reads from the **heap only** (the heap gives O(1) peek of the globally best candidate).
- A `setInterval` every 1s runs `promoteDueJobs()`:
  - Queries DB for due PENDING jobs not yet in the heap.
  - Calls `maybeEnqueue()` which inserts into both structures.
  - This catches jobs that were created with future `scheduledAt` values.

## Failure Handling

| Failure Mode | Mechanism | Location |
|---|---|---|---|
| Handler throws | Retry with jittered backoff (up to 3 retries; retryCount checked with `>=` before increment) | `worker.service.ts:134-158` |
| Final retry exhausted | Moves to DLQ (`inDlq=true, status=FAILED`) | `dlq.service.ts:24-36` |
| DLQ ≥ 10 jobs | Auto-sends alert email to `ops@dilamme.com` | `dlq.service.ts:55-69` |
| Worker crash mid-job | Lock TTL expires (300s), job sticks at PROCESSING. Manual or scheduled recovery needed. | `redis.service.ts:25-28` |
| Double execution | Redis `SET NX EX` prevents two workers claiming same job | `worker.service.ts:59-63` |
| Dependency not met | Job stays in PENDING, never enqueued until all deps COMPLETED | `jobs.service.ts:118-122` |

### Retry Logic

```
retryCount 0 → handler fails → 0 >= 3? no → increment to 1, delay ~1s
          1 → handler fails → 1 >= 3? no → increment to 2, delay ~5s
          2 → handler fails → 2 >= 3? no → increment to 3, delay ~25s
          3 → handler fails → 3 >= 3? yes → DLQ (retryCount stays 3)
```

After 3 retry attempts the job moves to DLQ. Manual retry resets `retryCount` to 0. The UI displays the count in the **Attempts** column with a red `Failed (max)` badge at 3 and a pulse animation while the job is retrying.

## Implementation Modalities

### Two-Process Architecture

The system runs two separate Node.js processes sharing the same database and Redis:

1. **API Server** (`src/main.ts`):
   - Full NestJS HTTP server with middleware, validation pipes, CORS, Swagger.
   - Exposes CRUD + workflow + health + SSE endpoints.
   - Loads `AppModule` which includes all modules.

2. **Worker Process** (`src/worker.main.ts`):
   - `NestFactory.createApplicationContext` — no HTTP listener.
   - Loads `WorkerBootstrapModule` (stripped-down: TypeORM + Redis + Worker + deps).
   - Runs an infinite poll loop, processing one job per tick.
   - Scale horizontally: run multiple instances with `npm run start:worker`.

### Configuration

- `NODE_ENV=production` loads `.env.production` (Supabase/Upstash) instead of `.env` (local Docker).
- `synchronize: true` in non-production — TypeORM auto-creates tables. In production, use `npm run migration:run`.
- Tunable via env: `WORKER_POLL_MS`, `JOB_LOCK_TTL_SEC`, `STARVATION_THRESHOLD_MS`, `DLQ_ALERT_THRESHOLD`.

| Variable | Process | Purpose |
|---|---|---|
| `NODE_ENV` | API, worker | Chooses `.env` vs `.env.production` and production database behavior |
| `PORT` | API | HTTP listener port for NestJS |
| `CORS_ORIGIN` | API | Browser origins allowed to call the API |
| `DATABASE_URL` | API, worker | Preferred PostgreSQL connection string |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | API, worker | PostgreSQL component settings when not using only `DATABASE_URL` |
| `REDIS_URL`, `REDIS_DB` | API, worker | Redis connection for locks |
| `STARVATION_THRESHOLD_MS` | API, worker | Milliseconds before waiting jobs gain one effective priority level |
| `DLQ_ALERT_THRESHOLD` | API, worker | DLQ count that emits the automatic alert email |
| `WORKER_POLL_MS` | worker | Polling cadence for worker processes |
| `JOB_LOCK_TTL_SEC` | worker | Redis lock TTL for claimed jobs |
| `VITE_API_BASE_URL` | client | API base URL used by the browser bundle |

### Assignment Option Choices

The assignment asks for one choice in three areas. This implementation chooses:

| Area | Selected option | Implementation |
|---|---|---|
| Job Handler | Email simulation | `send_email` is the single registered handler — adheres to the "pick one" requirement |
| Live Updates | Server-Sent Events | React consumes `GET /events/stream` through `useEventStream` |
| Alternative Scheduling Algorithm | Timing wheel | `TimingWheelQueue` is maintained beside the heap and benchmarked against it |

### Persistence vs In-Memory

| Layer | Storage | Purpose |
|---|---|---|
| PostgreSQL (`jobs` table) | Persistent on disk | Source of truth for all jobs |
| `HeapPriorityQueue` | In-memory (Node.js) | Fast priority-ordered pop for workers |
| `TimingWheelQueue` | In-memory (Node.js) | Fast scheduled-job bucketing |
| Redis | In-memory (external) | Distributed locks, eventual pub/sub |

On startup, `QueueService.rebuild()` loads all PENDING + !inDlq jobs into both in-memory structures.

### DAG Workflow

Jobs declare dependencies via `dependencyIds: UUID[]`. The `dependenciesMet()` check ensures all dependencies are COMPLETED before the job enters the in-memory queue. When a job completes, its dependents are fetched and `maybeEnqueue` is called. DAG orchestration is available via the `dependency_ids` field on job creation — no built-in pipeline endpoint is required.

### Recurring Jobs

Jobs with an `interval` field (every_1_minute, every_5_minutes, every_1_hour) spawn a clone with a future `scheduledAt` upon completion. Recurring is opt-in per job.

### SSE Event Bus

- `EventsService` wraps an RxJS `Subject<JobEvent>`.
- The API server exposes `GET /events/stream` (NestJS `@Sse`).
- The React client consumes via `EventSource` and dispatches to `useEventStream` hook.
- Events: `job.created`, `job.updated`, `stats.updated`, `dlq.alert`.

### Client Architecture

- React 19 with Vite 6, Tailwind CSS v4 via `@tailwindcss/vite` plugin.
- Vite proxies `/api` → `localhost:3000`.
- Components: `Dashboard` (stats cards), `JobsTable` (list + cancel, with Attempts column, status badges, and pulse animation on retry), `DlqView` (DLQ list + retry), `CreateJobForm` (create modal).
- Theme: Neon orange accent (`--color-orange-neon: #ff7a00`) via Tailwind v4 `@theme` block in `index.css`. Dark background throughout.
- Real-time updates via SSE, no manual refresh needed.
