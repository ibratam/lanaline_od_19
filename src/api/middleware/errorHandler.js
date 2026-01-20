import logger from '../../utils/logger.js';
import { sanitizeErrorMessage } from '../../utils/errorSanitizer.js';
import { ValidationError, SystemError, UnrecoverableError } from './errors.js';

/**
 * Categorize error for appropriate user messaging and retry strategy
 * Maps errors to UC (user correctable), SE (system), or UR (unrecoverable)
 */
function categorizeError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  // User-Correctable (UC-001-999)
  if (code.startsWith('UC') ||
      message.includes('validation') ||
      message.includes('required field') ||
      message.includes('constraint violation') ||
      message.includes('conflict is locked')) {
    return { category: 'user_correctable', prefix: 'UC' };
  }

  // System Errors (SE-001-999)
  if (code.startsWith('SE') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('temporarily unavailable')) {
    return { category: 'system', prefix: 'SE' };
  }

  // Unrecoverable (UR-001-999)
  return { category: 'unrecoverable', prefix: 'UR' };
}

/**
 * Centralized error handling middleware with error categorization
 */
export function errorHandler(err, req, res, next) {
  void next;
  const {
    message = 'Internal server error',
    details = null
  } = err;
  const responseStatus = err.status ?? err.statusCode ?? 500;
  let code = err.code ?? null;

  // Categorize error and assign error code with prefix if not already assigned
  const errorCategory = categorizeError(err);
  if (!code) {
    const errorNum = Math.floor(Math.random() * 999) + 1;
    code = `${errorCategory.prefix}-${String(errorNum).padStart(3, '0')}`;
  }

  // Prepare user-facing message (sanitized)
  let userMessage = sanitizeErrorMessage(message, errorCategory.category);
  if (errorCategory.category === 'user_correctable') {
    userMessage = sanitizeErrorMessage(message, 'user_correctable');
  } else if (errorCategory.category === 'system') {
    userMessage = 'A temporary system error occurred. The system will retry automatically.';
  } else {
    userMessage = 'An unrecoverable error occurred. Please contact support.';
  }

  // Log full error details internally
  logger.error('Request error:', {
    path: req.path,
    method: req.method,
    status: responseStatus,
    code,
    category: errorCategory.category,
    message,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userDetails: details
  });

  // Send response
  res.setHeader('Content-Type', 'application/json');
  res.status(responseStatus).json({
    error: true,
    status: responseStatus,
    code,
    category: errorCategory.category,
    message: userMessage,
    details: process.env.NODE_ENV === 'development' ? details || err.message : null,
    timestamp: new Date().toISOString()
  });
}

/**
 * Async route wrapper to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error class
 */
/**
 * Not found error class
 */
export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

/**
 * Unauthorized error class
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.code = 'UNAUTHORIZED';
  }
}

/**
 * Conflict error class
 */
export class ConflictError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
    this.code = 'CONFLICT';
    this.details = details;
  }
}

/**
 * Internal server error class
 */
export class InternalError extends Error {
  constructor(message = 'Internal server error', details = null) {
    super(message);
    this.name = 'InternalError';
    this.statusCode = 500;
    this.code = 'INTERNAL_ERROR';
    this.details = details;
  }
}

export { ValidationError, SystemError, UnrecoverableError };

export default errorHandler;
