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
    const conflicts = this._matchConflicts(rule, ['detected', 'reviewing', 'needs_manual_review']);
    return {
      matches: conflicts.length,
      preview: conflicts.slice(0, 20).map(conflict => ({
        id: conflict.id,
        model_name: conflict.odoo_model,
        record_id: conflict.record_id,
        field_name: conflict.field_name,
        will_apply_version: rule.action === 'keep_local' ? 'local' : 'odoo',
        current_state: conflict.state
      }))
    };
  }

  async apply(rule) {
    this._validateRule(rule);
    const conflicts = this._matchConflicts(rule, ['detected', 'reviewing', 'needs_manual_review']);
    const alreadyResolved = this._matchConflicts(rule, ['resolved', 'applied']);
    const chosenVersion = rule.action === 'keep_local' ? 'local' : 'odoo';
    const results = {
      resolved_count: 0,
      already_resolved_count: alreadyResolved.length,
      failed_count: 0,
      details: {
        resolved: [],
        already_resolved: alreadyResolved.map(conflict => conflict.id),
        failed: []
      }
    };

    if (conflicts.length === 0 && alreadyResolved.length === 0) {
      throw new Error('No conflicts match this rule');
    }

    let sharedClient = null;
    try {
      if (conflicts.length > 0) {
        const connectionId = chosenVersion === 'local'
          ? conflicts[0].target_db_id
          : conflicts[0].source_db_id;
        sharedClient = await this.conflictResolver.createClient(connectionId);
      }

      for (const conflict of conflicts) {
        try {
          this.conflictResolver.resolve(conflict.id, chosenVersion);
          await this.conflictResolver.applyWithClient(conflict.id, sharedClient, chosenVersion);
          results.resolved_count += 1;
          results.details.resolved.push(conflict.id);
        } catch (error) {
          results.failed_count += 1;
          results.details.failed.push({
            conflict_id: conflict.id,
            reason: error.message,
            error_code: 'BULK_APPLY_FAILED'
          });
        }
      }
      logger.info('Bulk resolution applied', { count: conflicts.length });
      return results;
    } catch (error) {
      logger.error('Bulk resolution failed', { error: error.message });
      throw error;
    } finally {
      if (sharedClient) {
        await sharedClient.close();
      }
    }
  }

  _matchConflicts(rule, states = null) {
    const params = [rule.model];
    let sql = `
      SELECT * FROM sync_conflicts
      WHERE odoo_model = ?
    `;

    if (rule.field) {
      sql += ' AND field_name = ?';
      params.push(rule.field);
    }

    if (states && states.length > 0) {
      const placeholders = states.map(() => '?').join(',');
      sql += ` AND state IN (${placeholders})`;
      params.push(...states);
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
