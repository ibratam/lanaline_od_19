-- Odoo Sync Middleware Database Schema

-- Database Connections table
CREATE TABLE IF NOT EXISTS database_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'odoo', -- odoo, other
  status TEXT NOT NULL DEFAULT 'untested', -- untested, connected, failed
  last_checked_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Synchronization Runs table
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_db_id INTEGER NOT NULL,
  target_db_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, rolled_back
  triggered_by TEXT NOT NULL DEFAULT 'manual', -- manual, scheduled
  triggered_by_user TEXT,
  triggered_by_schedule_id INTEGER,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  duration_ms INTEGER,
  total_records_created INTEGER DEFAULT 0,
  total_records_updated INTEGER DEFAULT 0,
  total_records_deleted INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  preview_only INTEGER DEFAULT 0,
  model_filter TEXT, -- JSON array of model names if filtered
  rollback_completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (target_db_id) REFERENCES database_connections(id)
);

-- Sync Operations (per model per sync run)
CREATE TABLE IF NOT EXISTS sync_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  odoo_model TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- create, update, delete
  record_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

-- Sync Conflicts table
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  odoo_model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  source_db_id INTEGER NOT NULL,
  target_db_id INTEGER NOT NULL,
  source_values TEXT NOT NULL, -- JSON
  target_values TEXT NOT NULL, -- JSON
  source_create_date DATETIME,
  target_create_date DATETIME,
  source_write_date DATETIME,
  target_write_date DATETIME,
  state TEXT DEFAULT 'detected',
  locked_by INTEGER,
  locked_at DATETIME,
  resolution TEXT, -- keep_source, keep_target, skip, null = unresolved
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (target_db_id) REFERENCES database_connections(id)
);

-- Sync Schedules table
CREATE TABLE IF NOT EXISTS sync_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_db_id INTEGER NOT NULL,
  target_db_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_executed_at DATETIME,
  next_execution_at DATETIME,
  notification_email TEXT,
  notify_on_error INTEGER NOT NULL DEFAULT 1,
  notify_on_success INTEGER NOT NULL DEFAULT 0,
  model_filter TEXT, -- JSON array if filtering models
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_db_id) REFERENCES database_connections(id),
  FOREIGN KEY (target_db_id) REFERENCES database_connections(id)
);

-- Sync Errors table
CREATE TABLE IF NOT EXISTS sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  error_type TEXT NOT NULL, -- connection_error, validation_error, sync_error, etc.
  odoo_model TEXT,
  record_id INTEGER,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_runs_source_target ON sync_runs(source_db_id, target_db_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_triggered_by ON sync_runs(triggered_by);
CREATE INDEX IF NOT EXISTS idx_sync_runs_created_at ON sync_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_operations_sync_run_id ON sync_operations(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_operations_model ON sync_operations(odoo_model);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_sync_run_id ON sync_conflicts(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_model_record ON sync_conflicts(odoo_model, record_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_state ON sync_conflicts(state);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_model_state ON sync_conflicts(odoo_model, state);

-- Conflict Resolutions table
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id INTEGER NOT NULL UNIQUE,
  user_id INTEGER,
  chosen_version TEXT NOT NULL CHECK (chosen_version IN ('local', 'odoo')),
  resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_category TEXT CHECK (last_error_category IS NULL OR last_error_category IN ('user_correctable', 'system', 'unrecoverable')),
  last_retry_at DATETIME,
  next_retry_at DATETIME,
  FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_conflict ON conflict_resolutions(conflict_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_user ON conflict_resolutions(user_id);

-- Conflict Locks table
CREATE TABLE IF NOT EXISTS conflict_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  user_id INTEGER,
  locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE,
  UNIQUE(conflict_id)
);

CREATE INDEX IF NOT EXISTS idx_conflict_locks_session ON conflict_locks(session_id);
CREATE INDEX IF NOT EXISTS idx_conflict_locks_expires ON conflict_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_enabled ON sync_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_sync_errors_sync_run_id ON sync_errors(sync_run_id);
