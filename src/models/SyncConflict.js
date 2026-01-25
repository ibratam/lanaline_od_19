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

      const normalizeJson = value => (
        typeof value === 'string' ? value : JSON.stringify(value ?? null)
      );
      const normalizeDateValue = value => {
        if (value == null || value === false) {
          return null;
        }
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
          return value;
        }
        if (typeof value === 'boolean') {
          return null;
        }
        return JSON.stringify(value);
      };

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
        normalizeJson(source_values),
        normalizeJson(target_values),
        normalizeDateValue(source_create_date),
        normalizeDateValue(target_create_date),
        normalizeDateValue(source_write_date),
        normalizeDateValue(target_write_date)
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

  /**
   * Get conflicts by state
   */
  getByState(state, limit = 50, offset = 0) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_conflicts
        WHERE state = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      const results = stmt.all(state, limit, offset);
      return results.map(result => ({
        ...result,
        source_values: JSON.parse(result.source_values),
        target_values: JSON.parse(result.target_values)
      }));
    } catch (error) {
      logger.error(`Error getting conflicts by state ${state}:`, error);
      throw error;
    }
  }

  /**
   * Update conflict state
   */
  updateState(id, state) {
    try {
      const stmt = this.db.prepare(`
        UPDATE sync_conflicts
        SET state = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(state, id);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating conflict state ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get lock information for a conflict
   */
  getLocked(conflictId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM conflict_locks
        WHERE conflict_id = ?
      `);
      return stmt.get(conflictId);
    } catch (error) {
      logger.error(`Error getting lock for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure state/lock columns exist (idempotent)
   */
  addStateColumn() {
    try {
      const columns = this.db.prepare('PRAGMA table_info(sync_conflicts)').all();
      const columnNames = new Set(columns.map(col => col.name));

      if (!columnNames.has('state')) {
        this.db.exec("ALTER TABLE sync_conflicts ADD COLUMN state TEXT DEFAULT 'detected'");
      }
      if (!columnNames.has('locked_by')) {
        this.db.exec('ALTER TABLE sync_conflicts ADD COLUMN locked_by INTEGER');
      }
      if (!columnNames.has('locked_at')) {
        this.db.exec('ALTER TABLE sync_conflicts ADD COLUMN locked_at DATETIME');
      }

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_sync_conflicts_state ON sync_conflicts(state)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_sync_conflicts_model_state ON sync_conflicts(odoo_model, state)');
    } catch (error) {
      logger.error('Error adding conflict state columns:', error);
      throw error;
    }
  }
}

export default SyncConflict;
