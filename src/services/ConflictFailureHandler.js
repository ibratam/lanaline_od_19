import logger from '../utils/logger.js';
import ErrorCategorizer from './ErrorCategorizer.js';
import ConflictResolution from '../models/ConflictResolution.js';
import RetryHistory from '../models/RetryHistory.js';
import { ensureConflictTransition } from '../utils/stateValidator.js';

/**
 * Conflict Failure Handler
 * Captures conflict resolution failures with categorization and guidance.
 */
export class ConflictFailureHandler {
  constructor(db, notificationService, errorCategorizer = new ErrorCategorizer()) {
    this.db = db.getDB ? db.getDB() : db;
    this.notificationService = notificationService;
    this.errorCategorizer = errorCategorizer;
    this.resolutionModel = new ConflictResolution(this.db);
    this.retryHistory = new RetryHistory(this.db);
  }

  handleApplyFailure(conflictId, error) {
    const conflict = this.db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const resolution = this.resolutionModel.getByConflictId(conflictId);
    if (!resolution) {
      throw new Error('Resolution record missing');
    }

    const categoryResult = this.errorCategorizer.categorize(error);
    const suggestedAction = this._suggestAction(categoryResult.category, error);
    const retryCount = (resolution.retry_count || 0) + 1;

    this.resolutionModel.updateError(conflictId, error.message, categoryResult.category);
    this.resolutionModel.updateRetry(conflictId, retryCount, null);

    this.retryHistory.create({
      conflict_id: conflictId,
      error_code: error?.code || null,
      error_category: categoryResult.category,
      error_message: error?.message || 'Conflict apply failed'
    });

    const nextState = retryCount >= 3 ? 'needs_manual_review' : 'failed_resolution';
    ensureConflictTransition(conflict.state, nextState);

    this.db.prepare(`
      UPDATE sync_conflicts
      SET state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextState, conflictId);

    if (nextState === 'needs_manual_review' && this.notificationService?.sendConflictNeedsReview) {
      this.notificationService.sendConflictNeedsReview({
        conflict_id: conflictId,
        state: nextState,
        error_category: categoryResult.category,
        suggested_action: suggestedAction
      });
    }

    logger.warn('Conflict resolution failed', {
      conflictId,
      category: categoryResult.category,
      retryCount,
      state: nextState
    });

    return {
      state: nextState,
      category: categoryResult.category,
      suggestedAction,
      retryCount
    };
  }

  getSuggestedAction(resolution) {
    if (!resolution?.last_error_category) {
      return null;
    }
    const fakeError = new Error(resolution.last_error || '');
    return this._suggestAction(resolution.last_error_category, fakeError);
  }

  _suggestAction(category, error) {
    const message = String(error?.message || '').toLowerCase();

    if (category === 'user_correctable') {
      if (message.includes('validation') || message.includes('required field')) {
        return 'Fix validation issues in the record and retry the resolution.';
      }
      if (message.includes('constraint')) {
        return 'Resolve constraint violations, then retry the resolution.';
      }
      return 'Update the record data and retry the resolution.';
    }

    if (category === 'system') {
      if (message.includes('timeout') || message.includes('network')) {
        return 'Check connectivity and retry after a short delay.';
      }
      if (message.includes('cache') || message.includes('stale')) {
        return 'Refresh data to clear stale cache, then retry.';
      }
      return 'Retry after the system stabilizes.';
    }

    return 'Review the data and contact support if the issue persists.';
  }
}

export default ConflictFailureHandler;
