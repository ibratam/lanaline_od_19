/**
 * Formatting Utilities for Frontend
 */

/**
 * Format number with thousands separator
 */
export function formatNumber(num) {
  if (!Number.isFinite(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format date and time
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return dateString;
  }
}

/**
 * Format date only (no time)
 */
export function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return dateString;
  }
}

/**
 * Format time duration in milliseconds to human readable
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';

  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(2)}m`;
  } else {
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}

/**
 * Format sync status for display
 */
export function formatSyncStatus(status) {
  const statusMap = {
    'pending': '⏳ Pending',
    'running': '⚙️ Running',
    'completed': '✓ Completed',
    'failed': '✗ Failed',
    'rolled_back': '↩️ Rolled Back'
  };
  return statusMap[status] || status;
}

/**
 * Format trigger type
 */
export function formatTriggerType(type) {
  const typeMap = {
    'manual': '👤 Manual',
    'scheduled': '⏰ Scheduled'
  };
  return typeMap[type] || type;
}

/**
 * Format connection status
 */
export function formatConnectionStatus(status) {
  const statusMap = {
    'connected': '✓ Connected',
    'failed': '✗ Failed',
    'untested': '❓ Untested'
  };
  return statusMap[status] || status;
}

/**
 * Format value for display
 */
export function formatValue(value, maxLength = 100) {
  if (value === null || value === undefined) {
    return '<em>null</em>';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > maxLength ?
        json.substring(0, maxLength) + '...' : json;
    } catch {
      return '[Complex Object]';
    }
  }
  const str = String(value);
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format percentage
 */
export function formatPercentage(value, total) {
  if (!total || total === 0) return '0%';
  return Math.round((value / total) * 100) + '%';
}

/**
 * Format model name for display (res.partner -> Partner, product.product -> Product)
 */
export function formatModelName(modelName) {
  if (!modelName) return modelName;
  const parts = modelName.split('.');
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format error message for display
 */
export function formatError(error) {
  if (typeof error === 'string') {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  return String(error);
}

export default {
  formatNumber,
  formatDate,
  formatDateOnly,
  formatDuration,
  formatSyncStatus,
  formatTriggerType,
  formatConnectionStatus,
  formatValue,
  formatFileSize,
  formatPercentage,
  formatModelName,
  escapeHtml,
  truncate,
  formatError
};
