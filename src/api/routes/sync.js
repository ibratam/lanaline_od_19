import express from 'express';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  asyncHandler
} from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import SyncEngine from '../../services/SyncEngine.js';
import OdooClient from '../../services/OdooClient.js';
import HistoryLogger from '../../services/HistoryLogger.js';
import DataPreserver from '../../services/DataPreserver.js';
import SyncRun from '../../models/SyncRun.js';
import SyncFailureTracker from '../../services/SyncFailureTracker.js';

const syncState = {
  current: null,
  lastCompleted: null
};

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
  const failureTracker = new SyncFailureTracker(db);

  const MIN_RETRY_WAIT_MS = process.env.NODE_ENV === 'test' ? 0 : 5000;

  /**
   * GET /api/sync/models
   * List available models for a source connection
   */
  router.get('/models', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required');
    }

    const sourceConnection = await configManager.getConnectionWithPassword(sourceDbId);
    if (!sourceConnection) {
      throw new NotFoundError(`Source database ${sourceDbId} not found`);
    }

    const sourceClient = new OdooClient(
      sourceConnection.url,
      sourceConnection.database_name,
      sourceConnection.username,
      sourceConnection.password
    );

    try {
      await sourceClient.authenticate();
      const models = await sourceClient.getModels();
      const normalized = models.map(model => ({
        id: model.id,
        name: model.name,
        model: model.model
      }));
      res.json({ models: normalized });
    } finally {
      await sourceClient.close();
    }
  }));

  /**
   * POST /api/sync/preview
   * Generate preview of what will be synchronized
   */
  router.post('/preview', asyncHandler(async (req, res) => {
    const {
      source_db_id,
      target_db_id,
      model_filter
    } = req.body;

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
        model_filter
      });

      // Get connections
      const sourceConnection = await configManager.getConnectionWithPassword(source_db_id);
      const targetConnection = await configManager.getConnectionWithPassword(target_db_id);

      if (!sourceConnection) {
        throw new NotFoundError(`Source database ${source_db_id} not found`);
      }

      if (!targetConnection) {
        throw new NotFoundError(`Target database ${target_db_id} not found`);
      }

      // Create Odoo clients
      const sourceClient = new OdooClient(
        sourceConnection.url,
        sourceConnection.database_name,
        sourceConnection.username,
        sourceConnection.password
      );

      const targetClient = new OdooClient(
        targetConnection.url,
        targetConnection.database_name,
        targetConnection.username,
        targetConnection.password
      );

      // Authenticate
      await sourceClient.authenticate();
      await targetClient.authenticate();

      // Generate preview
      const syncEngine = new SyncEngine(sourceClient);
      const preview = await syncEngine.generatePreview(
        sourceClient,
        targetClient,
        model_filter
      );

      preview.model_filter = Array.isArray(model_filter) && model_filter.length > 0
        ? model_filter
        : null;

      // Close clients
      await sourceClient.close();
      await targetClient.close();

      logger.info('Preview generated successfully', {
        models: preview.summary.total_models,
        creates: preview.summary.total_records_to_create,
        updates: preview.summary.total_records_to_update,
        deletes: preview.summary.total_records_to_delete,
        conflicts: preview.summary.total_conflicts
      });

      res.json(preview);
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
      simulate_error
    } = req.body;

    if (!source_db_id || !target_db_id) {
      throw new ValidationError('source_db_id and target_db_id are required');
    }

    if (source_db_id === target_db_id) {
      throw new ValidationError('source_db_id and target_db_id must be different');
    }

    if (syncState.current && syncState.current.status === 'running') {
      throw new ConflictError('A synchronization is already in progress');
    }

    const sourceConnection = await configManager.getConnectionWithPassword(source_db_id);
    const targetConnection = await configManager.getConnectionWithPassword(target_db_id);

    if (!sourceConnection) {
      throw new NotFoundError(`Source database ${source_db_id} not found`);
    }

    if (!targetConnection) {
      throw new NotFoundError(`Target database ${target_db_id} not found`);
    }

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

    const sourceClient = new OdooClient(
      sourceConnection.url,
      sourceConnection.database_name,
      sourceConnection.username,
      sourceConnection.password
    );

    const targetClient = new OdooClient(
      targetConnection.url,
      targetConnection.database_name,
      targetConnection.username,
      targetConnection.password
    );

    const syncEngine = new SyncEngine(sourceClient);
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

        const result = await syncEngine.executeSync({
          sourceClient,
          targetClient,
          modelFilter: model_filter,
          dataPreserver,
          mock: mockMode,
          syncRunId: syncRun.id,
          progressCallback: (progress) => {
            updateSyncState({
              ...progress
            });
          }
        });

        const completedAt = new Date().toISOString();
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
        const failureResult = failureTracker.recordFailure({
          syncRunId: syncRun.id,
          error,
          failureReason: 'sync_execute'
        });
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

    const sourceConnection = await configManager.getConnectionWithPassword(previousRun.source_db_id);
    const targetConnection = await configManager.getConnectionWithPassword(previousRun.target_db_id);

    if (!sourceConnection) {
      throw new NotFoundError(`Source database ${previousRun.source_db_id} not found`);
    }

    if (!targetConnection) {
      throw new NotFoundError(`Target database ${previousRun.target_db_id} not found`);
    }

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

    const sourceClient = new OdooClient(
      sourceConnection.url,
      sourceConnection.database_name,
      sourceConnection.username,
      sourceConnection.password
    );

    const targetClient = new OdooClient(
      targetConnection.url,
      targetConnection.database_name,
      targetConnection.username,
      targetConnection.password
    );

    const syncEngine = new SyncEngine(sourceClient);
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
          progressCallback: (progress) => {
            updateSyncState({
              ...progress
            });
          }
        });

        const completedAt = new Date().toISOString();
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
        const failureResult = failureTracker.recordFailure({
          syncRunId: syncRun.id,
          error,
          failureReason: 'sync_retry'
        });
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

    if (syncState.current && syncState.current.status === 'running') {
      throw new ConflictError('Cannot rollback while synchronization is running');
    }

    const runId = sync_run_id || syncState.lastCompleted?.sync_run_id;
    if (!runId) {
      throw new ValidationError('sync_run_id is required');
    }

    if (!syncState.lastCompleted || syncState.lastCompleted.sync_run_id !== runId) {
      throw new NotFoundError('Sync run not found for rollback');
    }

    const syncRun = syncRunModel.getById(runId);
    if (!syncRun) {
      throw new NotFoundError(`Sync run ${runId} not found`);
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
    const rollbackOperations = syncState.lastCompleted.rollback_operations;

    (async () => {
      try {
        if (!mockMode) {
          const targetConnection = await configManager.getConnectionWithPassword(syncRun.target_db_id);
          if (!targetConnection) {
            throw new NotFoundError('Target connection not found for rollback');
          }

          const targetClient = new OdooClient(
            targetConnection.url,
            targetConnection.database_name,
            targetConnection.username,
            targetConnection.password
          );

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
            ...syncState.lastCompleted.summary,
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
