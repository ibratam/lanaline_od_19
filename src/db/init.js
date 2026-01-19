import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseConnection from '../utils/database.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initialize the middleware database
 */
export async function initializeDatabase(dbPath = null) {
  try {
    logger.info('Initializing database...');

    // Use provided path or default
    const finalDbPath = dbPath || path.join(__dirname, '../../data/middleware.db');

    // Create database connection
    const db = new DatabaseConnection(finalDbPath);

    // Initialize (creates/migrates tables)
    await db.initialize();

    logger.info('Database initialization complete');
    return db;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
export function closeDatabase(db) {
  try {
    if (db) {
      db.close();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database:', error);
  }
}

export default {
  initializeDatabase,
  closeDatabase
};
