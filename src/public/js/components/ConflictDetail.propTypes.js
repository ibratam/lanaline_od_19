/**
 * PropTypes for ConflictDetail Component
 * Feature: 002-resolve-conflicts (US1)
 * Task: T001c
 * Date: 2026-01-19
 *
 * ConflictDetail displays side-by-side comparison of conflicting versions
 */

import { ComponentPropTypes } from './propTypes.js';

/**
 * ConflictDetail Component Props
 *
 * Props:
 *   - conflict (Conflict): The conflict object to display
 *   - loading (boolean): True while fetching details
 *   - error (string|null): Error message if fetch failed
 *   - lockInfo (ConflictLock|null): Current lock state
 *   - onClose (function): Called when user closes detail view
 *   - onResolve (function): Called when user selects resolution
 *   - readOnly (boolean): If true, disable resolution controls
 *
 * Usage:
 *   const detail = new ConflictDetail({
 *     conflict: fetchedConflict,
 *     loading: false,
 *     error: null,
 *     lockInfo: { locked_by: 5, locked_at: '2026-01-19T10:35:00Z' },
 *     onClose: () => hideDetail(),
 *     onResolve: (id, version) => resolveConflict(id, version),
 *     readOnly: false
 *   });
 */
export const ConflictDetailPropTypes = {
  // Data Props
  conflict: {
    type: 'object',
    shape: ComponentPropTypes.Conflict,
    required: true,
    description: 'Conflict object with both versions for comparison'
  },

  // State Props
  loading: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while fetching full conflict details'
  },

  error: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Error message if detail fetch failed'
  },

  lockInfo: {
    type: ['object', 'null'],
    shape: ComponentPropTypes.ConflictLock,
    required: false,
    default: null,
    description: 'Current lock information if conflict is locked'
  },

  readOnly: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'If true, hide resolution controls (e.g., conflict already applied)'
  },

  // Event Handler Props
  onClose: {
    type: 'function',
    signature: 'function() => void',
    required: true,
    description: 'Called when user clicks close/back button'
  },

  onResolve: {
    type: 'function',
    signature: 'function(conflictId: number, version: "local"|"odoo") => void',
    required: true,
    description: 'Called when user selects a version to keep'
  }
};

/**
 * ConflictDetail Display Configuration
 */
export const ConflictDetailRenderProps = {
  layout: 'side-by-side', // or 'stacked' for mobile

  panels: [
    {
      title: 'Metadata',
      fields: [
        { key: 'id', label: 'Conflict ID', type: 'number' },
        { key: 'model_name', label: 'Odoo Model', type: 'text' },
        { key: 'record_id', label: 'Record ID', type: 'number' },
        { key: 'field_name', label: 'Field', type: 'text', nullable: true },
        { key: 'state', label: 'Status', type: 'badge' },
        { key: 'created_at', label: 'Detected At', type: 'datetime' }
      ]
    },
    {
      title: 'Source (Local)',
      side: 'left',
      fields: [
        { key: 'source_write_date', label: 'Last Modified', type: 'datetime' },
        { key: 'source_value', label: 'Value', type: 'json', expandable: true }
      ]
    },
    {
      title: 'Target (Odoo)',
      side: 'right',
      fields: [
        { key: 'target_write_date', label: 'Last Modified', type: 'datetime' },
        { key: 'target_value', label: 'Value', type: 'json', expandable: true }
      ]
    }
  ],

  comparisonHighlight: true, // Highlight differences between versions
  timestampComparison: true, // Show which version is newer
  jsonDiffView: true // Show structured diff of JSON values
};

/**
 * Conflict State Badge Styles
 */
export const ConflictStateBadges = {
  detected: {
    class: 'badge-info',
    icon: 'circle',
    label: 'Detected',
    color: '#0dcaf0'
  },
  reviewing: {
    class: 'badge-warning',
    icon: 'eye',
    label: 'Under Review',
    color: '#ffc107'
  },
  resolved: {
    class: 'badge-primary',
    icon: 'check-circle',
    label: 'Resolved',
    color: '#0d6efd'
  },
  applied: {
    class: 'badge-success',
    icon: 'check-double',
    label: 'Applied',
    color: '#198754'
  },
  needs_manual_review: {
    class: 'badge-danger',
    icon: 'exclamation-triangle',
    label: 'Needs Manual Review',
    color: '#dc3545'
  }
};

/**
 * Lock State Display
 */
export const LockStateDisplay = {
  locked: {
    message: 'This conflict is being resolved by another user',
    icon: 'lock',
    class: 'alert-warning',
    actionLabel: 'Retry',
    actionDisabled: true
  },
  unlocked: {
    message: null,
    icon: null,
    class: null,
    actionLabel: 'Resolve This Conflict',
    actionDisabled: false
  }
};

/**
 * Component Integration Requirements
 */
export const ConflictDetailRequirements = {
  cssClasses: [
    'conflict-detail',
    'conflict-detail-modal',
    'conflict-detail-loading',
    'conflict-detail-error',
    'conflict-detail-comparison',
    'conflict-detail-locked',
    'conflict-detail-metadata',
    'conflict-detail-source',
    'conflict-detail-target',
    'conflict-detail-json-diff'
  ],

  requiredMethods: [
    'render()',
    'renderMetadata(conflict)',
    'renderComparison(source, target)',
    'renderLockWarning(lockInfo)',
    'renderResolutionButtons()',
    'handleClose()',
    'handleResolveClick(version)',
    'formatJsonValue(value)',
    'getTimestampComparison(sourceDate, targetDate)'
  ],

  requiredEvents: [
    'conflict:closed - Event fired when detail modal closes',
    'conflict:resolved - Event fired with {conflictId, version}'
  ],

  accessibilityRequirements: [
    'Proper ARIA labels for modal',
    'Keyboard navigation (ESC to close)',
    'Focus management on modal open/close',
    'Semantic HTML structure'
  ]
};

/**
 * JSON Formatting Options
 */
export const JsonFormattingOptions = {
  indent: 2,
  colors: true,
  maxDepth: 5,
  truncateStrings: 100,
  expandableFields: true,
  showTypes: true // Show type annotations: string, number, etc.
};

export default ConflictDetailPropTypes;
