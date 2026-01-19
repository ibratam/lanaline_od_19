import logger from '../utils/logger.js';

/**
 * Bulk Resolution Engine
 * Applies resolution rules to multiple conflicts atomically.
 */
export class BulkResolutionEngine {
  constructor(db, conflictResolver) {
    this.db = db.getDB ? db.getDB() : db;
    this.conflictResolver = conflictResolver;
  }

  preview(rule) {
    this._validateRule(rule);
    const conflicts = this._matchConflicts(rule);
    return {
      matches: conflicts.length,
      conflict_ids: conflicts.map(conflict => conflict.id)
    };
  }

  apply(rule) {
    this._validateRule(rule);
    const conflicts = this._matchConflicts(rule);
    const chosenVersion = rule.action === 'keep_local' ? 'local' : 'odoo';

    const transaction = this.db.transaction(() => {
      for (const conflict of conflicts) {
        this.conflictResolver.resolve(conflict.id, chosenVersion);
        this.conflictResolver.apply(conflict.id);
      }
    });

    try {
      transaction();
      logger.info('Bulk resolution applied', { count: conflicts.length });
      return { applied: conflicts.length };
    } catch (error) {
      logger.error('Bulk resolution failed', { error: error.message });
      throw error;
    }
  }

  _matchConflicts(rule) {
    const params = [rule.model];
    let sql = `
      SELECT * FROM sync_conflicts
      WHERE odoo_model = ?
        AND state IN ('detected', 'reviewing', 'needs_manual_review')
    `;

    if (rule.field) {
      sql += ' AND field_name = ?';
      params.push(rule.field);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  _validateRule(rule) {
    if (!rule || typeof rule !== 'object') {
      throw new Error('Rule must be an object');
    }
    if (!rule.model || typeof rule.model !== 'string') {
      throw new Error('Rule requires model');
    }
    if (rule.field && typeof rule.field !== 'string') {
      throw new Error('Rule field must be a string');
    }
    if (!['keep_local', 'keep_odoo'].includes(rule.action)) {
      throw new Error('Rule action must be keep_local or keep_odoo');
    }
  }
}

export default BulkResolutionEngine;
