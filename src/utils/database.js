import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DatabaseConnection {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../data/middleware.db');
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info(`Created data directory: ${dataDir}`);
      }

      // Open database connection
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      logger.info(`Database connection opened: ${this.dbPath}`);

      // Load and execute schema
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      // Execute schema statements
      const statements = schema.split(';').filter(stmt => stmt.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          this.db.exec(stmt);
        }
      }

      logger.info('Database schema initialized');
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDB() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a query and return results
   */
  query(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error('Database query error:', { sql, error });
      throw error;
    }
  }

  /**
   * Execute a single query
   */
  queryOne(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } catch (error) {
      logger.error('Database query error:', { sql, error });
      throw error;
    }
  }

  /**
   * Execute an insert/update/delete query
   */
  execute(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    } catch (error) {
      logger.error('Database execute error:', { sql, error });
      throw error;
    }
  }

  /**
   * Start a transaction
   */
  beginTransaction() {
    try {
      this.db.exec('BEGIN TRANSACTION');
    } catch (error) {
      logger.error('Failed to begin transaction:', error);
      throw error;
    }
  }

  /**
   * Commit a transaction
   */
  commit() {
    try {
      this.db.exec('COMMIT');
    } catch (error) {
      logger.error('Failed to commit transaction:', error);
      throw error;
    }
  }

  /**
   * Rollback a transaction
   */
  rollback() {
    try {
      this.db.exec('ROLLBACK');
    } catch (error) {
      logger.error('Failed to rollback transaction:', error);
      throw error;
    }
  }

  /**
   * Execute function in a transaction
   */
  transaction(fn) {
    try {
      this.beginTransaction();
      const result = fn();
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close() {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
        logger.info('Database connection closed');
      }
    } catch (error) {
      logger.error('Error closing database:', error);
      throw error;
    }
  }

  /**
   * Get database file size
   */
  getFileSize() {
    try {
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch (error) {
      logger.error('Error getting database file size:', error);
      return 0;
    }
  }

  /**
   * Backup database
   */
  backup(backupPath) {
    try {
      fs.copyFileSync(this.dbPath, backupPath);
      logger.info(`Database backed up to: ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.error('Error backing up database:', error);
      throw error;
    }
  }
}

export default DatabaseConnection;
