# Deployment Guide for Background Job Scheduler

> **Target environment**: Any Linux server (tested on Oracle Linux 8+, Ubuntu 22.04, Debian 12) with root or sudo access.
> **Goal**: Run the NestJS API, the background worker(s), and the React SPA on a manually provisioned VM, expose a public HTTPS domain via a dynamic‑DNS provider, and reverse‑proxy with Nginx.

---

## 1️⃣ Prerequisites (before cloning the repo)

| Item | Why needed | Recommended command |
|------|------------|----------------------|
| **Node.js 22** | Required runtime for NestJS and the build scripts. | ```bash
# Using NodeSource (works on Oracle Linux, Ubuntu, Debian)
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs   # or `apt-get install -y nodejs`
node --version   # should be v22.x
npm --version    # >= 10
``` |
| **npm 10+** | Needed for the lockfile format used in package‑json. | Included with Node 22.
| **PM2** | Process manager to keep API/worker running and restart on reboot. | ```bash
npm install -g pm2
pm2 startup   # prints a systemd command you must run
``` |
| **Git** | To clone the repository. | ```bash
yum install -y git   # or `apt-get install -y git`
``` |
| **Nginx** | Reverse‑proxy + static file serving. | ```bash
yum install -y nginx   # or `apt-get install -y nginx`
systemctl enable --now nginx
``` |
| **Certbot (Snap)** | Free Let’s Encrypt certificates. | ```bash
# Install snapd if missing
yum install -y epel-release && yum install -y snapd
systemctl enable --now snapd.socket
ln -s /var/lib/snapd/snap /snap || true
snap install core
snap refresh core
snap install --classic certbot
ln -s /snap/bin/certbot /usr/bin/certbot
``` |
| **PostgreSQL 15** | Persistent store for jobs. | ```bash
# Oracle Linux example
yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm
yum install -y postgresql15-server postgresql15-contrib
/usr/pgsql-15/bin/postgresql-15-setup initdb
systemctl enable --now postgresql-15
``` |
| **Redis 7** | Distributed lock & queue state. | ```bash
yum install -y redis   # or `apt-get install -y redis-server`
systemctl enable --now redis
``` |
| **Dynamic DNS provider** (DuckDNS, No‑IP, etc.) | Gives you a stable domain that points to the server’s changing public IP. | Sign‑up at the provider, obtain a sub‑domain and token.
| **Mail utilities (optional)** | The DLQ alert email uses `sendmail`/`mail`. Install if you want email alerts. | ```bash
yum install -y mailx   # or `apt-get install -y mailutils`
``` |

---

## 2️⃣ Server‑side preparation

1. **Create a dedicated system user** (optional but recommended):
   ```bash
   adduser --system --shell /bin/bash jobuser
   ```
2. **Create a directory for the application** and give ownership to the user:
   ```bash
   mkdir -p /var/www/background-job-scheduler
   chown jobuser:jobuser /var/www/background-job-scheduler
   ```
3. **Clone the repository** (as `jobuser`):
   ```bash
   sudo -u jobuser git clone <YOUR_REPO_URL> /var/www/background-job-scheduler
   cd /var/www/background-job-scheduler
   ```
4. **Install backend dependencies**:
   ```bash
   sudo -u jobuser npm ci   # exact install based on package‑lock
   ```
5. **Install frontend dependencies**:
   ```bash
   cd client
   sudo -u jobuser npm ci
   cd ..
   ```
6. **Create production environment files**:
   ```bash
   # Backend
   cp .env.example .env.production
   # Edit .env.production (see "Configuration tweaks" below)
   
   # Frontend
   cp client/.env.example client/.env.production
   # Edit client/.env.production if you want to hard‑code the API URL (optional)
   ```

---

## 3️⃣ Configuration tweaks before first production deploy

### 3.1 Database credentials & security
- The provided `docker‑compose.yml` contains a hard‑coded password (`JohnUghiovhe.10`). **Never use that password in production**.
- Generate a strong password (e.g. `openssl rand -base64 32`).
- Update `src/database/typeorm.config.ts` **or** simply set the environment variables in `.env.production`:
  ```bash
  DB_PASSWORD=YOUR_STRONG_PASSWORD
  POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD   # for the local PostgreSQL service
  ```
- Create the database and user **once** (if you use the system‑installed PostgreSQL, not Docker):
  ```bash
  sudo -u postgres psql -c "CREATE USER jobuser WITH PASSWORD 'YOUR_STRONG_PASSWORD';"
  sudo -u postgres psql -c "CREATE DATABASE job_scheduler OWNER jobuser;"
  ```

### 3.2 Migrations vs. auto‑sync
- In production `config.env !== 'production'` disables `synchronize`. The repo currently has **no migration files**.
- **Option A – Quick start:** temporarily enable sync for the first launch:
  ```bash
  # Edit src/common/config.ts (or set an env var for one‑time use)
  NODE_ENV=development   # will make synchronize true
  ```
  Run the build once; the tables will be created. After confirming they exist, switch back to `production`.
- **Option B – Proper migration:** generate an initial migration now and commit it:
  ```bash
  npx typeorm migration:generate -n InitSchema -d src/database/typeorm.config.ts
  # This will create src/database/migrations/<timestamp>-InitSchema.ts
  # After verifying, commit the file.
  npm run migration:run   # runs the migration in production
  ```
  This is the recommended long‑term approach because `synchronize` must stay false for safety.

### 3.3 SSL configuration in NestJS
- The current config sets `ssl: { rejectUnauthorized: false }` for production. This works with self‑signed certs or when the PostgreSQL server presents a certificate that the OS cannot verify. If you have a proper PostgreSQL TLS setup, replace the block with the real cert path.

### 3.4 Environment variables checklist
| Variable | Recommended production value |
|----------|-----------------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` (Nginx will proxy to this) |
| `CORS_ORIGIN` | `https://jobs.YOURDOMAIN.com` |
| `DATABASE_URL` | `postgresql://jobuser:YOUR_PASSWORD@localhost:5432/job_scheduler` |
| `REDIS_URL` | `redis://localhost:6379` |
| `STARVATION_THRESHOLD_MS` | `60000` (default) |
| `DLQ_ALERT_THRESHOLD` | `10` (or your preferred limit) |
| `WORKER_POLL_MS` | `500` |
| `JOB_LOCK_TTL_SEC` | `300` |

---

## 4️⃣ Build the application (still on the server)

```bash
# From the repo root
npm run build               # Backend (NestJS) -> dist/
cd client && npm run build   # Frontend -> client/dist/
# Ensure the build succeeded
ls -R dist
ls -R client/dist
```

## 5️⃣ Run database migrations (if you chose Option B above)
```bash
npm run migration:run
```
If you used Option A and left `synchronize` on for the first launch, you can skip this step.

---

## 6️⃣ Process management with PM2

```bash
# API server (production)
pm2 start dist/main.js --name job-scheduler-api --update-env
# Worker process (production). You can start as many workers as you need.
pm2 start dist/worker.main.js --name job-scheduler-worker-1 --update-env
# Optional additional workers
pm2 start dist/worker.main.js --name job-scheduler-worker-2 --update-env

# Save the process list so it survives reboots
pm2 save

# Make PM2 auto‑start on boot (run the command printed by `pm2 startup` earlier)
# Example output:
#   sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u jobuser --hp /home/jobuser
# Execute that command now.
```

---

## 7️⃣ Nginx reverse‑proxy & static file serving

### 7.1 Create an Nginx server block (e.g. `/etc/nginx/conf.d/job-scheduler.conf`)
```nginx
server {
    listen 80;
    server_name jobs.YOURDOMAIN.com;   # replace with your dynamic‑DNS sub‑domain

    # ----- Let’s Encrypt challenge -----
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;   # default certbot webroot
    }

    # Redirect all HTTP → HTTPS (handled later by Certbot)
    location / {
        return 301 https://$host$request_uri;
    }
}
```

### 7.2 Obtain (and later auto‑renew) the SSL certificate
```bash
sudo certbot --nginx -d jobs.YOURDOMAIN.com --non-interactive --agree-tos -m your@email.com
# Certbot will edit the above server block, adding a new `listen 443 ssl` block.
# Verify the file now contains an `ssl_certificate` and `ssl_certificate_key` line.
```

### 7.3 Extend the **HTTPS** block to proxy API and serve the SPA
Edit the file created/modified by Certbot (typically still `/etc/nginx/conf.d/job-scheduler.conf`):
```nginx
server {
    listen 443 ssl http2;
    server_name jobs.YOURDOMAIN.com;

    # ---- Certbot‑managed SSL directives (do NOT edit) ----
    ssl_certificate /etc/letsencrypt/live/jobs.YOURDOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobs.YOURDOMAIN.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    # ----------------------------------------------------

    # Serve the React build
    root /var/www/background-job-scheduler/client/dist;
    index index.html;
    try_files $uri $uri/ /index.html;

    # Proxy API requests (including SSE)
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;   # trailing slash strips '/api'
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;               # required for SSE
    }

    # Optional health endpoint (no auth needed)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
```

### 7.4 Test & reload Nginx
```bash
nginx -t && systemctl reload nginx
```
Visit `https://jobs.YOURDOMAIN.com` – you should see the React dashboard, and the API should be reachable at `https://jobs.YOURDOMAIN.com/api/...`.

---

## 8️⃣ Dynamic DNS update (DuckDNS example)
If you use DuckDNS, create a small script and a systemd timer (the existing `DEPLOYMENT.md` already contains a full example). Briefly:
```bash
mkdir -p /opt/ddns
cat > /opt/ddns/duckdns.sh <<'EOF'
#!/bin/bash
SUBDOMAIN="$1"
TOKEN="$2"
IP=$(curl -s http://checkip.amazonaws.com)
curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${TOKEN}&ip=${IP}" > /dev/null
EOF
chmod +x /opt/ddns/duckdns.sh
# systemd service & timer (see DEPLOYMENT.md for exact unit files)
```
Enable the timer (`systemctl enable --now duckdns.timer`). It will keep your DNS record up‑to‑date.

---

## 9️⃣ Post‑deployment verification
1. **API health**: `curl -k https://jobs.YOURDOMAIN.com/health` → JSON with `redis` and `database` status.
2. **SSE stream**: Open the website, open DevTools → Network → look for a request to `/api/events/stream`. It should stay `200` and receive `event:` lines.
3. **Create a job via the UI** – verify it appears in the table, is processed (status changes to *completed*), and the worker logs show `job.completed`.
4. **DLQ test**: Temporarily set `JOB_LOCK_TTL_SEC=1` and kill a worker while a job is processing to force a retry; after three failures the job should appear in `/dlq`.
5. **PM2 status**: `pm2 list` – all processes should be `online`.
6. **Nginx logs** (`/var/log/nginx/error.log` & `access.log`) for any 502/504 errors.

---

## 🔧 Optional – Automate future deployments
Create a `deploy.sh` (the repo already ships one, but you may want to store it outside version control):
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/background-job-scheduler
git pull origin main
npm ci
cd client && npm ci && cd ..
npm run build && npm run client:build
npm run migration:run   # only needed if you added new migrations
pm2 restart job-scheduler-api job-scheduler-worker-1
```
Schedule it via a cron job or run manually after every code push.

---

## 📄 Summary of required repo changes before first production launch
- **Generate & commit an initial migration** (or temporarily enable `synchronize`).
- **Replace hard‑coded passwords** in `docker‑compose.yml` and `.env.production` with strong, unique values.
- **Add a `.env.production`** (already present, just edit). Ensure `CORS_ORIGIN` points to the public domain.
- **(Optional) Add an Nginx unit file** to the repo for easier copy‑paste on new servers.
- **Update README** to reference the new deployment steps (you can point to this file).

---

**You now have a fully‑functional, manually‑hosted deployment workflow for the Background Job Scheduler.** Follow the steps in order, double‑check the security‑related notes, and you’ll have a production‑ready system behind HTTPS, served by Nginx, with automatic restarts via PM2 and a dynamic‑DNS domain.
