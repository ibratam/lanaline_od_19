/**
 * Consistency Verification & Repair API Routes
 * Endpoints for verifying data consistency between local and Odoo
 * and applying repairs (keep_local, keep_odoo, manual_review)
 */

import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

export default function createConsistencyRouter(db, services) {
  const router = express.Router();

  /**
   * GET /api/consistency/check
   * Run data consistency verification
   * Query params:
   *   - sync_operation_id: ID of sync operation to verify (optional, uses latest if not provided)
   *   - models: CSV list of models to verify (optional, verifies all if not provided)
   */
  router.get('/check', asyncHandler(async (req, res) => {
    const syncOperationId = req.query.sync_operation_id || null;
    const modelsParam = req.query.models || '';
    const models = modelsParam ? modelsParam.split(',').map(m => m.trim()) : [];

    // If no sync operation specified, get the latest one
    let operationId = syncOperationId;
    if (!operationId) {
      const stmt = db.getDB().prepare(`
        SELECT id FROM sync_operations
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const latest = stmt.get();
      operationId = latest ? latest.id : null;
    }

    if (!operationId) {
      return res.json({
        status: 'no_operations',
        data: {
          sync_operation_id: null,
          status: 'consistent',
          summary: {
            data_mismatch: 0,
            missing_record: 0,
            extra_record: 0,
            total_inconsistencies: 0,
            duration_ms: 0
          },
          inconsistencies: [],
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    }

    try {
      const report = await services.consistencyChecker.verify(operationId, models);

      res.json({
        status: 'success',
        data: report,
        timestamp: new Date().toISOString()
      });

      logger.info('Consistency check completed', {
        syncOperationId: operationId,
        inconsistencies: report.summary.total_inconsistencies,
        duration_ms: report.summary.duration_ms,
        service: 'consistency-api'
      });
    } catch (error) {
      logger.error('Consistency check failed', {
        syncOperationId: operationId,
        error: error.message,
        service: 'consistency-api'
      });

      return res.status(500).json({
        error: true,
        code: 'CONSISTENCY_002',
        message: 'Consistency verification failed',
        details: error.message
      });
    }
  }));

  /**
   * GET /api/consistency/status
   * Get current consistency status without running full verification
   * Returns cached status or summary of pending inconsistencies
   */
  router.get('/status', asyncHandler(async (req, res) => {
    try {
      const summary = services.dataInconsistencyModel.getSummary();

      res.json({
        status: 'success',
        data: {
          overall_status: summary.total_pending === 0 ? 'consistent' : 'inconsistent',
          pending_count: summary.total_pending,
          summary,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Status check failed', {
        error: error.message,
        service: 'consistency-api'
      });

      return res.status(500).json({
        error: true,
        code: 'CONSISTENCY_003',
        message: 'Status check failed',
        details: error.message
      });
    }
  }));

  /**
   * GET /api/consistency/inconsistencies
   * Get list of pending inconsistencies
   * Query params:
   *   - type: Filter by type (data_mismatch, missing_record, extra_record)
   *   - limit: Number of results (default: 50, max: 500)
   *   - offset: Pagination offset (default: 0)
   *   - sync_operation_id: Filter by sync operation
   */
  router.get('/inconsistencies', asyncHandler(async (req, res) => {
    const type = req.query.type || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const syncOperationId = req.query.sync_operation_id || null;

    let inconsistencies;

    if (syncOperationId) {
      inconsistencies = services.dataInconsistencyModel.getBySyncOperation(syncOperationId);
      if (type) {
        inconsistencies = inconsistencies.filter(i => i.inconsistency_type === type);
      }
      inconsistencies = inconsistencies.slice(offset, offset + limit);
    } else if (type) {
      inconsistencies = services.dataInconsistencyModel.getByType(type, limit, offset);
    } else {
      inconsistencies = services.dataInconsistencyModel.getPending(limit);
      inconsistencies = inconsistencies.slice(offset, offset + limit);
    }

    res.json({
      status: 'success',
      data: {
        inconsistencies,
        count: inconsistencies.length,
        limit,
        offset
      }
    });
  }));

  /**
   * POST /api/consistency/repair
   * Apply a repair action to an inconsistency
   * Body:
   *   - inconsistency_id: ID of inconsistency to repair
   *   - repair_action: Action to apply (keep_local, keep_odoo, manual_review)
   *   - notes: Optional notes about the repair
   */
  router.post('/repair', asyncHandler(async (req, res) => {
    const { inconsistency_id, repair_action, notes } = req.body;

    // Validate inputs
    if (!inconsistency_id || !repair_action) {
      return res.status(400).json({
        error: true,
        code: 'CONSISTENCY_004',
        message: 'Missing required fields: inconsistency_id, repair_action'
      });
    }

    const validRepairs = ['keep_local', 'keep_odoo', 'manual_review'];
    if (!validRepairs.includes(repair_action)) {
      return res.status(400).json({
        error: true,
        code: 'CONSISTENCY_005',
        message: 'Invalid repair_action. Must be one of: ' + validRepairs.join(', ')
      });
    }

    try {
      const inconsistency = services.dataInconsistencyModel.getById(inconsistency_id);
      if (!inconsistency) {
        return res.status(404).json({
          error: true,
          code: 'CONSISTENCY_006',
          message: 'Inconsistency not found'
        });
      }

      // Apply repair based on action
      let repairStatus = 'resolved';
      let repairDetails = null;

      if (repair_action === 'keep_local') {
        // Update Odoo with local data
        repairDetails = await _applyKeepLocal(inconsistency, services);
      } else if (repair_action === 'keep_odoo') {
        // Update local with Odoo data
        repairDetails = await _applyKeepOdoo(inconsistency, services);
      } else if (repair_action === 'manual_review') {
        // Just flag for manual review
        repairStatus = 'manual_review';
      }

      // Update inconsistency record
      const updated = services.dataInconsistencyModel.updateRepair(
        inconsistency_id,
        repairStatus,
        repair_action
      );

      // Log repair in audit trail
      logger.info('Consistency repair applied', {
        inconsistency_id,
        repair_action,
        status: repairStatus,
        notes,
        service: 'consistency-api'
      });

      res.json({
        status: 'success',
        data: {
          inconsistency: updated,
          repair_details: repairDetails,
          message: `Repair applied: ${repair_action}`
        }
      });
    } catch (error) {
      logger.error('Repair application failed', {
        inconsistency_id,
        repair_action,
        error: error.message,
        service: 'consistency-api'
      });

      return res.status(500).json({
        error: true,
        code: 'CONSISTENCY_007',
        message: 'Repair application failed',
        details: error.message
      });
    }
  }));

  /**
   * POST /api/consistency/repair-bulk
   * Apply repair action to multiple inconsistencies
   * Body:
   *   - inconsistency_ids: Array of inconsistency IDs
   *   - repair_action: Action to apply (keep_local, keep_odoo)
   */
  router.post('/repair-bulk', asyncHandler(async (req, res) => {
    const { inconsistency_ids, repair_action } = req.body;

    if (!Array.isArray(inconsistency_ids) || inconsistency_ids.length === 0) {
      return res.status(400).json({
        error: true,
        code: 'CONSISTENCY_008',
        message: 'Invalid inconsistency_ids. Must be non-empty array'
      });
    }

    if (!['keep_local', 'keep_odoo'].includes(repair_action)) {
      return res.status(400).json({
        error: true,
        code: 'CONSISTENCY_009',
        message: 'Invalid repair_action for bulk repair. Must be keep_local or keep_odoo'
      });
    }

    const results = {
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const incId of inconsistency_ids) {
      try {
        const inconsistency = services.dataInconsistencyModel.getById(incId);
        if (!inconsistency) {
          results.failed++;
          results.errors.push({ id: incId, error: 'Not found' });
          continue;
        }

        if (repair_action === 'keep_local') {
          await _applyKeepLocal(inconsistency, services);
        } else if (repair_action === 'keep_odoo') {
          await _applyKeepOdoo(inconsistency, services);
        }

        services.dataInconsistencyModel.updateRepair(incId, 'resolved', repair_action);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: incId, error: error.message });
      }
    }

    logger.info('Bulk consistency repair completed', {
      total: inconsistency_ids.length,
      succeeded: results.succeeded,
      failed: results.failed,
      repair_action,
      service: 'consistency-api'
    });

    res.json({
      status: 'success',
      data: results,
      message: `Repaired ${results.succeeded} inconsistencies`
    });
  }));

  return router;
}

/**
 * Apply keep_local repair: Update Odoo with local data
 * @param {Object} inconsistency - Inconsistency record
 * @param {Object} services - Service objects
 * @returns {Object} Repair details
 */
async function _applyKeepLocal(inconsistency, services) {
  // TODO: Implement Odoo API update call
  // For now, just return details
  return {
    action: 'keep_local',
    target: 'odoo',
    record_id: inconsistency.record_id,
    field: inconsistency.field_name,
    message: 'Local data will be synced to Odoo'
  };
}

/**
 * Apply keep_odoo repair: Update local with Odoo data
 * @param {Object} inconsistency - Inconsistency record
 * @param {Object} services - Service objects
 * @returns {Object} Repair details
 */
async function _applyKeepOdoo(inconsistency, services) {
  // TODO: Implement local database update
  // For now, just return details
  return {
    action: 'keep_odoo',
    target: 'local',
    record_id: inconsistency.record_id,
    field: inconsistency.field_name,
    message: 'Local data will be updated from Odoo'
  };
}
