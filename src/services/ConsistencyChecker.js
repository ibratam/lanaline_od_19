/**
 * Consistency Checker Service
 * Compares key fields between local database and Odoo
 * Identifies data_mismatch, missing_record, extra_record inconsistencies
 * Suggests repairs: keep_local, keep_odoo, manual_review
 */

import logger from '../utils/logger.js';

export class ConsistencyChecker {
  constructor(db, odooClient, dataInconsistencyModel) {
    this.db = db;
    this.odooClient = odooClient;
    this.dataInconsistencyModel = dataInconsistencyModel;
    this.keyFields = ['status', 'amount', 'date_modified']; // Fields to compare
  }

  /**
   * Run consistency verification for a sync operation
   * Compares key fields between local and Odoo
   * @param {number} syncOperationId - ID of the sync operation
   * @param {Array} models - Models to verify (e.g., ['sales.order', 'account.invoice'])
   * @returns {Object} Verification report with inconsistencies
   */
  async verify(syncOperationId, models = []) {
    const startTime = Date.now();
    logger.info('Starting consistency verification', {
      syncOperationId,
      models: models.length > 0 ? models : 'all',
      service: 'ConsistencyChecker'
    });

    try {
      const inconsistencies = [];
      const summary = {
        data_mismatch: 0,
        missing_record: 0,
        extra_record: 0,
        total_inconsistencies: 0,
        duration_ms: 0
      };

      // Get models to verify
      const modelsToCheck = models.length > 0 ? models : await this._getModelsFromLastSync();

      // Verify each model
      for (const model of modelsToCheck) {
        try {
          const modelInconsistencies = await this._verifyModel(model, syncOperationId);
          inconsistencies.push(...modelInconsistencies);

          // Update summary counts
          modelInconsistencies.forEach(inc => {
            summary[inc.inconsistency_type]++;
            summary.total_inconsistencies++;
          });
        } catch (error) {
          logger.error('Error verifying model', {
            model,
            error: error.message,
            service: 'ConsistencyChecker'
          });
        }
      }

      summary.duration_ms = Date.now() - startTime;

      logger.info('Consistency verification completed', {
        syncOperationId,
        ...summary,
        service: 'ConsistencyChecker'
      });

      return {
        sync_operation_id: syncOperationId,
        status: summary.total_inconsistencies === 0 ? 'consistent' : 'inconsistent',
        summary,
        inconsistencies,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Consistency verification failed', {
        syncOperationId,
        error: error.message,
        service: 'ConsistencyChecker'
      });
      throw error;
    }
  }

  /**
   * Verify a single model for consistency
   * Compares local records with Odoo records
   * @param {string} model - Model name (e.g., 'sales.order')
   * @param {number} syncOperationId - Sync operation ID
   * @returns {Array} Array of inconsistencies found
   */
  async _verifyModel(model, syncOperationId) {
    const inconsistencies = [];

    try {
      // Get local records for this model
      const localRecords = this._getLocalRecords(model);
      const localByExternalId = new Map();
      localRecords.forEach(rec => {
        localByExternalId.set(rec.external_id, rec);
      });

      // Get Odoo records for this model
      const odooRecords = await this._getOdooRecords(model);
      const odooByExternalId = new Map();
      odooRecords.forEach(rec => {
        odooByExternalId.set(rec.external_id, rec);
      });

      // Check for data mismatches and missing records in Odoo
      for (const [externalId, localRecord] of localByExternalId) {
        const odooRecord = odooByExternalId.get(externalId);

        if (!odooRecord) {
          // Record exists locally but missing in Odoo
          inconsistencies.push({
            record_id: localRecord.id,
            odoo_model: model,
            field_name: null,
            local_value: JSON.stringify(localRecord),
            odoo_value: null,
            inconsistency_type: 'missing_record',
            suggested_repair: 'keep_local', // Default to keeping local
            sync_operation_id: syncOperationId
          });
        } else {
          // Check for field-level mismatches
          const fieldMismatches = this._compareRecords(localRecord, odooRecord, model);
          fieldMismatches.forEach(mismatch => {
            mismatch.record_id = localRecord.id;
            mismatch.odoo_model = model;
            mismatch.inconsistency_type = 'data_mismatch';
            mismatch.suggested_repair = 'manual_review'; // Field mismatches need review
            mismatch.sync_operation_id = syncOperationId;
            inconsistencies.push(mismatch);
          });

          // Mark as processed
          odooByExternalId.delete(externalId);
        }
      }

      // Check for extra records in Odoo (not in local)
      for (const [externalId, odooRecord] of odooByExternalId) {
        inconsistencies.push({
          record_id: null, // No local ID
          odoo_model: model,
          field_name: null,
          local_value: null,
          odoo_value: JSON.stringify(odooRecord),
          inconsistency_type: 'extra_record',
          suggested_repair: 'keep_odoo', // Default to keeping Odoo (external source of truth)
          sync_operation_id: syncOperationId
        });
      }

      // Store inconsistencies in database
      for (const inconsistency of inconsistencies) {
        this.dataInconsistencyModel.create(inconsistency);
      }

      return inconsistencies;
    } catch (error) {
      logger.error('Model verification failed', {
        model,
        error: error.message,
        service: 'ConsistencyChecker'
      });
      throw error;
    }
  }

  /**
   * Get local records for a model from local database
   * @param {string} model - Model name
   * @returns {Array} Array of local records
   */
  _getLocalRecords(model) {
    try {
      const table = this._getTableName(model);
      const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE deleted = 0 LIMIT 1000`);
      return stmt.all();
    } catch (error) {
      logger.warn('Could not fetch local records for model', {
        model,
        error: error.message,
        service: 'ConsistencyChecker'
      });
      return [];
    }
  }

  /**
   * Get records for a model from Odoo
   * @param {string} model - Model name
   * @returns {Array} Array of Odoo records
   */
  async _getOdooRecords(model) {
    try {
      const fields = this.keyFields.concat(['external_id', 'id']);
      const records = await this.odooClient.search_read(model, [], fields);
      return records || [];
    } catch (error) {
      logger.warn('Could not fetch Odoo records for model', {
        model,
        error: error.message,
        service: 'ConsistencyChecker'
      });
      return [];
    }
  }

  /**
   * Compare two records for field-level mismatches
   * Compares key fields: status, amount, date_modified
   * @param {Object} localRecord - Local record
   * @param {Object} odooRecord - Odoo record
   * @param {string} model - Model name
   * @returns {Array} Array of field mismatches
   */
  _compareRecords(localRecord, odooRecord, model) {
    const mismatches = [];

    for (const field of this.keyFields) {
      const localValue = localRecord[field];
      const odooValue = odooRecord[field];

      // Normalize values for comparison (handle null, undefined, type differences)
      const localNorm = this._normalizeValue(localValue);
      const odooNorm = this._normalizeValue(odooValue);

      if (localNorm !== odooNorm) {
        mismatches.push({
          field_name: field,
          local_value: String(localValue),
          odoo_value: String(odooValue)
        });
      }
    }

    return mismatches;
  }

  /**
   * Normalize values for comparison
   * Handles null, undefined, type coercion, date formatting
   * @param {*} value - Value to normalize
   * @returns {string} Normalized value string
   */
  _normalizeValue(value) {
    if (value === null || value === undefined) {
      return 'null';
    }

    // Handle dates - convert to ISO string for comparison
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      // Already ISO date format
      return value;
    }

    // Convert to string for comparison
    return String(value).toLowerCase().trim();
  }

  /**
   * Get table name from model name
   * Maps Odoo model names to local table names
   * @param {string} model - Odoo model name (e.g., 'sales.order')
   * @returns {string} Local table name
   */
  _getTableName(model) {
    const mapping = {
      'sales.order': 'sales_orders',
      'sale.order.line': 'sale_order_lines',
      'account.invoice': 'invoices',
      'account.move': 'account_moves',
      'stock.move': 'stock_moves',
      'purchase.order': 'purchase_orders',
      'res.partner': 'partners'
    };

    return mapping[model] || model.replace(/\./g, '_');
  }

  /**
   * Get models from the last sync operation
   * @returns {Array} Array of model names synced in last operation
   */
  async _getModelsFromLastSync() {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT odoo_model FROM sync_conflicts
        ORDER BY id DESC
        LIMIT 100
      `);
      const results = stmt.all();
      return results.map(r => r.odoo_model).filter(Boolean);
    } catch (error) {
      logger.warn('Could not fetch models from last sync', {
        error: error.message,
        service: 'ConsistencyChecker'
      });
      return [];
    }
  }
}

export default ConsistencyChecker;
