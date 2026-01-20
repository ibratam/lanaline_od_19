import logger from '../utils/logger.js';

/**
 * Error Categorizer Service
 * Classifies errors for retry strategy and user messaging.
 */
export class ErrorCategorizer {
  constructor() {
    this.codeRanges = {
      user_correctable: 'UC',
      system: 'SE',
      unrecoverable: 'UR'
    };
  }

  /**
   * Categorize an error into UC/SE/UR with supporting metadata.
   */
  categorize(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    const statusCode = this._extractStatusCode(error);

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      if (statusCode === 408 || statusCode === 429) {
        return this._buildResult('system', statusCode);
      }

      if (statusCode === 401 || statusCode === 403) {
        return this._buildResult('unrecoverable', statusCode);
      }

      if (message.includes('validation') ||
          message.includes('required field') ||
          message.includes('constraint')) {
        return this._buildResult('user_correctable', statusCode);
      }

      return this._buildResult('unrecoverable', statusCode);
    }

    if (statusCode && statusCode >= 500) {
      return this._buildResult('system', statusCode);
    }

    if (code.startsWith('UC') ||
        message.includes('validation') ||
        message.includes('required field') ||
        message.includes('constraint violation') ||
        message.includes('constraint failed')) {
      return this._buildResult('user_correctable', statusCode);
    }

    if (code.startsWith('SE') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('temporarily unavailable') ||
        message.includes('rate limit') ||
        message.includes('too many requests')) {
      return this._buildResult('system', statusCode);
    }

    if (code.startsWith('UR')) {
      return this._buildResult('unrecoverable', statusCode);
    }

    return this._buildResult('unrecoverable', statusCode);
  }

  _extractStatusCode(error) {
    const status = error?.statusCode
      ?? error?.details?.status
      ?? error?.details?.statusCode
      ?? error?.response?.status;

    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : null;
  }

  _buildResult(category, statusCode) {
    const prefix = this.codeRanges[category] || 'UR';
    return {
      category,
      prefix,
      statusCode
    };
  }

  logCategorization(error) {
    const result = this.categorize(error);
    logger.warn('Categorized error', {
      category: result.category,
      statusCode: result.statusCode,
      error: error?.message
    });
    return result;
  }
}

export default ErrorCategorizer;
