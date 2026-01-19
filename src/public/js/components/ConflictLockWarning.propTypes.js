/**
 * PropTypes for ConflictLockWarning Component
 * Feature: 002-resolve-conflicts (US2)
 * Task: T001h
 * Date: 2026-01-19
 *
 * ConflictLockWarning alerts user when a conflict is locked by another session
 */

import { ComponentPropTypes } from './propTypes.js';

export const ConflictLockWarningPropTypes = {
  isVisible: {
    type: 'boolean',
    required: true,
    description: 'Show/hide the warning'
  },

  lockInfo: {
    type: 'object',
    shape: ComponentPropTypes.ConflictLock,
    required: false,
    description: 'Current lock information'
  },

  conflictId: {
    type: 'number',
    required: true,
    description: 'ID of locked conflict'
  },

  expiresIn: {
    type: ['number', 'null'],
    required: false,
    default: null,
    description: 'Seconds until lock expires'
  },

  lockedByUsername: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Username of user holding lock'
  },

  canForceUnlock: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'Whether current user can force unlock'
  },

  onRetry: {
    type: 'function',
    signature: 'function(conflictId: number) => void',
    required: true,
    description: 'Called when user clicks retry button'
  },

  onForceUnlock: {
    type: 'function',
    signature: 'function(conflictId: number) => Promise<void>',
    required: false,
    description: 'Called when user forces unlock (admin only)'
  },

  onDismiss: {
    type: 'function',
    signature: 'function() => void',
    required: true,
    description: 'Called when user closes warning'
  }
};

export const ConflictLockWarningRenderProps = {
  type: 'alert', // or 'modal', 'toast'
  position: 'top', // Where to display

  alert: {
    class: 'alert alert-warning',
    icon: 'lock',
    title: 'Conflict Locked',
    dismissible: true
  },

  message: {
    locked: 'This conflict is currently being resolved by another user. The lock will expire in {{expiresIn}} seconds.',
    lockedByUser: 'This conflict is being resolved by {{username}}. Try again after they\'re done.',
    lockedExpiring: 'Lock expiring soon! Retrying in {{expiresIn}}s...',
    lockedExpired: 'The lock has expired. You can now try again.'
  },

  buttons: {
    retry: {
      label: 'Retry Now',
      class: 'btn btn-primary btn-sm',
      icon: 'sync-alt'
    },
    forceUnlock: {
      label: 'Force Unlock (Admin)',
      class: 'btn btn-danger btn-sm',
      icon: 'unlock',
      requiresConfirm: true
    },
    dismiss: {
      label: 'Dismiss',
      class: 'btn-close'
    }
  },

  countdownDisplay: {
    show: true,
    format: '{{seconds}}s',
    updateFrequency: 1000 // Update every second
  }
};

export const ConflictLockWarningBehavior = {
  autoRetry: false, // Don't auto-retry after lock expires
  autoClose: false, // Stay open until user dismisses
  countdownRefresh: 1000, // Refresh countdown every 1s
  expirationBuffer: 2000, // Warn 2s before expiration
  retryDelay: 3000 // Wait 3s before retrying after lock expires
};

export const ConflictLockWarningStates = {
  locked: {
    icon: 'lock',
    class: 'warning',
    message: 'Conflict is locked by another user',
    showCountdown: true,
    actionButtons: ['retry', 'dismiss']
  },

  locked_expiring_soon: {
    icon: 'hourglass-end',
    class: 'warning',
    message: 'Lock expiring soon...',
    showCountdown: true,
    actionButtons: ['retry', 'dismiss']
  },

  lock_expired: {
    icon: 'unlock',
    class: 'info',
    message: 'Lock expired. You can retry now.',
    showCountdown: false,
    actionButtons: ['retry', 'dismiss']
  },

  force_unlock_available: {
    icon: 'lock-open',
    class: 'danger',
    message: 'Admin: Force unlock available',
    showCountdown: false,
    actionButtons: ['forceUnlock', 'dismiss']
  }
};

export const ConflictLockWarningRequirements = {
  cssClasses: [
    'conflict-lock-warning',
    'lock-warning-alert',
    'lock-warning-modal',
    'lock-warning-locked',
    'lock-warning-expiring',
    'lock-warning-expired',
    'lock-countdown',
    'lock-message',
    'lock-buttons',
    'btn-retry',
    'btn-force-unlock',
    'btn-dismiss'
  ],

  requiredMethods: [
    'render()',
    'renderAlert()',
    'renderCountdown()',
    'renderButtons()',
    'handleRetry()',
    'handleForceUnlock()',
    'handleDismiss()',
    'startCountdown(seconds)',
    'stopCountdown()',
    'updateCountdown()',
    'getExpirationTime()',
    'shouldShowForceUnlock()'
  ],

  requiredEvents: [
    'lock:warning-shown - Event when warning appears',
    'lock:retry-clicked - Event when retry button clicked',
    'lock:force-unlock-clicked - Event when force unlock attempted',
    'lock:dismissed - Event when warning closed',
    'lock:expired - Event when lock expires'
  ],

  serverSynchronization: [
    'Poll lock status every 5 seconds',
    'Update countdown display every 1 second',
    'Detect lock expiration server-side',
    'Handle race condition if user refreshes page'
  ]
};

export const ConflictLockWarningAccessibility = {
  ariaLive: 'assertive', // Announce immediately
  ariaLabel: 'Conflict locked warning',
  role: 'alert',

  accessibleText: [
    'Lock warning is provided as alert for screen readers',
    'Countdown updates announced every second',
    'Button labels are clear and descriptive',
    'Color coding supplemented with icons and text'
  ],

  keyboardNavigation: [
    'Tab to cycle through buttons',
    'Enter to activate button',
    'Escape to dismiss (if dismissible)'
  ]
};

export const ConflictLockWarningPerformance = {
  countdownUpdateInterval: 1000, // ms
  statusPollingInterval: 5000, // ms
  maxCountdownDuration: 600000, // 10 minutes max lock time

  optimizations: [
    'Debounce countdown updates',
    'Cancel polling on component unmount',
    'Use requestAnimationFrame for animations'
  ]
};

export default ConflictLockWarningPropTypes;
