# Background Job Scheduler

A production-ready background job scheduler with a **heap-based priority queue** (starvation-aware), **hierarchical timing wheel** for scheduled dispatch, **DAG workflow** support, and a **dead-letter queue** with automatic alerting. Runs as two independent processes — an API server and one or more workers — sharing PostgreSQL and Redis.

## Features

- **Dual in-memory queues** — `HeapPriorityQueue` (min-heap, O(log n)) for global priority ordering plus `TimingWheelQueue` (O(1) bucket insert) for dense time schedules
- **Starvation prevention** — effective priority boosts by 1 per 60s of waiting; no low-priority job starves indefinitely
- **DAG workflows** — jobs declare `dependencyIds`; downstream jobs wait until all upstream jobs complete
- **Retry with jittered backoff** — 3 retries at [1s, 5s, 25s] ±20% jitter; final failure routes to DLQ
- **Dead-letter queue** — isolated view of permanently failed jobs; manual retry resets the counter; automatic email alert when threshold (default 10) is crossed
- **Distributed locking** — Redis `SET NX EX` prevents double-execution across multiple worker processes
- **Real-time SSE events** — `GET /events/stream` pushes job updates, stats changes, and DLQ alerts to connected clients
- **React dashboard** — neon-themed live-updating UI (Vite + Tailwind CSS v4) with stats cards, job table, DLQ management, and job creation
- **Handler** — `send_email` is the single working handler (email simulation with ~10% simulated failure rate)
- **Recurring jobs** — intervals of 1m, 5m, or 1h; automatically spawns a successor on completion
- **Attempts tracking** — each job tracks retry count; UI shows Attempts column, "Failed (max)" badge at 3 retries, and pulse animation during retry
- **Swagger docs** — auto-generated API documentation at `GET /docs` (Jobs, Events, DLQ, and Health endpoints)

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript |
| API framework | NestJS 11 |
| ORM | TypeORM 0.3 with PostgreSQL 15 |
| Queue (in-memory) | Custom min-heap + hierarchical timing wheel |
| Caching / locking | Redis 7 (via `node-redis`) |
| Frontend | React 19, Vite 6, Tailwind CSS 4 |
| Validation | class-validator + class-transformer |
| Docs | @nestjs/swagger (Swagger UI) |

## Prerequisites

- Node.js 22+
- npm 10+
- Docker Desktop (for local Redis + PostgreSQL)
- Git

## Local Development Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url> && cd background-job-scheduler
npm install
cd client && npm install && cd ..
```

### 2. Start infrastructure

```bash
docker compose up -d
```

Starts Redis (port 6379) and PostgreSQL (port 5433).

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your password if different from the docker-compose default. The defaults match `docker-compose.yml`.

> `.env` and `.env.production` are gitignored. `NODE_ENV=production` loads `.env.production` instead.

### Environment variables

| Variable | Used by | Default / Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | API, worker | `development` | Selects `.env` or `.env.production`; disables TypeORM sync in production |
| `PORT` | API | `3000` | NestJS HTTP port |
| `CORS_ORIGIN` | API | `*` locally | Allowed browser origins; use your HTTPS domain in production |
| `DATABASE_URL` | API, worker | `postgresql://postgres:YOUR_PASSWORD@localhost:5433/job_scheduler_dev` | Full PostgreSQL connection string |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | API, worker | Docker or provider values | Component PostgreSQL connection settings |
| `REDIS_URL` | API, worker | `redis://localhost:6379` | Redis connection for distributed locks |
| `REDIS_DB` | API, worker | `0` | Redis logical database |
| `STARVATION_THRESHOLD_MS` | API, worker | `60000` | Waiting time before a job gains one effective priority level |
| `DLQ_ALERT_THRESHOLD` | API, worker | `10` | DLQ size that triggers the automatic email alert |
| `WORKER_POLL_MS` | worker | `500` | Worker polling interval |
| `JOB_LOCK_TTL_SEC` | worker | `300` | Redis lock TTL for in-flight jobs |
| `VITE_API_BASE_URL` | client | `/api` | Browser API base path or absolute API URL |

### 4. Start the API server

```bash
npm run start:dev
```

NestJS boots on `http://localhost:3000`. Swagger UI at `http://localhost:3000/docs`.

### 5. Start the worker (separate terminal)

```bash
npm run start:worker
```

The worker polls the in-memory queue every 500ms and processes jobs. Start multiple instances for horizontal scaling.

### 6. Start the frontend (separate terminal)

```bash
npm run client:dev
```

Vite dev server on `http://localhost:5173`. Proxies `/api` → `localhost:3000`.

## UI Screenshots

The UI is designed around the required evaluation screens. After starting the API, worker, and client, the live dashboard reflects real-time updates via SSE.

| Screen | Screenshot |
|---|---|
| Dashboard | ![Dashboard ](docs\screenshots\dashboard.png) |
|  Jobs table  | ![Jobs table](docs\screenshots\jobs-table.png) |
| Create job form | ![Create job form](docs\screenshots\create-job.png) |
| Dead-letter queue | ![Dead-letter queue](docs/screenshots/dlq.png) |

> **Note**: Screenshots may show the previous indigo theme. The current UI uses a neon orange accent theme with Tailwind CSS v4. Refresh screenshots after starting the full stack.

## Running Workers

```bash
# Single worker (builds then watches with node --watch)
npm run start:worker

# Multiple workers — run in separate terminals
npm run start:worker   # terminal 1
npm run start:worker   # terminal 2
```

Each worker gets a unique ID (`worker-<random>`). Redis locking ensures no two workers execute the same job simultaneously.

## Queue Processing

The system uses two in-memory data structures in parallel:

- **HeapPriorityQueue** — the authoritative pop source. Workers call `QueueService.popNext()` which pops from the min-heap ordered by effective priority, scheduled time, then creation time.
- **TimingWheelQueue** — time-bucketed (3600 one-second slots) for efficient handling of future-scheduled jobs. A 1-second interval runs `promoteDueJobs()` which queries PostgreSQL for due jobs and inserts them into both queues.

On startup, all `PENDING` + `!inDlq` jobs are loaded from PostgreSQL.

## Assignment Choices

| Requirement | Chosen implementation | Notes |
|---|---|---|
| Job handler | Email simulation | Required option; validates recipient/subject, simulates latency and transient failures |
| Live updates | Server-Sent Events | `GET /events/stream` powers the React client without page refreshes |
| Alternative scheduler | Timing wheel | Implemented alongside the required heap and benchmarked with `npm run benchmark` |

Only `send_email` is registered — the project adheres to the "pick one handler" assignment requirement.

## Project Structure

```
background-job-scheduler/
├── src/
│   ├── main.ts                    # API server entrypoint (NestJS HTTP, port 3000)
│   ├── worker.main.ts             # Worker process entrypoint (NestApplicationContext)
│   ├── app.module.ts              # Root module (API + DB + Queue + Events)
│   ├── common/
│   │   ├── config.ts              # Env-driven config (dotenv)
│   │   └── logger.service.ts      # Structured JSON logger (stdout)
│   ├── database/
│   │   ├── entities/job.entity.ts # Job schema (TypeORM)
│   │   └── typeorm.config.ts      # Migration DataSource
│   ├── queue/
│   │   ├── heap-queue.ts          # Min-heap with starvation boost
│   │   ├── timing-wheel-queue.ts  # Hierarchical timing wheel
│   │   ├── queue.service.ts       # Dual-queue orchestration
│   │   └── benchmark.ts           # Heap vs wheel performance benchmark
│   ├── jobs/
│   │   ├── jobs.controller.ts     # CRUD + stats endpoints
│   │   ├── jobs.service.ts        # Job creation, cancellation, stats, recurring
│   │   └── dto/create-job.dto.ts  # Validation schema
│   ├── workers/
│   │   ├── worker.service.ts      # Poll loop, lock, execute, retry/DLQ
│   │   ├── worker.module.ts       # Worker DI module
│   │   └── worker-bootstrap.module.ts  # Standalone NestJS context for worker
│   ├── dlq/
│   │   ├── dlq.controller.ts      # GET /dlq, POST /dlq/:id/retry
│   │   ├── dlq.service.ts         # Enter DLQ, manual retry, alert threshold
│   ├── handlers/
│   │   ├── handler.registry.ts    # type → handler mapping
│   │   └── email.handler.ts       # send_email with ~10% simulated failure
│   ├── redis/
│   │   └── redis.service.ts       # Lock acquire/release, pub/sub
│   ├── events/
│   │   ├── events.service.ts      # RxJS Subject → SSE
│   │   └── events.controller.ts   # GET /events/stream
│   └── health/
│       └── health.controller.ts   # GET /health, /health/redis, /health/db
├── client/
│   ├── src/
│   │   ├── App.tsx                # Main UI (tabs, SSE hook)
│   │   ├── api.ts                 # API client (configurable base URL)
│   │   ├── types.ts               # Frontend type definitions
│   │   ├── hooks/useEventStream.ts # SSE consumer hook
│   │   └── components/
│   │       ├── Dashboard.tsx       # Stats cards
│   │       ├── JobsTable.tsx       # Job list + cancel
│   │       ├── DlqView.tsx         # DLQ list + retry
│   │       └── CreateJobForm.tsx   # Job creation form
│   ├── vite.config.ts             # Vite + React + Tailwind + proxy
│   └── package.json
├── docker-compose.yml             # Redis 7 + PostgreSQL 15
├── .env.example                   # Backend env template
├── client/.env.example            # Frontend VITE_ env template
├── tsconfig.json
└── nest-cli.json
```

## Commands

| Command | Description |
|---|---|
| `npm run build` | Clean build (`rimraf dist && nest build`) |
| `npm run start:dev` | API server (watch mode, port 3000) |
| `npm run start:worker` | Worker process (builds then watches with `node --watch`) |
| `npm run start:worker:prod` | Production worker (`node dist/worker.main`) |
| `npm run benchmark` | Heap vs Timing Wheel benchmark |
| `npm run migration:run` | Run TypeORM migrations |
| `npm run client:dev` | Vite dev server (port 5173) |
| `npm run client:build` | Production client build |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/jobs` | Create a job |
| `GET` | `/jobs` | List jobs (optional `?status=`) |
| `GET` | `/jobs/stats` | Job count by status + DLQ count |
| `GET` | `/jobs/types` | Registered handler types |
| `GET` | `/jobs/:id` | Get job by ID |
| `POST` | `/jobs/:id/cancel` | Cancel a pending/processing job |
| `GET` | `/dlq` | List DLQ jobs |
| `POST` | `/dlq/:id/retry` | Retry a job from DLQ |
| `GET` | `/events/stream` | SSE event stream (real-time updates) |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/health` | Health check (Redis + DB) |

## Additional Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — structural diagrams, data flow, queue mechanics, failure handling, and complete end-to-end implementation details.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — production deployment guide for Oracle Linux with Nginx reverse proxy, HTTPS, and process management.

## License

MIT
