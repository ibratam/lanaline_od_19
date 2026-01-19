# Implementation Plan: Odoo 19 Database Synchronization Middleware

**Branch**: `001-odoo-sync-middleware` | **Date**: 2026-01-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-odoo-sync-middleware/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a production-ready Node.js middleware for synchronizing two Odoo 19 databases while preserving
original record IDs and timestamps. Features include web-based configuration (no login required),
real-time sync preview with conflict detection, manual & scheduled synchronization with rollback
capability, and comprehensive audit logging. REST API polling for progress updates. Modular
JavaScript architecture with lightweight frontend.

## Technical Context

**Language/Version**: Node.js 18 LTS (production-ready, long-term support)

**Primary Dependencies**:
- **API Framework**: Express.js (lightweight, modular middleware support)
- **Odoo SDK**: Odoo bin JSON RPC client (or Odoo's xmlrpc2 for compatibility)
- **Task Scheduling**: node-cron (for scheduled synchronization)
- **Database**: SQLite (lightweight, embedded sync history & config storage)
- **Frontend**: HTML5 + Vanilla JavaScript (no login, minimal dependencies)
- **Credential Storage**: dotenv for secrets + encrypted config at rest
- **Logging**: winston (structured logging for audit trail)
- **Testing**: Jest + Supertest (contract & integration tests)

**Storage**: SQLite for middleware state (config, history, schedules); Odoo RPC for source/target data access

**Testing**: Jest for unit tests, Supertest for API contract tests, custom integration tests for full sync workflows

**Target Platform**: Linux/macOS server; runs as standalone process or Docker container

**Project Type**: Backend API + lightweight frontend (single repository, monolithic architecture for simplicity)

**Performance Goals**:
- Preview generation: <30 seconds for 10k records/model
- Sync execution: <5 minutes for 1,000-10,000 typical records
- Progress polling: <200ms API response time
- Scheduled job startup: within 5 minutes of scheduled time

**Constraints**:
- Zero authentication required (open web interface, suitable for internal networks)
- Single sync process active at a time (prevent race conditions)
- Atomic transactions on Odoo side (all-or-nothing, rollback capability)
- No external dependencies required (self-contained middleware)

**Scale/Scope**:
- Support databases with up to 100,000+ records across multiple models
- 10+ concurrent UI connections polling progress
- Persistent history of 10,000+ synchronization runs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Constitution Principles Alignment

✅ **I. Component-Driven Architecture** (PASS - with note)
- Backend: Modular services architecture (sync engine, conflict detector, scheduler, history logger)
- Frontend: Modular HTML components (config form, preview display, history table)
- Note: Vanilla JS frontend (not React), but follows component modularity principles

✅ **II. Full-Stack Integration** (PASS)
- API contracts defined in Phase 1 (contracts/ directory)
- Frontend validates all API responses before rendering
- Contract-first: Define endpoint specs before implementation
- Logging all cross-stack communication

✅ **III. Test-Driven Development** (PASS)
- Contract tests: Jest + Supertest for all API endpoints
- Integration tests: Full sync workflows with mock Odoo databases
- Unit tests: Business logic (conflict detection, ID preservation, date handling)
- Target: ≥80% coverage for critical paths (sync engine, data preservation)

✅ **IV. Security by Design** (PASS)
- No login required → open access but suitable for internal networks only
- Credential encryption: config file encryption + environment variables
- Input validation: Sanitize Odoo connection strings, validate database operations
- SQL injection prevention: SQLite parameterized queries, Odoo RPC escaping
- Audit trail: All sync operations logged with timestamps and error details
- No credentials in logs: passwords masked in history/error messages

### Constitution Violations & Justifications

None. Design aligns with all 4 core principles.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
odoo-sync-middleware/
├── src/
│   ├── api/                          # Express.js API routes & middleware
│   │   ├── routes/
│   │   │   ├── config.js             # Database configuration endpoints
│   │   │   ├── sync.js               # Manual sync trigger & monitoring
│   │   │   ├── schedule.js           # Schedule CRUD operations
│   │   │   ├── history.js            # Sync history & audit logs
│   │   │   └── status.js             # Real-time progress polling
│   │   └── middleware/
│   │       ├── errorHandler.js       # Centralized error handling
│   │       └── requestLogger.js      # Request/response logging
│   │
│   ├── services/                     # Business logic (modular)
│   │   ├── OdooClient.js             # Odoo RPC wrapper service
│   │   ├── SyncEngine.js             # Core synchronization logic
│   │   ├── ConflictDetector.js       # Identify & report conflicts
│   │   ├── DataPreserver.js          # Maintain IDs & timestamps
│   │   ├── ScheduleManager.js        # Cron job scheduling
│   │   ├── HistoryLogger.js          # Persist sync audit trail
│   │   └── ConfigManager.js          # Encrypted config storage
│   │
│   ├── models/                       # SQLite data schemas
│   │   ├── DatabaseConnection.js     # Stored connections
│   │   ├── SyncRun.js               # Sync execution records
│   │   ├── SyncConflict.js          # Conflict history
│   │   └── SyncSchedule.js          # Scheduled job configs
│   │
│   ├── utils/                        # Shared utilities
│   │   ├── logger.js                 # Winston logging
│   │   ├── encryption.js             # Config encryption/decryption
│   │   └── validators.js             # Input validation
│   │
│   ├── public/                       # Lightweight frontend (no login)
│   │   ├── index.html                # Main UI page
│   │   ├── css/
│   │   │   └── styles.css            # Minimal CSS (no framework)
│   │   └── js/
│   │       ├── app.js                # Frontend app initialization
│   │       ├── components/
│   │       │   ├── ConfigForm.js     # Database config UI component
│   │       │   ├── PreviewDisplay.js # Sync scope preview
│   │       │   ├── ProgressMonitor.js # Real-time progress display
│   │       │   ├── HistoryTable.js   # Sync history display
│   │       │   └── ScheduleEditor.js # Schedule configuration UI
│   │       ├── services/
│   │       │   └── apiClient.js      # Frontend HTTP client
│   │       └── utils/
│   │           ├── formatters.js     # UI formatting helpers
│   │           └── validators.js     # Client-side validation
│   │
│   ├── db/                           # SQLite database initialization
│   │   └── schema.sql                # Database schema & migrations
│   │
│   └── app.js                        # Express app setup & configuration

├── tests/
│   ├── contract/                     # API contract tests (Supertest)
│   │   ├── config.test.js
│   │   ├── sync.test.js
│   │   ├── schedule.test.js
│   │   └── history.test.js
│   │
│   ├── integration/                  # End-to-end workflows
│   │   ├── fullSyncWorkflow.test.js  # Complete sync execution
│   │   ├── conflictResolution.test.js
│   │   ├── scheduledExecution.test.js
│   │   └── rollback.test.js
│   │
│   ├── unit/                         # Business logic tests
│   │   ├── SyncEngine.test.js
│   │   ├── ConflictDetector.test.js
│   │   ├── DataPreserver.test.js
│   │   ├── ScheduleManager.test.js
│   │   └── encryption.test.js
│   │
│   ├── fixtures/                     # Mock data for testing
│   │   ├── mockOdooData.json
│   │   └── testConfigs.json
│   │
│   └── setup.js                      # Test environment setup

├── package.json
├── .env.example                      # Example environment variables
├── .gitignore
├── README.md                         # Deployment & usage guide
├── docker-compose.yml                # Optional Docker setup
└── Dockerfile                        # Optional Docker image
```

**Structure Decision**: Single modular repository (monolithic) chosen for simplicity.
- Backend API (Express) and lightweight frontend (Vanilla JS) in same process
- Clear service layer separation enables independent testing
- Modular services can be extracted to separate packages later if needed
- SQLite embedded for zero external database dependency

## Complexity Tracking

> **No Constitution violations. No complexity tracking required.**

---

## Phase 0: Research & Clarifications

### Research Tasks

1. **Odoo RPC Integration Patterns**
   - Research best practices for Odoo 19 RPC client in Node.js
   - Evaluate: odoo-jsonrpc vs odoo-rpc-client vs manual xmlrpc2
   - Decision: Select library supporting JSON-RPC 2.0 with good error handling

2. **SQLite with Node.js**
   - Research sqlite3 vs better-sqlite3 for embedded database
   - Compare: async (sqlite3) vs sync (better-sqlite3) for sync operations
   - Decision: Select based on performance vs complexity trade-off

3. **Scheduled Task Execution in Node.js**
   - Research node-cron vs agenda vs bull for job scheduling
   - Requirements: Persist schedules, handle missed runs, timezone support
   - Decision: Finalize scheduling library choice

4. **Encryption for Configuration**
   - Research secrets management: env vars, .env files, encrypted config
   - Requirements: Secure storage of Odoo credentials, easy deployment
   - Decision: Define encryption approach

### Research Output

Results consolidated in `research.md` with decisions and rationale.

---

## Phase 1: Design & Contracts

### 1.1 Data Model (data-model.md)

Extract entities from spec and define schemas:

- **DatabaseConnection**: url, username, password_encrypted, status, last_check
- **SyncRun**: id, source_db_id, target_db_id, status, started_at, completed_at, triggered_by (manual/scheduled)
- **SyncConflict**: sync_run_id, model, record_id, source_values, target_values, resolution
- **SyncSchedule**: id, source_db_id, target_db_id, frequency (cron), enabled, notification_email
- **SyncOperation**: sync_run_id, operation (create/update/delete), model, record_count, duration

### 1.2 API Contracts (contracts/)

Define REST endpoints (OpenAPI 3.0):

```text
contracts/
├── openapi.yaml              # Complete OpenAPI 3.0 spec
├── endpoints/
│   ├── config.endpoints.json
│   ├── sync.endpoints.json
│   ├── schedule.endpoints.json
│   └── history.endpoints.json
└── schemas/
    ├── DatabaseConnection.schema.json
    ├── SyncRun.schema.json
    └── SyncConflict.schema.json
```

Key endpoints:
- `POST /api/config` - Save database configuration
- `GET /api/config/test` - Validate connection
- `POST /api/sync/preview` - Generate preview without changes
- `POST /api/sync/execute` - Start synchronization
- `GET /api/sync/status` - Poll current progress
- `POST /api/sync/rollback` - Rollback last sync
- `GET /api/schedule` - List schedules
- `POST /api/schedule` - Create schedule
- `GET /api/history` - Sync history with filtering
- `GET /api/history/export` - Export history as CSV/JSON

### 1.3 Quickstart Guide (quickstart.md)

- Setup instructions (Node.js, npm install, .env config)
- Local development (running middleware locally)
- First sync walkthrough (configure DBs, preview, execute, check history)
- Docker deployment (optional)

### 1.4 Frontend Architecture

Lightweight vanilla JS with no framework:
- Single HTML page with embedded CSS
- Vanilla JS modules for each component
- REST API client for backend communication
- Progressive enhancement (works without external CDN)

---

## Phase 2: Task Generation

**Note**: Task generation is handled by `/speckit.tasks` command (NOT by this plan).

This plan output enables task generation by providing:
- ✅ Data model details
- ✅ API contracts & schemas
- ✅ Project structure
- ✅ Technology stack decisions
- ✅ Constitution alignment verification

**Next Step**: Run `/speckit.tasks` to generate actionable implementation tasks.
