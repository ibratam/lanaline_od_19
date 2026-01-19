export const ERROR_MESSAGES = {
  CONNECTION_NOT_FOUND: 'Connection not found',
  SCHEDULE_NOT_FOUND: 'Schedule not found',
  SYNC_NOT_FOUND: 'Sync run not found',
  INVALID_INPUT: 'Invalid input provided',
  DUPLICATE_REQUEST: 'A synchronization is already in progress',
  CRON_INVALID: 'Cron expression must be a valid 5-part string',
  TIMEZONE_INVALID: 'Timezone is invalid',
  ENCRYPTION_KEY_MISSING: 'Encryption key is missing or invalid',
  EXPORT_FORMAT_INVALID: 'Export format must be csv or json'
};

export function getErrorMessage(key, fallback = 'Unexpected error') {
  return ERROR_MESSAGES[key] || fallback;
}

export default {
  ERROR_MESSAGES,
  getErrorMessage
};
