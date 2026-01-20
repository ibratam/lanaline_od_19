export function up(db) {
  db.exec(`
    ALTER TABLE sync_runs ADD COLUMN last_error_code TEXT;
    ALTER TABLE sync_runs ADD COLUMN last_error_category TEXT CHECK (last_error_category IS NULL OR last_error_category IN ('user_correctable', 'system', 'unrecoverable'));
    ALTER TABLE sync_runs ADD COLUMN retry_count INTEGER DEFAULT 0;
    ALTER TABLE sync_runs ADD COLUMN last_retry_at DATETIME;
    ALTER TABLE sync_runs ADD COLUMN next_retry_at DATETIME;
    ALTER TABLE sync_runs ADD COLUMN state_transitions TEXT;

    ALTER TABLE sync_operations ADD COLUMN error_code TEXT;
    ALTER TABLE sync_operations ADD COLUMN error_category TEXT CHECK (error_category IS NULL OR error_category IN ('user_correctable', 'system', 'unrecoverable'));
    ALTER TABLE sync_operations ADD COLUMN retry_count INTEGER DEFAULT 0;
    ALTER TABLE sync_operations ADD COLUMN state_from TEXT;
    ALTER TABLE sync_operations ADD COLUMN state_to TEXT;
    ALTER TABLE sync_operations ADD COLUMN state_changed_at DATETIME;
  `);
}

export function down() {
  // SQLite cannot drop columns easily; leave as no-op for rollback.
}

export default { up, down };
