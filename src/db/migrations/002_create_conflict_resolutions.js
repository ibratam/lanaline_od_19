export function up(db) {
  db.exec(`
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
  `);
}

export function down(db) {
  db.exec('DROP TABLE IF EXISTS conflict_resolutions;');
}

export default { up, down };
