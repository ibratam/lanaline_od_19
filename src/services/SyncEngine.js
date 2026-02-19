import logger from '../utils/logger.js';
import { ConflictDetector } from './ConflictDetector.js';
import SyncOperationLogger from './SyncOperationLogger.js';

const DEFAULT_EXCLUDED_MODELS = new Set([
  'stock.forecasted_product_product',
  'stock.forecasted_product_template',
  'report.stock.report_stock_rule',
  'stock.warn.insufficient.qty',
  'stock.replenish.mixin',
  'report.stock.report_reception',
  'pos.bus.mixin',
  'pos.load.mixin',
  'report.point_of_sale.report_saledetails',
  'report.point_of_sale.report_invoice',
  'ir.http',
  'pos.payment.method'
]);
const DEFAULT_SAMPLE_FLAG_MODELS = new Set([
  'sale.order',
  'sale.order.line',
  'pos.order',
  'pos.order.line',
  'pos.session',
  'account.move',
  'account.move.line'
]);
export const DEFAULT_ALLOWED_MODELS = new Set([
  'res.partner.title',
  'res.partner.industry',
  'res.partner.category',
  'res.country',
  'res.country.state',
  'pos.config',
  'pos.session',
  'pos.order',
  'pos.order.line',
  'sale.order',
  'sale.order.line',
  'account.move',
  'account.move.line',
  'res.partner',
  'res.partner.bank',
  'product.product',
  'product.template'
]);
const LEGACY_ALLOWED_MODELS = Array.from(DEFAULT_ALLOWED_MODELS);
const DEFAULT_MODEL_ORDER = [
  'res.partner.title',
  'res.partner.industry',
  'res.partner.category',
  'res.country',
  'res.country.state',
  'res.partner',
  'res.partner.bank',
  'product.template',
  'product.product',
  'pos.config',
  'pos.session',
  'pos.order',
  'pos.order.line',
  'sale.order',
  'sale.order.line',
  'account.move',
  'account.move.line'
];

/**
 * Sync Engine Service
 * Core synchronization logic for comparing and syncing records
 */
export class SyncEngine {
  constructor(odooClient, options = {}) {
    this.odooClient = odooClient;
    this.conflictDetector = new ConflictDetector();
    this.modelFieldCache = new Map();
    this.modelFieldNames = new WeakMap();
    this.modelFieldMeta = new Map();
    // Hard-disable deletes to prevent destructive operations.
    this.disableDeletes = true;
    const extraExcluded = Array.isArray(options.excludedModels) ? options.excludedModels : [];
    this.excludedModels = new Set([...DEFAULT_EXCLUDED_MODELS, ...extraExcluded]);
    this.sampleFlagValue = options.sampleFlagValue ?? null;
    const sampleFlagModels = Array.isArray(options.sampleFlagModels)
      ? options.sampleFlagModels
      : Array.from(DEFAULT_SAMPLE_FLAG_MODELS);
    this.sampleFlagModels = new Set(sampleFlagModels);
    const hasAllowedModels = Object.prototype.hasOwnProperty.call(options, 'allowedModels');
    const allowedModels = hasAllowedModels ? options.allowedModels : null;
    this.allowedModels = Array.isArray(allowedModels) && allowedModels.length > 0
      ? new Set(allowedModels)
      : null;
    this.modelOrder = Array.isArray(options.modelOrder) && options.modelOrder.length > 0
      ? options.modelOrder
      : DEFAULT_MODEL_ORDER;
    this.idMapModel = options.idMapModel || null;

    if (this.allowedModels && this.allowedModels.size > 0) {
      logger.info(`SyncEngine allowlist enabled (${this.allowedModels.size} models)`);
    } else if (hasAllowedModels && Array.isArray(allowedModels) && allowedModels.length === 0) {
      logger.warn('SyncEngine allowlist was empty, falling back to syncing all discovered models');
    } else if (!hasAllowedModels) {
      logger.debug(`SyncEngine model allowlist disabled by default; legacy preset size was ${LEGACY_ALLOWED_MODELS.length}`);
    }
  }

  /**
   * Generate preview of synchronization
   * Compares source and target databases, identifies conflicts
   */
  async generatePreview(sourceClient, targetClient, modelFilter = null, companyId = null) {
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
      const selection = await this.getModelSelection(sourceClient, targetClient, modelFilter);
      const models = selection.models;
      preview.summary.total_models = models.length;
      preview.model_selection = selection;

      // Compare each model
      for (const model of models) {
        logger.debug(`Comparing model: ${model}`);

        try {
          const modelComparison = await this.compareModel(
            sourceClient,
            targetClient,
            model,
            { companyId }
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
      syncRunId = null,
      companyId = null,
      sourceDbId = null,
      targetDbId = null,
      incrementalSince = null
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

    const mappingContext = this.getMappingContext(sourceDbId, targetDbId);
    const incrementalCutoff = this.formatOdooDatetime(incrementalSince);
    const models = mock
      ? (Array.isArray(modelFilter) && modelFilter.length > 0 ? modelFilter : ['res.partner'])
      : await this.getModelsToSync(sourceClient, targetClient, modelFilter);

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
          : await this.compareModel(sourceClient, targetClient, model, {
            companyId,
            mappingContext,
            incrementalSince: incrementalCutoff,
            writeMappings: true
          });
        operationLogger.endPhase(compareOpId, 'compare');
        operationLogger.transitionState(compareOpId, 'running', 'completed');
        operationLogger.completeOperation(compareOpId, {
          status: 'completed'
        });
      } catch (error) {
        const accessDenied = this.isAccessDeniedError(error);
        operationLogger.recordError(compareOpId, error);
        operationLogger.endPhase(compareOpId, 'compare');
        operationLogger.transitionState(compareOpId, 'running', accessDenied ? 'skipped' : 'failed');
        operationLogger.completeOperation(compareOpId, {
          status: accessDenied ? 'skipped' : 'failed'
        });
        errors.push({
          error_type: accessDenied ? 'access_denied' : 'sync_error',
          odoo_model: model,
          error_message: error.message,
          stack_trace: error.stack
        });
        if (accessDenied) {
          continue;
        }
        throw error;
      }

      totalRecords += comparison.to_create.count
        + comparison.to_update.count
        + comparison.to_delete.count;

      let skipRemainingOps = false;
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
      let dependencySync = null;
      try {
        const createStart = Date.now();
        dependencySync = {
          sourceClient,
          targetClient,
          dataPreserver,
          rollbackOperations,
          mock,
          companyId,
          mappingContext,
          incrementalSince: incrementalCutoff,
          attemptedModels: new Set(),
          inProgress: new Set()
        };
        createCount = await this.executeCreates(
          model,
          comparison.to_create.records,
          targetClient,
          dataPreserver,
          rollbackOperations,
          mock,
          dependencySync
        );
        createDuration = Date.now() - createStart;
        operationLogger.endPhase(createOpId, 'create', { record_count: createCount });
        operationLogger.transitionState(createOpId, 'running', 'completed');
        createEntry = operationLogger.completeOperation(createOpId, {
          status: 'completed',
          record_count: createCount
        });
      } catch (error) {
        const accessDenied = this.isAccessDeniedError(error);
        operationLogger.recordError(createOpId, error);
        operationLogger.endPhase(createOpId, 'create');
        operationLogger.transitionState(createOpId, 'running', accessDenied ? 'skipped' : 'failed');
        operationLogger.completeOperation(createOpId, {
          status: accessDenied ? 'skipped' : 'failed'
        });
        errors.push({
          error_type: accessDenied ? 'access_denied' : 'sync_error',
          odoo_model: model,
          error_message: error.message,
          stack_trace: error.stack
        });
        if (accessDenied) {
          skipRemainingOps = true;
        } else {
          throw error;
        }
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
      if (!skipRemainingOps) {
        try {
          const updateStart = Date.now();
          updateCount = await this.executeUpdates(
            model,
            comparison.to_update.records,
            targetClient,
            dataPreserver,
            rollbackOperations,
            mock,
            dependencySync
          );
          updateDuration = Date.now() - updateStart;
          operationLogger.endPhase(updateOpId, 'update', { record_count: updateCount });
          operationLogger.transitionState(updateOpId, 'running', 'completed');
          updateEntry = operationLogger.completeOperation(updateOpId, {
            status: 'completed',
            record_count: updateCount
          });
        } catch (error) {
          const accessDenied = this.isAccessDeniedError(error);
          operationLogger.recordError(updateOpId, error);
          operationLogger.endPhase(updateOpId, 'update');
          operationLogger.transitionState(updateOpId, 'running', accessDenied ? 'skipped' : 'failed');
          operationLogger.completeOperation(updateOpId, {
            status: accessDenied ? 'skipped' : 'failed'
          });
          errors.push({
            error_type: accessDenied ? 'access_denied' : 'sync_error',
            odoo_model: model,
            error_message: error.message,
            stack_trace: error.stack
          });
          if (accessDenied) {
            skipRemainingOps = true;
          } else {
            throw error;
          }
        }
      } else {
        operationLogger.endPhase(updateOpId, 'update', { record_count: 0 });
        operationLogger.transitionState(updateOpId, 'running', 'skipped');
        updateEntry = operationLogger.completeOperation(updateOpId, {
          status: 'skipped',
          record_count: 0
        });
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
        if (!skipRemainingOps) {
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
            const accessDenied = this.isAccessDeniedError(error);
            operationLogger.recordError(deleteOpId, error);
            operationLogger.endPhase(deleteOpId, 'delete');
            operationLogger.transitionState(deleteOpId, 'running', accessDenied ? 'skipped' : 'failed');
            operationLogger.completeOperation(deleteOpId, {
              status: accessDenied ? 'skipped' : 'failed'
            });
            errors.push({
              error_type: accessDenied ? 'access_denied' : 'sync_error',
              odoo_model: model,
              error_message: error.message,
              stack_trace: error.stack
            });
            if (!accessDenied) {
              throw error;
            }
          }
        } else {
          operationLogger.endPhase(deleteOpId, 'delete', { record_count: 0 });
          operationLogger.transitionState(deleteOpId, 'running', 'skipped');
          deleteEntry = operationLogger.completeOperation(deleteOpId, {
            status: 'skipped',
            record_count: 0
          });
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
        status: createEntry?.status || (skipRemainingOps ? 'skipped' : 'completed'),
        phase_timings: { create_ms: createDuration },
        state_transitions: createEntry?.state_transitions || []
      });
      operations.push({
        odoo_model: model,
        operation_type: 'update',
        record_count: updateCount,
        duration_ms: updateDuration,
        status: updateEntry?.status || (skipRemainingOps ? 'skipped' : 'completed'),
        phase_timings: { update_ms: updateDuration },
        state_transitions: updateEntry?.state_transitions || []
      });
      operations.push({
        odoo_model: model,
        operation_type: 'delete',
        record_count: deleteCount,
        duration_ms: deleteDuration,
        status: this.disableDeletes ? 'skipped' : (deleteEntry?.status || (skipRemainingOps ? 'skipped' : 'completed')),
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
  async getModelsToSync(sourceClient, targetClient = null, modelFilter = null) {
    try {
      const normalized = this.normalizeModelSelectionArgs(targetClient, modelFilter);
      const normalizedTargetClient = normalized.targetClient;
      const normalizedModelFilter = normalized.modelFilter;

      // Get all available models
      const allModelsRaw = await sourceClient.getModels();
      const allModels = Array.isArray(allModelsRaw) ? allModelsRaw : [];
      const allModelNames = new Set(
        allModels
          .map(m => m.model)
          .filter(m => m && !m.startsWith('_'))
      );
      let targetModelNames = null;
      if (normalizedTargetClient) {
        const targetModelsRaw = await normalizedTargetClient.getModels();
        const targetModels = Array.isArray(targetModelsRaw) ? targetModelsRaw : [];
        targetModelNames = new Set(
          targetModels
            .map(m => m.model)
            .filter(m => m && !m.startsWith('_'))
        );
      }

      if (!normalizedModelFilter || !Array.isArray(normalizedModelFilter) || normalizedModelFilter.length === 0) {
        const models = Array.from(allModelNames).filter(name => (
          targetModelNames ? targetModelNames.has(name) : true
        ));
        const { models: allowed } = this.filterAllowedModels(models);
        const ordered = this.orderModels(allowed);
        const { models: filtered, excluded } = this.filterExcludedModels(ordered);
        if (excluded.length > 0) {
          logger.info(`Excluded models: ${excluded.length}`);
        }
        logger.info(`Models to sync: ${filtered.length}`);
        return filtered;
      }

      const { models: modelNames, modules } = this.parseModelFilter(normalizedModelFilter);
      const selectedModels = new Set();
      modelNames.forEach(name => selectedModels.add(name));

      for (const moduleName of modules) {
        const moduleModels = await sourceClient.getModelsByModule(moduleName);
        moduleModels.forEach(item => {
          if (item?.model) {
            selectedModels.add(item.model);
          }
        });
      }

      const models = Array.from(selectedModels).filter(name => (
        allModelNames.has(name) && (targetModelNames ? targetModelNames.has(name) : true)
      ));
      const { models: allowed } = this.filterAllowedModels(models);
      const ordered = this.orderModels(allowed);
      const { models: filtered, excluded } = this.filterExcludedModels(ordered);
      if (excluded.length > 0) {
        logger.info(`Excluded models: ${excluded.length}`);
      }

      logger.info(`Models to sync: ${filtered.length}`);
      return filtered;
    } catch (error) {
      logger.error('Error getting models:', error);
      throw error;
    }
  }

  async getModelSelection(sourceClient, targetClient = null, modelFilter = null) {
    const normalized = this.normalizeModelSelectionArgs(targetClient, modelFilter);
    const normalizedTargetClient = normalized.targetClient;
    const normalizedModelFilter = normalized.modelFilter;

    const sourceModelsRaw = await sourceClient.getModels();
    const sourceModels = Array.isArray(sourceModelsRaw) ? sourceModelsRaw : [];
    const sourceModelNames = new Set(
      sourceModels
        .map(m => m.model)
        .filter(m => m && !m.startsWith('_'))
    );

    let targetModelNames = null;
    if (normalizedTargetClient) {
      const targetModelsRaw = await normalizedTargetClient.getModels();
      const targetModels = Array.isArray(targetModelsRaw) ? targetModelsRaw : [];
      targetModelNames = new Set(
        targetModels
          .map(m => m.model)
          .filter(m => m && !m.startsWith('_'))
      );
    }

    if (!normalizedModelFilter || !Array.isArray(normalizedModelFilter) || normalizedModelFilter.length === 0) {
      const models = Array.from(sourceModelNames).filter(name => (
        targetModelNames ? targetModelNames.has(name) : true
      ));
      const { models: allowed } = this.filterAllowedModels(models);
      const ordered = this.orderModels(allowed);
      const { models: filtered, excluded } = this.filterExcludedModels(ordered);
      return {
        models: filtered,
        missing_on_source: [],
        missing_on_target: [],
        excluded_models: excluded
      };
    }

    const { models: modelNames, modules } = this.parseModelFilter(normalizedModelFilter);
    const desiredModels = new Set();

    modelNames.forEach(name => {
      if (name && !name.startsWith('_')) {
        desiredModels.add(name);
      }
    });

    for (const moduleName of modules) {
      const moduleModels = await sourceClient.getModelsByModule(moduleName);
      moduleModels.forEach(item => {
        if (item?.model && !item.model.startsWith('_')) {
          desiredModels.add(item.model);
        }
      });
    }

    const desiredList = Array.from(desiredModels);
    const { models: allowedDesired } = this.filterAllowedModels(desiredList);
    const ordered = this.orderModels(allowedDesired);
    const { models: filteredDesired, excluded: excludedModels } = this.filterExcludedModels(ordered);
    const missingOnSource = filteredDesired.filter(name => !sourceModelNames.has(name));
    const missingOnTarget = targetModelNames
      ? filteredDesired.filter(name => !targetModelNames.has(name))
      : [];
    const models = filteredDesired.filter(name => (
      sourceModelNames.has(name) && (targetModelNames ? targetModelNames.has(name) : true)
    ));

    return {
      models,
      missing_on_source: missingOnSource,
      missing_on_target: missingOnTarget,
      excluded_models: excludedModels
    };
  }

  isExcludedModel(name) {
    return this.excludedModels.has(name);
  }

  filterExcludedModels(models) {
    const excluded = [];
    const filtered = models.filter(model => {
      const isExcluded = this.isExcludedModel(model);
      if (isExcluded) {
        excluded.push(model);
      }
      return !isExcluded;
    });
    return { models: filtered, excluded };
  }

  filterAllowedModels(models) {
    if (!this.allowedModels || this.allowedModels.size === 0) {
      return { models: [...models] };
    }
    const filtered = models.filter(model => this.allowedModels.has(model));
    return { models: filtered };
  }

  normalizeModelSelectionArgs(targetClient, modelFilter) {
    if (Array.isArray(targetClient) && (modelFilter === null || modelFilter === undefined)) {
      return {
        targetClient: null,
        modelFilter: targetClient
      };
    }

    if (targetClient && typeof targetClient.getModels !== 'function') {
      return {
        targetClient: null,
        modelFilter
      };
    }

    return {
      targetClient,
      modelFilter
    };
  }

  orderModels(models) {
    const orderIndex = new Map(this.modelOrder.map((name, idx) => [name, idx]));
    const withIndex = models.map((name, idx) => ({
      name,
      priority: orderIndex.has(name) ? orderIndex.get(name) : Number.MAX_SAFE_INTEGER,
      idx
    }));
    withIndex.sort((a, b) => a.priority - b.priority || a.idx - b.idx);
    return withIndex.map(item => item.name);
  }

  parseModelFilter(modelFilter) {
    const models = [];
    const modules = [];

    for (const entry of modelFilter) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith('module:')) {
        const moduleName = trimmed.slice('module:'.length).trim();
        if (moduleName) {
          modules.push(moduleName);
        }
        continue;
      }
      if (trimmed.includes('.')) {
        models.push(trimmed);
      } else {
        modules.push(trimmed);
      }
    }

    return { models, modules };
  }

  /**
   * Compare a single model between source and target
   */
  async compareModel(sourceClient, targetClient, model, options = {}) {
    const {
      companyId = null,
      mappingContext = null,
      incrementalSince = null,
      writeMappings = false
    } = options || {};
    try {
      logger.debug(`Comparing model: ${model}`);

      const sourceDomain = await this.getModelDomain(sourceClient, model, companyId);
      const targetDomain = await this.getModelDomain(targetClient, model, companyId);
      const comparisonFields = await this.getComparisonFields(sourceClient, targetClient, model);
      const matchStats = {
        mapped: 0,
        business_key: 0,
        id: 0,
        create: 0
      };

      const useWindowedIncremental = await this.shouldUseWindowedIncremental(sourceClient, model, incrementalSince);
      if (!useWindowedIncremental && incrementalSince) {
        const sourceFieldNames = await this.getModelFieldNames(sourceClient, model);
        if (sourceFieldNames.has('write_date')) {
          sourceDomain.push(['write_date', '>', incrementalSince]);
        }
      }

      // Get full record data with paging to reduce memory and RPC payloads
      const sourceData = useWindowedIncremental
        ? await this.fetchWindowedRecords(sourceClient, model, sourceDomain, comparisonFields, incrementalSince)
        : await sourceClient.searchReadAll(model, sourceDomain, comparisonFields);
      logger.debug(`Source: ${sourceData.length} records in ${model}`);

      let targetData = [];
      if (incrementalSince) {
        const targetMode = String(process.env.ODOO_INCREMENTAL_TARGET_MODE || 'full').toLowerCase();
        if (targetMode === 'ids') {
          const sourceIds = sourceData.map(record => record.id).filter(id => Number.isInteger(id) && id > 0);
          targetData = sourceIds.length > 0
            ? await targetClient.read(model, sourceIds, comparisonFields)
            : [];
        } else if (targetMode === 'window') {
          targetData = await this.fetchWindowedRecords(targetClient, model, targetDomain, comparisonFields, incrementalSince);
        } else {
          targetData = await targetClient.searchReadAll(model, targetDomain, comparisonFields);
        }
      } else {
        targetData = await targetClient.searchReadAll(model, targetDomain, comparisonFields);
      }
      logger.debug(`Target: ${targetData.length} records in ${model}`);
      logger.debug(`Domains for ${model}: source=${JSON.stringify(sourceDomain)} target=${JSON.stringify(targetDomain)}`);
      if (process.env.LOG_COMPARE_STATS === 'true') {
        logger.info(`Domains for ${model}: source=${JSON.stringify(sourceDomain)} target=${JSON.stringify(targetDomain)}`);
      }

      // Convert to maps for easier lookup
      const sourceMap = new Map(sourceData.map(r => [r.id, r]));
      const targetMap = new Map(targetData.map(r => [r.id, r]));
      const targetKeyMap = this.buildTargetKeyMap(model, targetData);
      const matchedTargetIds = new Set();
      const processedTargetIds = new Set();

      const comparison = {
        model,
        to_create: { count: 0, records: [] },
        to_update: { count: 0, records: [] },
        to_delete: { count: 0, records: [] },
        conflicts: []
      };

      // Find records to create / update / conflicts in a single pass
      for (const [id, sourceRecord] of sourceMap) {
        let targetRecord = null;
        let targetId = null;
        let sourceId = id;

        if (mappingContext) {
          const mappedId = this.getMappedTargetId(mappingContext, model, id);
          if (mappedId) {
            targetRecord = targetMap.get(mappedId) || null;
            targetId = targetRecord?.id || null;
            if (targetRecord && writeMappings) {
              this.storeIdMapping(mappingContext, model, id, targetRecord.id);
            }
            if (targetRecord) {
              matchStats.mapped += 1;
            }
          }
        }
        if (!targetRecord) {
          const targetMatch = this.findTargetByBusinessKey(model, sourceRecord, targetKeyMap);
          if (targetMatch) {
            targetRecord = targetMatch;
            targetId = targetMatch.id;
            if (mappingContext && writeMappings) {
              this.storeIdMapping(mappingContext, model, id, targetMatch.id);
            }
            matchStats.business_key += 1;
          }
        }
        if (!targetRecord) {
          targetRecord = targetMap.get(id) || null;
          targetId = targetRecord?.id || null;
          if (targetRecord && mappingContext && writeMappings) {
            this.storeIdMapping(mappingContext, model, id, targetRecord.id);
          }
          if (targetRecord) {
            matchStats.id += 1;
          }
        }
        if (!targetRecord) {
          comparison.to_create.records.push({
            id,
            data: sourceRecord
          });
          comparison.to_create.count++;
          matchStats.create += 1;
          continue;
        }

        if (targetRecord) {
          matchedTargetIds.add(targetId);
          if (processedTargetIds.has(targetId)) {
            continue;
          }
          processedTargetIds.add(targetId);
          // Compare records for differences
          const diff = this.compareRecords(sourceRecord, targetRecord);
          if (diff.hasDifferences) {
            // Check if it's a conflict (both have different values)
            const hasConflict = this.detectConflict(sourceRecord, targetRecord, diff);
            if (hasConflict) {
              comparison.conflicts.push({
                record_id: targetId,
                source_id: sourceId,
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
                id: targetId,
                source_id: sourceId,
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
          if (!sourceMap.has(id) && !matchedTargetIds.has(id)) {
            comparison.to_delete.records.push({
              id,
              data: targetRecord
            });
            comparison.to_delete.count++;
          }
        }
      }

      logger.debug(`Model ${model}: creates=${comparison.to_create.count}, updates=${comparison.to_update.count}, deletes=${comparison.to_delete.count}, conflicts=${comparison.conflicts.length}`);
      logger.debug(`Model ${model}: match_stats=${JSON.stringify(matchStats)}`);
      if (process.env.LOG_COMPARE_STATS === 'true') {
        logger.info(`Model ${model}: match_stats=${JSON.stringify(matchStats)}`);
      }

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

  async executeCreates(model, records, targetClient, dataPreserver, rollbackOperations, mock, dependencySync = null) {
    let count = 0;
    const mappingContext = dependencySync?.mappingContext || null;

    for (const record of records) {
      const values = dataPreserver
        ? dataPreserver.prepareCreateValues(record.data)
        : record.data;
      let filteredValues = await this.filterWritableFields(model, values, targetClient, mock);
      if (!mock && targetClient) {
        filteredValues = await this.mapRelationalIdsByBusinessKey(
          model,
          filteredValues,
          targetClient,
          dependencySync?.sourceClient || null,
          mappingContext
        );
      }

      if (!mock && targetClient) {
        if (model === 'product.template' || model === 'product.product') {
          this.stripUserReferences(filteredValues);
          const categoryName = this.extractDisplayName(record.data?.categ_id)
            || this.extractDisplayName(filteredValues?.categ_id);
          if (categoryName) {
            let categoryId = await this.findModelIdByName(targetClient, 'product.category', categoryName);
            if (!categoryId) {
              categoryId = await targetClient.create('product.category', { name: categoryName });
            }
            filteredValues.categ_id = categoryId;
          }

          if (model === 'product.template') {
            const barcode = filteredValues?.barcode;
            if (barcode) {
              const existingProductIds = await targetClient.search(
                'product.product',
                [['barcode', '=', barcode]],
                0,
                1
              );
              if (existingProductIds.length > 0) {
                const existingProduct = await targetClient.read(
                  'product.product',
                  existingProductIds[0],
                  ['product_tmpl_id']
                );
                const templateId = existingProduct?.[0]?.product_tmpl_id?.[0];
                if (templateId) {
                  const previous = await targetClient.read(model, templateId, []);
                  logger.info(`Barcode ${barcode} exists; updating ${model} ${templateId} instead of create.`);
                  await targetClient.write(model, templateId, filteredValues);
                  rollbackOperations.updated.push({
                    model,
                    record_id: templateId,
                    previous_values: previous?.[0] || null
                  });
                  this.storeIdMapping(mappingContext, model, record.id, templateId);
                  count += 1;
                  continue;
                }
              }
            }
          }

          if (model === 'product.product') {
            const templateName = this.extractDisplayName(record.data?.product_tmpl_id);
            const templateInfo = { name: templateName || null, barcode: null, default_code: null };
            let templateId = null;

            if (templateInfo.name) {
              templateId = await this.findModelIdByName(targetClient, 'product.template', templateInfo.name);
            }

            if (!templateId) {
              const templateRefId = Array.isArray(record.data?.product_tmpl_id)
                ? record.data.product_tmpl_id[0]
                : record.data?.product_tmpl_id;
              if (templateRefId && dependencySync?.sourceClient) {
                try {
                  const sourceTemplate = await dependencySync.sourceClient.read(
                    'product.template',
                    [templateRefId],
                    ['name', 'barcode', 'default_code']
                  );
                  const sourceData = sourceTemplate?.[0] || {};
                  templateInfo.name = templateInfo.name || sourceData.name || null;
                  templateInfo.barcode = sourceData.barcode || null;
                  templateInfo.default_code = sourceData.default_code || null;
                } catch (error) {
                  logger.warn(`Failed to load product.template ${templateRefId} from source: ${error.message}`);
                }
              }
            }

            if (!templateId) {
              templateId = await this.findProductTemplateId(targetClient, templateInfo);
            }

            if (!templateId && dependencySync) {
              await this.syncModelDependencies(dependencySync, model);
              templateId = await this.findProductTemplateId(targetClient, templateInfo);
            }

            if (templateId) {
              filteredValues.product_tmpl_id = templateId;
            } else {
              logger.warn(`Skipping product.product create: product.template not found for ${filteredValues.default_code || filteredValues.name || record.id}.`);
              continue;
            }

            if (filteredValues.product_tmpl_id) {
              const productFieldNames = await this.getModelFieldNames(targetClient, 'product.product');
              const productDomain = [['product_tmpl_id', '=', filteredValues.product_tmpl_id]];
              if (productFieldNames.has('combination_indices') && filteredValues?.combination_indices) {
                productDomain.push(['combination_indices', '=', filteredValues.combination_indices]);
              }
              const existingProductIds = await targetClient.search(
                'product.product',
                productDomain,
                0,
                1
              );
              if (existingProductIds.length > 0) {
                const existingId = existingProductIds[0];
                const previous = await targetClient.read('product.product', existingId, []);
                logger.info(`Product variant exists; updating product.product ${existingId} instead of create.`);
                await targetClient.write('product.product', existingId, filteredValues);
                rollbackOperations.updated.push({
                  model: 'product.product',
                  record_id: existingId,
                  previous_values: previous?.[0] || null
                });
                this.storeIdMapping(mappingContext, 'product.product', record.id, existingId);
                count += 1;
                continue;
              }
            }
          }
        }

        if (model === 'pos.config') {
          const configName = filteredValues?.name || this.extractDisplayName(record.data?.name);
          if (configName) {
            const existingConfigId = await this.findModelIdByName(targetClient, 'pos.config', configName);
            if (existingConfigId) {
              const previous = await targetClient.read(model, existingConfigId, []);
              logger.info(`POS config ${configName} exists; updating ${model} ${existingConfigId} instead of create.`);
              await targetClient.write(model, existingConfigId, filteredValues);
              rollbackOperations.updated.push({
                model,
                record_id: existingConfigId,
                previous_values: previous?.[0] || null
              });
              this.storeIdMapping(mappingContext, model, record.id, existingConfigId);
              count += 1;
              continue;
            }
          }

          const pickingName = this.extractDisplayName(record.data?.picking_type_id)
            || this.extractDisplayName(filteredValues?.picking_type_id);
          if (pickingName) {
            const targetPickingId = await this.findModelIdByName(
              targetClient,
              'stock.picking.type',
              pickingName
            );
            if (targetPickingId) {
              filteredValues.picking_type_id = targetPickingId;
            } else {
              logger.warn(`Skipping pos.config create: picking type not found (${pickingName}).`);
              continue;
            }
          } else if (filteredValues?.picking_type_id) {
            logger.warn('Skipping pos.config create: picking type name missing.');
            continue;
          }
        }

        if (model === 'pos.session') {
          const configName = this.extractDisplayName(filteredValues?.config_id);
          if (configName) {
            const targetConfigId = await this.findModelIdByName(targetClient, 'pos.config', configName);
            if (targetConfigId) {
              filteredValues.config_id = targetConfigId;
            } else {
              logger.warn(`Skipping pos.session create: config not found (${configName}).`);
              continue;
            }
          }
        }

        if (model === 'pos.order') {
          const sessionName = this.extractDisplayName(filteredValues?.session_id);
          const configName = this.extractDisplayName(filteredValues?.config_id);
          let targetConfigId = null;
          let targetSessionId = null;

          if (configName) {
            targetConfigId = await this.findModelIdByName(targetClient, 'pos.config', configName);
          }
          if (sessionName && targetConfigId) {
            targetSessionId = await this.findPosSessionId(targetClient, sessionName, targetConfigId);
          }

          if (!targetSessionId) {
            logger.warn(`Skipping pos.order create: session not found (${sessionName || 'unknown'}).`);
            continue;
          }

          filteredValues.session_id = targetSessionId;
          if (targetConfigId) {
            filteredValues.config_id = targetConfigId;
          }
        }

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
          const code = filteredValues.code;
          const companyId = this.extractCompanyId(filteredValues.company_id);
          let existingIds = [];
          let matchedCompany = false;

          if (companyId) {
            existingIds = await targetClient.search(
              model,
              [['code', '=', code], ['company_id', '=', companyId]],
              0,
              1
            );
            matchedCompany = existingIds.length > 0;
          }

          if (existingIds.length === 0) {
            existingIds = await targetClient.search(model, [['code', '=', code]], 0, 1);
          }

          if (existingIds.length > 0) {
            const existingId = existingIds[0];
            const previous = await targetClient.read(model, existingId, []);
            const updateValues = { ...filteredValues };
            if (!matchedCompany) {
              delete updateValues.company_id;
            }
            logger.info(`Account code ${code} exists; updating ${model} ${existingId} instead of create.`);
            await targetClient.write(model, existingId, updateValues);
            rollbackOperations.updated.push({
              model,
              record_id: existingId,
              previous_values: previous?.[0] || null
            });
            this.storeIdMapping(mappingContext, model, record.id, existingId);
            count += 1;
            continue;
          }
        }

        if (model === 'sale.order') {
          const partnerFields = ['partner_id', 'partner_invoice_id', 'partner_shipping_id'];
          let skipCreate = false;
          for (const field of partnerFields) {
            if (!filteredValues?.[field]) {
              continue;
            }
            let partnerId = await this.resolvePartnerId(
              targetClient,
              dependencySync?.sourceClient || null,
              filteredValues[field]
            );
            if (!partnerId && dependencySync) {
              await this.syncModelDependencies(dependencySync, model);
              partnerId = await this.resolvePartnerId(
                targetClient,
                dependencySync.sourceClient || null,
                filteredValues[field]
              );
            }
            if (partnerId) {
              filteredValues[field] = partnerId;
            } else {
              logger.warn(`Skipping sale.order create: ${field} not found (${this.extractDisplayName(filteredValues[field]) || 'unknown'}).`);
              skipCreate = true;
              break;
            }
          }
          if (skipCreate) {
            continue;
          }

          if (filteredValues?.user_id) {
            let userId = await this.resolveUserId(
              targetClient,
              dependencySync?.sourceClient || null,
              filteredValues.user_id
            );
            if (!userId && dependencySync) {
              await this.syncModelDependencies(dependencySync, model);
              userId = await this.resolveUserId(
                targetClient,
                dependencySync.sourceClient || null,
                filteredValues.user_id
              );
            }
            if (!userId) {
              userId = await this.findFallbackUserId(targetClient);
              if (userId) {
                logger.warn(`Salesperson not found; assigning fallback user ${userId} for sale.order.`);
              }
            }
            if (userId) {
              filteredValues.user_id = userId;
            } else {
              logger.warn(`Skipping sale.order create: user_id not found (${this.extractDisplayName(filteredValues.user_id) || 'unknown'}).`);
              continue;
            }
          }
        }

        if (model === 'res.partner') {
          const countryId = await this.resolveCountryId(
            targetClient,
            dependencySync?.sourceClient || null,
            filteredValues?.country_id
          );
          if (countryId) {
            filteredValues.country_id = countryId;
          }

          if (filteredValues?.state_id) {
            let stateId = await this.resolveStateId(
              targetClient,
              dependencySync?.sourceClient || null,
              filteredValues.state_id,
              filteredValues?.country_id
            );
            if (!stateId && dependencySync) {
              await this.syncModelDependencies(dependencySync, model);
              stateId = await this.resolveStateId(
                targetClient,
                dependencySync.sourceClient || null,
                filteredValues.state_id,
                filteredValues?.country_id
              );
            }
            if (stateId) {
              filteredValues.state_id = stateId;
            } else {
              logger.warn(`Skipping res.partner create: state_id not found (${this.extractDisplayName(filteredValues.state_id) || 'unknown'}).`);
              continue;
            }
          }
        }

        if (model === 'account.account') {
          const companyId = this.extractCompanyId(filteredValues?.company_id);
          if (!filteredValues?.code || !companyId) {
            logger.warn('Skipping account.account create: missing code or company_id.');
            continue;
          }
        }

        const mappedTargetId = this.getMappedTargetId(mappingContext, model, record.id);
        if (mappedTargetId) {
          const previous = await targetClient.read(model, mappedTargetId, []);
          logger.info(`Mapped ${model} ${record.id} to ${mappedTargetId}; updating instead of create.`);
          await targetClient.write(model, mappedTargetId, filteredValues);
          rollbackOperations.updated.push({
            model,
            record_id: mappedTargetId,
            previous_values: previous?.[0] || null
          });
          this.storeIdMapping(mappingContext, model, record.id, mappedTargetId);
          count += 1;
          continue;
        }

        try {
          const createdId = await targetClient.create(model, filteredValues);
          this.storeIdMapping(mappingContext, model, record.id, createdId);
        } catch (error) {
          if (model === 'account.account' && filteredValues?.code) {
            const existingIds = await targetClient.search(model, [['code', '=', filteredValues.code]], 0, 1);
            if (existingIds.length > 0) {
              const existingId = existingIds[0];
              const previous = await targetClient.read(model, existingId, []);
              const updateValues = { ...filteredValues };
              delete updateValues.company_id;
              delete updateValues.company_ids;
              logger.info(`Account code ${filteredValues.code} exists; updating ${model} ${existingId} after create error.`);
              await targetClient.write(model, existingId, updateValues);
              rollbackOperations.updated.push({
                model,
                record_id: existingId,
                previous_values: previous?.[0] || null
              });
              this.storeIdMapping(mappingContext, model, record.id, existingId);
              count += 1;
              continue;
            }
          }
          if (dependencySync && this.shouldRetryAfterDependencySync(error)) {
            const retryKey = `${model}`;
            if (!dependencySync.attemptedModels.has(retryKey)) {
              dependencySync.attemptedModels.add(retryKey);
              await this.syncModelDependencies(dependencySync, model);
              const createdId = await targetClient.create(model, filteredValues);
              this.storeIdMapping(mappingContext, model, record.id, createdId);
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
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

  isAccountCompanyCodeError(error) {
    const message = error?.details?.data?.arguments?.[0] || error?.message || '';
    return String(message).toLowerCase().includes('code must be set for every company');
  }

  shouldRetryAfterDependencySync(error) {
    const name = error?.details?.data?.name || '';
    if (name === 'odoo.exceptions.ValidationError') {
      return true;
    }
    if (name === 'odoo.exceptions.MissingError') {
      return true;
    }
    if (name === 'odoo.exceptions.UserError') {
      return true;
    }
    const message = error?.details?.data?.message || error?.message || '';
    return /missing/i.test(message) || /must be set/i.test(message);
  }

  async syncModelDependencies(dependencySync, model) {
    const {
      sourceClient,
      targetClient,
      dataPreserver,
      rollbackOperations,
      mock,
      companyId
    } = dependencySync;

    if (!sourceClient || !targetClient) {
      return;
    }

    if (dependencySync.inProgress.has(model)) {
      return;
    }

    dependencySync.inProgress.add(model);

    try {
      const fields = await sourceClient.getModelFields(model);
      const dependencies = Object.values(fields || {})
        .filter(field => field?.type === 'many2one' && typeof field?.comodel_name === 'string')
        .map(field => field.comodel_name)
        .filter(dep => dep && dep !== model && !dep.startsWith('_'));

      if (dependencies.length === 0) {
        return;
      }

      const selection = await this.getModelSelection(sourceClient, targetClient, dependencies);
      const modelsToSync = selection.models.filter(dep => dep !== model);

      for (const depModel of modelsToSync) {
        try {
          const comparison = await this.compareModel(
            sourceClient,
            targetClient,
            depModel,
            {
              companyId,
              mappingContext: dependencySync.mappingContext,
              incrementalSince: dependencySync.incrementalSince,
              writeMappings: true
            }
          );
          await this.executeCreates(
            depModel,
            comparison.to_create.records,
            targetClient,
            dataPreserver,
            rollbackOperations,
            mock,
            dependencySync
          );
          await this.executeUpdates(
            depModel,
            comparison.to_update.records,
            targetClient,
            dataPreserver,
            rollbackOperations,
            mock,
            dependencySync
          );
        } catch (error) {
          if (!this.isAccessDeniedError(error)) {
            logger.warn(`Dependency sync failed for ${depModel}: ${error.message}`);
          }
        }
      }
    } finally {
      dependencySync.inProgress.delete(model);
    }
  }

  async executeUpdates(model, records, targetClient, dataPreserver, rollbackOperations, mock, dependencySync = null) {
    let count = 0;
    const mappingContext = dependencySync?.mappingContext || null;

    for (const record of records) {
      const values = dataPreserver
        ? dataPreserver.prepareUpdateValues(record.source)
        : record.source;
      let filteredValues = await this.filterWritableFields(model, values, targetClient, mock);
      if (!mock && targetClient) {
        filteredValues = await this.mapRelationalIdsByBusinessKey(
          model,
          filteredValues,
          targetClient,
          dependencySync?.sourceClient || null,
          mappingContext
        );
      }
      const sourceId = record.source_id || record.id;

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
      this.storeIdMapping(mappingContext, model, sourceId, record.id);
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
    if (!targetClient) {
      return new Set();
    }

    let clientCache = this.modelFieldNames.get(targetClient);
    if (!clientCache) {
      clientCache = new Map();
      this.modelFieldNames.set(targetClient, clientCache);
    }

    if (clientCache.has(model)) {
      return clientCache.get(model);
    }

    const fields = await targetClient.getModelFields(model);
    const names = new Set(Object.keys(fields || {}));
    clientCache.set(model, names);
    return names;
  }

  async getModelFieldMeta(targetClient, model) {
    if (!targetClient) {
      return null;
    }
    if (this.modelFieldMeta.has(model)) {
      return this.modelFieldMeta.get(model);
    }
    const fields = await targetClient.getModelFields(model);
    this.modelFieldMeta.set(model, fields || null);
    return fields || null;
  }

  getBusinessKeyFieldNames(model) {
    switch (model) {
      case 'product.template':
        return ['barcode', 'default_code', 'name'];
      case 'product.product':
        return ['barcode', 'default_code', 'product_tmpl_id', 'combination_indices'];
      case 'res.partner':
        return ['email', 'vat', 'ref', 'name'];
      case 'sale.order.line':
      case 'pos.order.line':
        return ['order_id', 'product_id', 'name'];
      case 'sale.order':
      case 'pos.order':
      case 'pos.config':
      case 'res.partner.category':
      case 'res.partner.industry':
      case 'res.partner.title':
        return ['name'];
      case 'pos.session':
        return ['name', 'config_id'];
      case 'res.users':
        return ['login', 'email', 'name'];
      case 'res.country':
        return ['code', 'name'];
      case 'res.country.state':
        return ['code', 'name', 'country_id'];
      default:
        return ['name'];
    }
  }

  async getComparisonFields(sourceClient, targetClient, model) {
    if (!sourceClient || !targetClient) {
      return [];
    }

    try {
      const [sourceFieldNames, targetFieldNames] = await Promise.all([
        this.getModelFieldNames(sourceClient, model),
        this.getModelFieldNames(targetClient, model)
      ]);

      const writableFields = await this.getWritableFields(targetClient, model);
      const fields = new Set([
        'id',
        'create_date',
        'write_date',
        '__last_update'
      ]);

      let allowedFields = null;
      if (model === 'res.partner' && process.env.ODOO_RES_PARTNER_FIELDS) {
        allowedFields = new Set(
          String(process.env.ODOO_RES_PARTNER_FIELDS)
            .split(',')
            .map(field => field.trim())
            .filter(Boolean)
        );
      }

      if (writableFields) {
        for (const field of writableFields) {
          if (!allowedFields || allowedFields.has(field)) {
            fields.add(field);
          }
        }
      }

      for (const field of this.getBusinessKeyFieldNames(model)) {
        if (!allowedFields || allowedFields.has(field)) {
          fields.add(field);
        }
      }

      const intersection = [];
      for (const field of fields) {
        if (sourceFieldNames.has(field) && targetFieldNames.has(field)) {
          intersection.push(field);
        }
      }

      return intersection;
    } catch (error) {
      logger.warn(`Failed to determine comparison fields for ${model}: ${error.message}`);
      return [];
    }
  }

  async shouldUseWindowedIncremental(client, model, incrementalSince) {
    if (!client || !incrementalSince) {
      return false;
    }
    const windowMinutes = Number(process.env.ODOO_WRITE_DATE_WINDOW_MINUTES);
    if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
      return false;
    }
    const fieldNames = await this.getModelFieldNames(client, model);
    return fieldNames.has('write_date');
  }

  async fetchWindowedRecords(client, model, baseDomain, fields, incrementalSince) {
    const windowMinutes = Number(process.env.ODOO_WRITE_DATE_WINDOW_MINUTES);
    if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
      return client.searchReadAll(model, baseDomain, fields);
    }

    const start = new Date(incrementalSince);
    if (Number.isNaN(start.getTime())) {
      return client.searchReadAll(model, baseDomain, fields);
    }

    const end = new Date();
    const windowMs = windowMinutes * 60 * 1000;
    const records = [];
    let cursor = new Date(start);

    while (cursor.getTime() < end.getTime()) {
      const windowEnd = new Date(Math.min(cursor.getTime() + windowMs, end.getTime()));
      const domain = [
        ...baseDomain,
        ['write_date', '>=', this.formatOdooDatetime(cursor)],
        ['write_date', '<', this.formatOdooDatetime(windowEnd)]
      ];
      const batch = await client.searchReadAll(model, domain, fields);
      if (Array.isArray(batch) && batch.length > 0) {
        records.push(...batch);
      }
      cursor = windowEnd;
    }

    return records;
  }

  async getModelDomain(client, model, companyId) {
    if (!client) {
      return [];
    }

    const domain = [];
    try {
      const fields = await client.getModelFields(model);
      const fieldNames = new Set(Object.keys(fields || {}));
      if (companyId && fieldNames.has('company_id')) {
        domain.push(['company_id', '=', companyId]);
      }
      if (this.sampleFlagModels.has(model)
        && fieldNames.has('x_studio_sample_flag')
        && this.sampleFlagValue !== null
        && this.sampleFlagValue !== undefined
      ) {
        domain.push(['x_studio_sample_flag', '=', this.normalizeSampleFlagValue(this.sampleFlagValue)]);
      }
    } catch (error) {
      logger.warn(`Failed to detect domain filters for ${model}: ${error.message}`);
    }

    return domain;
  }

  normalizeSampleFlagValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      return null;
    }
    const lowered = trimmed.toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  formatOdooDatetime(value) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  extractCompanyId(value) {
    if (!value) {
      return null;
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    if (typeof value === 'object') {
      return value.id || null;
    }
    return value;
  }

  stripUserReferences(values) {
    if (!values || typeof values !== 'object') {
      return;
    }
    const userFields = [
      'create_uid',
      'write_uid',
      'responsible_id',
      'product_manager',
      'user_id',
      'salesperson_id'
    ];
    userFields.forEach(field => {
      if (field in values) {
        delete values[field];
      }
    });
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

  extractDisplayName(value) {
    if (!value) {
      return null;
    }
    if (Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string') {
      return value[1];
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      return value.name || value.display_name || null;
    }
    return null;
  }

  normalizeKeyValue(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (Array.isArray(value)) {
      if (value.length >= 2 && typeof value[1] === 'string') {
        return value[1];
      }
      return value[0] || null;
    }
    if (typeof value === 'object') {
      return value.name || value.display_name || value.id || null;
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    return String(value);
  }

  getBusinessKeyCandidates(model, record) {
    if (!record || typeof record !== 'object') {
      return [];
    }
    const keys = [];
    const addKey = (name, value) => {
      const normalized = this.normalizeKeyValue(value);
      if (normalized) {
        keys.push(`${name}:${String(normalized).toLowerCase()}`);
      }
    };
    const addCompositeKey = (name, parts) => {
      const normalizedParts = parts
        .map(part => this.normalizeKeyValue(part))
        .filter(Boolean)
        .map(part => String(part).toLowerCase());
      if (normalizedParts.length === parts.length) {
        keys.push(`${name}:${normalizedParts.join('|')}`);
      }
    };

    switch (model) {
      case 'product.template':
        addKey('barcode', record.barcode);
        addKey('default_code', record.default_code);
        addKey('name', record.name);
        break;
      case 'product.product':
        addKey('barcode', record.barcode);
        addKey('default_code', record.default_code);
        addCompositeKey(
          'template_combo',
          [this.extractDisplayName(record.product_tmpl_id), record.combination_indices]
        );
        break;
      case 'res.partner':
        addKey('email', record.email);
        addKey('vat', record.vat);
        addKey('ref', record.ref);
        addKey('name', record.name);
        break;
      case 'sale.order.line':
      case 'pos.order.line':
        addCompositeKey('order_product', [
          this.extractDisplayName(record.order_id),
          this.extractDisplayName(record.product_id),
          record.name
        ]);
        break;
      case 'sale.order':
      case 'pos.order':
      case 'pos.config':
      case 'res.partner.category':
      case 'res.partner.industry':
      case 'res.partner.title':
        addKey('name', record.name);
        break;
      case 'pos.session':
        addCompositeKey('name_config', [record.name, this.extractDisplayName(record.config_id)]);
        break;
      case 'res.users':
        addKey('login', record.login);
        addKey('email', record.email);
        addKey('name', record.name);
        break;
      case 'res.country':
        addKey('code', record.code);
        addKey('name', record.name);
        break;
      case 'res.country.state':
        addCompositeKey('code_country', [record.code, this.extractDisplayName(record.country_id)]);
        addCompositeKey('name_country', [record.name, this.extractDisplayName(record.country_id)]);
        break;
      default:
        addKey('name', record.name);
        break;
    }

    return keys;
  }

  buildTargetKeyMap(model, records) {
    const keyMap = new Map();
    for (const record of records || []) {
      const keys = this.getBusinessKeyCandidates(model, record);
      for (const key of keys) {
        if (!keyMap.has(key)) {
          keyMap.set(key, record);
        }
      }
    }
    return keyMap;
  }

  findTargetByBusinessKey(model, sourceRecord, targetKeyMap) {
    if (!targetKeyMap || targetKeyMap.size === 0) {
      return null;
    }
    const keys = this.getBusinessKeyCandidates(model, sourceRecord);
    for (const key of keys) {
      const match = targetKeyMap.get(key);
      if (match) {
        return match;
      }
    }
    return null;
  }

  getMappingContext(sourceDbId, targetDbId) {
    if (!this.idMapModel) {
      return null;
    }
    if (!Number.isInteger(sourceDbId) || !Number.isInteger(targetDbId)) {
      return null;
    }
    return { sourceDbId, targetDbId };
  }

  getMappedTargetId(mappingContext, model, sourceId) {
    if (!this.idMapModel || !mappingContext || !model || !sourceId) {
      return null;
    }
    return this.idMapModel.getTargetId(
      mappingContext.sourceDbId,
      mappingContext.targetDbId,
      model,
      sourceId
    );
  }

  storeIdMapping(mappingContext, model, sourceId, targetId) {
    if (!this.idMapModel || !mappingContext || !model || !sourceId || !targetId) {
      return;
    }
    this.idMapModel.upsertMapping(
      mappingContext.sourceDbId,
      mappingContext.targetDbId,
      model,
      sourceId,
      targetId
    );
  }

  async resolveTargetIdByBusinessKey(targetClient, sourceClient, model, value, mappingContext = null) {
    if (!targetClient || !model || !value) {
      return null;
    }
    const sourceId = Array.isArray(value) ? value[0] : (value?.id || value);
    if (mappingContext && sourceId) {
      const mappedId = this.getMappedTargetId(mappingContext, model, sourceId);
      if (mappedId) {
        return mappedId;
      }
    }

    if (model === 'res.partner') {
      return this.resolvePartnerId(targetClient, sourceClient, value);
    }
    if (model === 'res.country') {
      return this.resolveCountryId(targetClient, sourceClient, value);
    }
    if (model === 'res.users') {
      return this.resolveUserId(targetClient, sourceClient, value);
    }
    if (model === 'res.country.state') {
      return this.resolveStateId(targetClient, sourceClient, value);
    }

    const displayName = this.extractDisplayName(value);
    if (displayName) {
      return this.findModelIdByName(targetClient, model, displayName);
    }

    if (sourceClient && sourceId) {
      return this.resolveByBusinessKeyFields(targetClient, sourceClient, model, sourceId);
    }

    return null;
  }

  async resolveByBusinessKeyFields(targetClient, sourceClient, model, sourceId) {
    try {
      const fields = this.getBusinessKeyFieldNames(model);
      if (!fields || fields.length === 0) {
        return null;
      }
      const sourceRecords = await sourceClient.read(model, [sourceId], fields);
      const record = sourceRecords?.[0];
      if (!record) {
        return null;
      }

      for (const field of fields) {
        const value = record[field];
        if (value === null || value === undefined) {
          continue;
        }
        if (Array.isArray(value) || typeof value === 'object') {
          const name = this.extractDisplayName(value);
          if (!name) {
            continue;
          }
          const ids = await targetClient.search(model, [['name', '=', name]], 0, 1);
          if (ids.length > 0) {
            return ids[0];
          }
          continue;
        }
        const ids = await targetClient.search(model, [[field, '=', value]], 0, 1);
        if (ids.length > 0) {
          return ids[0];
        }
      }
    } catch (error) {
      logger.warn(`Failed to resolve ${model} ${sourceId} by business keys: ${error.message}`);
    }
    return null;
  }

  async mapRelationalIdsByBusinessKey(model, values, targetClient, sourceClient, mappingContext = null) {
    if (!values || typeof values !== 'object' || !targetClient) {
      return values;
    }
    const fields = await this.getModelFieldMeta(targetClient, model);
    if (!fields) {
      return values;
    }
    const mapped = { ...values };
    for (const [field, value] of Object.entries(mapped)) {
      const meta = fields[field];
      if (!meta || meta.type !== 'many2one') {
        continue;
      }
      if (!value) {
        continue;
      }
      const comodel = meta.comodel_name;
      if (!comodel) {
        continue;
      }
      const targetId = await this.resolveTargetIdByBusinessKey(
        targetClient,
        sourceClient,
        comodel,
        value,
        mappingContext
      );
      if (targetId) {
        mapped[field] = targetId;
      }
    }
    return mapped;
  }

  async findModelIdByName(targetClient, model, name) {
    if (!targetClient || !name) {
      return null;
    }
    const ids = await targetClient.search(model, [['name', '=', name]], 0, 1);
    return ids.length > 0 ? ids[0] : null;
  }

  async resolvePartnerId(targetClient, sourceClient, value) {
    if (!targetClient || !value) {
      return null;
    }
    const name = this.extractDisplayName(value);
    let partnerId = null;
    const fieldNames = await this.getModelFieldNames(targetClient, 'res.partner');

    if (name) {
      partnerId = await this.findModelIdByName(targetClient, 'res.partner', name);
      if (partnerId) {
        return partnerId;
      }
    }

    const sourceId = Array.isArray(value) ? value[0] : value;
    if (sourceClient && sourceId) {
      try {
        const sourcePartner = await sourceClient.read(
          'res.partner',
          [sourceId],
          ['name', 'email', 'vat', 'ref']
        );
        const partner = sourcePartner?.[0] || {};
        const lookups = [];
        if (partner.email && fieldNames.has('email')) {
          lookups.push(['email', '=', partner.email]);
        }
        if (partner.vat && fieldNames.has('vat')) {
          lookups.push(['vat', '=', partner.vat]);
        }
        if (partner.ref && fieldNames.has('ref')) {
          lookups.push(['ref', '=', partner.ref]);
        }
        if (partner.name) {
          lookups.push(['name', '=', partner.name]);
        }

        for (const domain of lookups) {
          const ids = await targetClient.search('res.partner', [domain], 0, 1);
          if (ids.length > 0) {
            return ids[0];
          }
        }
      } catch (error) {
        logger.warn(`Failed to resolve res.partner ${sourceId}: ${error.message}`);
      }
    }

    return null;
  }

  async resolveCountryId(targetClient, sourceClient, value) {
    if (!targetClient || !value) {
      return null;
    }
    const name = this.extractDisplayName(value);
    if (name) {
      const idByName = await this.findModelIdByName(targetClient, 'res.country', name);
      if (idByName) {
        return idByName;
      }
    }

    const sourceId = Array.isArray(value) ? value[0] : value;
    if (sourceClient && sourceId) {
      try {
        const sourceCountry = await sourceClient.read(
          'res.country',
          [sourceId],
          ['name', 'code']
        );
        const country = sourceCountry?.[0] || {};
        if (country.code) {
          const ids = await targetClient.search('res.country', [['code', '=', country.code]], 0, 1);
          if (ids.length > 0) {
            return ids[0];
          }
        }
        if (country.name) {
          const idByName = await this.findModelIdByName(targetClient, 'res.country', country.name);
          if (idByName) {
            return idByName;
          }
        }
      } catch (error) {
        logger.warn(`Failed to resolve res.country ${sourceId}: ${error.message}`);
      }
    }

    return null;
  }

  async resolveUserId(targetClient, sourceClient, value) {
    if (!targetClient || !value) {
      return null;
    }
    const name = this.extractDisplayName(value);
    if (name) {
      const idByName = await this.findModelIdByName(targetClient, 'res.users', name);
      if (idByName) {
        return idByName;
      }
    }

    const sourceId = Array.isArray(value) ? value[0] : value;
    if (sourceClient && sourceId) {
      try {
        const sourceUser = await sourceClient.read(
          'res.users',
          [sourceId],
          ['login', 'email', 'name']
        );
        const user = sourceUser?.[0] || {};
        const lookups = [];
        if (user.login) {
          lookups.push(['login', '=', user.login]);
        }
        if (user.email) {
          lookups.push(['email', '=', user.email]);
        }
        if (user.name) {
          lookups.push(['name', '=', user.name]);
        }
        for (const domain of lookups) {
          const ids = await targetClient.search('res.users', [domain], 0, 1);
          if (ids.length > 0) {
            return ids[0];
          }
        }
      } catch (error) {
        logger.warn(`Failed to resolve res.users ${sourceId}: ${error.message}`);
      }
    }

    return null;
  }

  async findFallbackUserId(targetClient) {
    if (!targetClient) {
      return null;
    }
    const ids = await targetClient.search('res.users', [], 0, 1);
    return ids.length > 0 ? ids[0] : null;
  }

  async resolveStateId(targetClient, sourceClient, value, countryId = null) {
    if (!targetClient || !value) {
      return null;
    }
    const name = this.extractDisplayName(value);
    const stateDomain = [];
    if (name) {
      stateDomain.push(['name', '=', name]);
    }
    const countryKey = this.extractCompanyId(countryId);
    if (countryKey) {
      stateDomain.push(['country_id', '=', countryKey]);
    }
    if (stateDomain.length > 0) {
      const ids = await targetClient.search('res.country.state', stateDomain, 0, 1);
      if (ids.length > 0) {
        return ids[0];
      }
    }

    const sourceId = Array.isArray(value) ? value[0] : value;
    if (sourceClient && sourceId) {
      try {
        const sourceState = await sourceClient.read(
          'res.country.state',
          [sourceId],
          ['name', 'code', 'country_id']
        );
        const state = sourceState?.[0] || {};
        if (state.code) {
          const domain = [['code', '=', state.code]];
          const srcCountryId = Array.isArray(state.country_id) ? state.country_id[0] : null;
          if (srcCountryId) {
            const targetCountryId = await this.resolveCountryId(targetClient, sourceClient, state.country_id);
            if (targetCountryId) {
              domain.push(['country_id', '=', targetCountryId]);
            }
          }
          const ids = await targetClient.search('res.country.state', domain, 0, 1);
          if (ids.length > 0) {
            return ids[0];
          }
        }
      } catch (error) {
        logger.warn(`Failed to resolve res.country.state ${sourceId}: ${error.message}`);
      }
    }

    return null;
  }

  async findProductTemplateId(targetClient, templateInfo) {
    if (!targetClient || !templateInfo) {
      return null;
    }

    const fieldNames = await this.getModelFieldNames(targetClient, 'product.template');
    if (templateInfo.barcode && fieldNames.has('barcode')) {
      const ids = await targetClient.search('product.template', [['barcode', '=', templateInfo.barcode]], 0, 1);
      if (ids.length > 0) {
        return ids[0];
      }
    }

    if (templateInfo.default_code && fieldNames.has('default_code')) {
      const ids = await targetClient.search('product.template', [['default_code', '=', templateInfo.default_code]], 0, 1);
      if (ids.length > 0) {
        return ids[0];
      }
    }

    if (templateInfo.name) {
      return this.findModelIdByName(targetClient, 'product.template', templateInfo.name);
    }

    return null;
  }

  async findPosSessionId(targetClient, sessionName, configId) {
    if (!targetClient || !sessionName || !configId) {
      return null;
    }
    const ids = await targetClient.search(
      'pos.session',
      [['name', '=', sessionName], ['config_id', '=', configId]],
      0,
      1
    );
    return ids.length > 0 ? ids[0] : null;
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
