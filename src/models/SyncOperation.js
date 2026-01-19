import logger from '../utils/logger.js';

export class SyncOperation {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new sync operation record
   */
  create(data) {
    try {
      const {
        sync_run_id,
        odoo_model,
        operation_type,
        record_count = 0,
        duration_ms = null,
        error_count = 0,
        status = 'completed',
        error_message = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_operations (
          sync_run_id, odoo_model, operation_type, record_count,
          duration_ms, error_count, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        odoo_model,
        operation_type,
        record_count,
        duration_ms,
        error_count,
        status,
        error_message
      );

      logger.info(`Created sync operation: ID ${result.lastInsertRowid}`);
      return result.lastInsertRowid;
    } catch (error) {
      logger.error('Error creating sync operation:', error);
      throw error;
    }
  }

  /**
   * Get operations for a sync run
   */
  getBySyncRunId(syncRunId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_operations
        WHERE sync_run_id = ?
        ORDER BY created_at ASC
      `);
      return stmt.all(syncRunId);
    } catch (error) {
      logger.error(`Error getting operations for sync run ${syncRunId}:`, error);
      throw error;
    }
  }
}

export default SyncOperation;
