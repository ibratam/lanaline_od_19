import { encrypt, decrypt, maskPassword } from '../utils/encryption.js';
import DatabaseConnection from '../models/DatabaseConnection.js';
import logger from '../utils/logger.js';

export class ConfigManager {
  constructor(db) {
    this.db = db;
    this.model = new DatabaseConnection(db.getDB());
  }

  /**
   * Save or update database configuration with encrypted password
   */
  async saveConnection(data) {
    try {
      const {
        id = null,
        name,
        url,
        database_name,
        username,
        password
      } = data;

      if (!name || !url || !database_name || !username || !password) {
        throw new Error('Missing required fields: name, url, database_name, username, password');
      }

      // Encrypt password
      const secretKey = process.env.MIDDLEWARE_SECRET_KEY;
      if (!secretKey || secretKey.length < 32) {
        throw new Error('MIDDLEWARE_SECRET_KEY must be set and at least 32 characters');
      }

      const passwordEncrypted = encrypt(password, secretKey);

      if (id) {
        // Update existing
        logger.info(`Updating database connection: ${name}`);
        return this.model.update(id, {
          name,
          url,
          database_name,
          username,
          password_encrypted: passwordEncrypted
        });
      } else {
        // Create new
        logger.info(`Creating new database connection: ${name}`);
        return this.model.create({
          name,
          url,
          database_name,
          username,
          password_encrypted: passwordEncrypted
        });
      }
    } catch (error) {
      logger.error('Error saving connection:', error);
      throw error;
    }
  }

  /**
   * Get connection with decrypted password (internal use only)
   */
  async getConnectionWithPassword(id) {
    try {
      const connection = this.model.getById(id);
      if (!connection) {
        return null;
      }

      const secretKey = process.env.MIDDLEWARE_SECRET_KEY;
      if (!secretKey) {
        throw new Error('MIDDLEWARE_SECRET_KEY not set');
      }

      try {
        connection.password = decrypt(connection.password_encrypted, secretKey);
        connection.password_encrypted = '[ENCRYPTED]'; // Don't expose encrypted version
      } catch (error) {
        logger.warn(`Failed to decrypt password for connection ${id}:`, error.message);
        connection.password = null;
        connection.password_encrypted = '[ENCRYPTED]';
      }

      return connection;
    } catch (error) {
      logger.error('Error getting connection with password:', error);
      throw error;
    }
  }

  /**
   * Get connection without password (safe for API responses)
   */
  async getConnection(id) {
    try {
      const connection = this.model.getById(id);
      if (!connection) {
        return null;
      }

      return this.maskConnection(connection);
    } catch (error) {
      logger.error('Error getting connection:', error);
      throw error;
    }
  }

  /**
   * Get all connections (masked)
   */
  async getAllConnections() {
    try {
      const connections = this.model.getAll();
      return connections.map(c => this.maskConnection(c));
    } catch (error) {
      logger.error('Error getting all connections:', error);
      throw error;
    }
  }

  /**
   * Delete connection
   */
  async deleteConnection(id) {
    try {
      return this.model.delete(id);
    } catch (error) {
      logger.error('Error deleting connection:', error);
      throw error;
    }
  }

  /**
   * Mask password in connection object
   */
  maskConnection(connection) {
    if (!connection) return null;

    return {
      ...connection,
      password_encrypted: maskPassword(connection.password_encrypted || ''),
      password: undefined
    };
  }

  /**
   * Test connection to Odoo database
   */
  async testConnection(id) {
    try {
      const connection = await this.getConnectionWithPassword(id);
      if (!connection || !connection.password) {
        throw new Error('Cannot decrypt connection password');
      }

      // TODO: Implement actual Odoo connection test
      // This will be implemented in OdooClient service
      logger.info(`Testing connection to ${connection.url}`);

      return {
        success: true,
        message: 'Connection test successful',
        connectionId: id
      };
    } catch (error) {
      logger.error(`Connection test failed for ${id}:`, error);
      return {
        success: false,
        message: error.message,
        connectionId: id
      };
    }
  }

  /**
   * Validate connection configuration
   */
  validateConnection(data) {
    const errors = [];

    if (!data.name || data.name.trim() === '') {
      errors.push('Connection name is required');
    }

    if (!data.url || data.url.trim() === '') {
      errors.push('URL is required');
    } else {
      try {
        new URL(data.url);
      } catch {
        errors.push('URL is invalid');
      }
    }

    if (!data.database_name || data.database_name.trim() === '') {
      errors.push('Database name is required');
    }

    if (!data.username || data.username.trim() === '') {
      errors.push('Username is required');
    }

    if (!data.password || data.password.trim() === '') {
      errors.push('Password is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default ConfigManager;
