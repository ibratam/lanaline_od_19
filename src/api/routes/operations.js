/**
 * Operations Monitoring & Logging API Routes
 * Endpoints for retrieving detailed sync operation logs, timing data, and performance analysis
 */

import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

export default function createOperationsRouter(db, services) {
  const router = express.Router();

  /**
   * GET /api/operations/{id}/logs
   * Retrieve detailed logs for a specific sync operation
   * Includes: timing data, phase breakdown, state transitions, error details
   */
  router.get('/:id/logs', asyncHandler(async (req, res) => {
    const operationId = req.params.id;

    try {
      const sqlite = db.getDB();

      // Get operation summary
      const opStmt = sqlite.prepare(`
        SELECT * FROM sync_operations WHERE id = ?
      `);
      const operation = opStmt.get(operationId);

      if (!operation) {
        return res.status(404).json({
          error: true,
          code: 'OPERATIONS_001',
          message: 'Operation not found',
          details: `Operation ID ${operationId} does not exist`
        });
      }

      // Get operation status transitions
      const statusStmt = sqlite.prepare(`
        SELECT * FROM sync_operation_status
        WHERE sync_operation_id = ?
        ORDER BY created_at ASC
      `);
      const statusTransitions = statusStmt.all(operationId);

      // Get retry history for this operation
      const retryStmt = sqlite.prepare(`
        SELECT * FROM retry_history
        WHERE sync_operation_id = ?
        ORDER BY created_at ASC
      `);
      const retryHistory = retryStmt.all(operationId);

      // Get sync failures for this operation
      const failuresStmt = sqlite.prepare(`
        SELECT * FROM sync_failures
        WHERE sync_operation_id = ?
        ORDER BY created_at ASC
      `);
      const failures = failuresStmt.all(operationId);

      // Get data inconsistencies for this operation
      const inconsistenciesStmt = sqlite.prepare(`
        SELECT * FROM data_inconsistencies
        WHERE sync_operation_id = ?
        LIMIT 100
      `);
      const inconsistencies = inconsistenciesStmt.all(operationId);

      // Construct comprehensive log data
      const logs = {
        summary: {
          id: operation.id,
          status: operation.status,
          odoo_model: operation.odoo_model,
          operation_type: operation.operation_type,
          record_count: operation.record_count,
          error_count: operation.error_count || 0,
          duration_ms: operation.duration_ms,
          error_category: operation.error_category,
          error_code: operation.error_code,
          error_message: operation.error_message,
          created_at: operation.created_at,
          completed_at: null
        },
        phases: extractPhases(operation, retryHistory, failures),
        state_transitions: statusTransitions.map(st => ({
          from: st.previous_status,
          to: st.status,
          at: st.created_at,
          reason: st.note,
          error_code: st.error_code,
          error_category: st.error_category
        })),
        error: operation.error_code ? {
          code_prefix: operation.error_code?.split('-')[0] || '',
          category: operation.error_category,
          status_code: mapErrorCategoryToStatus(operation.error_category),
          message: operation.error_message
        } : null,
        failures: failures.slice(0, 50),
        retries: retryHistory.slice(0, 50),
        inconsistencies: inconsistencies
      };

      res.json({
        status: 'success',
        data: logs,
        timestamp: new Date().toISOString()
      });

      logger.info('Operation logs retrieved', {
        operationId,
        statusTransitions: statusTransitions.length,
        failures: failures.length,
        service: 'operations-api'
      });
    } catch (error) {
      logger.error('Failed to retrieve operation logs', {
        operationId,
        error: error.message,
        service: 'operations-api'
      });

      return res.status(500).json({
        error: true,
        code: 'OPERATIONS_002',
        message: 'Failed to retrieve operation logs',
        details: error.message
      });
    }
  }));

  /**
   * GET /api/operations/{id}/analysis
   * Perform performance analysis on operation logs
   * Identifies bottlenecks and suggests improvements
   */
  router.get('/:id/analysis', asyncHandler(async (req, res) => {
    const operationId = req.params.id;

    try {
      const sqlite = db.getDB();

      // Get operation
      const opStmt = sqlite.prepare(`
        SELECT * FROM sync_operations WHERE id = ?
      `);
      const operation = opStmt.get(operationId);

      if (!operation) {
        return res.status(404).json({
          error: true,
          code: 'OPERATIONS_001',
          message: 'Operation not found'
        });
      }

      // Get retry history for timing analysis
      const retryStmt = sqlite.prepare(`
        SELECT * FROM retry_history
        WHERE sync_operation_id = ?
        ORDER BY created_at ASC
      `);
      const retries = retryStmt.all(operationId);

      // Get failures
      const failuresStmt = sqlite.prepare(`
        SELECT * FROM sync_failures
        WHERE sync_operation_id = ?
      `);
      const failures = failuresStmt.all(operationId);

      // Perform analysis
      const analysis = {
        operation_id: operationId,
        total_duration_ms: operation.duration_ms || 0,
        total_records: operation.record_count || 0,
        total_errors: operation.error_count || 0,
        retry_count: retries.length,
        failure_count: failures.length,
        throughput: operation.record_count && operation.duration_ms
          ? (operation.record_count / (operation.duration_ms / 1000)).toFixed(2)
          : 0,
        error_rate: operation.record_count
          ? ((operation.error_count / operation.record_count) * 100).toFixed(2)
          : 0,
        bottlenecks: identifyBottlenecks(retries, failures),
        recommendations: generateRecommendations(operation, retries, failures)
      };

      res.json({
        status: 'success',
        data: analysis,
        timestamp: new Date().toISOString()
      });

      logger.info('Operation analysis completed', {
        operationId,
        bottleneckCount: analysis.bottlenecks.length,
        service: 'operations-api'
      });
    } catch (error) {
      logger.error('Failed to analyze operation', {
        operationId,
        error: error.message,
        service: 'operations-api'
      });

      return res.status(500).json({
        error: true,
        code: 'OPERATIONS_003',
        message: 'Failed to analyze operation',
        details: error.message
      });
    }
  }));

  return router;
}

/**
 * Extract phase information from retry history and failures
 */
function extractPhases(operation, retries, failures) {
  const phases = {};

  // Estimate phases based on retry attempts
  // In a real system, this would come from detailed phase logs
  const phaseNames = ['detection', 'validation', 'resolution', 'apply', 'verification'];
  const failuresByPhase = {};

  failures.forEach(failure => {
    const phase = failure.suggested_action ? failure.suggested_action.split('_')[0] : 'unknown';
    if (!failuresByPhase[phase]) failuresByPhase[phase] = [];
    failuresByPhase[phase].push(failure);
  });

  // Calculate phase timing
  if (operation.duration_ms && retries.length > 0) {
    const avgPhaseTime = operation.duration_ms / phaseNames.length;

    phaseNames.forEach((phase, index) => {
      const phaseStart = retries[0]?.created_at || new Date().toISOString();
      const phaseErrors = failuresByPhase[phase] || [];

      phases[phase] = {
        started_at: phaseStart,
        ended_at: new Date(new Date(phaseStart).getTime() + avgPhaseTime).toISOString(),
        duration_ms: avgPhaseTime,
        records_processed: Math.floor((operation.record_count || 0) / phaseNames.length),
        errors_in_phase: phaseErrors.length
      };
    });
  }

  return phases;
}

/**
 * Map error category to HTTP status code
 */
function mapErrorCategoryToStatus(category) {
  const mapping = {
    'user_correctable': 400,
    'system': 500,
    'unrecoverable': 422
  };
  return mapping[category] || 500;
}

/**
 * Identify performance bottlenecks
 */
function identifyBottlenecks(retries, failures) {
  const bottlenecks = [];

  // Analyze failure patterns
  const failuresByType = {};
  failures.forEach(f => {
    const type = f.failure_reason || f.error_category || 'unknown';
    failuresByType[type] = (failuresByType[type] || 0) + 1;
  });

  // Identify if specific errors are causing repeated failures
  Object.entries(failuresByType).forEach(([type, count]) => {
    if (count > 2) {
      bottlenecks.push({
        type: 'repeated_error',
        description: `Error type "${type}" occurred ${count} times`,
        severity: count > 5 ? 'high' : 'medium'
      });
    }
  });

  // Analyze retry patterns
  if (retries.length > 3) {
    bottlenecks.push({
      type: 'high_retry_count',
      description: `Operation required ${retries.length} retry attempts`,
      severity: 'medium'
    });
  }

  return bottlenecks;
}

/**
 * Generate recommendations based on operation analysis
 */
function generateRecommendations(operation, retries, failures) {
  const recommendations = [];

  // Check error category
  if (operation.error_category === 'user_correctable') {
    recommendations.push({
      category: 'validation',
      message: 'User input validation failed. Review error messages and correct the input data.',
      priority: 'high'
    });
  }

  if (operation.error_category === 'system') {
    recommendations.push({
      category: 'system',
      message: 'Transient system error detected. Consider retrying or checking Odoo connectivity.',
      priority: 'medium'
    });
  }

  if (operation.error_category === 'unrecoverable') {
    recommendations.push({
      category: 'fatal',
      message: 'Unrecoverable error. Manual intervention may be required.',
      priority: 'high'
    });
  }

  // Check for performance issues
  if (operation.record_count && operation.duration_ms) {
    const recordsPerSecond = (operation.record_count / (operation.duration_ms / 1000));
    if (recordsPerSecond < 10) {
      recommendations.push({
        category: 'performance',
        message: `Low throughput detected (${recordsPerSecond.toFixed(2)} records/sec). Check network latency and Odoo API response times.`,
        priority: 'low'
      });
    }
  }

  // Check retry count
  if (retries.length > 2) {
    recommendations.push({
      category: 'debugging',
      message: `High retry count (${retries.length}). Review sync logs and check for recurring issues.`,
      priority: 'medium'
    });
  }

  return recommendations;
}
