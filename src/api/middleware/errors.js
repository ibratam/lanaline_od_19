export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
    this.errorCategory = 'user_correctable';
  }
}

export class SystemError extends Error {
  constructor(message = 'System error', details = null) {
    super(message);
    this.name = 'SystemError';
    this.statusCode = 503;
    this.code = 'SYSTEM_ERROR';
    this.details = details;
    this.errorCategory = 'system';
  }
}

export class UnrecoverableError extends Error {
  constructor(message = 'Unrecoverable error', details = null) {
    super(message);
    this.name = 'UnrecoverableError';
    this.statusCode = 500;
    this.code = 'UNRECOVERABLE_ERROR';
    this.details = details;
    this.errorCategory = 'unrecoverable';
  }
}

export default {
  ValidationError,
  SystemError,
  UnrecoverableError
};
