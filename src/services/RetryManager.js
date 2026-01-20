import logger from '../utils/logger.js';

/**
 * Retry Manager Service
 * Handles retry workflow with exponential backoff.
 */
export class RetryManager {
  constructor(conflictResolver) {
    this.conflictResolver = conflictResolver;
    this.backoffDelays = [5000, 10000, 20000];
  }

  async applyWithRetry(conflictId, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await this.conflictResolver.apply(conflictId);
      } catch (error) {
        lastError = error;
        const category = this._categorizeError(error);

        if (category !== 'system') {
          break;
        }

        const delayMs = this.backoffDelays[attempt] || this.backoffDelays[this.backoffDelays.length - 1];
        logger.warn('Retrying conflict apply', { conflictId, attempt: attempt + 1, delayMs });
        await this._delay(delayMs);
      }
    }

    if (lastError) {
      const db = this.conflictResolver.db;
      db.prepare(`
        UPDATE sync_conflicts
        SET state = 'needs_manual_review', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conflictId);
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Categorize errors into three categories for retry strategy and user messaging.
   * Maps to error codes: UC-001-999, SE-001-999, UR-001-999
   *
   * @param {Error} error - The error to categorize
   * @returns {string} One of 'user_correctable', 'system', or 'unrecoverable'
   */
  _categorizeError(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();

    // User-Correctable (UC-001-999): Validation errors, data constraint violations
    if (code.startsWith('UC') ||
        message.includes('validation') ||
        message.includes('required field') ||
        message.includes('constraint violation') ||
        message.includes('constraint failed')) {
      return 'user_correctable';
    }

    // System Errors (SE-001-999): Temporary failures that may succeed on retry
    if (code.startsWith('SE') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('temporarily unavailable')) {
      return 'system';
    }

    // Unrecoverable (UR-001-999): Permanent failures that won't succeed on retry
    return 'unrecoverable';
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RetryManager;
