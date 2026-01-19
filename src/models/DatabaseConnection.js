import logger from '../utils/logger.js';

export class DatabaseConnection {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new database connection record
   */
  create(data) {
    try {
      const {
        name,
        url,
        database_name,
        username,
        password_encrypted,
        connection_type = 'odoo'
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO database_connections (
          name, url, database_name, username, password_encrypted, connection_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        name,
        url,
        database_name,
        username,
        password_encrypted,
        connection_type,
        'untested'
      );

      logger.info(`Created database connection: ${name} (ID: ${result.lastInsertRowid})`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating database connection:', error);
      throw error;
    }
  }

  /**
   * Get connection by ID
   */
  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM database_connections WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting database connection by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get connection by name
   */
  getByName(name) {
    try {
      const stmt = this.db.prepare('SELECT * FROM database_connections WHERE name = ?');
      return stmt.get(name);
    } catch (error) {
      logger.error(`Error getting database connection by name ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get all connections
   */
  getAll() {
    try {
      const stmt = this.db.prepare('SELECT * FROM database_connections ORDER BY created_at DESC');
      return stmt.all();
    } catch (error) {
      logger.error('Error getting all database connections:', error);
      throw error;
    }
  }

  /**
   * Update connection
   */
  update(id, data) {
    try {
      const {
        name,
        url,
        database_name,
        username,
        password_encrypted,
        status,
        last_checked_at
      } = data;

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (url !== undefined) {
        updates.push('url = ?');
        params.push(url);
      }
      if (database_name !== undefined) {
        updates.push('database_name = ?');
        params.push(database_name);
      }
      if (username !== undefined) {
        updates.push('username = ?');
        params.push(username);
      }
      if (password_encrypted !== undefined) {
        updates.push('password_encrypted = ?');
        params.push(password_encrypted);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (last_checked_at !== undefined) {
        updates.push('last_checked_at = ?');
        params.push(last_checked_at);
      }

      if (updates.length === 0) {
        return this.getById(id);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const sql = `UPDATE database_connections SET ${updates.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      stmt.run(...params);

      logger.info(`Updated database connection: ID ${id}`);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating database connection ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete connection
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM database_connections WHERE id = ?');
      stmt.run(id);
      logger.info(`Deleted database connection: ID ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting database connection ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update connection status
   */
  updateStatus(id, status, lastCheckedAt = new Date().toISOString()) {
    try {
      return this.update(id, { status, last_checked_at: lastCheckedAt });
    } catch (error) {
      logger.error(`Error updating connection status for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check if connection name exists
   */
  nameExists(name, excludeId = null) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM database_connections WHERE name = ?';
      const params = [name];

      if (excludeId) {
        sql += ' AND id != ?';
        params.push(excludeId);
      }

      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return result.count > 0;
    } catch (error) {
      logger.error('Error checking connection name exists:', error);
      throw error;
    }
  }
}

export default DatabaseConnection;
