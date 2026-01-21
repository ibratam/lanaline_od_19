import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseConnection from '../utils/database.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initialize the middleware database
 */
export async function initializeDatabase(dbPath = null) {
  try {
    logger.info('Initializing database...');

    // Use provided path or default
    const finalDbPath = dbPath || path.join(__dirname, '../../data/middleware.db');

    // Create database connection
    const db = new DatabaseConnection(finalDbPath);

    // Initialize (creates/migrates tables)
    await db.initialize();

    const sqlite = db.getDB();
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS retry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_run_id INTEGER,
        sync_operation_id INTEGER,
        conflict_id INTEGER,
        error_code TEXT,
        error_category TEXT CHECK (error_category IS NULL OR error_category IN ('user_correctable', 'system', 'unrecoverable')),
        error_message TEXT,
        user_correction TEXT,
        next_retry_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (sync_operation_id) REFERENCES sync_operations(id) ON DELETE SET NULL,
        FOREIGN KEY (conflict_id) REFERENCES sync_conflicts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sync_operation_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_operation_id INTEGER NOT NULL,
        previous_status TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        error_category TEXT CHECK (error_category IS NULL OR error_category IN ('user_correctable', 'system', 'unrecoverable')),
        note TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sync_operation_id) REFERENCES sync_operations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_run_id INTEGER NOT NULL,
        sync_operation_id INTEGER,
        odoo_model TEXT,
        record_id INTEGER,
        error_code TEXT,
        error_category TEXT CHECK (error_category IS NULL OR error_category IN ('user_correctable', 'system', 'unrecoverable')),
        error_message TEXT NOT NULL,
        failure_reason TEXT,
        suggested_action TEXT,
        retry_count INTEGER DEFAULT 0,
        last_retry_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (sync_operation_id) REFERENCES sync_operations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS table_schemas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        schema_json TEXT NOT NULL,
        dependencies_json TEXT,
        status TEXT NOT NULL DEFAULT 'discovered',
        last_checked_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS data_inconsistencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_run_id INTEGER,
        sync_operation_id INTEGER,
        odoo_model TEXT,
        record_id INTEGER,
        field_name TEXT,
        local_value TEXT,
        odoo_value TEXT,
        inconsistency_type TEXT NOT NULL,
        suggested_action TEXT,
        suggested_repair TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sync_failures_run ON sync_failures(sync_run_id);
      CREATE INDEX IF NOT EXISTS idx_sync_failures_category ON sync_failures(error_category);
      CREATE INDEX IF NOT EXISTS idx_retry_history_run ON retry_history(sync_run_id);
      CREATE INDEX IF NOT EXISTS idx_retry_history_conflict ON retry_history(conflict_id);
      CREATE INDEX IF NOT EXISTS idx_sync_operation_status_operation ON sync_operation_status(sync_operation_id);
      CREATE INDEX IF NOT EXISTS idx_table_schemas_name ON table_schemas(table_name);
      CREATE INDEX IF NOT EXISTS idx_data_inconsistencies_type ON data_inconsistencies(inconsistency_type);
    `);

    const dataInconsistencyColumns = sqlite.prepare("PRAGMA table_info('data_inconsistencies')").all();
    const columnNames = new Set(dataInconsistencyColumns.map(col => col.name));
    const alterStatements = [];

    if (!columnNames.has('status')) {
      alterStatements.push("ALTER TABLE data_inconsistencies ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    }
    if (!columnNames.has('suggested_repair')) {
      alterStatements.push('ALTER TABLE data_inconsistencies ADD COLUMN suggested_repair TEXT');
    }
    if (!columnNames.has('sync_operation_id')) {
      alterStatements.push('ALTER TABLE data_inconsistencies ADD COLUMN sync_operation_id INTEGER');
    }
    if (!columnNames.has('resolved_at')) {
      alterStatements.push('ALTER TABLE data_inconsistencies ADD COLUMN resolved_at DATETIME');
    }

    for (const statement of alterStatements) {
      sqlite.exec(statement);
    }

    const conflictColumns = sqlite.prepare("PRAGMA table_info('sync_conflicts')").all();
    const conflictColumnNames = new Set(conflictColumns.map(col => col.name));
    if (!conflictColumnNames.has('updated_at')) {
      sqlite.exec("ALTER TABLE sync_conflicts ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }

    logger.info('Database initialization complete');
    return db;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
export function closeDatabase(db) {
  try {
    if (db) {
      db.close();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database:', error);
  }
}

export default {
  initializeDatabase,
  closeDatabase
};
