import logger from '../utils/logger.js';
import { ensureSyncOperationTransition } from '../utils/stateValidator.js';

export class SyncOperationStatus {
  constructor(db) {
    this.db = db;
  }

  recordTransition(data) {
    try {
      const {
        sync_operation_id,
        previous_status = null,
        status,
        error_code = null,
        error_category = null,
        note = null
      } = data;

      if (previous_status) {
        ensureSyncOperationTransition(previous_status, status);
      }

      const stmt = this.db.prepare(`
        INSERT INTO sync_operation_status (
          sync_operation_id,
          previous_status,
          status,
          error_code,
          error_category,
          note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        sync_operation_id,
        previous_status,
        status,
        error_code,
        error_category,
        note
      );

      logger.info('Logged sync operation status', {
        id: result.lastInsertRowid,
        sync_operation_id,
        status
      });

      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error recording sync operation status:', error);
      throw error;
    }
  }

  getById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM sync_operation_status WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Error getting sync operation status ${id}:`, error);
      throw error;
    }
  }

  getLatest(syncOperationId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_operation_status
        WHERE sync_operation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return stmt.get(syncOperationId);
    } catch (error) {
      logger.error(`Error getting latest status for operation ${syncOperationId}:`, error);
      throw error;
    }
  }
}

export default SyncOperationStatus;
