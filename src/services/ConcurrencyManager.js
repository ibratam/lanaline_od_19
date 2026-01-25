import logger from '../utils/logger.js';
import { ensureSyncOperationTransition } from '../utils/stateValidator.js';

/**
 * Concurrency Manager Service
 * Prevents duplicate sync operations using optimistic locking on sync_operations.
 */
export class ConcurrencyManager {
  constructor(db) {
    this.db = db.getDB ? db.getDB() : db;
  }

  claimOperation(operationId, expectedStatus = 'queued') {
    ensureSyncOperationTransition(expectedStatus, 'running');

    const stmt = this.db.prepare(`
      UPDATE sync_operations
      SET status = 'running',
          state_from = ?,
          state_to = 'running',
          state_changed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `);

    const result = stmt.run(expectedStatus, operationId, expectedStatus);
    const claimed = result.changes === 1;

    if (!claimed) {
      logger.warn('Failed to claim sync operation', { operationId, expectedStatus });
    }

    return claimed;
  }

  releaseOperation(operationId, status = 'completed', error = null) {
    ensureSyncOperationTransition('running', status);

    const stmt = this.db.prepare(`
      UPDATE sync_operations
      SET status = ?,
          error_message = COALESCE(?, error_message),
          state_from = 'running',
          state_to = ?,
          state_changed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'running'
    `);

    const result = stmt.run(status, error?.message || null, status, operationId);
    return result.changes === 1;
  }
}

export default ConcurrencyManager;
