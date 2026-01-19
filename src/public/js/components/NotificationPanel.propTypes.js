/**
 * PropTypes for NotificationPanel Component
 * Feature: 002-resolve-conflicts (US2)
 * Task: T001g
 * Date: 2026-01-19
 *
 * NotificationPanel displays toast notifications for sync events and retries
 */

import { ComponentPropTypes } from './propTypes.js';

export const NotificationPanelPropTypes = {
  notifications: {
    type: 'array',
    items: ComponentPropTypes.Notification,
    required: true,
    description: 'Array of active notifications'
  },

  maxNotifications: {
    type: 'number',
    required: false,
    default: 5,
    description: 'Maximum visible notifications before queueing'
  },

  position: {
    type: 'enum:top-left|top-center|top-right|bottom-left|bottom-center|bottom-right',
    required: false,
    default: 'bottom-right',
    description: 'Position of notification container'
  },

  animationDuration: {
    type: 'number',
    required: false,
    default: 300,
    description: 'Slide-in animation duration in ms'
  },

  onNotificationDismiss: {
    type: 'function',
    signature: 'function(notificationId: string) => void',
    required: true,
    description: 'Called when user closes notification or timeout expires'
  }
};

export const NotificationPanelRenderProps = {
  position: 'bottom-right',

  stack: {
    maxVisible: 5,
    queueExcess: true, // Queue notifications if max exceeded
    transitionDuration: 300
  },

  notificationTypes: {
    success: {
      icon: 'check-circle',
      class: 'notification-success',
      defaultDuration: 3000
    },
    error: {
      icon: 'exclamation-circle',
      class: 'notification-error',
      defaultDuration: 8000, // Errors stay longer
      closeable: true
    },
    warning: {
      icon: 'exclamation-triangle',
      class: 'notification-warning',
      defaultDuration: 5000,
      closeable: true
    },
    info: {
      icon: 'info-circle',
      class: 'notification-info',
      defaultDuration: 4000
    }
  }
};

export const NotificationTemplates = {
  resolutionSuccess: {
    type: 'success',
    icon: 'check-circle',
    message: 'Conflict {{conflictId}} resolved and applied successfully',
    duration: 3000
  },

  resolutionFailed: {
    type: 'error',
    icon: 'exclamation-circle',
    message: 'Failed to resolve conflict {{conflictId}}: {{errorMessage}}',
    duration: 8000,
    closeable: true,
    showDetails: true
  },

  retryStarting: {
    type: 'info',
    icon: 'hourglass-start',
    message: 'Retrying sync (attempt {{attempt}}/3)...',
    duration: null, // Stays until complete
    closeable: false
  },

  retryFailed: {
    type: 'warning',
    icon: 'hourglass-end',
    message: 'Sync attempt {{attempt}}/3 failed. Retrying in {{seconds}} seconds...',
    duration: null,
    closeable: false,
    showCountdown: true
  },

  retryGaveUp: {
    type: 'error',
    icon: 'exclamation-triangle',
    message: 'Failed to sync conflict {{conflictId}} after 3 attempts. {{code}}: {{reason}}',
    duration: 10000,
    closeable: true,
    showErrorCode: true,
    actionButton: {
      label: 'Contact Support',
      handler: 'openSupportTicket'
    }
  },

  bulkResolutionStarted: {
    type: 'info',
    icon: 'spinner',
    message: 'Bulk resolving {{count}} conflicts...',
    duration: null,
    closeable: false,
    showProgress: true
  },

  bulkResolutionComplete: {
    type: 'success',
    icon: 'check-double',
    message: 'Bulk resolved {{successful}} conflicts ({{failed}} failed)',
    duration: 5000,
    closeable: true
  },

  conflictLocked: {
    type: 'warning',
    icon: 'lock',
    message: 'Conflict {{conflictId}} is being resolved by another user. Try again in a moment.',
    duration: 5000,
    closeable: true
  },

  lockExpired: {
    type: 'info',
    icon: 'hourglass-end',
    message: 'Your lock on conflict {{conflictId}} has expired. Please start over.',
    duration: 6000,
    closeable: true,
    actionButton: {
      label: 'Retry',
      handler: 'retryResolution'
    }
  }
};

export const NotificationPanelRequirements = {
  cssClasses: [
    'notification-panel',
    'notification-container',
    'notification-stack',
    'notification-item',
    'notification-success',
    'notification-error',
    'notification-warning',
    'notification-info',
    'notification-loading',
    'notification-close-btn',
    'notification-progress',
    'notification-countdown',
    'position-top-right',
    'position-bottom-right'
  ],

  requiredMethods: [
    'render()',
    'addNotification(notification)',
    'removeNotification(id)',
    'clearAll()',
    'renderNotification(notification)',
    'renderCountdown(seconds)',
    'renderProgress(percent)',
    'handleClose(id)',
    'startAutoClose(id, duration)',
    'cancelAutoClose(id)',
    'updateNotification(id, changes)'
  ],

  requiredEvents: [
    'notification:added - Event with notification data',
    'notification:dismissed - Event with notification id',
    'notification:action-clicked - Event with {id, action}',
    'notification:cleared - Event when all cleared'
  ],

  accessibilityRequirements: [
    'ARIA live region for screen readers',
    'ARIA labels on close buttons',
    'Keyboard dismissible (ESC)',
    'Color not sole indicator of type',
    'High contrast for text'
  ]
};

export const NotificationAnimation = {
  slideIn: {
    duration: 300,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    from: { transform: 'translateX(400px)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 }
  },

  slideOut: {
    duration: 300,
    easing: 'ease-out',
    from: { transform: 'translateX(0)', opacity: 1 },
    to: { transform: 'translateX(400px)', opacity: 0 }
  },

  fadeOut: {
    duration: 500,
    easing: 'ease-out',
    from: { opacity: 1 },
    to: { opacity: 0 }
  }
};

export const NotificationQueueing = {
  maxVisible: 5,
  queueStrategy: 'fifo', // or 'lifo'
  groupSimilar: true, // Merge duplicate notifications
  timeout: 8000 // Default auto-dismiss time
};

export default NotificationPanelPropTypes;
