/**
 * Validates an Odoo database URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
export function validateOdooUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validates a database name
 * @param {string} dbName - Database name to validate
 * @returns {boolean} - True if valid database name
 */
export function validateDatabaseName(dbName) {
  if (!dbName || typeof dbName !== 'string') {
    return false;
  }
  // Database names typically contain alphanumeric, underscore, hyphen
  return /^[a-zA-Z0-9_-]{1,128}$/.test(dbName);
}

/**
 * Validates an email address
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates required fields in an object
 * @param {object} obj - Object to validate
 * @param {string[]} requiredFields - Required field names
 * @returns {string|null} - Error message if validation fails, null if valid
 */
export function validateRequiredFields(obj, requiredFields) {
  if (!obj || typeof obj !== 'object') {
    return 'Object is required';
  }

  for (const field of requiredFields) {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      return `Field '${field}' is required`;
    }
  }

  return null;
}

/**
 * Validates cron expression format (5-part: minute hour day month day-of-week)
 * @param {string} cronExpression - Cron expression to validate
 * @returns {boolean} - True if valid cron expression
 */
export function validateCronExpression(cronExpression) {
  if (!cronExpression || typeof cronExpression !== 'string') {
    return false;
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    // 5 parts = standard cron, 6 parts = with seconds
    return false;
  }

  // Basic validation: each part should be a number, *, ?, comma-separated, or range
  const cronPartRegex = /^(\*|[0-9]|[0-9]-[0-9]|[0-9],[0-9]|\?|\/)[0-9a-zA-Z,\-/*?]*$/;
  return parts.every(part => cronPartRegex.test(part));
}

/**
 * Validates that a value is a positive integer
 * @param {*} value - Value to validate
 * @returns {boolean} - True if valid positive integer
 */
export function validatePositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Sanitizes a string to prevent SQL injection (basic)
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeString(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str.replace(/['";\\]/g, '\\$&');
}

/**
 * Validates a timezone name (IANA format)
 * @param {string} timezone - Timezone name
 * @returns {boolean} - True if valid timezone
 */
export function validateTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
