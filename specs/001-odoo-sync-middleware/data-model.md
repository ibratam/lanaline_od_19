# Data Model: Odoo 19 Database Synchronization Middleware

**Date**: 2026-01-19
**Status**: Phase 1 Complete
**Purpose**: Define all entities, relationships, and validation rules

---

## Entity: DatabaseConnection

**Purpose**: Store and manage connection details to Odoo databases

```sql
CREATE TABLE database_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,                    -- e.g., "http://odoo1.example.com"
  database TEXT NOT NULL,               -- Odoo database name
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,     -- AES-256 encrypted
  connection_type TEXT NOT NULL,        -- 'source' or 'target'
  status TEXT DEFAULT 'untested',       -- 'connected', 'failed', 'untested'
  status_message TEXT,                  -- Last error/success message
  last_checked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Validation Rules**:
- `name`: Non-empty, unique across all connections
- `url`: Valid HTTP/HTTPS URL format
- `database`: Non-empty string, valid Odoo database name pattern
- `username`: Non-empty, valid email or alphanumeric
- `password_encrypted`: Must be encrypted before storage (never plaintext)
- `connection_type`: Only 'source' or 'target'

**Relationships**:
- One DatabaseConnection can be source or target in multiple SyncRuns
- One DatabaseConnection → Many SyncSchedules

**Constraints**:
- Cannot delete connection if active SyncSchedule references it
- Can have maximum 2 connections (1 source, 1 target) per sync configuration

---

## Entity: SyncRun

**Purpose**: Track individual synchronization execution

```sql
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_db_id INTEGER NOT NULL,
  target_db_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',       -- 'pending', 'running', 'completed', 'failed', 'rolled_back'
  triggered_by TEXT NOT NULL,          -- 'manual' or 'scheduled'
  scheduled_job_id INTEGER,            -- FK to SyncSchedule if triggered_by='scheduled'
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  total_duration_seconds INTEGER,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  total_records INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  preview_only BOOLEAN DEFAULT FALSE,  -- TRUE if this was preview run
  rollback_performed BOOLEAN DEFAULT FALSE,
  rollback_at DATETIME,
  initiated_by_user TEXT,              -- Username or 'system' for scheduled
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (target_db_id) REFERENCES database_connections(id)
);
```

**State Transitions**:
```
pending → running → completed
         → running → failed
         → running → rolled_back (after completed with errors)
```

**Validation Rules**:
- `source_db_id` and `target_db_id` must be different
- `started_at` cannot be in future
- `completed_at` >= `started_at` (if set)
- `total_duration_seconds` = `completed_at` - `started_at` (calculated)
- Sum of record operations should equal `total_records`

**Relationships**:
- One SyncRun → Many SyncConflicts
- One SyncRun → Many SyncOperations
- One SyncRun → Many SyncErrors

---

## Entity: SyncConflict

**Purpose**: Track data conflicts detected between databases

```sql
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,            -- e.g., 'res.partner', 'product.product'
  record_id INTEGER NOT NULL,          -- Odoo record ID
  conflict_type TEXT NOT NULL,         -- 'field_mismatch', 'orphaned_fk', 'duplicate_id'
  source_values TEXT,                  -- JSON object of conflicting fields
  target_values TEXT,                  -- JSON object of conflicting fields
  field_names TEXT,                    -- JSON array of fields that differ
  source_create_date DATETIME,         -- Original creation date from source
  target_create_date DATETIME,         -- Original creation date from target
  resolution TEXT,                     -- 'use_source', 'use_target', 'skip', 'manual'
  resolved_at DATETIME,
  resolved_by TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
```

**Validation Rules**:
- `model_name`: Valid Odoo model name (alphanumeric + dots)
- `record_id`: Positive integer
- `conflict_type`: Only predefined types
- `source_values` and `target_values`: Valid JSON objects
- `resolution`: Only set if conflict resolved

**Relationships**:
- Many conflicts → One SyncRun
- Conflict immutable after resolution

---

## Entity: SyncOperation

**Purpose**: Log individual record operations (create/update/delete)

```sql
CREATE TABLE sync_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  operation_type TEXT NOT NULL,        -- 'create', 'update', 'delete'
  model_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  source_timestamp DATETIME,           -- When changed in source DB
  target_timestamp DATETIME,           -- When applied in target DB
  duration_ms INTEGER,                 -- How long this operation took
  status TEXT NOT NULL,                -- 'success', 'failed', 'skipped'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
```

**Validation Rules**:
- `operation_type`: Only 'create', 'update', 'delete'
- `record_id`: Positive integer
- `duration_ms`: Non-negative integer
- `status`: Only predefined values

---

## Entity: SyncSchedule

**Purpose**: Define recurring synchronization schedules

```sql
CREATE TABLE sync_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_db_id INTEGER NOT NULL,
  target_db_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,             -- Cron expression: '0 0 * * *' = daily at midnight
  frequency_readable TEXT,             -- Human-readable: 'Every day at 00:00'
  timezone TEXT DEFAULT 'UTC',         -- e.g., 'America/New_York'
  enabled BOOLEAN DEFAULT TRUE,
  model_filter TEXT,                   -- JSON array of models to sync, or null for all
  last_run_id INTEGER,                 -- FK to most recent SyncRun
  last_run_at DATETIME,
  next_run_at DATETIME,
  notification_email TEXT,             -- Email for error alerts
  notification_on_success BOOLEAN DEFAULT FALSE,
  notification_on_failure BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (target_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (last_run_id) REFERENCES sync_runs(id)
);
```

**Validation Rules**:
- `frequency`: Valid cron expression (5-part format)
- `timezone`: Valid IANA timezone name
- `enabled`: Boolean
- `source_db_id` != `target_db_id`
- `notification_email`: Valid email format or null

**Relationships**:
- One SyncSchedule → Many SyncRuns (via triggered_by='scheduled')

---

## Entity: SyncError

**Purpose**: Track errors during synchronization

```sql
CREATE TABLE sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  error_type TEXT NOT NULL,            -- 'connection', 'data_integrity', 'validation', 'timeout', 'other'
  severity TEXT NOT NULL,              -- 'error', 'warning'
  message TEXT NOT NULL,
  stack_trace TEXT,
  model_name TEXT,                     -- NULL if not model-specific
  record_id INTEGER,                   -- NULL if not record-specific
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
```

---

## Key Timestamps & Data Preservation

### Original Date/ID Preservation

**Strategy**: Preserve source record's create_date and write_date

```javascript
// When syncing from source to target:
const syncedRecord = {
  // Copy all fields from source
  ...sourceRecord,

  // PRESERVE original timestamps
  create_date: sourceRecord.create_date,  // Never modify
  write_date: sourceRecord.write_date,    // Update only this if field changes

  // PRESERVE original ID (if not conflicting)
  id: sourceRecord.id,

  // DON'T copy:
  // - __last_update (Odoo internal)
  // - message_ids (if field-specific)
};
```

**Constraints**:
- Source `create_date` must be copied exactly (no timestamp conversion)
- Source `write_date` should reflect source modification time
- If ID conflict: log conflict and defer to user resolution
- Computed/formula fields: Skip (read-only in Odoo)

---

## Data Model Relationships Diagram

```
┌─────────────────────┐
│ DatabaseConnection  │
│  (source/target)    │
└──────────┬──────────┘
           │
           ├─────────────────┬──────────────────┐
           │                 │                  │
           ▼                 ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  SyncRun     │  │ SyncSchedule │  │ SyncSchedule │
    │  (manual)    │  │  (recurring) │  │  (recurring) │
    └──────┬───────┘  └──────────────┘  └──────────────┘
           │
           ├─────────┬──────────┬──────────┐
           │         │          │          │
           ▼         ▼          ▼          ▼
        ┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐
        │Error │ │Conflict│ │Operation│ │Conflict│
        └──────┘ └────────┘ └─────────┘ └────────┘
```

---

## Indexing Strategy

Critical indexes for query performance:

```sql
-- Sync history lookups
CREATE INDEX idx_sync_runs_status ON sync_runs(status);
CREATE INDEX idx_sync_runs_created_at ON sync_runs(created_at DESC);
CREATE INDEX idx_sync_runs_source_target ON sync_runs(source_db_id, target_db_id);

-- Conflict lookups
CREATE INDEX idx_sync_conflicts_run_id ON sync_conflicts(sync_run_id);
CREATE INDEX idx_sync_conflicts_model ON sync_conflicts(model_name);

-- Schedule lookups
CREATE INDEX idx_sync_schedules_enabled ON sync_schedules(enabled);
CREATE INDEX idx_sync_schedules_next_run ON sync_schedules(next_run_at) WHERE enabled=1;

-- Operations lookups
CREATE INDEX idx_sync_operations_run_id ON sync_operations(sync_run_id);
CREATE INDEX idx_sync_operations_model ON sync_operations(model_name);
```

---

## Schema Versioning

Initial schema version: `1.0.0` (2026-01-19)

Migration approach:
- Store `schema_version` in metadata table
- Each migration numbered and timestamped
- Backward compatibility maintained when possible
- Rollback scripts provided for each migration
