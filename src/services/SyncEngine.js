import logger from '../utils/logger.js';
import { ConflictDetector } from './ConflictDetector.js';
import SyncOperationLogger from './SyncOperationLogger.js';

/**
 * Sync Engine Service
 * Core synchronization logic for comparing and syncing records
 */
export class SyncEngine {
  constructor(odooClient, options = {}) {
    this.odooClient = odooClient;
    this.conflictDetector = new ConflictDetector();
    this.modelFieldCache = new Map();
    this.modelFieldNames = new Map();
    this.disableDeletes = options.disableDeletes ?? true;
  }

  /**
   * Generate preview of synchronization
   * Compares source and target databases, identifies conflicts
   */
  async generatePreview(sourceClient, targetClient, modelFilter = null) {
    try {
      logger.info('Generating sync preview...');

      const preview = {
        generated_at: new Date().toISOString(),
        summary: {
          total_models: 0,
          total_records_to_create: 0,
          total_records_to_update: 0,
          total_records_to_delete: 0,
          total_conflicts: 0
        },
        models: []
      };

      // Get list of models to sync
      const models = await this.getModelsToSync(sourceClient, modelFilter);
      preview.summary.total_models = models.length;

      // Compare each model
      for (const model of models) {
        logger.debug(`Comparing model: ${model}`);

        try {
          const modelComparison = await this.compareModel(
            sourceClient,
            targetClient,
            model
          );

          preview.models.push(modelComparison);

          // Update summary
          preview.summary.total_records_to_create += modelComparison.to_create.count;
          preview.summary.total_records_to_update += modelComparison.to_update.count;
          preview.summary.total_records_to_delete += modelComparison.to_delete.count;
          preview.summary.total_conflicts += modelComparison.conflicts.length;
        } catch (error) {
          const accessDenied = this.isAccessDeniedError(error);
          const skipReason = accessDenied
            ? 'Skipped: access denied'
            : `Error: ${error.message}`;

          logger.warn(`Error comparing model ${model}: ${error.message}`);
          preview.models.push({
            model,
            skipped: accessDenied,
            skip_reason: accessDenied ? skipReason : null,
            error: accessDenied ? null : error.message,
            to_create: { count: 0, records: [] },
            to_update: { count: 0, records: [] },
            to_delete: { count: 0, records: [] },
            conflicts: []
          });
        }
      }

      logger.info('Preview generation complete', {
        models: preview.summary.total_models,
        creates: preview.summary.total_records_to_create,
        updates: preview.summary.total_records_to_update,
        deletes: preview.summary.total_records_to_delete,
        conflicts: preview.summary.total_conflicts
      });

      return preview;
    } catch (error) {
      logger.error('Error generating preview:', error);
      throw error;
    }
  }

  /**
   * Execute synchronization between source and target
   */
  async executeSync(options) {
    const {
      sourceClient,
      targetClient,
      modelFilter = null,
      dataPreserver = null,
      progressCallback = null,
      mock = process.env.NODE_ENV === 'test',
      operationLogger = new SyncOperationLogger(),
      syncRunId = null
    } = options || {};

    const startedAt = Date.now();
    const operations = [];
    const errors = [];
    const rollbackOperations = {
      created: [],
      updated: [],
      deleted: []
    };

    let totalRecords = 0;
    let recordsProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;

    const models = mock
      ? (Array.isArray(modelFilter) && modelFilter.length > 0 ? modelFilter : ['res.partner'])
      : await this.getModelsToSync(sourceClient, modelFilter);

    const updateProgress = (currentModel) => {
      if (progressCallback) {
        const percentage = totalRecords > 0
          ? Math.round((recordsProcessed / totalRecords) * 100)
          : 0;
        progressCallback({
          status: 'running',
          current_model: currentModel,
          records_processed: recordsProcessed,
          total_records: totalRecords,
          percentage
        });
      }
    };

    for (const model of models) {
      const compareOpId = operationLogger.startOperation({
        sync_run_id: syncRunId,
        odoo_model: model,
        operation_type: 'compare'
      });
      operationLogger.transitionState(compareOpId, 'queued', 'running');
      operationLogger.startPhase(compareOpId, 'compare');
      let comparison;

      try {
        comparison = mock
          ? this.buildMockComparison(model)
          : await this.compareModel(sourceClient, targetClient, model);
        operationLogger.endPhase(compareOpId, 'compare');
        operationLogger.transitionState(compareOpId, 'running', 'completed');
        operationLogger.completeOperation(compareOpId, {
          status: 'completed'
        });
      } catch (error) {
        operationLogger.recordError(compareOpId, error);
        operationLogger.endPhase(compareOpId, 'compare');
        operationLogger.transitionState(compareOpId, 'running', 'failed');
        operationLogger.completeOperation(compareOpId, {
          status: 'failed'
        });
        errors.push({
          error_type: 'sync_error',
          odoo_model: model,
          error_message: error.message,
          stack_trace: error.stack
        });
        throw error;
      }

      totalRecords += comparison.to_create.count
        + comparison.to_update.count
        + comparison.to_delete.count;

      const createOpId = operationLogger.startOperation({
        sync_run_id: syncRunId,
        odoo_model: model,
        operation_type: 'create'
      });
      operationLogger.transitionState(createOpId, 'queued', 'running');
      operationLogger.startPhase(createOpId, 'create');
      let createCount = 0;
      let createDuration = 0;
      let createEntry = null;
      try {
        const createStart = Date.now();
        createCount = await this.executeCreates(
          model,
          comparison.to_create.records,
          targetClient,
          dataPreserver,
          rollbackOperations,
          mock
        );
        createDuration = Date.now() - createStart;
        operationLogger.endPhase(createOpId, 'create', { record_count: createCount });
        operationLogger.transitionState(createOpId, 'running', 'completed');
        createEntry = operationLogger.completeOperation(createOpId, {
          status: 'completed',
          record_count: createCount
        });
      } catch (error) {
        operationLogger.recordError(createOpId, error);
        operationLogger.endPhase(createOpId, 'create');
        operationLogger.transitionState(createOpId, 'running', 'failed');
        operationLogger.completeOperation(createOpId, {
          status: 'failed'
        });
        throw error;
      }
      totalCreated += createCount;
      recordsProcessed += createCount;

      const updateOpId = operationLogger.startOperation({
        sync_run_id: syncRunId,
        odoo_model: model,
        operation_type: 'update'
      });
      operationLogger.transitionState(updateOpId, 'queued', 'running');
      operationLogger.startPhase(updateOpId, 'update');
      let updateCount = 0;
      let updateDuration = 0;
      let updateEntry = null;
      try {
        const updateStart = Date.now();
        updateCount = await this.executeUpdates(
          model,
          comparison.to_update.records,
          targetClient,
          dataPreserver,
          rollbackOperations,
          mock
        );
        updateDuration = Date.now() - updateStart;
        operationLogger.endPhase(updateOpId, 'update', { record_count: updateCount });
        operationLogger.transitionState(updateOpId, 'running', 'completed');
        updateEntry = operationLogger.completeOperation(updateOpId, {
          status: 'completed',
          record_count: updateCount
        });
      } catch (error) {
        operationLogger.recordError(updateOpId, error);
        operationLogger.endPhase(updateOpId, 'update');
        operationLogger.transitionState(updateOpId, 'running', 'failed');
        operationLogger.completeOperation(updateOpId, {
          status: 'failed'
        });
        throw error;
      }
      totalUpdated += updateCount;
      recordsProcessed += updateCount;

      let deleteCount = 0;
      let deleteDuration = 0;
      let deleteEntry = null;
      if (!this.disableDeletes) {
        const deleteOpId = operationLogger.startOperation({
          sync_run_id: syncRunId,
          odoo_model: model,
          operation_type: 'delete'
        });
        operationLogger.transitionState(deleteOpId, 'queued', 'running');
        operationLogger.startPhase(deleteOpId, 'delete');
        try {
          const deleteStart = Date.now();
          deleteCount = await this.executeDeletes(
            model,
            comparison.to_delete.records,
            targetClient,
            rollbackOperations,
            mock
          );
          deleteDuration = Date.now() - deleteStart;
          operationLogger.endPhase(deleteOpId, 'delete', { record_count: deleteCount });
          operationLogger.transitionState(deleteOpId, 'running', 'completed');
          deleteEntry = operationLogger.completeOperation(deleteOpId, {
            status: 'completed',
            record_count: deleteCount
          });
        } catch (error) {
          operationLogger.recordError(deleteOpId, error);
          operationLogger.endPhase(deleteOpId, 'delete');
          operationLogger.transitionState(deleteOpId, 'running', 'failed');
          operationLogger.completeOperation(deleteOpId, {
            status: 'failed'
          });
          throw error;
        }
        totalDeleted += deleteCount;
        recordsProcessed += deleteCount;
      }

      if (mock) {
        await this.delay(10);
      }

      operations.push({
        odoo_model: model,
        operation_type: 'create',
        record_count: createCount,
        duration_ms: createDuration,
        status: 'completed',
        phase_timings: { create_ms: createDuration },
        state_transitions: createEntry?.state_transitions || []
      });
      operations.push({
        odoo_model: model,
        operation_type: 'update',
        record_count: updateCount,
        duration_ms: updateDuration,
        status: 'completed',
        phase_timings: { update_ms: updateDuration },
        state_transitions: updateEntry?.state_transitions || []
      });
      operations.push({
        odoo_model: model,
        operation_type: 'delete',
        record_count: deleteCount,
        duration_ms: deleteDuration,
        status: this.disableDeletes ? 'skipped' : 'completed',
        phase_timings: { delete_ms: deleteDuration },
        state_transitions: deleteEntry?.state_transitions || []
      });

      updateProgress(model);
    }

    const durationMs = Date.now() - startedAt;

    return {
      summary: {
        status: 'completed',
        duration_ms: durationMs,
        total_records_created: totalCreated,
        total_records_updated: totalUpdated,
        total_records_deleted: totalDeleted,
        total_records: totalRecords
      },
      operations,
      errors,
      rollback_operations: rollbackOperations
    };
  }

  /**
   * Get list of models to sync
   */
  async getModelsToSync(sourceClient, modelFilter = null) {
    try {
      // Get all available models
      const allModels = await sourceClient.getModels();

      // Extract model names
      let models = allModels
        .map(m => m.model)
        .filter(m => m && !m.startsWith('_')); // Exclude internal models

      // Filter by model_filter if provided
      if (modelFilter && Array.isArray(modelFilter) && modelFilter.length > 0) {
        models = models.filter(m => modelFilter.includes(m));
      }

      logger.info(`Models to sync: ${models.length}`);
      return models;
    } catch (error) {
      logger.error('Error getting models:', error);
      throw error;
    }
  }

  /**
   * Compare a single model between source and target
   */
  async compareModel(sourceClient, targetClient, model) {
    try {
      logger.debug(`Comparing model: ${model}`);

      // Get all records from source
      const sourceRecords = await sourceClient.search(model, [], 0, 0);
      logger.debug(`Source: ${sourceRecords.length} records in ${model}`);

      // Get all records from target
      const targetRecords = await targetClient.search(model, [], 0, 0);
      logger.debug(`Target: ${targetRecords.length} records in ${model}`);

      // Get full record data
      const sourceData = sourceRecords.length > 0 ?
        await sourceClient.read(model, sourceRecords, []) : [];
      const targetData = targetRecords.length > 0 ?
        await targetClient.read(model, targetRecords, []) : [];

      // Convert to maps for easier lookup
      const sourceMap = new Map(sourceData.map(r => [r.id, r]));
      const targetMap = new Map(targetData.map(r => [r.id, r]));

      const comparison = {
        model,
        to_create: { count: 0, records: [] },
        to_update: { count: 0, records: [] },
        to_delete: { count: 0, records: [] },
        conflicts: []
      };

      // Find records to create (in source but not in target)
      for (const [id, sourceRecord] of sourceMap) {
        if (!targetMap.has(id)) {
          comparison.to_create.records.push({
            id,
            data: sourceRecord
          });
          comparison.to_create.count++;
        }
      }

      // Find records to update or conflicts
      for (const [id, sourceRecord] of sourceMap) {
        const targetRecord = targetMap.get(id);
        if (targetRecord) {
          // Compare records for differences
          const diff = this.compareRecords(sourceRecord, targetRecord);
          if (diff.hasDifferences) {
            // Check if it's a conflict (both have different values)
            const hasConflict = this.detectConflict(sourceRecord, targetRecord, diff);
            if (hasConflict) {
              comparison.conflicts.push({
                record_id: id,
                source_values: sourceRecord,
                target_values: targetRecord,
                differences: diff.differences,
                source_create_date: sourceRecord.create_date,
                target_create_date: targetRecord.create_date,
                source_write_date: sourceRecord.write_date,
                target_write_date: targetRecord.write_date
              });
            } else {
              // Regular update
              comparison.to_update.records.push({
                id,
                source: sourceRecord,
                target: targetRecord,
                differences: diff.differences
              });
              comparison.to_update.count++;
            }
          }
        }
      }

      if (!this.disableDeletes) {
        // Find records to delete (in target but not in source)
        for (const [id, targetRecord] of targetMap) {
          if (!sourceMap.has(id)) {
            comparison.to_delete.records.push({
              id,
              data: targetRecord
            });
            comparison.to_delete.count++;
          }
        }
      }

      logger.debug(`Model ${model}: creates=${comparison.to_create.count}, updates=${comparison.to_update.count}, deletes=${comparison.to_delete.count}, conflicts=${comparison.conflicts.length}`);

      return comparison;
    } catch (error) {
      logger.error(`Error comparing model ${model}:`, error);
      throw error;
    }
  }

  /**
   * Compare two records for differences
   */
  compareRecords(sourceRecord, targetRecord) {
    const differences = {};
    let hasDifferences = false;

    // Compare all fields from source record
    for (const [key, sourceValue] of Object.entries(sourceRecord)) {
      // Skip system fields
      if (['id', 'create_date', 'write_date', '__last_update'].includes(key)) {
        continue;
      }

      const targetValue = targetRecord[key];

      // Compare values (deep comparison for objects/arrays)
      if (!this.valuesEqual(sourceValue, targetValue)) {
        differences[key] = {
          source: sourceValue,
          target: targetValue
        };
        hasDifferences = true;
      }
    }

    // Check for fields in target but not in source
    for (const key of Object.keys(targetRecord)) {
      if (['id', 'create_date', 'write_date', '__last_update'].includes(key)) {
        continue;
      }

      if (!(key in sourceRecord)) {
        differences[key] = {
          source: undefined,
          target: targetRecord[key]
        };
        hasDifferences = true;
      }
    }

    return { hasDifferences, differences };
  }

  async executeCreates(model, records, targetClient, dataPreserver, rollbackOperations, mock) {
    let count = 0;

    for (const record of records) {
      const values = dataPreserver
        ? dataPreserver.prepareCreateValues(record.data)
        : record.data;
      const filteredValues = await this.filterWritableFields(model, values, targetClient, mock);

      if (!mock && targetClient) {
        if (model === 'account.analytic.account' && filteredValues?.company_id) {
          const companyRef = this.extractCompanyRef(record.data?.company_id, record.data);
          const mappedCompanyId = await this.findCompanyId(targetClient, companyRef);
          if (mappedCompanyId) {
            filteredValues.company_id = mappedCompanyId;
          } else if (companyRef?.name || companyRef?.code) {
            logger.warn(`No matching company found for account.analytic.account (${companyRef.name || companyRef.code}).`);
          }
        }

        if (model === 'account.account' && filteredValues?.code) {
          const existingIds = await targetClient.search(model, [['code', '=', filteredValues.code]], 0, 1);
          if (existingIds.length > 0) {
            const existingId = existingIds[0];
            const previous = await targetClient.read(model, existingId, []);
            logger.info(`Account code ${filteredValues.code} exists; updating ${model} ${existingId} instead of create.`);
            await targetClient.write(model, existingId, filteredValues);
            rollbackOperations.updated.push({
              model,
              record_id: existingId,
              previous_values: previous?.[0] || null
            });
            count += 1;
            continue;
          }
        }

        await targetClient.create(model, filteredValues);
      }

      rollbackOperations.created.push({
        model,
        record_id: record.id,
        values: filteredValues
      });
      count += 1;
    }

    return count;
  }

  async executeUpdates(model, records, targetClient, dataPreserver, rollbackOperations, mock) {
    let count = 0;

    for (const record of records) {
      const values = dataPreserver
        ? dataPreserver.prepareUpdateValues(record.source)
        : record.source;
      const filteredValues = await this.filterWritableFields(model, values, targetClient, mock);

      if (!mock && targetClient) {
        if (model === 'account.analytic.account' && filteredValues?.company_id) {
          const companyRef = this.extractCompanyRef(record.source?.company_id, record.source);
          const mappedCompanyId = await this.findCompanyId(targetClient, companyRef);
          if (mappedCompanyId) {
            filteredValues.company_id = mappedCompanyId;
          } else if (companyRef?.name || companyRef?.code) {
            logger.warn(`No matching company found for account.analytic.account (${companyRef.name || companyRef.code}).`);
          }
        }

        await targetClient.write(model, record.id, filteredValues);
      }

      rollbackOperations.updated.push({
        model,
        record_id: record.id,
        previous_values: record.target || null
      });
      count += 1;
    }

    return count;
  }

  async executeDeletes(model, records, targetClient, rollbackOperations, mock) {
    let count = 0;

    if (!mock && targetClient && records.length > 0) {
      const ids = records.map(record => record.id);
      try {
        await targetClient.delete(model, ids);
      } catch (error) {
        const shouldArchive = await this.shouldArchiveOnDeleteError(error, model, targetClient);
        if (!shouldArchive) {
          throw error;
        }

        logger.warn(`Delete blocked for ${model}; archiving ${ids.length} records instead.`);
        await targetClient.write(model, ids, { active: false });
      }
    }

    for (const record of records) {
      rollbackOperations.deleted.push({
        model,
        record_id: record.id,
        values: record.data
      });
      count += 1;
    }

    return count;
  }

  buildMockComparison(model) {
    const deleteBlock = this.disableDeletes
      ? { count: 0, records: [] }
      : {
        count: 1,
        records: [
          { id: 4, data: { id: 4, name: `${model} Removed` } }
        ]
      };

    return {
      model,
      to_create: {
        count: 2,
        records: [
          { id: 1, data: { id: 1, name: `${model} A`, create_date: '2026-01-01', write_date: '2026-01-02' } },
          { id: 2, data: { id: 2, name: `${model} B`, create_date: '2026-01-01', write_date: '2026-01-02' } }
        ]
      },
      to_update: {
        count: 1,
        records: [
          {
            id: 3,
            source: { id: 3, name: `${model} Updated`, create_date: '2026-01-01', write_date: '2026-01-03' },
            target: { id: 3, name: `${model} Old`, create_date: '2026-01-01', write_date: '2026-01-02' },
            differences: { name: { source: 'Updated', target: 'Old' } }
          }
        ]
      },
      to_delete: deleteBlock,
      conflicts: []
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async filterWritableFields(model, values, targetClient, mock) {
    if (mock || !targetClient || !values || typeof values !== 'object') {
      return values;
    }

    const writableFields = await this.getWritableFields(targetClient, model);
    if (!writableFields || writableFields.size === 0) {
      return values;
    }

    const filtered = {};
    for (const [key, value] of Object.entries(values)) {
      if (writableFields.has(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  async getWritableFields(targetClient, model) {
    if (this.modelFieldCache.has(model)) {
      return this.modelFieldCache.get(model);
    }

    try {
      const fields = await targetClient.getModelFields(model);
      const writable = new Set(
        Object.entries(fields || {})
          .filter(([, meta]) => !meta?.readonly)
          .map(([name]) => name)
      );
      this.modelFieldCache.set(model, writable);
      return writable;
    } catch (error) {
      logger.warn(`Failed to load fields for ${model}: ${error.message}`);
      this.modelFieldCache.set(model, null);
      return null;
    }
  }

  async getModelFieldNames(targetClient, model) {
    if (this.modelFieldNames.has(model)) {
      return this.modelFieldNames.get(model);
    }

    const fields = await targetClient.getModelFields(model);
    const names = new Set(Object.keys(fields || {}));
    this.modelFieldNames.set(model, names);
    return names;
  }

  extractCompanyRef(companyValue, record) {
    let name = null;
    let code = null;

    if (Array.isArray(companyValue) && companyValue.length >= 2 && typeof companyValue[1] === 'string') {
      name = companyValue[1];
    } else if (typeof companyValue === 'string') {
      name = companyValue;
    } else if (companyValue && typeof companyValue === 'object') {
      name = companyValue.name || companyValue.display_name || null;
      code = companyValue.code || companyValue.company_code || null;
    }

    if (!code) {
      code = record?.company_code || record?.company_id_code || null;
    }

    return { name, code };
  }

  async findCompanyId(targetClient, companyRef) {
    if (!targetClient || (!companyRef?.name && !companyRef?.code)) {
      return null;
    }

    if (companyRef.name) {
      const ids = await targetClient.search('res.company', [['name', '=', companyRef.name]], 0, 1);
      if (ids.length > 0) {
        return ids[0];
      }
    }

    if (companyRef.code) {
      const fieldNames = await this.getModelFieldNames(targetClient, 'res.company');
      let field = null;
      if (fieldNames.has('code')) {
        field = 'code';
      } else if (fieldNames.has('company_code')) {
        field = 'company_code';
      }

      if (field) {
        const ids = await targetClient.search('res.company', [[field, '=', companyRef.code]], 0, 1);
        if (ids.length > 0) {
          return ids[0];
        }
      }
    }

    return null;
  }

  isAccessDeniedError(error) {
    const name = error?.details?.data?.name || '';
    const message = error?.details?.data?.message || error?.message || '';
    return name === 'odoo.exceptions.AccessError'
      || /not allowed to access/i.test(message);
  }

  isArchiveSuggestedError(error) {
    const message = error?.details?.data?.message || error?.message || '';
    return /archive it instead/i.test(message)
      || /requires the record being deleted/i.test(message)
      || /foreign key constraint/i.test(message);
  }

  async shouldArchiveOnDeleteError(error, model, targetClient) {
    if (!this.isArchiveSuggestedError(error)) {
      return false;
    }

    const writableFields = await this.getWritableFields(targetClient, model);
    return !!(writableFields && writableFields.has('active'));
  }

  /**
   * Detect if records have a conflict (both modified)
   */
  detectConflict(sourceRecord, targetRecord, diff) {
    // Simple heuristic: if both have different write dates, it's a conflict
    if (sourceRecord.write_date && targetRecord.write_date) {
      const sourceDate = new Date(sourceRecord.write_date);
      const targetDate = new Date(targetRecord.write_date);

      // If both were recently modified, consider it a conflict
      if (sourceDate.getTime() !== targetDate.getTime()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compare values for equality
   */
  valuesEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    // Compare arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.valuesEqual(val, b[idx]));
    }

    // Compare objects
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.valuesEqual(a[key], b[key]));
    }

    return false;
  }
}

export default SyncEngine;
