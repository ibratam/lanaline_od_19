import logger from '../../utils/logger.js';

/**
 * Centralized error handling middleware
 */
export function errorHandler(err, req, res) {
  const {
    message = 'Internal server error',
    details = null
  } = err;
  const responseStatus = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  // Log error
  logger.error('Request error:', {
    path: req.path,
    method: req.method,
    status: responseStatus,
    message,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Send response
  res.status(responseStatus).json({
    error: true,
    status: responseStatus,
    code,
    message,
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
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

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

export default errorHandler;
