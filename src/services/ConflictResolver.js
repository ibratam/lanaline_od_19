import logger from '../utils/logger.js';
import { ensureConflictTransition } from '../utils/stateValidator.js';
import OdooClient from './OdooClient.js';
import DataPreserver from './DataPreserver.js';
import SyncEngine from './SyncEngine.js';

/**
 * Conflict Resolver Service
 * Handles state transitions for conflict resolution workflow.
 */
export class ConflictResolver {
  constructor(db, services = {}) {
    this.db = db.getDB ? db.getDB() : db;
    this.configManager = services.configManager || null;
    this.dataPreserver = services.dataPreserver || new DataPreserver();
    this.syncEngine = new SyncEngine(null);
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

    if (conflict.state === 'applied') {
      throw new Error('Conflict already applied');
    }

    ensureConflictTransition(conflict.state, 'resolved');

    if (conflict.state === 'resolved') {
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
  async apply(conflictId) {
    const conflict = this._getConflict(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    await this._applyConflict(conflict, null);
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
  }

  async applyWithClient(conflictId, client, chosenVersionOverride = null) {
    const conflict = this._getConflict(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    await this._applyConflict(conflict, client, chosenVersionOverride);
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
  }

  reopenForRetry(conflictId) {
    const conflict = this._getConflict(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    if (conflict.state !== 'needs_manual_review') {
      return conflict;
    }

    ensureConflictTransition(conflict.state, 'resolved');
    this.db.prepare(`
      UPDATE sync_conflicts
      SET state = 'resolved', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conflictId);
    return this._getConflict(conflictId);
  }

  _categorizeError(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();

    if (code.startsWith('UC') ||
        message.includes('validation') ||
        message.includes('required field') ||
        message.includes('constraint violation') ||
        message.includes('constraint failed')) {
      return 'user_correctable';
    }

    if (code.startsWith('SE') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('temporarily unavailable')) {
      return 'system';
    }

    return 'unrecoverable';
  }

  async _applyConflict(conflict, client, chosenVersionOverride = null) {
    if (!conflict) {
      throw new Error('Conflict sync payload invalid');
    }

    if (!['resolved', 'failed_resolution'].includes(conflict.state)) {
      throw new Error('Conflict is not resolved');
    }

    ensureConflictTransition(conflict.state, 'applied');

    const resolution = this.db.prepare(`
      SELECT * FROM conflict_resolutions WHERE conflict_id = ?
    `).get(conflict.id);

    if (!resolution && !chosenVersionOverride) {
      throw new Error('Resolution record missing');
    }

    const chosenVersion = chosenVersionOverride || resolution.chosen_version;
    const shouldKeepLocal = chosenVersion === 'local';
    const connectionId = shouldKeepLocal ? conflict.target_db_id : conflict.source_db_id;
    const updateValues = shouldKeepLocal ? conflict.source_values : conflict.target_values;

    const activeClient = client || await this.createClient(connectionId);
    try {
      const prepared = this.dataPreserver.prepareUpdateValues(updateValues);
      const filtered = await this.syncEngine.filterWritableFields(
        conflict.odoo_model,
        prepared,
        activeClient,
        false
      );

      const hasValues = filtered && Object.keys(filtered).length > 0;
      if (!hasValues) {
        logger.warn('Conflict apply skipped: no writable fields', {
          conflictId: conflict.id,
          model: conflict.odoo_model
        });
        return { status: 'skipped' };
      }

      await activeClient.write(conflict.odoo_model, conflict.record_id, filtered);
      return { status: 'applied' };
    } finally {
      if (!client) {
        await activeClient.close();
      }
    }
  }

  async createClient(connectionId) {
    const connection = await this.configManager.getConnectionWithPassword(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const client = new OdooClient(
      connection.url,
      connection.database_name,
      connection.username,
      connection.password
    );
    await client.authenticate();
    return client;
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
