import logger from '../utils/logger.js';

export class TableSchema {
  constructor(db) {
    this.db = db;
  }

  createOrUpdate(data) {
    try {
      const {
        table_name,
        schema_json,
        dependencies_json = null,
        status = 'discovered',
        last_checked_at = null
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO table_schemas (
          table_name,
          schema_json,
          dependencies_json,
          status,
          last_checked_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(table_name) DO UPDATE SET
          schema_json = excluded.schema_json,
          dependencies_json = excluded.dependencies_json,
          status = excluded.status,
          last_checked_at = excluded.last_checked_at,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(
        table_name,
        schema_json,
        dependencies_json,
        status,
        last_checked_at
      );

      return this.getByName(table_name);
    } catch (error) {
      logger.error('Error creating/updating table schema:', error);
      throw error;
    }
  }

  getByName(tableName) {
    try {
      const stmt = this.db.prepare('SELECT * FROM table_schemas WHERE table_name = ?');
      return stmt.get(tableName);
    } catch (error) {
      logger.error(`Error getting table schema for ${tableName}:`, error);
      throw error;
    }
  }

  list(limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM table_schemas
        ORDER BY updated_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      logger.error('Error listing table schemas:', error);
      throw error;
    }
  }
}

export default TableSchema;
