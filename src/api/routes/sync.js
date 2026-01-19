import express from 'express';
import {
  ValidationError,
  NotFoundError,
  asyncHandler
} from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import SyncEngine from '../../services/SyncEngine.js';
import OdooClient from '../../services/OdooClient.js';

export function createSyncRouter(db, services) {
  const router = express.Router();
  const { configManager } = services;

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
    // TODO: Implement when we have active sync support
    res.json({
      status: 'idle',
      message: 'No synchronization in progress'
    });
  }));

  /**
   * POST /api/sync/execute
   * Execute synchronization
   */
  router.post('/execute', asyncHandler(async (req, res) => {
    // TODO: Implement full sync execution
    throw new NotFoundError('Not yet implemented');
  }));

  /**
   * POST /api/sync/rollback
   * Rollback last synchronization
   */
  router.post('/rollback', asyncHandler(async (req, res) => {
    // TODO: Implement rollback
    throw new NotFoundError('Not yet implemented');
  }));

  return router;
}

export default createSyncRouter;
