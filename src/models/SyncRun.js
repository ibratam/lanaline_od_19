import logger from '../utils/logger.js';

export class SyncRun {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new sync run
   */
  create(data) {
    try {
      const {
        source_db_id,
        target_db_id,
        status = 'pending',
        triggered_by = 'manual',
        triggered_by_user = null,
        triggered_by_schedule_id = null,
        model_filter = null,
        preview_only = 0
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_runs (
          source_db_id, target_db_id, status, triggered_by,
          triggered_by_user, triggered_by_schedule_id, model_filter, preview_only
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        source_db_id,
        target_db_id,
        status,
        triggered_by,
        triggered_by_user,
        triggered_by_schedule_id,
        model_filter ? JSON.stringify(model_filter) : null,
        preview_only
      );

      logger.info(`Created sync run: ID ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating sync run:', error);
      throw error;
    }
  }

  /**
   * Get sync run by ID
   */
  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_runs WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting sync run by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all sync runs with optional filtering
   */
  getAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM sync_runs WHERE 1=1';
      const params = [];

      if (filters.source_db_id) {
        sql += ' AND source_db_id = ?';
        params.push(filters.source_db_id);
      }

      if (filters.target_db_id) {
        sql += ' AND target_db_id = ?';
        params.push(filters.target_db_id);
      }

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters.triggered_by) {
        sql += ' AND triggered_by = ?';
        params.push(filters.triggered_by);
      }

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      sql += ' ORDER BY created_at DESC';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error('Error getting all sync runs:', error);
      throw error;
    }
  }

  /**
   * Update sync run
   */
  update(id, data) {
    try {
      const {
        status,
        completed_at,
        duration_ms,
        total_records_created,
        total_records_updated,
        total_records_deleted,
        error_count,
        error_message,
        rollback_completed_at
      } = data;

      const updates = [];
      const params = [];

      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (completed_at !== undefined) {
        updates.push('completed_at = ?');
        params.push(completed_at);
      }
      if (duration_ms !== undefined) {
        updates.push('duration_ms = ?');
        params.push(duration_ms);
      }
      if (total_records_created !== undefined) {
        updates.push('total_records_created = ?');
        params.push(total_records_created);
      }
      if (total_records_updated !== undefined) {
        updates.push('total_records_updated = ?');
        params.push(total_records_updated);
      }
      if (total_records_deleted !== undefined) {
        updates.push('total_records_deleted = ?');
        params.push(total_records_deleted);
      }
      if (error_count !== undefined) {
        updates.push('error_count = ?');
        params.push(error_count);
      }
      if (error_message !== undefined) {
        updates.push('error_message = ?');
        params.push(error_message);
      }
      if (rollback_completed_at !== undefined) {
        updates.push('rollback_completed_at = ?');
        params.push(rollback_completed_at);
      }

      if (updates.length === 0) {
        return this.getById(id);
      }

      params.push(id);
      const sql = `UPDATE sync_runs SET ${updates.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      stmt.run(...params);

      logger.info(`Updated sync run: ID ${id}`);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating sync run ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get latest sync run for a database pair
   */
  getLatest(sourceDbId, targetDbId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_runs
        WHERE source_db_id = ? AND target_db_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return stmt.get(sourceDbId, targetDbId);
    } catch (error) {
      logger.error('Error getting latest sync run:', error);
      throw error;
    }
  }

  /**
   * Get sync run count
   */
  getCount(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM sync_runs WHERE 1=1';
      const params = [];

      if (filters.source_db_id) {
        sql += ' AND source_db_id = ?';
        params.push(filters.source_db_id);
      }

      if (filters.target_db_id) {
        sql += ' AND target_db_id = ?';
        params.push(filters.target_db_id);
      }

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters.triggered_by) {
        sql += ' AND triggered_by = ?';
        params.push(filters.triggered_by);
      }

      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return result.count;
    } catch (error) {
      logger.error('Error getting sync run count:', error);
      throw error;
    }
  }
}

export default SyncRun;
