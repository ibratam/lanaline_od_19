import logger from '../utils/logger.js';

export class ConflictResolution {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    try {
      const {
        conflict_id,
        user_id = null,
        chosen_version,
        resolved_at = new Date().toISOString()
      } = data;

      const stmt = this.db.prepare(`
        INSERT INTO conflict_resolutions (conflict_id, user_id, chosen_version, resolved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(conflict_id)
        DO UPDATE SET chosen_version = excluded.chosen_version, resolved_at = excluded.resolved_at
      `);

      stmt.run(conflict_id, user_id, chosen_version, resolved_at);
      return this.getByConflictId(conflict_id);
    } catch (error) {
      logger.error('Error creating conflict resolution:', error);
      throw error;
    }
  }

  getByConflictId(conflictId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM conflict_resolutions
        WHERE conflict_id = ?
      `);
      return stmt.get(conflictId);
    } catch (error) {
      logger.error(`Error getting resolution for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  updateApplied(conflictId, appliedAt = new Date().toISOString()) {
    try {
      const stmt = this.db.prepare(`
        UPDATE conflict_resolutions
        SET applied_at = ?
        WHERE conflict_id = ?
      `);
      stmt.run(appliedAt, conflictId);
      return this.getByConflictId(conflictId);
    } catch (error) {
      logger.error(`Error updating applied time for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  updateError(conflictId, message, category) {
    try {
      const stmt = this.db.prepare(`
        UPDATE conflict_resolutions
        SET last_error = ?, last_error_category = ?
        WHERE conflict_id = ?
      `);
      stmt.run(message, category, conflictId);
      return this.getByConflictId(conflictId);
    } catch (error) {
      logger.error(`Error updating error for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  updateRetry(conflictId, retryCount, nextRetryAt = null) {
    try {
      const stmt = this.db.prepare(`
        UPDATE conflict_resolutions
        SET retry_count = ?, last_retry_at = CURRENT_TIMESTAMP, next_retry_at = ?
        WHERE conflict_id = ?
      `);
      stmt.run(retryCount, nextRetryAt, conflictId);
      return this.getByConflictId(conflictId);
    } catch (error) {
      logger.error(`Error updating retry for conflict ${conflictId}:`, error);
      throw error;
    }
  }
}

export default ConflictResolution;
