/**
 * OperationAnalyzer Service
 * Analyzes operation logs to identify bottlenecks and suggest performance improvements
 */

import logger from '../utils/logger.js';

export class OperationAnalyzer {
  constructor(db) {
    this.db = db;
  }

  /**
   * Analyze a single operation for performance issues and bottlenecks
   * @param {number} operationId - Operation ID to analyze
   * @returns {Object} Analysis results with bottlenecks and recommendations
   */
  analyzeOperation(operationId) {
    try {
      const sqlite = this.db.getDB();

      // Get operation data
      const opStmt = sqlite.prepare(`SELECT * FROM sync_operations WHERE id = ?`);
      const operation = opStmt.get(operationId);

      if (!operation) {
        return { error: 'Operation not found', operationId };
      }

      // Get all related data
      const retries = this._getRetryHistory(operationId);
      const failures = this._getFailures(operationId);
      const inconsistencies = this._getInconsistencies(operationId);
      const statusTransitions = this._getStatusTransitions(operationId);

      // Perform analysis
      const bottlenecks = this._identifyBottlenecks(operation, retries, failures, inconsistencies);
      const recommendations = this._generateRecommendations(operation, retries, failures, bottlenecks);
      const performanceMetrics = this._calculateMetrics(operation, retries, failures);

      return {
        operation_id: operationId,
        status: operation.status,
        analysis_timestamp: new Date().toISOString(),
        performance_metrics: performanceMetrics,
        bottlenecks: bottlenecks,
        recommendations: recommendations,
        diagnostics: {
          total_retries: retries.length,
          total_failures: failures.length,
          total_inconsistencies: inconsistencies.length,
          total_state_transitions: statusTransitions.length
        }
      };
    } catch (error) {
      logger.error('Failed to analyze operation', {
        operationId,
        error: error.message,
        service: 'OperationAnalyzer'
      });
      throw error;
    }
  }

  /**
   * Analyze multiple operations and identify patterns
   * @param {Array} operationIds - Array of operation IDs
   * @returns {Object} Pattern analysis across operations
   */
  analyzeMultipleOperations(operationIds) {
    try {
      const analyses = operationIds.map(id => this.analyzeOperation(id));
      return this._synthesizeAnalyses(analyses);
    } catch (error) {
      logger.error('Failed to analyze multiple operations', {
        count: operationIds.length,
        error: error.message,
        service: 'OperationAnalyzer'
      });
      throw error;
    }
  }

  /**
   * Get performance trends over time
   * @param {number} days - Number of days to analyze
   * @returns {Object} Trend data
   */
  getPerformanceTrends(days = 7) {
    try {
      const sqlite = this.db.getDB();

      // Get operations from the last N days
      const stmt = sqlite.prepare(`
        SELECT * FROM sync_operations
        WHERE created_at > datetime('now', '-' || ? || ' days')
        ORDER BY created_at ASC
      `);

      const operations = stmt.all(days);

      if (operations.length === 0) {
        return { error: 'No operations found for analysis', days };
      }

      // Organize by day
      const byDay = {};
      operations.forEach(op => {
        const day = op.created_at.split(' ')[0];
        if (!byDay[day]) {
          byDay[day] = [];
        }
        byDay[day].push(op);
      });

      // Calculate daily metrics
      const trends = Object.entries(byDay).map(([day, ops]) => {
        const avgDuration = ops.reduce((sum, op) => sum + (op.duration_ms || 0), 0) / ops.length;
        const successRate = (ops.filter(op => op.status === 'completed').length / ops.length) * 100;
        const avgErrorCount = ops.reduce((sum, op) => sum + (op.error_count || 0), 0) / ops.length;

        return {
          date: day,
          operation_count: ops.length,
          avg_duration_ms: Math.round(avgDuration),
          success_rate: successRate.toFixed(1),
          avg_error_count: avgErrorCount.toFixed(2),
          failed_count: ops.filter(op => op.status === 'failed').length
        };
      });

      return {
        days: days,
        trends: trends,
        overall_summary: this._calculateOverallSummary(operations)
      };
    } catch (error) {
      logger.error('Failed to get performance trends', {
        days,
        error: error.message,
        service: 'OperationAnalyzer'
      });
      throw error;
    }
  }

  /**
   * Identify specific bottlenecks in an operation
   */
  _identifyBottlenecks(operation, retries, failures, inconsistencies) {
    const bottlenecks = [];

    // 1. High retry count
    if (retries.length > 3) {
      bottlenecks.push({
        type: 'high_retry_count',
        severity: retries.length > 10 ? 'high' : 'medium',
        description: `Operation required ${retries.length} retry attempts`,
        impact: `Increased total duration by approximately ${retries.length * 5}s (exponential backoff)`
      });
    }

    // 2. High error rate
    if (operation.record_count && operation.error_count) {
      const errorRate = (operation.error_count / operation.record_count) * 100;
      if (errorRate > 5) {
        bottlenecks.push({
          type: 'high_error_rate',
          severity: errorRate > 20 ? 'high' : 'medium',
          description: `Error rate is ${errorRate.toFixed(1)}%`,
          impact: `${operation.error_count} records failed out of ${operation.record_count}`
        });
      }
    }

    // 2. Repeated error patterns
    const errorCounts = {};
    failures.forEach(f => {
      const key = f.error_code || f.failure_reason || 'unknown';
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    Object.entries(errorCounts).forEach(([error, count]) => {
      if (count > 2) {
        bottlenecks.push({
          type: 'repeated_error',
          severity: count > 5 ? 'high' : 'medium',
          description: `Error "${error}" occurred ${count} times`,
          impact: `Suggests systematic issue with this error condition`
        });
      }
    });

    // 3. Data inconsistencies
    if (inconsistencies.length > 0) {
      bottlenecks.push({
        type: 'data_inconsistencies',
        severity: inconsistencies.length > 100 ? 'high' : 'medium',
        description: `${inconsistencies.length} data inconsistencies detected`,
        impact: `May require manual review and data repair`
      });
    }

    // 4. Long operation duration
    if (operation.duration_ms && operation.duration_ms > 300000) { // > 5 minutes
      bottlenecks.push({
        type: 'long_duration',
        severity: operation.duration_ms > 600000 ? 'high' : 'low',
        description: `Operation took ${(operation.duration_ms / 1000).toFixed(2)}s to complete`,
        impact: `May indicate slow network or Odoo API performance`
      });
    }

    return bottlenecks;
  }

  /**
   * Generate actionable recommendations
   */
  _generateRecommendations(operation, retries, failures, bottlenecks) {
    const recommendations = [];

    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.type) {
        case 'high_retry_count':
          recommendations.push({
            category: 'retry_strategy',
            priority: bottleneck.severity === 'high' ? 'high' : 'medium',
            recommendation: 'Consider investigating root cause of retries',
            action: 'Check Odoo API logs and network connectivity',
            expected_improvement: 'Reduce retry count and total operation duration'
          });
          break;

        case 'high_error_rate':
          recommendations.push({
            category: 'error_handling',
            priority: 'high',
            recommendation: 'Review data validation and mapping logic',
            action: 'Examine failed records for common patterns',
            expected_improvement: 'Reduce error count and improve success rate'
          });
          break;

        case 'repeated_error':
          recommendations.push({
            category: 'debugging',
            priority: 'high',
            recommendation: `Investigate recurring "${bottleneck.description}" error`,
            action: 'Review error logs and test with similar data',
            expected_improvement: 'Fix systematic issue and improve reliability'
          });
          break;

        case 'data_inconsistencies':
          recommendations.push({
            category: 'data_quality',
            priority: 'medium',
            recommendation: 'Review and repair detected data inconsistencies',
            action: 'Use consistency verification tool to identify and fix mismatches',
            expected_improvement: 'Ensure data integrity between systems'
          });
          break;

        case 'long_duration':
          recommendations.push({
            category: 'performance',
            priority: 'low',
            recommendation: 'Optimize sync performance',
            action: 'Consider batching records, reducing model filter scope, or improving network',
            expected_improvement: 'Reduce operation duration'
          });
          break;
      }
    });

    // Add error category specific recommendations
    if (operation.error_category === 'user_correctable') {
      recommendations.push({
        category: 'user_action',
        priority: 'high',
        recommendation: 'User input validation failed',
        action: 'Review error messages and correct the source data',
        expected_improvement: 'Retry should succeed after data correction'
      });
    }

    if (operation.error_category === 'system') {
      recommendations.push({
        category: 'system_issue',
        priority: 'medium',
        recommendation: 'Transient system error detected',
        action: 'Wait a moment and retry, or check Odoo system status',
        expected_improvement: 'Transient errors typically resolve on retry'
      });
    }

    return recommendations;
  }

  /**
   * Calculate performance metrics
   */
  _calculateMetrics(operation, retries, failures) {
    const baselineTime = operation.duration_ms || 0;
    const retryTime = retries.reduce((sum, r) => sum + 5000, 0); // Estimate 5s per retry
    const totalTime = baselineTime + retryTime;

    return {
      baseline_duration_ms: baselineTime,
      estimated_retry_overhead_ms: retryTime,
      total_estimated_time_ms: totalTime,
      throughput_records_per_sec: operation.record_count && baselineTime > 0
        ? (operation.record_count / (baselineTime / 1000)).toFixed(2)
        : 0,
      failure_count: failures.length,
      failure_rate: operation.record_count
        ? ((failures.length / operation.record_count) * 100).toFixed(2)
        : 0,
      retry_count: retries.length,
      average_time_per_record_ms: operation.record_count && baselineTime > 0
        ? (baselineTime / operation.record_count).toFixed(2)
        : 0
    };
  }

  /**
   * Calculate summary across multiple operations
   */
  _calculateOverallSummary(operations) {
    const successful = operations.filter(op => op.status === 'completed').length;
    const failed = operations.filter(op => op.status === 'failed').length;
    const avgDuration = operations.reduce((sum, op) => sum + (op.duration_ms || 0), 0) / operations.length;
    const totalRecords = operations.reduce((sum, op) => sum + (op.record_count || 0), 0);

    return {
      total_operations: operations.length,
      successful_count: successful,
      failed_count: failed,
      success_rate: ((successful / operations.length) * 100).toFixed(1),
      avg_duration_ms: Math.round(avgDuration),
      total_records_processed: totalRecords,
      avg_records_per_operation: Math.round(totalRecords / operations.length)
    };
  }

  /**
   * Synthesize analyses from multiple operations
   */
  _synthesizeAnalyses(analyses) {
    const patterns = {
      most_common_bottlenecks: this._findMostCommonBottlenecks(analyses),
      error_categories: this._analyzeErrorCategories(analyses),
      success_patterns: this._analyzeSuccessPatterns(analyses)
    };

    return {
      total_analyzed: analyses.length,
      successful_analyses: analyses.filter(a => !a.error).length,
      patterns: patterns,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Find most common bottlenecks across multiple operations
   */
  _findMostCommonBottlenecks(analyses) {
    const bottleneckCounts = {};

    analyses.forEach(analysis => {
      if (analysis.bottlenecks) {
        analysis.bottlenecks.forEach(bottleneck => {
          const key = bottleneck.type;
          bottleneckCounts[key] = (bottleneckCounts[key] || 0) + 1;
        });
      }
    });

    return Object.entries(bottleneckCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, occurrences: count }));
  }

  /**
   * Analyze error categories
   */
  _analyzeErrorCategories(analyses) {
    const categories = {};

    analyses.forEach(analysis => {
      if (analysis.diagnostics) {
        const category = analysis.status;
        if (!categories[category]) {
          categories[category] = 0;
        }
        categories[category]++;
      }
    });

    return categories;
  }

  /**
   * Analyze patterns in successful operations
   */
  _analyzeSuccessPatterns(analyses) {
    const successful = analyses.filter(a => !a.error && a.status === 'completed');

    if (successful.length === 0) {
      return { message: 'No successful operations to analyze' };
    }

    const avgDuration = successful.reduce((sum, a) => sum + (a.performance_metrics?.baseline_duration_ms || 0), 0) / successful.length;

    return {
      successful_count: successful.length,
      avg_duration_ms: Math.round(avgDuration),
      zero_retry_count: successful.filter(a => a.diagnostics.total_retries === 0).length,
      zero_error_count: successful.filter(a => a.diagnostics.total_failures === 0).length
    };
  }

  /**
   * Get retry history for an operation
   */
  _getRetryHistory(operationId) {
    const stmt = this.db.getDB().prepare(`
      SELECT * FROM retry_history WHERE sync_operation_id = ? ORDER BY created_at ASC
    `);
    return stmt.all(operationId);
  }

  /**
   * Get failures for an operation
   */
  _getFailures(operationId) {
    const stmt = this.db.getDB().prepare(`
      SELECT * FROM sync_failures WHERE sync_operation_id = ? ORDER BY created_at ASC
    `);
    return stmt.all(operationId);
  }

  /**
   * Get inconsistencies for an operation
   */
  _getInconsistencies(operationId) {
    const stmt = this.db.getDB().prepare(`
      SELECT * FROM data_inconsistencies WHERE sync_operation_id = ? LIMIT 1000
    `);
    return stmt.all(operationId);
  }

  /**
   * Get status transitions for an operation
   */
  _getStatusTransitions(operationId) {
    const stmt = this.db.getDB().prepare(`
      SELECT * FROM sync_operation_status WHERE sync_operation_id = ? ORDER BY created_at ASC
    `);
    return stmt.all(operationId);
  }
}

export default OperationAnalyzer;
