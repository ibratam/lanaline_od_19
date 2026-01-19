import logger from '../utils/logger.js';

export class SyncError {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new error record
   */
  create(data) {
    try {
      const {
        sync_run_id,
        error_type,
        odoo_model = null,
        record_id = null,
        error_message,
        stack_trace = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_errors (
          sync_run_id, error_type, odoo_model, record_id, error_message, stack_trace
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        error_type,
        odoo_model,
        record_id,
        error_message,
        stack_trace
      );

      logger.info(`Created sync error: ID ${result.lastInsertRowid} for sync run ${sync_run_id}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating sync error record:', error);
      throw error;
    }
  }

  /**
   * Get error by ID
   */
  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_errors WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting error by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get errors for a sync run
   */
  getBySyncRunId(syncRunId, filters = {}) {
    try {
      let sql = 'SELECT * FROM sync_errors WHERE sync_run_id = ?';
      const params = [syncRunId];

      if (filters.error_type) {
        sql += ' AND error_type = ?';
        params.push(filters.error_type);
      }

      if (filters.odoo_model) {
        sql += ' AND odoo_model = ?';
        params.push(filters.odoo_model);
      }

      sql += ' ORDER BY created_at DESC';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Error getting errors for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get error count for a sync run
   */
  getCount(syncRunId, errorType = null) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM sync_errors WHERE sync_run_id = ?';
      const params = [syncRunId];

      if (errorType) {
        sql += ' AND error_type = ?';
        params.push(errorType);
      }

      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return result.count;
    } catch (error) {
      logger.error(`Error getting error count for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get errors by type
   */
  getByType(errorType, limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_errors
        WHERE error_type = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(errorType, limit);
    } catch (error) {
      logger.error(`Error getting errors by type ${errorType}:`, error);
      throw error;
    }
  }

  /**
   * Get errors by model
   */
  getByModel(syncRunId, model) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_errors
        WHERE sync_run_id = ? AND odoo_model = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(syncRunId, model);
    } catch (error) {
      logger.error(`Error getting errors for model ${model}:`, error);
      throw error;
    }
  }

  /**
   * Get summary of errors for a sync run
   */
  getSummary(syncRunId) {
    try {
      const stmt = this.db.prepare(`
        SELECT
          error_type,
          COUNT(*) as count
        FROM sync_errors
        WHERE sync_run_id = ?
        GROUP BY error_type
        ORDER BY count DESC
      `);
      return stmt.all(syncRunId);
    } catch (error) {
      logger.error(`Error getting error summary for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent errors (last N)
   */
  getRecent(limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_errors
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      logger.error('Error getting recent errors:', error);
      throw error;
    }
  }
}

export default SyncError;
