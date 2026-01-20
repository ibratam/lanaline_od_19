import SyncRun from '../models/SyncRun.js';
import SyncOperation from '../models/SyncOperation.js';
import SyncError from '../models/SyncError.js';
import logger from '../utils/logger.js';

/**
 * History Logger Service
 * Persists sync run metadata, operations, and errors.
 */
export class HistoryLogger {
  constructor(db) {
    this.db = db.getDB ? db.getDB() : db;
    this.syncRunModel = new SyncRun(this.db);
    this.syncOperationModel = new SyncOperation(this.db);
    this.syncErrorModel = new SyncError(this.db);
  }

  getDb() {
    return this.db;
  }

  /**
   * Create a new sync run record
   */
  createRun(data) {
    const payload = {
      ...data,
      status: data.status || 'running',
      preview_only: data.preview_only ? 1 : 0
    };
    return this.syncRunModel.create(payload);
  }

  /**
   * Complete a sync run with summary data and logs
   */
  commitRunLogs(syncRunId, summary, operations = [], errors = []) {
    const transaction = this.db.transaction(() => {
      for (const operation of operations) {
        this.syncOperationModel.create({
          sync_run_id: syncRunId,
          ...operation
        });
      }

      for (const error of errors) {
        this.syncErrorModel.create({
          sync_run_id: syncRunId,
          ...error
        });
      }

      this.syncRunModel.update(syncRunId, summary);
    });

    try {
      transaction();
    } catch (error) {
      logger.error('Failed to commit sync logs:', error);
      throw error;
    }
  }

  /**
   * Update sync run status
   */
  updateRun(syncRunId, data) {
    return this.syncRunModel.update(syncRunId, data);
  }

  /**
   * Log a single sync operation
   */
  logSyncOperation(syncRunId, operation) {
    return this.syncOperationModel.create({
      sync_run_id: syncRunId,
      ...operation
    });
  }

  /**
   * Query operations by status
   */
  queryByState(state, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_operations
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(state, limit, offset);
  }

  /**
   * Query operations by model
   */
  queryByModel(model, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_operations
      WHERE odoo_model = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(model, limit);
  }

  /**
   * Query operations by date range
   */
  queryByDateRange(start, end) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_operations
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);
    return stmt.all(start, end);
  }

  /**
   * Get operation details by ID
   */
  getDetails(operationId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_operations
      WHERE id = ?
    `);
    return stmt.get(operationId);
  }
}

export default HistoryLogger;
