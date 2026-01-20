/**
 * PropTypes Definitions for Conflict Resolution Components
 * Feature: 002-resolve-conflicts
 * Date: 2026-01-19
 *
 * Centralized type definitions for all conflict resolution UI components
 * using PropTypes for runtime type checking in vanilla JavaScript
 */

/**
 * Conflict object structure
 * @typedef {Object} Conflict
 * @property {number} id - Unique conflict ID
 * @property {string} model_name - Odoo model name (e.g., 'product.product')
 * @property {number} record_id - ID of the conflicting record
 * @property {string|null} field_name - Field with conflict (null for structural)
 * @property {Object} source_value - Value from source database (JSON)
 * @property {Object} target_value - Value from target database (JSON)
 * @property {string} source_write_date - ISO8601 datetime from source
 * @property {string} target_write_date - ISO8601 datetime from target
 * @property {string} state - Current state: detected|reviewing|resolved|applied|needs_manual_review
 * @property {number|null} locked_by - User ID holding lock, null if unlocked
 * @property {string|null} locked_at - ISO8601 when lock acquired
 * @property {string} created_at - ISO8601 when conflict detected
 * @property {string} updated_at - ISO8601 of last update
 * @property {ConflictResolution|null} resolution - Resolution details if resolved
 */
export const ConflictPropTypes = {
  id: 'number',
  model_name: 'string',
  record_id: 'number',
  field_name: ['string', 'null'],
  source_value: 'object',
  target_value: 'object',
  source_write_date: 'string',
  target_write_date: 'string',
  state: 'enum:detected|reviewing|resolved|applied|needs_manual_review',
  locked_by: ['number', 'null'],
  locked_at: ['string', 'null'],
  created_at: 'string',
  updated_at: 'string',
  resolution: ['object', 'null']
};

/**
 * Conflict Resolution object structure
 * @typedef {Object} ConflictResolution
 * @property {number} id - Resolution record ID
 * @property {number} conflict_id - FK to conflict
 * @property {string} chosen_version - 'local' or 'odoo'
 * @property {string} resolved_at - ISO8601 when user made choice
 * @property {string|null} applied_at - ISO8601 when applied, null if not applied
 * @property {number} retry_count - 0-3 failed attempts
 * @property {string|null} last_error - Error message from last attempt
 * @property {string|null} last_error_category - 'user_correctable'|'system'|'unrecoverable'
 * @property {string|null} next_retry_at - ISO8601 when next retry scheduled
 */
export const ConflictResolutionPropTypes = {
  id: 'number',
  conflict_id: 'number',
  chosen_version: 'enum:local|odoo',
  resolved_at: 'string',
  applied_at: ['string', 'null'],
  retry_count: 'number',
  last_error: ['string', 'null'],
  last_error_category: ['enum:user_correctable|system|unrecoverable', 'null'],
  next_retry_at: ['string', 'null']
};

/**
 * Sync Operation object structure
 * @typedef {Object} SyncOperation
 * @property {number} id - Operation ID
 * @property {number} sync_run_id - FK to sync run
 * @property {string} odoo_model - Model name
 * @property {string} operation_type - create|update|delete
 * @property {number} record_count - Records affected
 * @property {number|null} duration_ms - Execution time
 * @property {number} error_count - Errors encountered
 * @property {string} status - pending|completed|failed
 * @property {string|null} error_message - Error details
 * @property {string|null} error_category - 'user_correctable'|'system'|'unrecoverable'
 * @property {string} created_at - ISO8601 created
 */
export const SyncOperationPropTypes = {
  id: 'number',
  sync_run_id: 'number',
  odoo_model: 'string',
  operation_type: 'enum:create|update|delete',
  record_count: 'number',
  duration_ms: ['number', 'null'],
  error_count: 'number',
  status: 'enum:pending|completed|failed',
  error_message: ['string', 'null'],
  error_category: ['enum:user_correctable|system|unrecoverable', 'null'],
  created_at: 'string'
};

/**
 * Pagination metadata
 * @typedef {Object} Pagination
 * @property {number} page - Current page number (1-based)
 * @property {number} limit - Records per page
 * @property {number} total - Total record count
 * @property {number} pages - Total page count
 * @property {string|null} next_cursor - Base64 cursor for next page
 */
export const PaginationPropTypes = {
  page: 'number',
  limit: 'number',
  total: 'number',
  pages: 'number',
  next_cursor: ['string', 'null']
};

/**
 * Notification object
 * @typedef {Object} Notification
 * @property {string} id - Unique notification ID
 * @property {string} type - 'success'|'error'|'warning'|'info'
 * @property {string} message - User-visible message
 * @property {string|null} code - Error code (for errors)
 * @property {number|null} duration - Auto-dismiss after ms (null = manual)
 */
export const NotificationPropTypes = {
  id: 'string',
  type: 'enum:success|error|warning|info',
  message: 'string',
  code: ['string', 'null'],
  duration: ['number', 'null']
};

/**
 * Bulk resolution rule
 * @typedef {Object} BulkRule
 * @property {string} model - Odoo model to match
 * @property {string|null} field - Field name or null for all fields
 * @property {string} action - 'keep_local' or 'keep_odoo'
 * @property {boolean} dry_run - Preview only if true
 */
export const BulkRulePropTypes = {
  model: 'string',
  field: ['string', 'null'],
  action: 'enum:keep_local|keep_odoo',
  dry_run: 'boolean'
};

/**
 * Lock information
 * @typedef {Object} ConflictLock
 * @property {number} conflict_id - FK to conflict
 * @property {string} session_id - Browser session ID
 * @property {number|null} user_id - User ID
 * @property {string} locked_at - ISO8601 when acquired
 * @property {string} expires_at - ISO8601 when lock expires
 */
export const ConflictLockPropTypes = {
  conflict_id: 'number',
  session_id: 'string',
  user_id: ['number', 'null'],
  locked_at: 'string',
  expires_at: 'string'
};

/**
 * Component Event Handler Signatures
 * These document expected callback signatures
 */
export const EventHandlerSignatures = {
  // ConflictsList handlers
  onSelectConflict: 'function(conflictId: number) => void',
  onFilterChange: 'function(filters: {state?: string, model?: string, page?: number}) => void',
  onRefresh: 'function() => void',

  // ConflictDetail handlers
  onClose: 'function() => void',
  onResolve: 'function(conflictId: number, version: "local"|"odoo") => void',

  // ResolutionForm handlers
  onSubmit: 'function(resolution: {conflictId: number, chosenVersion: "local"|"odoo"}) => void',
  onCancel: 'function() => void',

  // BulkResolutionDialog handlers
  onApplyBulk: 'function(rule: BulkRule) => void',
  onDryRun: 'function(rule: BulkRule) => void',

  // NotificationPanel handlers
  onNotificationDismiss: 'function(notificationId: string) => void',

  // SyncHistoryPanel handlers
  onHistoryFilter: 'function(filters: {model?: string, operation?: string, startDate?: string, endDate?: string}) => void'
};

/**
 * API Response envelope structure
 * @typedef {Object} APIResponse
 * @property {Object|Array} data - Response payload
 * @property {Object|null} error - Error details if failed
 * @property {string|null} code - Error code
 * @property {Pagination|null} pagination - Pagination info if applicable
 */
export const APIResponsePropTypes = {
  data: ['object', 'array'],
  error: ['object', 'null'],
  code: ['string', 'null'],
  pagination: ['object', 'null']
};

// Export all PropTypes as a bundle
export const ComponentPropTypes = {
  Conflict: ConflictPropTypes,
  ConflictResolution: ConflictResolutionPropTypes,
  SyncOperation: SyncOperationPropTypes,
  Pagination: PaginationPropTypes,
  Notification: NotificationPropTypes,
  BulkRule: BulkRulePropTypes,
  ConflictLock: ConflictLockPropTypes,
  APIResponse: APIResponsePropTypes,
  EventHandlers: EventHandlerSignatures
};

export default ComponentPropTypes;
