import logger from '../utils/logger.js';

export class SyncConflict {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new conflict record
   */
  create(data) {
    try {
      const {
        sync_run_id,
        odoo_model,
        record_id,
        source_db_id,
        target_db_id,
        source_values,
        target_values,
        source_create_date,
        target_create_date,
        source_write_date,
        target_write_date
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO sync_conflicts (
          sync_run_id, odoo_model, record_id, source_db_id, target_db_id,
          source_values, target_values, source_create_date, target_create_date,
          source_write_date, target_write_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_run_id,
        odoo_model,
        record_id,
        source_db_id,
        target_db_id,
        typeof source_values === 'string' ? source_values : JSON.stringify(source_values),
        typeof target_values === 'string' ? target_values : JSON.stringify(target_values),
        source_create_date,
        target_create_date,
        source_write_date,
        target_write_date
      );

      logger.info(`Created sync conflict: ID ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating sync conflict:', error);
      throw error;
    }
  }

  /**
   * Get conflict by ID
   */
  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_conflicts WHERE id = ?');
      const result = stmt.get(id);
      if (result) {
        result.source_values = JSON.parse(result.source_values);
        result.target_values = JSON.parse(result.target_values);
      }
      return result;
    } catch (error) {
      logger.error(`Error getting conflict by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get conflicts for a sync run
   */
  getBySyncRunId(syncRunId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_conflicts
        WHERE sync_run_id = ?
        ORDER BY odoo_model, record_id
      `);
      const results = stmt.all(syncRunId);
      return results.map(result => ({
        ...result,
        source_values: JSON.parse(result.source_values),
        target_values: JSON.parse(result.target_values)
      }));
    } catch (error) {
      logger.error(`Error getting conflicts for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get unresolved conflicts for a sync run
   */
  getUnresolved(syncRunId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_conflicts
        WHERE sync_run_id = ? AND resolution IS NULL
        ORDER BY odoo_model, record_id
      `);
      const results = stmt.all(syncRunId);
      return results.map(result => ({
        ...result,
        source_values: JSON.parse(result.source_values),
        target_values: JSON.parse(result.target_values)
      }));
    } catch (error) {
      logger.error(`Error getting unresolved conflicts for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve a conflict
   */
  resolve(id, resolution) {
    try {
      const stmt = this.db.prepare(`
        UPDATE sync_conflicts
        SET resolution = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(resolution, id);
      logger.info(`Resolved conflict: ID ${id}, resolution: ${resolution}`);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error resolving conflict ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get conflict count for a sync run
   */
  getCount(syncRunId) {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM sync_conflicts
        WHERE sync_run_id = ?
      `);
      const result = stmt.get(syncRunId);
      return result.count;
    } catch (error) {
      logger.error(`Error getting conflict count for sync run ${syncRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get conflicts by model
   */
  getByModel(syncRunId, model) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_conflicts
        WHERE sync_run_id = ? AND odoo_model = ?
        ORDER BY record_id
      `);
      const results = stmt.all(syncRunId, model);
      return results.map(result => ({
        ...result,
        source_values: JSON.parse(result.source_values),
        target_values: JSON.parse(result.target_values)
      }));
    } catch (error) {
      logger.error(`Error getting conflicts for model ${model}:`, error);
      throw error;
    }
  }
}

export default SyncConflict;
