import logger from '../utils/logger.js';

export class SyncSchedule {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new schedule
   */
  create(data) {
    try {
      const {
        source_db_id,
        target_db_id,
        name,
        description,
        cron_expression,
        timezone = 'UTC',
        notification_email = null,
        notify_on_error = 1,
        notify_on_success = 0,
        model_filter = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_schedules (
          source_db_id, target_db_id, name, description, cron_expression,
          timezone, notification_email, notify_on_error, notify_on_success, model_filter
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        source_db_id,
        target_db_id,
        name,
        description,
        cron_expression,
        timezone,
        notification_email,
        notify_on_error,
        notify_on_success,
        model_filter ? JSON.stringify(model_filter) : null
      );

      logger.info(`Created sync schedule: ${name} (ID: ${result.lastInsertRowid})`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating sync schedule:', error);
      throw error;
    }
  }

  /**
   * Get schedule by ID
   */
  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_schedules WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting schedule by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all schedules
   */
  getAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM sync_schedules WHERE 1=1';
      const params = [];

      if (filters.enabled !== undefined) {
        sql += ' AND enabled = ?';
        params.push(filters.enabled ? 1 : 0);
      }

      if (filters.source_db_id) {
        sql += ' AND source_db_id = ?';
        params.push(filters.source_db_id);
      }

      if (filters.target_db_id) {
        sql += ' AND target_db_id = ?';
        params.push(filters.target_db_id);
      }

      sql += ' ORDER BY created_at DESC';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error('Error getting all schedules:', error);
      throw error;
    }
  }

  /**
   * Get enabled schedules
   */
  getEnabled() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_schedules
        WHERE enabled = 1
        ORDER BY created_at DESC
      `);
      return stmt.all();
    } catch (error) {
      logger.error('Error getting enabled schedules:', error);
      throw error;
    }
  }

  /**
   * Update schedule
   */
  update(id, data) {
    try {
      const {
        name,
        description,
        cron_expression,
        timezone,
        enabled,
        notification_email,
        notify_on_error,
        notify_on_success,
        model_filter,
        last_executed_at,
        next_execution_at
      } = data;

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      if (cron_expression !== undefined) {
        updates.push('cron_expression = ?');
        params.push(cron_expression);
      }
      if (timezone !== undefined) {
        updates.push('timezone = ?');
        params.push(timezone);
      }
      if (enabled !== undefined) {
        updates.push('enabled = ?');
        params.push(enabled ? 1 : 0);
      }
      if (notification_email !== undefined) {
        updates.push('notification_email = ?');
        params.push(notification_email);
      }
      if (notify_on_error !== undefined) {
        updates.push('notify_on_error = ?');
        params.push(notify_on_error ? 1 : 0);
      }
      if (notify_on_success !== undefined) {
        updates.push('notify_on_success = ?');
        params.push(notify_on_success ? 1 : 0);
      }
      if (model_filter !== undefined) {
        updates.push('model_filter = ?');
        params.push(model_filter ? JSON.stringify(model_filter) : null);
      }
      if (last_executed_at !== undefined) {
        updates.push('last_executed_at = ?');
        params.push(last_executed_at);
      }
      if (next_execution_at !== undefined) {
        updates.push('next_execution_at = ?');
        params.push(next_execution_at);
      }

      if (updates.length === 0) {
        return this.getById(id);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const sql = `UPDATE sync_schedules SET ${updates.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      stmt.run(...params);

      logger.info(`Updated sync schedule: ID ${id}`);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating sync schedule ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete schedule
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM sync_schedules WHERE id = ?');
      stmt.run(id);
      logger.info(`Deleted sync schedule: ID ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting sync schedule ${id}:`, error);
      throw error;
    }
  }

  /**
   * Toggle schedule enabled/disabled
   */
  toggle(id) {
    try {
      const schedule = this.getById(id);
      if (!schedule) {
        throw new Error(`Schedule ${id} not found`);
      }
      return this.update(id, { enabled: !schedule.enabled });
    } catch (error) {
      logger.error(`Error toggling schedule ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update last execution time
   */
  updateLastExecution(id, timestamp = new Date().toISOString()) {
    try {
      return this.update(id, { last_executed_at: timestamp });
    } catch (error) {
      logger.error(`Error updating last execution for schedule ${id}:`, error);
      throw error;
    }
  }
}

export default SyncSchedule;
