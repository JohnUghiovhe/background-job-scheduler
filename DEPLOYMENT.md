# Deployment Guide

Target environment: **Oracle Linux 8+** (bare-metal VM) with **Nginx reverse proxy**, **Let's Encrypt HTTPS**, and **Dynamic DNS**.

## Architecture (Production)

```
                          Internet
                             |
                     DuckDNS / No-IP
                     jobs.yourdomain.com
                             |
                        Nginx (443)
                        /          \
                   /api/*           /*
                       |             |
                NestJS API      React SPA
               localhost:3000   /var/www/.../client/dist
                       |
            Redis + PostgreSQL
```

- Nginx terminates HTTPS and serves the built React SPA.
- `/api/*` is reverse-proxied to NestJS on `localhost:3000`.
- The worker process runs independently (no HTTP) — scale N workers via PM2.
- Dynamic DNS keeps the domain pointed at the server's public IP.

---

## 1. Initial Server Setup

Run every block below as `root` or with `sudo`.

### 1.1 System packages

```bash
# Update everything
dnf update -y

# Essential tools
dnf install -y git curl wget tar gzip make gcc-c++ firewalld

# Enable and start the firewall
systemctl enable --now firewalld

# Open HTTP and HTTPS ports
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

### 1.2 Install Node.js 22 (via NodeSource)

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# Verify
node --version   # v22.x
npm --version
```

### 1.3 Install PM2 globally

```bash
npm install -g pm2

# Configure PM2 to auto-start on reboot
pm2 startup
```

Copy the `systemctl enable` command the output prints and run it.

### 1.4 Install and start Nginx

```bash
dnf install -y nginx

# Enable and start
systemctl enable --now nginx

# Verify
nginx -v
curl -I http://localhost
```

You should get a 200 or 403 (default Nginx page).

### 1.5 Install and start PostgreSQL 15

```bash
dnf install -y postgresql15-server

# Initialize the database
/usr/pgsql-15/bin/postgresql-15-setup initdb

# Enable and start
systemctl enable --now postgresql-15

# Create the application database and user
sudo -u postgres psql -c "CREATE USER jobuser WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE job_scheduler OWNER jobuser;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE job_scheduler TO jobuser;"

# Allow password authentication (edit pg_hba.conf)
# Find the file:
find /var/lib/pgsql -name pg_hba.conf

# Edit it — change these lines from 'peer'/'ident' to 'md5':
#   local   all   all                    md5
#   host    all   all   127.0.0.1/32     md5
#   host    all   all   ::1/128          md5
# Then restart:
systemctl restart postgresql-15
```

### 1.6 Install and start Redis 7

```bash
dnf install -y redis7

# Enable and start
systemctl enable --now redis7

# Verify
redis-cli ping   # should reply PONG
```

---

## 2. Dynamic DNS (DuckDNS)

This script runs as a cron job and updates DuckDNS every 5 minutes with the server's current public IP.

### 2.1 Create the update script

```bash
mkdir -p /opt/ddns

cat > /opt/ddns/duckdns.sh << 'SCRIPT'
#!/bin/bash
# DuckDNS auto-update
# Usage: ./duckdns.sh <subdomain> <token>

SUBDOMAIN="$1"
TOKEN="$2"

CURRENT_IP=$(curl -s http://checkip.amazonaws.com)
LAST_IP_FILE="/opt/ddns/last_ip_${SUBDOMAIN}"

if [ -f "$LAST_IP_FILE" ]; then
    LAST_IP=$(cat "$LAST_IP_FILE")
    [ "$CURRENT_IP" = "$LAST_IP" ] && exit 0
fi

curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${TOKEN}&ip=${CURRENT_IP}" > /dev/null
echo "$CURRENT_IP" > "$LAST_IP_FILE"
SCRIPT

chmod +x /opt/ddns/duckdns.sh
```

### 2.2 Create the systemd timer

```bash
# Create the service unit
cat > /etc/systemd/system/duckdns.service << 'UNIT'
[Unit]
Description=DuckDNS dynamic DNS updater
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/ddns/duckdns.sh YOUR_SUBDOMAIN YOUR_DUCK_DNS_TOKEN
User=root
UNIT

# Create the timer (fires every 5 minutes)
cat > /etc/systemd/system/duckdns.timer << 'TIMER'
[Unit]
Description=Run DuckDNS update every 5 minutes
Requires=duckdns.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
TIMER

# Enable and start
systemctl daemon-reload
systemctl enable --now duckdns.timer

# Test it once
systemctl start duckdns.service
```

> Replace `YOUR_SUBDOMAIN` and `YOUR_DUCK_DNS_TOKEN` with your actual DuckDNS credentials. Sign up free at https://duckdns.org.

---

## 3. Application Deployment

### 3.1 Clone the repository

```bash
mkdir -p /var/www
cd /var/www
git clone <your-repo-url> background-job-scheduler
cd background-job-scheduler
```

### 3.2 Install dependencies

```bash
# Backend dependencies
npm install

# Frontend dependencies
cd client && npm install && cd ..
```

### 3.3 Configure backend environment

```bash
cat > .env.production << 'ENV'
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://jobs.YOUR_DOMAIN

# PostgreSQL
DATABASE_URL=postgresql://jobuser:CHANGE_ME_STRONG_PASSWORD@localhost:5432/job_scheduler
DB_HOST=localhost
DB_PORT=5432
DB_NAME=job_scheduler
DB_USER=jobuser
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Redis
REDIS_URL=redis://localhost:6379
REDIS_DB=0

# Scheduler
STARVATION_THRESHOLD_MS=60000
DLQ_ALERT_THRESHOLD=10
WORKER_POLL_MS=500
JOB_LOCK_TTL_SEC=300
ENV
```

### 3.4 Configure frontend environment

```bash
cat > client/.env.production << 'ENV'
VITE_API_BASE_URL=/api
ENV
```

> `/api` works because Nginx proxies `/api/*` to `localhost:3000`. Change to a full URL only if the API is on a separate domain.

### 3.5 Build both projects

```bash
# Build the backend
npm run build

# Build the frontend
npm run client:build
```

### 3.6 Run database migrations

```bash
npm run migration:run
```

---

## 4. Nginx Reverse Proxy + Certbot (HTTPS)

### 4.1 Install Certbot (via snap)

```bash
# Install snap if not present
dnf install -y epel-release
dnf install -y snapd
systemctl enable --now snapd.socket
ln -s /var/lib/snapd/snap /snap 2>/dev/null || true

# Install certbot
snap install core
snap refresh core
snap install --classic certbot
ln -s /snap/bin/certbot /usr/bin/certbot
```

### 4.2 Create the Nginx server block

Replace `jobs.YOUR_DOMAIN` with your DuckDNS domain (e.g. `jobs.example.duckdns.org`).

```bash
cat > /etc/nginx/conf.d/job-scheduler.conf << 'NGINX'
# HTTP — Certbot needs this to issue certificates
server {
    listen 80;
    server_name jobs.YOUR_DOMAIN;

    # Certbot challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect everything else to HTTPS (added after certbot)
    location / {
        return 301 https://$host$request_uri;
    }
}
NGINX

# Test and reload
nginx -t && systemctl reload nginx
```

### 4.3 Obtain the SSL certificate

```bash
certbot --nginx -d jobs.YOUR_DOMAIN --non-interactive --agree-tos -m YOUR_EMAIL@example.com
```

This automatically modifies the Nginx config to add SSL directives and the 301 redirect. After it runs, your HTTP block is converted to a full HTTPS block.

### 4.4 Verify the SSL certificate auto-renewal

```bash
# Test the renewal process (does not actually renew)
certbot renew --dry-run

# Certbot installs a systemd timer automatically; verify it:
systemctl list-timers | grep certbot
```

### 4.5 Final Nginx config (after Certbot)

Certbot rewrites `/etc/nginx/conf.d/job-scheduler.conf` to include SSL. You still need to add the proxy rules and SPA fallback. Open the file and add the `location` blocks inside the `server` block that Certbot created (the one with `listen 443 ssl`):

```nginx
# /etc/nginx/conf.d/job-scheduler.conf
# (Certbot manages the ssl_certificate lines — leave those alone)

server {
    listen 443 ssl http2;
    server_name jobs.YOUR_DOMAIN;

    # These lines are managed by Certbot — do not edit
    ssl_certificate /etc/letsencrypt/live/jobs.YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobs.YOUR_DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ─── Add everything below this line ─────────────────

    root /var/www/background-job-scheduler/client/dist;
    index index.html;

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API + SSE requests to NestJS
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE — disable buffering
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    # Proxy health check (unbuffered)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA fallback — serve index.html for any unknown route
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# HTTP → HTTPS redirect (Certbot creates this; verify it exists)
server {
    listen 80;
    server_name jobs.YOUR_DOMAIN;
    return 301 https://$host$request_uri;
}
```

```bash
# Validate and reload
nginx -t && systemctl reload nginx
```

---

## 5. Start the Application with PM2

### 5.1 Start API server

```bash
cd /var/www/background-job-scheduler

pm2 start dist/main.js --name job-scheduler-api --update-env
```

### 5.2 Start worker(s)

```bash
# Single worker
pm2 start dist/worker.main.js --name job-scheduler-worker --update-env

# Scale horizontally (start additional workers in separate terminals)
pm2 start dist/worker.main.js --name job-scheduler-worker-2 --update-env
pm2 start dist/worker.main.js --name job-scheduler-worker-3 --update-env
```

> For development, use `npm run start:worker` which builds then watches with `node --watch`.

### 5.3 Save the PM2 process list

```bash
pm2 save

# Verify the startup hook is installed
pm2 startup
```

> If `pm2 startup` says "not configured", run the `systemctl enable` command it prints.

### 5.4 Useful PM2 commands

```bash
pm2 status                    # List all processes
pm2 logs job-scheduler-api    # Stream API logs
pm2 logs job-scheduler-worker # Stream worker logs
pm2 monit                     # Resource monitor (CPU / memory)
pm2 restart all               # Restart everything after code update
```

---

## 6. Full Deployment Script (One-Shot)

Save this as `deploy.sh` in the repo root. Run it after every `git pull` to redeploy.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /var/www/background-job-scheduler

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Installing backend dependencies ==="
npm install

echo "=== Installing frontend dependencies ==="
cd client && npm install && cd ..

echo "=== Building backend ==="
npm run build

echo "=== Building frontend ==="
npm run client:build

echo "=== Running migrations ==="
npm run migration:run

echo "=== Restarting PM2 processes ==="
pm2 restart all --update-env

echo "=== Done ==="
```

```bash
chmod +x deploy.sh
```

---

## 7. Health Checks & Monitoring

### 7.1 Manual health check

```bash
curl -H "Host: jobs.YOUR_DOMAIN" http://localhost/health
# Response: {"redis":{"status":"ok",...},"database":{"status":"ok",...},"env":"production"}
```

### 7.2 Cron-based auto-recovery

```bash
cat > /opt/healthcheck.sh << 'SCRIPT'
#!/usr/bin/env bash
# If the API returns non-200, restart it

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health 2>/dev/null || echo "000")

if [ "$RESPONSE" != "200" ]; then
    pm2 restart job-scheduler-api
    echo "[$(date)] API was down (HTTP $RESPONSE); restarted" >> /var/log/healthcheck.log
fi
SCRIPT

chmod +x /opt/healthcheck.sh

# Add to crontab (runs every minute)
echo '* * * * * root /opt/healthcheck.sh' > /etc/cron.d/healthcheck
```

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `nginx -t` fails with "unknown directive" | Certbot options file missing | Re-run `certbot` or ensure `/etc/letsencrypt/options-ssl-nginx.conf` exists |
| API returns 502 Bad Gateway | NestJS not running | `pm2 status` — if stopped, `pm2 start job-scheduler-api` |
| Static files 404 | `root` path wrong or `client/dist` missing | Verify `ls /var/www/background-job-scheduler/client/dist/index.html` |
| SSE not updating in browser | Nginx buffering | Verify `proxy_buffering off` is in the `/api/` location block |
| Worker not picking up jobs | Worker process down or Redis misconfigured | `pm2 logs job-scheduler-worker` to check errors |
| CORS errors in browser | `CORS_ORIGIN` in `.env.production` doesn't match browser origin | Set `CORS_ORIGIN=https://jobs.YOUR_DOMAIN` (no trailing slash) |
| "Lock not acquired" spam | Too many workers for the job volume | Increase `WORKER_POLL_MS` (e.g. 1000) or add random jitter to poll interval |
| Certbot "too many certificates" | Let's Encrypt rate limit (50/week per domain) | Use the staging flag for testing: `certbot --staging ...` |
| PM2 processes not restarting after reboot | `pm2 startup` not configured | Run `pm2 startup` and execute the printed command |
| DuckDNS IP not updating | Firewall blocking outbound DNS | Allow DNS: `firewall-cmd --permanent --add-service=dns && firewall-cmd --reload` |
