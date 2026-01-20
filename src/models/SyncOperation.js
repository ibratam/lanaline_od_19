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
        error_message = null,
        error_code = null,
        error_category = null,
        retry_count = 0,
        state_from = null,
        state_to = null,
        state_changed_at = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_operations (
          sync_run_id, odoo_model, operation_type, record_count,
          duration_ms, error_count, status, error_message,
          error_code, error_category, retry_count,
          state_from, state_to, state_changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        odoo_model,
        operation_type,
        record_count,
        duration_ms,
        error_count,
        status,
        error_message,
        error_code,
        error_category,
        retry_count,
        state_from,
        state_to,
        state_changed_at
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

  /**
   * Update sync operation
   */
  update(id, data) {
    try {
      const {
        record_count,
        duration_ms,
        error_count,
        status,
        error_message,
        error_code,
        error_category,
        retry_count,
        state_from,
        state_to,
        state_changed_at
      } = data;

      const updates = [];
      const params = [];

      if (record_count !== undefined) {
        updates.push('record_count = ?');
        params.push(record_count);
      }
      if (duration_ms !== undefined) {
        updates.push('duration_ms = ?');
        params.push(duration_ms);
      }
      if (error_count !== undefined) {
        updates.push('error_count = ?');
        params.push(error_count);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (error_message !== undefined) {
        updates.push('error_message = ?');
        params.push(error_message);
      }
      if (error_code !== undefined) {
        updates.push('error_code = ?');
        params.push(error_code);
      }
      if (error_category !== undefined) {
        updates.push('error_category = ?');
        params.push(error_category);
      }
      if (retry_count !== undefined) {
        updates.push('retry_count = ?');
        params.push(retry_count);
      }
      if (state_from !== undefined) {
        updates.push('state_from = ?');
        params.push(state_from);
      }
      if (state_to !== undefined) {
        updates.push('state_to = ?');
        params.push(state_to);
      }
      if (state_changed_at !== undefined) {
        updates.push('state_changed_at = ?');
        params.push(state_changed_at);
      }

      if (updates.length === 0) {
        return this.db.prepare('SELECT * FROM sync_operations WHERE id = ?').get(id);
      }

      params.push(id);
      const stmt = this.db.prepare(`
        UPDATE sync_operations
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      stmt.run(...params);
      return this.db.prepare('SELECT * FROM sync_operations WHERE id = ?').get(id);
    } catch (error) {
      logger.error('Error updating sync operation:', error);
      throw error;
    }
  }
}

export default SyncOperation;
