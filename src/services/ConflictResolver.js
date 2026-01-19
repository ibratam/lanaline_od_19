import logger from '../utils/logger.js';

/**
 * Conflict Resolver Service
 * Handles state transitions for conflict resolution workflow.
 */
export class ConflictResolver {
  constructor(db) {
    this.db = db.getDB ? db.getDB() : db;
  }

  /**
   * Resolve a conflict by choosing a version.
   */
  resolve(conflictId, chosenVersion, userId = null) {
    if (!['local', 'odoo'].includes(chosenVersion)) {
      throw new Error('Invalid chosenVersion');
    }

    const conflict = this._getConflict(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    if (['resolved', 'applied'].includes(conflict.state)) {
      throw new Error('Conflict already resolved');
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE sync_conflicts
      SET state = 'resolved', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conflictId);

    this.db.prepare(`
      INSERT INTO conflict_resolutions (conflict_id, user_id, chosen_version, resolved_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(conflict_id)
      DO UPDATE SET chosen_version = excluded.chosen_version, resolved_at = excluded.resolved_at
    `).run(conflictId, userId, chosenVersion, now);

    logger.info('Conflict resolved', { conflictId, chosenVersion, userId });
    return this._getConflict(conflictId);
  }

  /**
   * Apply a previously resolved conflict.
   */
  apply(conflictId) {
    const conflict = this._getConflict(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    if (conflict.state !== 'resolved') {
      throw new Error('Conflict is not resolved');
    }

    const resolution = this.db.prepare(`
      SELECT * FROM conflict_resolutions WHERE conflict_id = ?
    `).get(conflictId);

    if (!resolution) {
      throw new Error('Resolution record missing');
    }

    try {
      this._performSync(conflict, resolution.chosen_version);
      this.db.prepare(`
        UPDATE sync_conflicts
        SET state = 'applied', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conflictId);
      this.db.prepare(`
        UPDATE conflict_resolutions
        SET applied_at = CURRENT_TIMESTAMP
        WHERE conflict_id = ?
      `).run(conflictId);
      return { status: 'applied' };
    } catch (error) {
      const category = this._categorizeError(error);
      this.db.prepare(`
        UPDATE sync_conflicts
        SET state = 'needs_manual_review', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conflictId);
      this.db.prepare(`
        UPDATE conflict_resolutions
        SET last_error = ?, last_error_category = ?, last_retry_at = CURRENT_TIMESTAMP
        WHERE conflict_id = ?
      `).run(error.message, category, conflictId);
      throw error;
    }
  }

  _performSync(conflict, chosenVersion) {
    if (!conflict || !chosenVersion) {
      throw new Error('Conflict sync payload invalid');
    }
    return true;
  }

  _categorizeError(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();

    if (code.startsWith('UC') || message.includes('validation')) {
      return 'user_correctable';
    }

    if (code.startsWith('SE') || message.includes('timeout') || message.includes('network')) {
      return 'system';
    }

    return 'unrecoverable';
  }

  _getConflict(conflictId) {
    const conflict = this.db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId);
    if (!conflict) return null;
    if (conflict.source_values) {
      conflict.source_values = JSON.parse(conflict.source_values);
    }
    if (conflict.target_values) {
      conflict.target_values = JSON.parse(conflict.target_values);
    }
    return conflict;
  }
}

export default ConflictResolver;
