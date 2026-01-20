/**
 * Error Sanitizer Utility
 * Removes sensitive data from error messages before exposing to users
 * Preserves: Field names, validation messages
 * Removes: Odoo API responses, stack traces, internal field values, SQL queries
 */

/**
 * Sanitize error message by removing sensitive data
 * @param {string} message - The error message to sanitize
 * @param {string} category - Error category (user_correctable, system, unrecoverable)
 * @returns {string} Sanitized error message
 */
export function sanitizeErrorMessage(message, category = 'unrecoverable') {
  if (!message || typeof message !== 'string') {
    return 'An error occurred';
  }

  let sanitized = message;

  // Remove Odoo API responses (JSON-like patterns)
  sanitized = sanitized.replace(/\{[^}]*"jsonrpc"[^}]*\}/gi, '[Odoo API Response]');
  sanitized = sanitized.replace(/\{[^}]*"result"[^}]*\}/gi, '[Odoo Response]');

  // Remove SQL queries
  sanitized = sanitized.replace(/\bSELECT\b.*?\bFROM\b.*?(?=\s|$)/gi, '[SQL Query]');
  sanitized = sanitized.replace(/\bINSERT\b.*?\bVALUES\b.*?(?=\s|$)/gi, '[SQL Insert]');
  sanitized = sanitized.replace(/\bUPDATE\b.*?\bSET\b.*?(?=\s|$)/gi, '[SQL Update]');

  // Remove database connection strings and credentials
  sanitized = sanitized.replace(/postgresql:\/\/[^:]+:[^@]+@[^/]+/gi, '[DB Connection]');
  sanitized = sanitized.replace(/sqlite:\/\/.*?(?=\s|$)/gi, '[DB Path]');

  // Remove file paths (local paths that might reveal system structure)
  sanitized = sanitized.replace(/\/(?:home|root|var|usr|etc)\/[^\s]*/gi, '[File Path]');
  sanitized = sanitized.replace(/C:\\(?:Users|Windows|Program Files)\\[^\s]*/gi, '[File Path]');

  // Remove email addresses and usernames
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[Email]');

  // Remove API keys and tokens (long hex strings or JWT-like patterns)
  sanitized = sanitized.replace(/[a-f0-9]{32,}/gi, '[Token]');
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[JWT Token]');

  // Remove IPv4 addresses
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP Address]');

  // For system and unrecoverable errors, provide generic message
  if (category === 'system') {
    return sanitized || 'A temporary system error occurred.';
  }

  if (category === 'unrecoverable') {
    // For unrecoverable, keep only the most basic message
    const basicMatch = sanitized.match(/^[^:]+/); // Get first part before colon
    return (basicMatch ? basicMatch[0] : sanitized) || 'An unrecoverable error occurred.';
  }

  // For user-correctable, preserve more detail
  return sanitized || 'Invalid input provided';
}

/**
 * Sanitize error object by removing sensitive data
 * @param {Error} error - The error object to sanitize
 * @param {string} category - Error category
 * @returns {Object} Sanitized error object with safe properties
 */
export function sanitizeError(error, category = 'unrecoverable') {
  if (!error || typeof error !== 'object') {
    return {
      message: 'An error occurred',
      category,
      safeForDisplay: true
    };
  }

  return {
    message: sanitizeErrorMessage(error.message, category),
    code: error.code || null,
    statusCode: error.statusCode || 500,
    category,
    safeForDisplay: true
  };
}

/**
 * Remove sensitive fields from request/response body
 * @param {Object} data - The data object to sanitize
 * @returns {Object} Sanitized data
 */
export function sanitizeRequestData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };
  const sensitiveFields = [
    'password', 'apiKey', 'api_key', 'token', 'secret',
    'secretKey', 'access_token', 'refresh_token', 'auth_token',
    'odoo_password', 'oauth_token', 'jwt_token'
  ];

  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

export default {
  sanitizeErrorMessage,
  sanitizeError,
  sanitizeRequestData
};
