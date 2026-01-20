import logger from '../utils/logger.js';
import ErrorCategorizer from './ErrorCategorizer.js';

/**
 * Retry Manager Service
 * Handles retry workflow with exponential backoff.
 */
export class RetryManager {
  constructor(conflictResolver, errorCategorizer = new ErrorCategorizer()) {
    this.conflictResolver = conflictResolver;
    this.errorCategorizer = errorCategorizer;
    this.backoffDelays = [5000, 10000, 20000];
    this.maxRateLimitRetries = 3;
    this.maxServerRetries = 1;
  }

  async applyWithRetry(conflictId, maxRetries = 3) {
    let lastError = null;
    let attempts = 0;
    let rateLimitRetries = 0;
    let serverRetries = 0;

    while (attempts < maxRetries) {
      try {
        return await this.conflictResolver.apply(conflictId);
      } catch (error) {
        lastError = error;
        attempts += 1;

        const decision = this._getRetryDecision(error, {
          rateLimitRetries,
          serverRetries
        });

        if (!decision.shouldRetry) {
          break;
        }

        if (decision.kind === 'rate_limit') {
          rateLimitRetries += 1;
        }

        if (decision.kind === 'server') {
          serverRetries += 1;
        }

        logger.warn('Retrying conflict apply', {
          conflictId,
          attempt: attempts,
          delayMs: decision.delayMs,
          reason: decision.reason
        });

        await this._delay(decision.delayMs);
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

  _getRetryDecision(error, counts) {
    const { statusCode, category } = this.errorCategorizer.categorize(error);
    const message = String(error?.message || '').toLowerCase();

    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
      return { shouldRetry: false, reason: 'client_error', kind: 'client', delayMs: 0 };
    }

    if (statusCode === 429 || message.includes('timeout') || message.includes('rate limit')) {
      if (counts.rateLimitRetries >= this.maxRateLimitRetries) {
        return { shouldRetry: false, reason: 'rate_limit_exhausted', kind: 'rate_limit', delayMs: 0 };
      }

      const delayMs = this.backoffDelays[counts.rateLimitRetries]
        || this.backoffDelays[this.backoffDelays.length - 1];
      return { shouldRetry: true, reason: 'rate_limit', kind: 'rate_limit', delayMs };
    }

    if (statusCode && statusCode >= 500) {
      if (counts.serverRetries >= this.maxServerRetries) {
        return { shouldRetry: false, reason: 'server_error_exhausted', kind: 'server', delayMs: 0 };
      }

      return { shouldRetry: true, reason: 'server_error', kind: 'server', delayMs: this.backoffDelays[0] };
    }

    if (category === 'system') {
      const delayMs = this.backoffDelays[Math.min(counts.rateLimitRetries, this.backoffDelays.length - 1)];
      return { shouldRetry: true, reason: 'system_error', kind: 'rate_limit', delayMs };
    }

    return { shouldRetry: false, reason: 'non_retryable', kind: 'other', delayMs: 0 };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RetryManager;
