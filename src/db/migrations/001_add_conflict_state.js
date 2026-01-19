export function up(db) {
  db.exec(`
    ALTER TABLE sync_conflicts ADD COLUMN state TEXT DEFAULT 'detected';
    ALTER TABLE sync_conflicts ADD COLUMN locked_by INTEGER;
    ALTER TABLE sync_conflicts ADD COLUMN locked_at DATETIME;

    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_state ON sync_conflicts(state);
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_model_state ON sync_conflicts(odoo_model, state);
  `);
}

export function down(db) {
  // SQLite cannot drop columns easily; leave as no-op for rollback.
}

export default { up, down };
