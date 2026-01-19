import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeDatabase } from '../../src/db/init.js';
import HistoryLogger from '../../src/services/HistoryLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('HistoryLogger', () => {
  let db;
  let historyLogger;
  const dbPath = path.join(__dirname, '../fixtures/history-test.db');

  beforeEach(async () => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    db = await initializeDatabase(dbPath);
    historyLogger = new HistoryLogger(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should log sync operation', () => {
    const syncRun = historyLogger.createRun({
      source_db_id: 1,
      target_db_id: 2,
      status: 'running',
      triggered_by: 'manual'
    });

    const operationId = historyLogger.logSyncOperation(syncRun.id, {
      odoo_model: 'res.partner',
      operation_type: 'create',
      record_count: 2,
      duration_ms: 50,
      status: 'completed'
    });

    expect(operationId).toBeDefined();
  });
});
