import logger from '../utils/logger.js';

export class SyncIdMap {
  constructor(db) {
    this.db = db;
  }

  getTargetId(sourceDbId, targetDbId, model, sourceId) {
    try {
      const stmt = this.db.prepare(`
        SELECT target_id
        FROM sync_id_map
        WHERE source_db_id = ? AND target_db_id = ? AND odoo_model = ? AND source_id = ?
      `);
      const row = stmt.get(sourceDbId, targetDbId, model, sourceId);
      return row ? row.target_id : null;
    } catch (error) {
      logger.error('Error reading sync ID mapping:', error);
      throw error;
    }
  }

  upsertMapping(sourceDbId, targetDbId, model, sourceId, targetId) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sync_id_map (
          source_db_id, target_db_id, odoo_model, source_id, target_id
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_db_id, target_db_id, odoo_model, source_id)
        DO UPDATE SET target_id = excluded.target_id, updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(sourceDbId, targetDbId, model, sourceId, targetId);
    } catch (error) {
      logger.error('Error upserting sync ID mapping:', error);
      throw error;
    }
  }
}

export default SyncIdMap;
