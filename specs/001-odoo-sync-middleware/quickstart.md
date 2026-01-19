# Quick Start Guide: Odoo 19 Database Synchronization Middleware

This guide will help you get the Odoo sync middleware up and running locally and in production.

---

## Prerequisites

- **Node.js**: v18 LTS or higher ([download](https://nodejs.org))
- **npm**: v8+ (included with Node.js)
- **Odoo 19**: Two instances with RPC access enabled
  - Note database names, URLs, and admin credentials
- **SQLite**: Included with Node.js (no separate install needed)

---

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
cd odoo-sync-middleware
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server configuration
NODE_ENV=development
PORT=3000
HOST=127.0.0.1

# Encryption key for storing credentials (generate a random 32-char string)
MIDDLEWARE_SECRET_KEY=your-random-32-character-encryption-key-here

# SQLite database location (relative to project root)
DB_PATH=./data/sync.db

# Logging level
LOG_LEVEL=info
```

### 3. Initialize Database

```bash
npm run db:migrate
```

This creates the SQLite database schema with all tables.

### 4. Start the Middleware

```bash
npm start
```

You should see:

```
[2026-01-19 10:15:30] INFO: Server running at http://127.0.0.1:3000
[2026-01-19 10:15:30] INFO: Scheduler initialized with 0 active schedules
```

### 5. Access the Web Interface

Open your browser and navigate to:

```
http://localhost:3000
```

You should see the Odoo Sync Middleware interface with no login required.

---

## First Synchronization: Step by Step

### Step 1: Configure Source Database

1. On the interface, click **"Add Database"** → **"Source"**
2. Enter source Odoo database details:
   - **Name**: "Odoo Production" (friendly name)
   - **URL**: `http://odoo-prod.example.com`
   - **Database**: `odoo_prod`
   - **Username**: `admin`
   - **Password**: `your-admin-password`
3. Click **"Test Connection"** to validate
4. When green (✓ Connected), click **"Save Configuration"**

### Step 2: Configure Target Database

1. Click **"Add Database"** → **"Target"**
2. Enter target Odoo database details (same format as Step 1)
3. Test and save

### Step 3: Preview the Synchronization

1. In the main interface, select:
   - **Source**: "Odoo Production"
   - **Target**: Your target database
2. Click **"Preview Sync"**
3. Wait for preview to generate (you'll see progress)
4. Review the report:
   - Records to create/update/delete
   - Any conflicts detected
5. If conflicts exist, review field differences

### Step 4: Execute Synchronization

1. After reviewing preview, click **"Start Synchronization"**
2. Monitor real-time progress:
   - Current model being synced
   - Records processed so far
   - Estimated time remaining
3. When complete, you'll see summary:
   - Total records created/updated/deleted
   - Any errors
   - Duration
4. Check **"Sync History"** to see full audit log

### Step 5: Verify Results

1. Log into both Odoo instances
2. Compare data:
   - Check that records match
   - Verify original IDs are preserved
   - Confirm creation/modification dates match source

---

## Setting Up Automatic Synchronization

### Create a Schedule

1. In the interface, go to **"Schedules"** tab
2. Click **"Create Schedule"**
3. Configure:
   - **Name**: "Nightly Sync to Test DB"
   - **Frequency**: Select **"Daily"** → Set time to "00:00" (midnight)
   - **Timezone**: Your timezone (e.g., "America/New_York")
   - **Error Notifications**: Enter email address (optional)
4. Click **"Save"**
5. Schedule will show: "Next run: Tomorrow at 00:00"

### How Scheduled Syncs Work

- At the configured time, the middleware automatically:
  1. Connects to both databases
  2. Generates preview
  3. Executes synchronization
  4. Logs results to history
  5. Sends email if errors occurred (if email configured)

---

## Docker Deployment

### 1. Build Docker Image

```bash
docker build -t odoo-sync-middleware:latest .
```

### 2. Create Docker Container

```bash
docker run -d \
  --name odoo-sync \
  -p 3000:3000 \
  -v odoo-sync-data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e MIDDLEWARE_SECRET_KEY=your-random-key-here \
  -e LOG_LEVEL=info \
  odoo-sync-middleware:latest
```

### 3. Verify Container

```bash
docker logs odoo-sync
```

Should show:

```
[2026-01-19 10:15:30] INFO: Server running at http://0.0.0.0:3000
```

### 4. Access via Browser

Navigate to `http://your-server-ip:3000`

---

## Production Deployment

### Security Considerations

1. **Network Access**: Deploy on internal network only (no login required)
   - Use VPN or firewall to restrict access
   - NOT suitable for internet-facing deployment

2. **Encryption Key**: Generate strong key

   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

3. **Database Backup**: Backup SQLite database regularly

   ```bash
   sqlite3 /app/data/sync.db ".backup '/backups/sync-`date +%Y%m%d`.db'"
   ```

### Reverse Proxy Setup (Nginx Example)

```nginx
server {
    listen 80;
    server_name sync.internal.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Process Management (PM2 Example)

```bash
npm install -g pm2

# Start middleware
pm2 start npm --name "odoo-sync" -- start

# Setup autostart on reboot
pm2 startup
pm2 save
```

---

## Monitoring & Troubleshooting

### Check Logs

```bash
# Development
npm run logs

# Production (Docker)
docker logs odoo-sync

# Production (PM2)
pm2 logs odoo-sync
```

### Common Issues

**Problem**: "Cannot connect to Odoo database"

```
Causes:
- Wrong URL or database name
- Network connectivity issue
- Odoo RPC disabled on target instance

Solution:
- Verify URL format: http://host:port (no /web)
- Check firewall/VPN connectivity
- Enable RPC in Odoo settings
- Test with odoo-cli if available
```

**Problem**: "Synchronization timed out"

```
Causes:
- Database is very large (100k+ records)
- Network latency between databases
- Odoo server under load

Solution:
- Try syncing smaller model subset first (use model filter)
- Increase timeout in .env if available
- Schedule syncs during low-traffic hours
- Check both Odoo servers' performance
```

**Problem**: "Preview shows too many conflicts"

```
Causes:
- Databases diverged significantly
- Different field definitions
- Manual edits in target database

Solution:
- Review conflicts in detail
- Choose "keep source" for critical records
- Use model filter to sync only key models
- Contact DB admin for schema alignment
```

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "active_sync_run": null,
  "scheduled_jobs_active": 2
}
```

---

## Advanced Configuration

### Syncing Only Specific Models

When creating sync or preview, use **Model Filter**:

```
Models to sync:
- res.partner
- product.product
- account.move
```

Only these models will be included in preview and sync.

### Email Notifications

Configure in `.env`:

```env
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASSWORD=smtp-password
SMTP_FROM=odoo-sync@example.com
```

Emails sent automatically when:
- Scheduled sync encounters errors
- Manual sync rollback occurs
- Connection test fails

### API Usage (Programmatic)

Get current sync status:

```bash
curl -X GET http://localhost:3000/api/sync/status?sync_run_id=123
```

Response:

```json
{
  "sync_run_id": 123,
  "status": "running",
  "progress": {
    "current_model": "res.partner",
    "records_processed": 450,
    "total_records": 2150,
    "percentage_complete": 20,
    "estimated_seconds_remaining": 680
  }
}
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# Contract tests
npm run test:contract

# Integration tests
npm run test:integration

# Unit tests
npm run test:unit
```

### Coverage Report

```bash
npm run test:coverage
```

Generate coverage report at `coverage/index.html`

---

## Database Backup & Restore

### Backup SQLite Database

```bash
# Full backup
sqlite3 data/sync.db ".backup backup-$(date +%Y%m%d-%H%M%S).db"

# Export as CSV
sqlite3 data/sync.db ".mode csv"
sqlite3 data/sync.db "SELECT * FROM sync_runs;" > sync_history.csv
```

### Restore from Backup

```bash
cp backup-20260119-101530.db data/sync.db
npm run db:migrate
```

---

## Next Steps

1. ✅ Local setup complete
2. Review [API Documentation](./contracts/openapi.yaml)
3. Check [Data Model](./data-model.md) for database schema
4. Read [Implementation Plan](./plan.md) for architecture details
5. Deploy to production using Docker or PM2
6. Set up monitoring and alerting

For questions or issues:
- Check logs: `npm run logs`
- Review error messages in UI history
- Consult troubleshooting section above
