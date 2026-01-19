/**
 * PropTypes for ResolutionForm Component
 * Feature: 002-resolve-conflicts (US2)
 * Task: T001d
 * Date: 2026-01-19
 *
 * ResolutionForm allows user to select which version to keep and apply
 */

import { ComponentPropTypes } from './propTypes.js';

export const ResolutionFormPropTypes = {
  conflictId: {
    type: 'number',
    required: true,
    description: 'ID of conflict being resolved'
  },

  sourceLabel: {
    type: 'string',
    required: false,
    default: 'Local',
    description: 'Label for source/local version'
  },

  targetLabel: {
    type: 'string',
    required: false,
    default: 'Odoo',
    description: 'Label for target/odoo version'
  },

  sourceDate: {
    type: 'string',
    required: true,
    description: 'ISO8601 datetime of source version'
  },

  targetDate: {
    type: 'string',
    required: true,
    description: 'ISO8601 datetime of target version'
  },

  preselectedVersion: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Pre-select "local" or "odoo" if known'
  },

  loading: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while applying resolution'
  },

  error: {
    type: ['object', 'null'],
    required: false,
    default: null,
    description: 'Error object if application failed'
  },

  retrying: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True if auto-retry countdown active'
  },

  retryCountdown: {
    type: ['number', 'null'],
    required: false,
    default: null,
    description: 'Seconds until next retry'
  },

  retryCount: {
    type: 'number',
    required: false,
    default: 0,
    description: 'Current retry attempt (0-3)'
  },

  onSubmit: {
    type: 'function',
    signature: 'function(resolution: {conflictId: number, chosenVersion: "local"|"odoo"}) => Promise<void>',
    required: true,
    description: 'Called when user submits resolution'
  },

  onCancel: {
    type: 'function',
    signature: 'function() => void',
    required: true,
    description: 'Called when user clicks cancel'
  }
};

export const ResolutionFormRenderProps = {
  showTimestampComparison: true,
  showRecencyIndicator: true, // Highlight newer version
  radioLayout: 'vertical', // or 'horizontal'

  buttons: [
    {
      id: 'keep-local',
      label: 'Keep Local',
      version: 'local',
      class: 'btn btn-outline-primary'
    },
    {
      id: 'keep-odoo',
      label: 'Keep Odoo',
      version: 'odoo',
      class: 'btn btn-outline-primary'
    }
  ],

  submitButton: {
    label: 'Apply Resolution',
    loadingLabel: 'Applying...',
    class: 'btn btn-success btn-lg'
  },

  cancelButton: {
    label: 'Cancel',
    class: 'btn btn-secondary'
  }
};

export const ResolutionFormErrorDisplay = {
  user_correctable: {
    title: 'Resolution Failed',
    class: 'alert-warning',
    icon: 'exclamation-circle',
    action: 'Retry',
    showDetails: true
  },

  system: {
    title: 'Syncing to Odoo...',
    class: 'alert-info',
    icon: 'hourglass-start',
    action: 'Retrying automatically',
    showCountdown: true
  },

  unrecoverable: {
    title: 'Sync Error',
    class: 'alert-danger',
    icon: 'exclamation-triangle',
    action: 'Contact Support',
    showErrorCode: true,
    showDetails: false // Hide technical details
  }
};

export const ResolutionFormRequirements = {
  cssClasses: [
    'resolution-form',
    'resolution-form-loading',
    'resolution-form-error',
    'resolution-form-retrying',
    'resolution-form-readonly',
    'resolution-options',
    'resolution-option-local',
    'resolution-option-odoo',
    'timestamp-comparison',
    'timestamp-newer',
    'timestamp-older'
  ],

  requiredMethods: [
    'render()',
    'renderOptions()',
    'renderTimestamps()',
    'renderError(error)',
    'renderRetryCountdown(seconds)',
    'handleOptionSelect(version)',
    'handleSubmit()',
    'handleCancel()',
    'startCountdown(seconds)',
    'formatTimestamp(isoDate)'
  ],

  requiredEvents: [
    'resolution:submitted - Event with {conflictId, version}',
    'resolution:cancelled - Event fired on cancel',
    'resolution:retrying - Event with {attemptNumber, nextRetryIn}'
  ],

  stateTransitions: [
    'idle → loading → success',
    'idle → loading → error → system error → auto-retry → loading',
    'idle → loading → error → unrecoverable error → manual review needed',
    'any state → cancelled'
  ]
};

export default ResolutionFormPropTypes;
