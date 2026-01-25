/**
 * PropTypes for BulkResolutionDialog Component
 * Feature: 002-resolve-conflicts (US4)
 * Task: T001e
 * Date: 2026-01-19
 *
 * BulkResolutionDialog allows user to create rules and bulk-resolve multiple conflicts
 */

import { ComponentPropTypes } from './propTypes.js';

export const BulkResolutionDialogPropTypes = {
  isOpen: {
    type: 'boolean',
    required: true,
    description: 'Dialog visibility state'
  },

  models: {
    type: 'array',
    items: 'string', // e.g., ['product.product', 'sale.order']
    required: true,
    description: 'List of available models for filtering'
  },

  preselectedModel: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Pre-fill rule model if known'
  },

  loading: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while applying bulk resolution'
  },

  previewing: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while fetching dry-run preview'
  },

  error: {
    type: ['object', 'null'],
    required: false,
    default: null,
    description: 'Error object if operation failed'
  },

  previewResult: {
    type: ['object', 'null'],
    required: false,
    default: null,
    description: 'Result of dry-run preview'
  },

  onApply: {
    type: 'function',
    signature: 'function(rule: BulkRule) => Promise<{resolved_count, failed_count}>',
    required: true,
    description: 'Called when user applies bulk resolution'
  },

  onDryRun: {
    type: 'function',
    signature: 'function(rule: BulkRule) => Promise<{matching_conflicts, preview}>',
    required: true,
    description: 'Called when user clicks preview'
  },

  onClose: {
    type: 'function',
    signature: 'function() => void',
    required: true,
    description: 'Called when user closes dialog'
  }
};

export const BulkResolutionDialogRenderProps = {
  title: 'Bulk Resolve Conflicts',

  sections: [
    {
      id: 'rule-builder',
      title: 'Create Resolution Rule',
      description: 'Select a model and action to resolve multiple conflicts automatically'
    },
    {
      id: 'preview',
      title: 'Preview',
      description: 'See which conflicts will be affected before applying'
    },
    {
      id: 'results',
      title: 'Results',
      description: 'Summary of applied resolutions'
    }
  ],

  modelSelector: {
    label: 'Odoo Model',
    placeholder: 'Select model (e.g., product.product)',
    required: true,
    helpText: 'All conflicts for this model will be affected'
  },

  fieldSelector: {
    label: 'Field Filter (Optional)',
    placeholder: 'Leave empty to affect all fields',
    required: false,
    helpText: 'Leave empty to resolve all fields in the model'
  },

  actionSelector: {
    label: 'Action',
    required: true,
    options: [
      {
        value: 'keep_local',
        label: 'Keep All Source Versions',
        description: 'Use source database values for all conflicts'
      },
      {
        value: 'keep_odoo',
        label: 'Keep All Target Versions',
        description: 'Use target database values for all conflicts'
      }
    ]
  },

  buttons: {
    preview: {
      label: 'Preview Changes',
      class: 'btn btn-info',
      icon: 'eye'
    },
    apply: {
      label: 'Apply Resolution',
      loadingLabel: 'Applying...',
      class: 'btn btn-success btn-lg',
      icon: 'check-circle'
    },
    cancel: {
      label: 'Cancel',
      class: 'btn btn-secondary',
      icon: 'times'
    }
  }
};

export const BulkResolutionDialogPreviewFormat = {
  summaryBox: {
    matchingConflicts: {
      label: 'Matching Conflicts',
      type: 'number'
    },
    affectedModels: {
      label: 'Models Affected',
      type: 'number'
    },
    estimatedTime: {
      label: 'Est. Time',
      type: 'duration'
    }
  },

  previewTable: {
    columns: [
      { field: 'id', header: 'ID', width: '60px' },
      { field: 'model_name', header: 'Model', width: '180px' },
      { field: 'record_id', header: 'Record', width: '100px' },
      { field: 'field_name', header: 'Field', width: '140px' },
      { field: 'will_apply_version', header: 'Will Apply', width: '100px', format: 'badge' },
      { field: 'current_state', header: 'State', width: '120px', format: 'badge' }
    ],
    maxRows: 20,
    showPagination: true
  }
};

export const BulkResolutionResultsFormat = {
  successBox: {
    resolvedCount: {
      label: 'Successfully Resolved',
      type: 'number',
      class: 'text-success'
    },
    alreadyResolvedCount: {
      label: 'Already Resolved',
      type: 'number',
      class: 'text-info'
    },
    failedCount: {
      label: 'Failed',
      type: 'number',
      class: 'text-danger'
    }
  },

  failureDetails: {
    title: 'Failed Conflicts',
    showDetails: true,
    columns: [
      { field: 'conflict_id', header: 'Conflict ID' },
      { field: 'reason', header: 'Reason' },
      { field: 'error_code', header: 'Error Code' }
    ]
  }
};

export const BulkResolutionDialogRequirements = {
  cssClasses: [
    'bulk-resolution-dialog',
    'bulk-resolution-modal',
    'bulk-resolution-loading',
    'bulk-resolution-previewing',
    'bulk-resolution-error',
    'rule-builder',
    'preview-section',
    'results-section',
    'summary-box',
    'affected-list',
    'conflict-preview-table'
  ],

  requiredMethods: [
    'render()',
    'renderRuleBuilder()',
    'renderPreview(result)',
    'renderResults(result)',
    'renderErrorState(error)',
    'handleRuleChange(field, value)',
    'handlePreviewClick()',
    'handleApplyClick()',
    'handleClose()',
    'formatConflictsList(conflicts)',
    'validateRule(rule)'
  ],

  validationRules: [
    'Model field is required',
    'Action field is required',
    'Field is optional but if provided must match existing field names',
    'Only one action allowed per dialog'
  ],

  requiredEvents: [
    'bulk:preview-requested - Event with rule',
    'bulk:apply-requested - Event with rule',
    'bulk:preview-complete - Event with result',
    'bulk:apply-complete - Event with result',
    'bulk:cancelled - Event fired on close'
  ],

  performanceRequirements: [
    'Preview must complete in <5 seconds for 100+ conflicts',
    'Apply must show progress indicator (attempt N/3)',
    'Results must display within 10 seconds'
  ]
};

export const BulkResolutionValidation = {
  rules: {
    model: {
      required: true,
      pattern: /^[a-z]+\.[a-z_]+$/, // Odoo model naming pattern
      maxLength: 100
    },
    field: {
      required: false,
      pattern: /^[a-z_]+$/, // Field naming pattern
      maxLength: 100
    },
    action: {
      required: true,
      enum: ['keep_local', 'keep_odoo']
    }
  },

  errorMessages: {
    modelRequired: 'Model is required',
    modelInvalid: 'Invalid model name format',
    fieldInvalid: 'Invalid field name format',
    actionRequired: 'Action is required',
    noConflicts: 'No conflicts match this rule'
  }
};

export default BulkResolutionDialogPropTypes;
