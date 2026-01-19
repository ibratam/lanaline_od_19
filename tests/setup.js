import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeDatabase } from '../src/db/init.js';
import { createApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

/**
 * Setup test environment
 */
export async function setupTests() {
  // Create fixtures directory if it doesn't exist
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.MIDDLEWARE_SECRET_KEY = 'a'.repeat(32);
}

/**
 * Cleanup test environment
 */
export function cleanupTests() {
  // Remove test database files if needed
  const testDbPath = path.join(fixturesDir, 'test.db');
  const testDbShmPath = path.join(fixturesDir, 'test.db-shm');
  const testDbWalPath = path.join(fixturesDir, 'test.db-wal');

  [testDbPath, testDbShmPath, testDbWalPath].forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
}

/**
 * Create test app with database
 */
export async function createTestApp() {
  const testDbPath = path.join(fixturesDir, 'test.db');

  // Clean up any existing test database
  cleanupTests();

  // Initialize database
  const db = await initializeDatabase(testDbPath);

  // Create app
  const app = createApp(db);

  return { app, db };
}

// Setup tests on import
await setupTests();
