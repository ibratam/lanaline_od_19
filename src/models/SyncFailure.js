import logger from '../utils/logger.js';

export class SyncFailure {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    try {
      const {
        sync_run_id,
        sync_operation_id = null,
        odoo_model = null,
        record_id = null,
        error_code = null,
        error_category = null,
        error_message,
        failure_reason = null,
        suggested_action = null,
        retry_count = 0,
        last_retry_at = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_failures (
          sync_run_id,
          sync_operation_id,
          odoo_model,
          record_id,
          error_code,
          error_category,
          error_message,
          failure_reason,
          suggested_action,
          retry_count,
          last_retry_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        sync_operation_id,
        odoo_model,
        record_id,
        error_code,
        error_category,
        error_message,
        failure_reason,
        suggested_action,
        retry_count,
        last_retry_at
      );

      logger.info(`Created sync failure: ID ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating sync failure record:', error);
      throw error;
    }
  }

  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_failures WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting sync failure by ID ${id}:`, error);
      throw error;
    }
  }

  getBySyncRunId(syncRunId, limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_failures
        WHERE sync_run_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(syncRunId, limit);
    } catch (error) {
      logger.error(`Error getting sync failures for run ${syncRunId}:`, error);
      throw error;
    }
  }

  getRecent(limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_failures
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      logger.error('Error getting recent sync failures:', error);
      throw error;
    }
  }
}

export default SyncFailure;
