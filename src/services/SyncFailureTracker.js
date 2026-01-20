import SyncFailure from '../models/SyncFailure.js';
import RetryHistory from '../models/RetryHistory.js';
import ErrorCategorizer from './ErrorCategorizer.js';
import logger from '../utils/logger.js';

/**
 * Sync Failure Tracker
 * Records sync failures with categorization and suggested corrective actions.
 */
export class SyncFailureTracker {
  constructor(db, errorCategorizer = new ErrorCategorizer()) {
    this.db = db.getDB ? db.getDB() : db;
    this.failureModel = new SyncFailure(this.db);
    this.retryHistoryModel = new RetryHistory(this.db);
    this.errorCategorizer = errorCategorizer;
  }

  recordFailure({
    syncRunId,
    syncOperationId = null,
    odooModel = null,
    recordId = null,
    error,
    failureReason = null,
    suggestedAction = null
  }) {
    const categoryResult = this.errorCategorizer.categorize(error);
    const errorCode = this._resolveErrorCode(error, categoryResult.prefix);
    const action = suggestedAction || this._suggestAction(categoryResult.category, error);

    const failure = this.failureModel.create({
      sync_run_id: syncRunId,
      sync_operation_id: syncOperationId,
      odoo_model: odooModel,
      record_id: recordId,
      error_code: errorCode,
      error_category: categoryResult.category,
      error_message: error?.message || 'Unknown error',
      failure_reason: failureReason,
      suggested_action: action
    });

    logger.warn('Recorded sync failure', {
      syncRunId,
      errorCode,
      category: categoryResult.category
    });

    return {
      failure,
      errorCode,
      category: categoryResult.category,
      suggestedAction: action
    };
  }

  recordRetry({
    syncRunId = null,
    syncOperationId = null,
    conflictId = null,
    error = null,
    userCorrection = null,
    nextRetryAt = null
  }) {
    const categoryResult = this.errorCategorizer.categorize(error || {});
    const errorCode = this._resolveErrorCode(error, categoryResult.prefix);

    return this.retryHistoryModel.create({
      sync_run_id: syncRunId,
      sync_operation_id: syncOperationId,
      conflict_id: conflictId,
      error_code: errorCode,
      error_category: error ? categoryResult.category : null,
      error_message: error?.message || null,
      user_correction: userCorrection,
      next_retry_at: nextRetryAt
    });
  }

  _resolveErrorCode(error, prefix) {
    const rawCode = String(error?.code || '');
    if (rawCode.startsWith('UC-') || rawCode.startsWith('SE-') || rawCode.startsWith('UR-')) {
      return rawCode;
    }

    const num = Math.floor(Math.random() * 999) + 1;
    return `${prefix}-${String(num).padStart(3, '0')}`;
  }

  _suggestAction(category, error) {
    const message = String(error?.message || '').toLowerCase();

    if (category === 'user_correctable') {
      if (message.includes('validation') || message.includes('required field')) {
        return 'Review missing or invalid fields, correct the data, then retry the sync.';
      }
      if (message.includes('constraint')) {
        return 'Fix constraint violations in the source data, then retry the sync.';
      }
      return 'Correct the data issue and retry the sync.';
    }

    if (category === 'system') {
      if (message.includes('rate limit') || message.includes('429')) {
        return 'Wait for rate limits to clear, then retry the sync.';
      }
      if (message.includes('timeout') || message.includes('network')) {
        return 'Check network connectivity and retry the sync.';
      }
      return 'Retry after a short delay. If the issue persists, check system connectivity.';
    }

    return 'This error is unrecoverable. Contact support with the error code.';
  }
}

export default SyncFailureTracker;
