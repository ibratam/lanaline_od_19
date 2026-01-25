/**
 * Migration 005: Extend Table Metadata
 * Adds columns for tracking table creation attempts and dependencies
 */

export async function up(db) {
  const sqlite = db.getDB();

  // Add new columns to table_schemas for tracking creation attempts
  sqlite.exec(`
    -- Add columns for tracking table creation attempts
    ALTER TABLE table_schemas ADD COLUMN creation_attempts INTEGER DEFAULT 0;
    ALTER TABLE table_schemas ADD COLUMN last_creation_attempt_at DATETIME;
    ALTER TABLE table_schemas ADD COLUMN last_creation_error TEXT;

    -- Create table for tracking creation attempts history
    CREATE TABLE IF NOT EXISTS table_creation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
      error_message TEXT,
      dependencies_resolved INTEGER DEFAULT 0,
      columns_created INTEGER DEFAULT 0,
      indexes_created INTEGER DEFAULT 0,
      duration_ms INTEGER,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (table_name) REFERENCES table_schemas(table_name) ON DELETE CASCADE
    );

    -- Create indexes for table creation history
    CREATE INDEX IF NOT EXISTS idx_table_creation_history_name ON table_creation_history(table_name);
    CREATE INDEX IF NOT EXISTS idx_table_creation_history_status ON table_creation_history(status);
    CREATE INDEX IF NOT EXISTS idx_table_creation_history_started ON table_creation_history(started_at);

    -- Create table for tracking table dependencies
    CREATE TABLE IF NOT EXISTS table_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      depends_on_table TEXT NOT NULL,
      dependency_type TEXT CHECK (dependency_type IN ('foreign_key', 'reference', 'sequence')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_name, depends_on_table),
      FOREIGN KEY (table_name) REFERENCES table_schemas(table_name) ON DELETE CASCADE
    );

    -- Create indexes for table dependencies
    CREATE INDEX IF NOT EXISTS idx_table_dependencies_name ON table_dependencies(table_name);
    CREATE INDEX IF NOT EXISTS idx_table_dependencies_depends_on ON table_dependencies(depends_on_table);
  `);

  console.log('Migration 005 completed: Extended table metadata');
  return true;
}

export async function down(db) {
  const sqlite = db.getDB();

  // Drop new tables and columns
  sqlite.exec(`
    DROP TABLE IF EXISTS table_dependencies;
    DROP TABLE IF EXISTS table_creation_history;

    -- Note: Cannot remove columns from SQLite with ALTER TABLE DROP COLUMN
    -- Would need to recreate the table. For now, leaving columns in place.
  `);

  console.log('Migration 005 rolled back: Reverted extended table metadata');
  return true;
}

export const description = 'Extend table metadata with creation tracking and dependencies';
