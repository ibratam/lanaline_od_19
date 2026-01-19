export function up(db) {
  db.exec(`
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
  `);
}

export function down(db) {
  db.exec('DROP TABLE IF EXISTS conflict_locks;');
}

export default { up, down };
