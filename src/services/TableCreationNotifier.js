import logger from '../utils/logger.js';

/**
 * TableCreationNotifier Service
 * Manages notifications to users about table creation progress
 * Shows progress updates and confirmation messages
 */
class TableCreationNotifier {
  constructor(notificationService = null) {
    this.notificationService = notificationService;
    this.progressUpdates = [];
    this.notifications = [];
  }

  /**
   * Notify user that a missing table was detected
   * @param {string} tableName
   * @param {Object} context - Additional context (record count, fields, etc.)
   */
  notifyMissingTable(tableName, context = {}) {
    const message = `Missing table detected: ${tableName}`;
    const details = `The target database is missing the table "${tableName}". It will be created automatically.`;

    const notification = {
      type: 'missing_table_detected',
      severity: 'info',
      table_name: tableName,
      message,
      details,
      context,
      created_at: new Date().toISOString()
    };

    this.notifications.push(notification);
    logger.info(message, { tableName, ...context });

    // Send through notification service if available
    if (this.notificationService) {
      this.notificationService.notify({
        type: 'table_missing',
        title: 'Creating Missing Table',
        message: details,
        severity: 'info'
      });
    }

    return notification;
  }

  /**
   * Notify user of table creation progress
   * @param {string} tableName
   * @param {string} status - 'starting', 'in_progress', 'creating_dependencies', 'completed'
   * @param {Object} progress - Progress details
   */
  notifyCreationProgress(tableName, status, progress = {}) {
    const statusMessages = {
      starting: `Creating table ${tableName}...`,
      in_progress: `Creating table ${tableName}... (resolving dependencies)`,
      creating_dependencies: `Creating dependencies for ${tableName}...`,
      completed: `Table ${tableName} created successfully`
    };

    const message = statusMessages[status] || `Table creation: ${tableName} (${status})`;

    const update = {
      type: 'table_creation_progress',
      table_name: tableName,
      status,
      message,
      progress: {
        ...progress,
        estimated_time_remaining: this.estimateTimeRemaining(progress),
        timestamp: new Date().toISOString()
      }
    };

    this.progressUpdates.push(update);
    logger.info(message, { tableName, status, ...progress });

    // Send through notification service if available
    if (this.notificationService && status === 'in_progress') {
      this.notificationService.notify({
        type: 'table_creation_progress',
        title: 'Creating Table',
        message: message,
        severity: 'info'
      });
    }

    return update;
  }

  /**
   * Notify user of successful table creation
   * @param {string} tableName
   * @param {Object} details - Table details (column count, dependencies, etc.)
   */
  notifyTableCreationSuccess(tableName, details = {}) {
    const message = `Table created successfully: ${tableName}`;
    const columnCount = details.column_count || 0;
    const dependenciesResolved = details.dependencies_resolved || 0;

    const notification = {
      type: 'table_creation_success',
      severity: 'success',
      table_name: tableName,
      message,
      details: {
        ...details,
        column_count: columnCount,
        dependencies_resolved: dependenciesResolved,
        created_at: new Date().toISOString()
      }
    };

    this.notifications.push(notification);
    logger.info(message, { tableName, ...details });

    // Send through notification service if available
    if (this.notificationService) {
      this.notificationService.notify({
        type: 'table_creation_complete',
        title: 'Table Created',
        message: `Table "${tableName}" has been created successfully with ${columnCount} columns.`,
        severity: 'success'
      });
    }

    return notification;
  }

  /**
   * Notify user of table creation failure
   * @param {string} tableName
   * @param {Error} error
   * @param {Object} context - Additional context
   */
  notifyTableCreationFailure(tableName, error, context = {}) {
    const message = `Failed to create table: ${tableName}`;
    const errorMessage = error.message || 'Unknown error';

    const notification = {
      type: 'table_creation_failure',
      severity: 'error',
      table_name: tableName,
      message,
      error: errorMessage,
      context,
      created_at: new Date().toISOString()
    };

    this.notifications.push(notification);
    logger.error(message, { tableName, error: errorMessage, ...context });

    // Send through notification service if available
    if (this.notificationService) {
      this.notificationService.notify({
        type: 'table_creation_failed',
        title: 'Table Creation Failed',
        message: `Unable to create table "${tableName}": ${errorMessage}`,
        severity: 'error'
      });
    }

    return notification;
  }

  /**
   * Notify user about dependency resolution
   * @param {string} tableName
   * @param {Array} dependencies - List of dependent tables
   */
  notifyDependencyResolution(tableName, dependencies = []) {
    const dependencyList = dependencies.length > 0
      ? `Dependencies: ${dependencies.join(', ')}`
      : 'No dependencies found';

    const message = `Resolving dependencies for table ${tableName}: ${dependencyList}`;

    const notification = {
      type: 'dependency_resolution',
      severity: 'info',
      table_name: tableName,
      message,
      dependencies,
      dependency_count: dependencies.length,
      created_at: new Date().toISOString()
    };

    this.notifications.push(notification);
    logger.info(message, { tableName, dependencies });

    return notification;
  }

  /**
   * Get all notifications
   * @param {Object} filter - Filter options (type, severity, tableName, etc.)
   * @returns {Array} Filtered notifications
   */
  getNotifications(filter = {}) {
    let filtered = [...this.notifications];

    if (filter.type) {
      filtered = filtered.filter(n => n.type === filter.type);
    }
    if (filter.severity) {
      filtered = filtered.filter(n => n.severity === filter.severity);
    }
    if (filter.table_name) {
      filtered = filtered.filter(n => n.table_name === filter.table_name);
    }
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * Get all progress updates
   * @param {Object} filter - Filter options
   * @returns {Array} Filtered progress updates
   */
  getProgressUpdates(filter = {}) {
    let filtered = [...this.progressUpdates];

    if (filter.table_name) {
      filtered = filtered.filter(u => u.table_name === filter.table_name);
    }
    if (filter.status) {
      filtered = filtered.filter(u => u.status === filter.status);
    }
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * Estimate time remaining for table creation
   * @param {Object} progress - Progress data with timing info
   * @returns {number} Estimated seconds remaining (or null if can't estimate)
   */
  estimateTimeRemaining(progress = {}) {
    if (!progress.started_at || !progress.completed_tables === undefined) {
      return null;
    }

    const elapsed = Date.now() - new Date(progress.started_at).getTime();
    const totalTables = progress.total_tables || 1;
    const completedTables = progress.completed_tables || 0;

    if (completedTables === 0) return null;

    const avgTimePerTable = elapsed / completedTables;
    const remainingTables = totalTables - completedTables;
    const estimatedRemaining = (avgTimePerTable * remainingTables) / 1000; // Convert to seconds

    return Math.max(0, estimatedRemaining);
  }

  /**
   * Clear all notifications and progress updates
   */
  clear() {
    this.notifications = [];
    this.progressUpdates = [];
  }

  /**
   * Get summary of all notifications
   * @returns {Object} Summary object
   */
  getSummary() {
    const summary = {
      total_notifications: this.notifications.length,
      by_type: {},
      by_severity: {},
      total_progress_updates: this.progressUpdates.length,
      last_notification: this.notifications[this.notifications.length - 1] || null,
      last_update: this.progressUpdates[this.progressUpdates.length - 1] || null
    };

    this.notifications.forEach(n => {
      summary.by_type[n.type] = (summary.by_type[n.type] || 0) + 1;
      summary.by_severity[n.severity] = (summary.by_severity[n.severity] || 0) + 1;
    });

    return summary;
  }
}

export default TableCreationNotifier;
