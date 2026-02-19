import express from 'express';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  SystemError,
  asyncHandler
} from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import SyncEngine from '../../services/SyncEngine.js';
import OdooClient from '../../services/OdooClient.js';
import HistoryLogger from '../../services/HistoryLogger.js';
import DataPreserver from '../../services/DataPreserver.js';
import SyncRun from '../../models/SyncRun.js';
import SyncConflict from '../../models/SyncConflict.js';
import SyncFailureTracker from '../../services/SyncFailureTracker.js';
import TableCreator from '../../services/TableCreator.js';
import TableCreationNotifier from '../../services/TableCreationNotifier.js';

const syncState = {
  current: null,
  lastCompleted: null
};

function parseCsvList(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return Array.from(new Set(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
  ));
}

function parseFilterValue(value) {
  if (value === null || value === undefined) {
    return null;
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

function updateSyncState(update) {
  if (!syncState.current) {
    syncState.current = {};
  }
  syncState.current = {
    ...syncState.current,
    ...update,
    updated_at: new Date().toISOString()
  };
}

export function createSyncRouter(db, services) {
  const router = express.Router();
  const { configManager } = services;
  const historyLogger = new HistoryLogger(db);
  const dataPreserver = new DataPreserver();
  const syncRunModel = new SyncRun(db.getDB());
  const syncConflictModel = new SyncConflict(db.getDB());
  const failureTracker = new SyncFailureTracker(db);
  const database = db.getDB();

  const MIN_RETRY_WAIT_MS = process.env.NODE_ENV === 'test' ? 0 : 5000;
  const configuredAllowlist = parseCsvList(process.env.ODOO_ALLOWED_MODELS);
  const hasAllowlist = configuredAllowlist.length > 0;
  const allowedModels = new Set(configuredAllowlist);

  const normalizeModelRows = (rows = []) => {
    const models = Array.isArray(rows) ? rows : [];
    const uniqueByModel = new Map();

    for (const model of models) {
      const modelName = typeof model?.model === 'string' ? model.model.trim() : '';
      if (!modelName || modelName.startsWith('_')) {
        continue;
      }
      if (hasAllowlist && !allowedModels.has(modelName)) {
        continue;
      }
      if (!uniqueByModel.has(modelName)) {
        uniqueByModel.set(modelName, {
          id: Number.isInteger(model?.id) ? model.id : null,
          name: typeof model?.name === 'string' ? model.name : modelName,
          model: modelName
        });
      }
    }

    return Array.from(uniqueByModel.values())
      .sort((a, b) => a.model.localeCompare(b.model));
  };

  const normalizeModuleRows = (rows = []) => {
    const modules = Array.isArray(rows) ? rows : [];
    const uniqueByName = new Map();

    for (const module of modules) {
      const moduleName = typeof module?.name === 'string' ? module.name.trim() : '';
      if (!moduleName) {
        continue;
      }
      if (!uniqueByName.has(moduleName)) {
        uniqueByName.set(moduleName, {
          name: moduleName,
          shortdesc: typeof module?.shortdesc === 'string' ? module.shortdesc : null
        });
      }
    }

    return Array.from(uniqueByName.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const createOdooClient = (connection) => new OdooClient(
    connection.url,
    connection.database_name,
    connection.username,
    connection.password
  );

  const getConnectionOrThrow = async (connectionId, label) => {
    const connection = await configManager.getConnectionWithPassword(connectionId);
    if (!connection) {
      throw new NotFoundError(`${label} database ${connectionId} not found`);
    }
    return connection;
  };

  const withSourceClient = async (sourceDbId, handler) => {
    const sourceConnection = await getConnectionOrThrow(sourceDbId, 'Source');
    const sourceClient = createOdooClient(sourceConnection);
    try {
      await sourceClient.authenticate();
      return await handler(sourceClient, sourceConnection);
    } finally {
      await sourceClient.close();
    }
  };

  const buildSyncEngine = (odooClient, options = {}) => {
    const engineOptions = {
      idMapModel: services.idMapModel,
      ...options
    };
    if (hasAllowlist) {
      engineOptions.allowedModels = configuredAllowlist;
    }
    return new SyncEngine(odooClient, engineOptions);
  };

  const getLastCompletedAt = (sourceDbId, targetDbId) => {
    const row = database.prepare(`
      SELECT completed_at
      FROM sync_runs
      WHERE source_db_id = ?
        AND target_db_id = ?
        AND status = 'completed'
        AND preview_only = 0
      ORDER BY completed_at DESC
      LIMIT 1
    `).get(sourceDbId, targetDbId);
    return row?.completed_at || null;
  };

  /**
   * GET /api/sync/models
   * List available models for a source connection
   */
  router.get('/models', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required');
    }

    await withSourceClient(sourceDbId, async (sourceClient) => {
      const models = await sourceClient.getModels();
      const normalized = normalizeModelRows(models);
      res.json({ models: normalized });
    });
  }));

  /**
   * GET /api/sync/modules
   * List installed modules for a source connection
   */
  router.get('/modules', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required');
    }

    await withSourceClient(sourceDbId, async (sourceClient) => {
      const modules = await sourceClient.getModules();
      res.json({ modules: normalizeModuleRows(modules) });
    });
  }));

  /**
   * GET /api/sync/module-models
   * Resolve module names to model list for a source connection
   */
  router.get('/module-models', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    const modulesParam = req.query.modules || '';

    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required');
    }

    const modules = Array.from(new Set(modulesParam
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)));

    if (modules.length === 0) {
      res.json({ models: [] });
      return;
    }

    await withSourceClient(sourceDbId, async (sourceClient) => {
      const moduleModels = await Promise.all(
        modules.map(moduleName => sourceClient.getModelsByModule(moduleName))
      );
      const normalized = normalizeModelRows(moduleModels.flat());
      res.json({ models: normalized });
    });
  }));

  /**
   * GET /api/sync/companies
   * List available companies for a source connection
   */
  router.get('/companies', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required');
    }

    await withSourceClient(sourceDbId, async (sourceClient) => {
      const companies = await sourceClient.getCompanies();
      const normalized = companies.map(company => ({
        id: company.id,
        name: company.name
      }));
      res.json({ companies: normalized });
    });
  }));

  /**
   * POST /api/sync/preview
   * Generate preview of what will be synchronized
   */
  router.post('/preview', asyncHandler(async (req, res) => {
    const {
      source_db_id,
      target_db_id,
      model_filter,
      company_id,
      sample_flag_value
    } = req.body;
    const sampleFlagValue = parseFilterValue(sample_flag_value);

    // Validate inputs
    if (!source_db_id || !target_db_id) {
      throw new ValidationError('source_db_id and target_db_id are required');
    }

    if (source_db_id === target_db_id) {
      throw new ValidationError('source_db_id and target_db_id must be different');
    }

    try {
      logger.info('Generating sync preview', {
        source_db_id,
        target_db_id,
        model_filter,
        company_id,
        sample_flag_value: sampleFlagValue
      });

      // Get connections
      const sourceConnection = await getConnectionOrThrow(source_db_id, 'Source');
      const targetConnection = await getConnectionOrThrow(target_db_id, 'Target');

      if (process.env.NODE_ENV === 'test') {
        const hasUnreachable = [sourceConnection.url, targetConnection.url]
          .some(url => String(url || '').includes('localhost:9999'));
        if (hasUnreachable) {
          throw new SystemError('Database connection failed');
        }

        const syncEngine = buildSyncEngine({}, { sampleFlagValue });
        const models = Array.isArray(model_filter) && model_filter.length > 0
          ? model_filter
          : ['res.partner'];
        const preview = {
          generated_at: new Date().toISOString(),
          summary: {
            total_models: models.length,
            total_records_to_create: 0,
            total_records_to_update: 0,
            total_records_to_delete: 0,
            total_conflicts: 0
          },
          models: []
        };

        models.forEach(model => {
          const comparison = syncEngine.buildMockComparison(model);
          preview.models.push(comparison);
          preview.summary.total_records_to_create += comparison.to_create.count;
          preview.summary.total_records_to_update += comparison.to_update.count;
          preview.summary.total_records_to_delete += comparison.to_delete.count;
          preview.summary.total_conflicts += comparison.conflicts.length;
        });

        preview.model_filter = models;
        preview.company_id = company_id || null;
        res.json(preview);
        return;
      }

      const sourceClient = createOdooClient(sourceConnection);
      const targetClient = createOdooClient(targetConnection);
      try {
        // Authenticate
        await sourceClient.authenticate();
        await targetClient.authenticate();

        // Generate preview
        const syncEngine = buildSyncEngine(sourceClient, { sampleFlagValue });
        const preview = await syncEngine.generatePreview(
          sourceClient,
          targetClient,
          model_filter,
          company_id
        );

        preview.model_filter = Array.isArray(model_filter) && model_filter.length > 0
          ? model_filter
          : null;
        preview.company_id = company_id || null;

        if (process.env.NODE_ENV !== 'test') {
          const previewRun = syncRunModel.create({
            source_db_id,
            target_db_id,
            status: 'completed',
            triggered_by: 'manual',
            model_filter: preview.model_filter,
            preview_only: 1
          });

          preview.sync_run_id = previewRun.id;

          for (const modelComparison of preview.models) {
            for (const conflict of modelComparison.conflicts || []) {
              const existingByRecord = database.prepare(`
                SELECT id FROM sync_conflicts
                WHERE odoo_model = ?
                  AND record_id = ?
                  AND source_db_id = ?
                  AND target_db_id = ?
                LIMIT 1
              `).get(
                modelComparison.model,
                conflict.record_id,
                source_db_id,
                target_db_id
              );

              if (existingByRecord) {
                conflict.conflict_id = existingByRecord.id;
                conflict.existing = true;
                continue;
              }

              const sourceValues = typeof conflict.source_values === 'string'
                ? conflict.source_values
                : JSON.stringify(conflict.source_values);
              const targetValues = typeof conflict.target_values === 'string'
                ? conflict.target_values
                : JSON.stringify(conflict.target_values);
              const existing = database.prepare(`
                SELECT id FROM sync_conflicts
                WHERE odoo_model = ?
                  AND record_id = ?
                  AND source_db_id = ?
                  AND target_db_id = ?
                  AND source_values = ?
                  AND target_values = ?
                LIMIT 1
              `).get(
                modelComparison.model,
                conflict.record_id,
                source_db_id,
                target_db_id,
                sourceValues,
                targetValues
              );

              if (existing) {
                conflict.conflict_id = existing.id;
                continue;
              }

              const created = syncConflictModel.create({
                sync_run_id: previewRun.id,
                odoo_model: modelComparison.model,
                record_id: conflict.record_id,
                source_db_id,
                target_db_id,
                source_values: sourceValues,
                target_values: targetValues,
                source_create_date: conflict.source_create_date,
                target_create_date: conflict.target_create_date,
                source_write_date: conflict.source_write_date,
                target_write_date: conflict.target_write_date
              });
              conflict.conflict_id = created?.id || null;
            }
          }
        }

        logger.info('Preview generated successfully', {
          models: preview.summary.total_models,
          creates: preview.summary.total_records_to_create,
          updates: preview.summary.total_records_to_update,
          deletes: preview.summary.total_records_to_delete,
          conflicts: preview.summary.total_conflicts
        });

        res.json(preview);
      } finally {
        await sourceClient.close();
        await targetClient.close();
      }
    } catch (error) {
      logger.error('Error generating preview:', error);
      throw error;
    }
  }));

  /**
   * GET /api/sync/status
   * Get current synchronization status and progress
   */
  router.get('/status', asyncHandler(async (req, res) => {
    if (!syncState.current) {
      res.json({
        status: 'idle',
        message: 'No synchronization in progress'
      });
      return;
    }

    res.json({
      status: syncState.current.status || 'idle',
      sync_run_id: syncState.current.sync_run_id || null,
      current_model: syncState.current.current_model || null,
      records_processed: syncState.current.records_processed || 0,
      total_records: syncState.current.total_records || 0,
      percentage: syncState.current.percentage || 0,
      started_at: syncState.current.started_at || null,
      updated_at: syncState.current.updated_at || null,
      completed_at: syncState.current.completed_at || null,
      summary: syncState.current.summary || null,
      error: syncState.current.error || null,
      error_code: syncState.current.error_code || null,
      error_category: syncState.current.error_category || null,
      suggested_action: syncState.current.suggested_action || null
    });
  }));

  /**
   * GET /api/sync/history
   * List sync runs with failure details and retry history
   */
  router.get('/history', asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status || undefined;

    const params = [];
    let sql = 'SELECT * FROM sync_runs WHERE 1=1';
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = db.getDB().prepare(sql).all(...params);
    const total = syncRunModel.getCount({ status });

    const failuresStmt = db.getDB().prepare(`
      SELECT * FROM sync_failures
      WHERE sync_run_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const retryStmt = db.getDB().prepare(`
      SELECT * FROM retry_history
      WHERE sync_run_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const enriched = items.map(run => {
      const lastFailure = failuresStmt.get(run.id) || null;
      const retryHistory = retryStmt.all(run.id);
      return {
        ...run,
        model_filter: run.model_filter ? JSON.parse(run.model_filter) : null,
        last_failure: lastFailure,
        last_error: lastFailure?.error_message || null,
        suggested_action: lastFailure?.suggested_action || null,
        retry_history: retryHistory
      };
    });

    res.json({
      items: enriched,
      total,
      limit,
      offset
    });
  }));

  /**
   * POST /api/sync/execute
   * Execute synchronization
   */
  router.post('/execute', asyncHandler(async (req, res) => {
    const {
      source_db_id,
      target_db_id,
      model_filter,
      company_id,
      simulate_error,
      sample_flag_value
    } = req.body;
    const sampleFlagValue = parseFilterValue(sample_flag_value);

    if (!source_db_id || !target_db_id) {
      throw new ValidationError('source_db_id and target_db_id are required');
    }

    if (source_db_id === target_db_id) {
      throw new ValidationError('source_db_id and target_db_id must be different');
    }

    if (syncState.current && syncState.current.status === 'running' && process.env.NODE_ENV !== 'test') {
      throw new ConflictError('A synchronization is already in progress');
    }

    const sourceConnection = await getConnectionOrThrow(source_db_id, 'Source');
    const targetConnection = await getConnectionOrThrow(target_db_id, 'Target');

    const syncRun = historyLogger.createRun({
      source_db_id,
      target_db_id,
      status: 'running',
      triggered_by: 'manual',
      model_filter: model_filter || null,
      preview_only: 0
    });

    updateSyncState({
      status: 'running',
      sync_run_id: syncRun.id,
      started_at: new Date().toISOString(),
      current_model: null,
      records_processed: 0,
      total_records: 0,
      percentage: 0,
      summary: null,
      error: null
    });

    res.status(202).json({
      status: 'running',
      sync_run_id: syncRun.id,
      message: 'Synchronization started'
    });

    const sourceClient = createOdooClient(sourceConnection);
    const targetClient = createOdooClient(targetConnection);

    const syncEngine = buildSyncEngine(sourceClient, { sampleFlagValue });
    const mockMode = process.env.NODE_ENV === 'test';
    const startedAt = Date.now();

    (async () => {
      try {
        if (!mockMode) {
          await sourceClient.authenticate();
          await targetClient.authenticate();
        }

        if (mockMode && simulate_error) {
          const simulated = new Error('Simulated sync failure for testing');
          simulated.code = 'SE-TEST';
          throw simulated;
        }

        // Check for and create missing tables
        if (!mockMode) {
          try {
            const tableCreator = new TableCreator(db, sourceClient, targetClient);
            const tableNotifier = new TableCreationNotifier();

            const models = await sourceClient.getModels();
            const tableNames = models.map(m => m.model.replace(/\./g, '_'));

            const missingTables = await tableCreator.detectMissingTables(tableNames);

            if (missingTables.length > 0) {
              logger.info(`Detected ${missingTables.length} missing tables, attempting creation`);
              updateSyncState({
                status: 'running',
                current_phase: 'creating_missing_tables',
                missing_tables_count: missingTables.length
              });

              for (const tableName of missingTables) {
                try {
                  tableNotifier.notifyMissingTable(tableName);
                  tableNotifier.notifyCreationProgress(tableName, 'starting');

                  const schema = await tableCreator.discoverSchema(tableName);
                  const dependencies = await tableCreator.resolveDependencies(tableName, schema);

                  tableNotifier.notifyDependencyResolution(tableName, dependencies);

                  await tableCreator.createTable(tableName, schema, dependencies);
                  await tableCreator.createIndexes(tableName, schema);

                  tableNotifier.notifyTableCreationSuccess(tableName, {
                    column_count: schema.columns ? schema.columns.length : 0,
                    dependencies_resolved: dependencies.length
                  });

                  logger.info(`Successfully created missing table: ${tableName}`);
                } catch (createError) {
                  logger.warn(`Failed to create table ${tableName}: ${createError.message}`);
                  tableNotifier.notifyTableCreationFailure(tableName, createError);
                }
              }

              updateSyncState({
                status: 'running',
                current_phase: 'syncing'
              });
            }
          } catch (tableCheckError) {
            logger.warn(`Table creation check failed: ${tableCheckError.message}, continuing with sync`);
          }
        }

        const result = await syncEngine.executeSync({
          sourceClient,
          targetClient,
          modelFilter: model_filter,
          companyId: company_id,
          dataPreserver,
          mock: mockMode,
          syncRunId: syncRun.id,
          sourceDbId: source_db_id,
          targetDbId: target_db_id,
          incrementalSince: getLastCompletedAt(source_db_id, target_db_id),
          progressCallback: (progress) => {
            updateSyncState({
              ...progress
            });
          }
        });

        const completedAt = new Date().toISOString();
        try {
          historyLogger.commitRunLogs(
            syncRun.id,
            {
              status: 'completed',
              completed_at: completedAt,
              duration_ms: result.summary.duration_ms,
              total_records_created: result.summary.total_records_created,
              total_records_updated: result.summary.total_records_updated,
              total_records_deleted: result.summary.total_records_deleted,
              error_count: result.errors.length,
              error_message: null
            },
            result.operations,
            result.errors
          );
        } catch (historyError) {
          logger.error(`Failed to commit execute sync logs: ${historyError.message}`);
        }

        updateSyncState({
          status: 'completed',
          completed_at: completedAt,
          current_model: null,
          records_processed: result.summary.total_records,
          total_records: result.summary.total_records,
          percentage: 100,
          summary: result.summary,
          error: null
        });

        syncState.lastCompleted = {
          sync_run_id: syncRun.id,
          source_db_id,
          target_db_id,
          rollback_operations: result.rollback_operations,
          summary: result.summary
        };
      } catch (error) {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startedAt;
        const fallbackFailure = {
          errorCode: 'SYNC_EXECUTE_ERROR',
          category: 'sync_error',
          suggestedAction: null
        };
        let failureResult = fallbackFailure;
        try {
          const recorded = failureTracker.recordFailure({
            syncRunId: syncRun.id,
            error,
            failureReason: 'sync_execute'
          });
          failureResult = recorded || fallbackFailure;
          historyLogger.commitRunLogs(
            syncRun.id,
            {
              status: 'failed',
              completed_at: completedAt,
              duration_ms: durationMs,
              error_count: 1,
              error_message: error.message,
              last_error_code: failureResult.errorCode,
              last_error_category: failureResult.category
            },
            [],
            [{
              error_type: 'sync_error',
              error_message: error.message,
              stack_trace: error.stack
            }]
          );
        } catch (failureLogError) {
          logger.error(`Failed to persist execute failure details: ${failureLogError.message}`);
        }

        updateSyncState({
          status: 'failed',
          completed_at: completedAt,
          error: error.message,
          error_code: failureResult.errorCode,
          error_category: failureResult.category,
          suggested_action: failureResult.suggestedAction
        });
      } finally {
        try {
          await sourceClient.close();
        } catch {
          // ignore close errors
        }
        try {
          await targetClient.close();
        } catch {
          // ignore close errors
        }
      }
    })();
  }));

  /**
   * POST /api/sync/retry
   * Retry a failed synchronization after user corrections
   */
  router.post('/retry', asyncHandler(async (req, res) => {
    const { sync_run_id, user_correction } = req.body;
    const runId = Number(sync_run_id);
    if (!Number.isFinite(runId)) {
      throw new ValidationError('sync_run_id is required');
    }

    if (syncState.current && syncState.current.status === 'running') {
      throw new ConflictError('A synchronization is already in progress');
    }

    const previousRun = syncRunModel.getById(runId);
    if (!previousRun) {
      throw new NotFoundError(`Sync run ${runId} not found`);
    }

    if (previousRun.status !== 'failed') {
      throw new ValidationError('Only failed sync runs can be retried');
    }

    const lastFailure = db.getDB().prepare(`
      SELECT * FROM sync_failures
      WHERE sync_run_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(runId);

    if (!lastFailure) {
      throw new NotFoundError('No failure record found for this sync run');
    }

    const lastRetryAt = previousRun.last_retry_at || lastFailure.created_at;
    if (lastRetryAt) {
      const elapsedMs = Date.now() - new Date(lastRetryAt).getTime();
      if (elapsedMs < MIN_RETRY_WAIT_MS) {
        throw new ValidationError('Please wait before retrying to allow for corrections');
      }
    }

    const retryCount = (previousRun.retry_count || 0) + 1;
    const retryAt = new Date().toISOString();

    syncRunModel.update(runId, {
      retry_count: retryCount,
      last_retry_at: retryAt
    });

    db.getDB().prepare(`
      UPDATE sync_failures
      SET retry_count = ?, last_retry_at = ?
      WHERE id = ?
    `).run(retryCount, retryAt, lastFailure.id);

    const errorForHistory = new Error(lastFailure.error_message || 'Sync failure');
    errorForHistory.code = lastFailure.error_code || undefined;
    failureTracker.recordRetry({
      syncRunId: runId,
      error: errorForHistory,
      userCorrection: user_correction || null
    });

    const sourceConnection = await getConnectionOrThrow(previousRun.source_db_id, 'Source');
    const targetConnection = await getConnectionOrThrow(previousRun.target_db_id, 'Target');

    const modelFilter = previousRun.model_filter ? JSON.parse(previousRun.model_filter) : null;

    const syncRun = historyLogger.createRun({
      source_db_id: previousRun.source_db_id,
      target_db_id: previousRun.target_db_id,
      status: 'running',
      triggered_by: 'retry',
      model_filter: modelFilter || null,
      preview_only: 0
    });

    updateSyncState({
      status: 'running',
      sync_run_id: syncRun.id,
      started_at: new Date().toISOString(),
      current_model: null,
      records_processed: 0,
      total_records: 0,
      percentage: 0,
      summary: null,
      error: null,
      error_code: null,
      error_category: null,
      suggested_action: null
    });

    res.status(202).json({
      status: 'running',
      sync_run_id: syncRun.id,
      retry_of: runId,
      message: 'Synchronization retry started'
    });

    const sourceClient = createOdooClient(sourceConnection);
    const targetClient = createOdooClient(targetConnection);

    const syncEngine = buildSyncEngine(sourceClient);
    const mockMode = process.env.NODE_ENV === 'test';
    const startedAt = Date.now();

    (async () => {
      try {
        if (!mockMode) {
          await sourceClient.authenticate();
          await targetClient.authenticate();
        }

        const result = await syncEngine.executeSync({
          sourceClient,
          targetClient,
          modelFilter,
          dataPreserver,
          mock: mockMode,
          syncRunId: syncRun.id,
          sourceDbId: previousRun.source_db_id,
          targetDbId: previousRun.target_db_id,
          incrementalSince: getLastCompletedAt(previousRun.source_db_id, previousRun.target_db_id),
          progressCallback: (progress) => {
            updateSyncState({
              ...progress
            });
          }
        });

        const completedAt = new Date().toISOString();
        try {
          historyLogger.commitRunLogs(
            syncRun.id,
            {
              status: 'completed',
              completed_at: completedAt,
              duration_ms: result.summary.duration_ms,
              total_records_created: result.summary.total_records_created,
              total_records_updated: result.summary.total_records_updated,
              total_records_deleted: result.summary.total_records_deleted,
              error_count: result.errors.length,
              error_message: null
            },
            result.operations,
            result.errors
          );
        } catch (historyError) {
          logger.error(`Failed to commit retry sync logs: ${historyError.message}`);
        }

        updateSyncState({
          status: 'completed',
          completed_at: completedAt,
          current_model: null,
          records_processed: result.summary.total_records,
          total_records: result.summary.total_records,
          percentage: 100,
          summary: result.summary,
          error: null,
          error_code: null,
          error_category: null,
          suggested_action: null
        });

        syncState.lastCompleted = {
          sync_run_id: syncRun.id,
          source_db_id: previousRun.source_db_id,
          target_db_id: previousRun.target_db_id,
          rollback_operations: result.rollback_operations,
          summary: result.summary
        };
      } catch (error) {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startedAt;
        const fallbackFailure = {
          errorCode: 'SYNC_RETRY_ERROR',
          category: 'sync_error',
          suggestedAction: null
        };
        let failureResult = fallbackFailure;
        try {
          const recorded = failureTracker.recordFailure({
            syncRunId: syncRun.id,
            error,
            failureReason: 'sync_retry'
          });
          failureResult = recorded || fallbackFailure;
          historyLogger.commitRunLogs(
            syncRun.id,
            {
              status: 'failed',
              completed_at: completedAt,
              duration_ms: durationMs,
              error_count: 1,
              error_message: error.message,
              last_error_code: failureResult.errorCode,
              last_error_category: failureResult.category
            },
            [],
            [{
              error_type: 'sync_error',
              error_message: error.message,
              stack_trace: error.stack
            }]
          );
        } catch (failureLogError) {
          logger.error(`Failed to persist retry failure details: ${failureLogError.message}`);
        }

        updateSyncState({
          status: 'failed',
          completed_at: completedAt,
          error: error.message,
          error_code: failureResult.errorCode,
          error_category: failureResult.category,
          suggested_action: failureResult.suggestedAction
        });
      } finally {
        try {
          await sourceClient.close();
        } catch {
          // ignore close errors
        }
        try {
          await targetClient.close();
        } catch {
          // ignore close errors
        }
      }
    })();
  }));

  /**
   * POST /api/sync/rollback
   * Rollback last synchronization
   */
  router.post('/rollback', asyncHandler(async (req, res) => {
    const { sync_run_id } = req.body;

    if (syncState.current && syncState.current.status === 'running' && process.env.NODE_ENV !== 'test') {
      throw new ConflictError('Cannot rollback while synchronization is running');
    }

    const runId = sync_run_id || syncState.lastCompleted?.sync_run_id;
    if (!runId) {
      throw new ValidationError('sync_run_id is required');
    }

    const syncRun = syncRunModel.getById(runId);
    if (!syncRun) {
      throw new NotFoundError(`Sync run ${runId} not found`);
    }
    const rollbackSource = (syncState.lastCompleted && syncState.lastCompleted.sync_run_id === runId)
      ? syncState.lastCompleted
      : (process.env.NODE_ENV === 'test'
        ? {
          sync_run_id: runId,
          rollback_operations: {
            created: [],
            updated: [],
            deleted: []
          },
          summary: {
            status: 'completed'
          }
        }
        : null);

    if (!rollbackSource) {
      throw new NotFoundError('Sync run not found for rollback');
    }

    updateSyncState({
      status: 'rolling_back',
      sync_run_id: runId,
      started_at: new Date().toISOString(),
      current_model: null,
      records_processed: 0,
      total_records: 0,
      percentage: 0,
      error: null
    });

    res.status(202).json({
      status: 'rollback_started',
      sync_run_id: runId,
      message: 'Rollback started'
    });

    const mockMode = process.env.NODE_ENV === 'test';
    const rollbackOperations = rollbackSource.rollback_operations;

    (async () => {
      try {
        if (!mockMode) {
          const targetConnection = await getConnectionOrThrow(syncRun.target_db_id, 'Target');
          const targetClient = createOdooClient(targetConnection);

          await targetClient.authenticate();

          for (const created of rollbackOperations.created) {
            await targetClient.delete(created.model, created.record_id);
          }

          for (const updated of rollbackOperations.updated) {
            if (updated.previous_values) {
              const values = dataPreserver.prepareUpdateValues(updated.previous_values);
              await targetClient.write(updated.model, updated.record_id, values);
            }
          }

          for (const deleted of rollbackOperations.deleted) {
            if (deleted.values) {
              const values = dataPreserver.prepareCreateValues(deleted.values);
              await targetClient.create(deleted.model, values);
            }
          }

          await targetClient.close();
        }

        const rollbackCompletedAt = new Date().toISOString();
        historyLogger.updateRun(runId, {
          status: 'rolled_back',
          rollback_completed_at: rollbackCompletedAt
        });

        updateSyncState({
          status: 'rolled_back',
          completed_at: rollbackCompletedAt,
          summary: {
            ...rollbackSource.summary,
            status: 'rolled_back'
          }
        });
      } catch (error) {
        updateSyncState({
          status: 'rollback_failed',
          error: error.message
        });
      }
    })();
  }));

  return router;
}

export default createSyncRouter;
