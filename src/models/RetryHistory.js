import logger from '../utils/logger.js';

export class RetryHistory {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    try {
      const {
        sync_run_id = null,
        sync_operation_id = null,
        conflict_id = null,
        error_code = null,
        error_category = null,
        error_message = null,
        user_correction = null,
        next_retry_at = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO retry_history (
          sync_run_id,
          sync_operation_id,
          conflict_id,
          error_code,
          error_category,
          error_message,
          user_correction,
          next_retry_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        sync_operation_id,
        conflict_id,
        error_code,
        error_category,
        error_message,
        user_correction,
        next_retry_at
      );

      logger.info(`Created retry history: ID ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating retry history record:', error);
      throw error;
    }
  }

  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM retry_history WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting retry history by ID ${id}:`, error);
      throw error;
    }
  }

  getBySyncRunId(syncRunId, limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM retry_history
        WHERE sync_run_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(syncRunId, limit);
    } catch (error) {
      logger.error(`Error getting retry history for run ${syncRunId}:`, error);
      throw error;
    }
  }

  getByConflictId(conflictId, limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM retry_history
        WHERE conflict_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(conflictId, limit);
    } catch (error) {
      logger.error(`Error getting retry history for conflict ${conflictId}:`, error);
      throw error;
    }
  }
}

export default RetryHistory;
