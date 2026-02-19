# Odoo 19 Database Synchronization Middleware

A production-ready Node.js middleware for synchronizing two Odoo 19 databases while preserving original record IDs and timestamps. Features include web-based configuration, real-time sync preview with conflict detection, manual & scheduled synchronization with rollback capability, and comprehensive audit logging.

## Features

- **Database Configuration**: Secure storage of connection credentials for two Odoo databases
- **Sync Preview**: See what data will be synchronized before executing with conflict detection
- **Manual Synchronization**: Execute sync on-demand with real-time progress monitoring
- **Scheduled Synchronization**: Configure recurring syncs (hourly, daily, weekly, monthly, or custom cron)
- **Rollback Capability**: Reverse synchronization changes if issues occur
- **Audit Logging**: Complete history of all synchronization operations
- **Data Preservation**: Maintains original record IDs and timestamps
- **REST API**: Query sync status and progress via API polling
- **No Authentication**: Open web interface suitable for internal networks

## Prerequisites

- **Node.js 18 LTS** or higher
- **npm** or **yarn**
- Access to two Odoo 19 databases
- Network connectivity to both Odoo instances

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd odoo-sync-middleware
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Edit `.env` with your settings:
```env
NODE_ENV=development
PORT=3000
HOST=localhost
MIDDLEWARE_SECRET_KEY=your_secret_key_here_min_32_chars
DB_PATH=./data/middleware.db
LOG_LEVEL=info
```

## Development

### Running Locally

```bash
# Development mode with file watching
npm run dev

# Production mode
npm start
```

The middleware will be available at `http://localhost:3000`

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Linting

```bash
# Check code style
npm run lint

# Fix linting errors
npm run lint:fix
```

## API Endpoints

### Configuration
- `POST /api/config` - Save database configuration
- `GET /api/config/{id}` - Retrieve configuration (password masked)
- `PUT /api/config/{id}` - Update configuration
- `DELETE /api/config/{id}` - Delete configuration
- `GET /api/config/test` - Test connection without saving

### Synchronization
- `POST /api/sync/preview` - Generate preview of changes
- `POST /api/sync/execute` - Start synchronization
- `GET /api/sync/status` - Get real-time progress
- `POST /api/sync/rollback` - Rollback last synchronization

### Scheduling
- `POST /api/schedule` - Create scheduled sync
- `GET /api/schedule` - List all schedules
- `PUT /api/schedule/{id}` - Update schedule
- `DELETE /api/schedule/{id}` - Delete schedule
- `POST /api/schedule/{id}/toggle` - Enable/disable schedule

### History
- `GET /api/history` - List all synchronizations
- `GET /api/history/{id}` - Get sync details
- `GET /api/history/export` - Export history as CSV/JSON

## Deployment

### Docker

```bash
# Build image
docker build -t odoo-sync-middleware .

# Run container
docker run -p 3000:3000 \
  -e MIDDLEWARE_SECRET_KEY=your-secret-key \
  -v $(pwd)/data:/app/data \
  odoo-sync-middleware
```

Or using Docker Compose:
```bash
MIDDLEWARE_SECRET_KEY=your-secret-key docker-compose up -d
```

### Linux/macOS with PM2

```bash
npm install -g pm2

pm2 start src/app.js --name "odoo-sync-middleware"
pm2 save
pm2 startup
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Environment (development, production) |
| PORT | 3000 | Server port |
| HOST | localhost | Server host |
| MIDDLEWARE_SECRET_KEY | required | Secret key for credential encryption (min 32 chars) |
| DB_PATH | ./data/middleware.db | SQLite database path |
| LOG_LEVEL | info | Winston log level (error, warn, info, debug) |
| ODOO_ALLOWED_MODELS | unset | Optional comma-separated model allowlist. If unset, sync engine uses all discovered models |

## Performance Targets

- Preview generation: <30 seconds for 10,000 records per model
- Synchronization: <5 minutes for 1,000-10,000 records
- Rollback: <1 minute for 100,000 records
- API response time: <200ms

## Architecture

```
src/
├── api/                    # Express routes and middleware
├── services/               # Business logic (SyncEngine, ConflictDetector, etc.)
├── models/                 # Data models (DatabaseConnection, SyncRun, etc.)
├── utils/                  # Shared utilities (logger, encryption, validators)
├── public/                 # Frontend (HTML, CSS, JavaScript)
└── db/                     # Database schema and initialization
```

### Data Flow

1. Users configure source/target connections in the UI.
2. Preview compares models using the SyncEngine and ConflictDetector services.
3. Execute runs sync operations and writes audit history to SQLite.
4. Scheduler loads enabled cron entries and triggers sync runs automatically.
5. History exports provide CSV/JSON data for external reporting.

## Security

- **Credentials**: AES-256 encryption at rest
- **Input Validation**: All user inputs sanitized
- **SQL Injection Prevention**: Parameterized queries
- **XSS Prevention**: No unescaped HTML in responses
- **Audit Trail**: All operations logged with timestamps

## Troubleshooting

### Connection Failures
- Verify Odoo URLs are correct and accessible
- Check that credentials have proper permissions
- Review logs in `data/error.log`

### Sync Errors
- Check preview for conflicts before executing
- Review error messages in sync details
- Use rollback if sync completes with errors

### Performance Issues
- For large databases (100k+ records), sync may take longer
- Check server resources during sync
- Consider scheduling syncs during off-peak hours

## Support

## Contributing

See `CONTRIBUTING.md` for setup, testing, and contribution guidelines.

For issues, errors, or feature requests, please refer to the specification document or contact the development team.

## License

MIT

## Version

1.0.0 - Initial Release (2026-01-19)
