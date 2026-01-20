/**
 * PropTypes for SyncHistoryPanel Component
 * Feature: 002-resolve-conflicts (US3)
 * Task: T001f
 * Date: 2026-01-19
 *
 * SyncHistoryPanel displays extended sync operation history with conflict details
 */

import { ComponentPropTypes } from './propTypes.js';

export const SyncHistoryPanelPropTypes = {
  operations: {
    type: 'array',
    items: ComponentPropTypes.SyncOperation,
    required: true,
    description: 'Array of sync operations to display'
  },

  pagination: {
    type: 'object',
    shape: ComponentPropTypes.Pagination,
    required: true,
    description: 'Pagination metadata'
  },

  loading: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while fetching history'
  },

  error: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Error message if fetch failed'
  },

  filters: {
    type: 'object',
    shape: {
      model: ['string', 'null'],
      operation: ['string', 'null'],
      status: ['string', 'null'],
      startDate: ['string', 'null'],
      endDate: ['string', 'null'],
      page: 'number'
    },
    required: false,
    default: { model: null, operation: null, status: null, startDate: null, endDate: null, page: 1 },
    description: 'Current filter state'
  },

  conflictDetails: {
    type: ['object', 'null'],
    required: false,
    default: null,
    description: 'Expanded conflict detail for selected operation'
  },

  onFilterChange: {
    type: 'function',
    signature: 'function(filters: {model?, operation?, status?, startDate?, endDate?, page}) => void',
    required: true,
    description: 'Called when user changes filters'
  },

  onPaginationChange: {
    type: 'function',
    signature: 'function(page: number) => void',
    required: true,
    description: 'Called when user changes page'
  },

  onOperationExpand: {
    type: 'function',
    signature: 'function(operationId: number) => Promise<{conflicts, details}>',
    required: false,
    description: 'Called when user expands operation row to see conflicts'
  }
};

export const SyncHistoryPanelRenderProps = {
  layout: 'timeline', // or 'table'

  columns: [
    {
      field: 'id',
      header: 'ID',
      width: '60px',
      sortable: false
    },
    {
      field: 'created_at',
      header: 'Date',
      width: '160px',
      sortable: true,
      format: 'datetime'
    },
    {
      field: 'odoo_model',
      header: 'Model',
      width: '180px',
      sortable: true,
      format: 'text'
    },
    {
      field: 'operation_type',
      header: 'Operation',
      width: '100px',
      sortable: true,
      format: 'badge',
      badgeMap: {
        create: 'badge-success',
        update: 'badge-info',
        delete: 'badge-danger'
      }
    },
    {
      field: 'record_count',
      header: 'Records',
      width: '80px',
      sortable: true,
      format: 'number'
    },
    {
      field: 'status',
      header: 'Status',
      width: '100px',
      sortable: true,
      format: 'badge',
      badgeMap: {
        pending: 'badge-warning',
        completed: 'badge-success',
        failed: 'badge-danger'
      }
    },
    {
      field: 'duration_ms',
      header: 'Duration',
      width: '100px',
      sortable: true,
      format: 'duration'
    },
    {
      field: 'error_count',
      header: 'Errors',
      width: '80px',
      sortable: true,
      format: 'number',
      highlight: value => value > 0 ? 'text-danger' : null
    }
  ],

  expandableRows: true,
  expandedRowContent: 'conflict-details',

  filterOptions: {
    operation: [
      { label: 'All Operations', value: null },
      { label: 'Create', value: 'create' },
      { label: 'Update', value: 'update' },
      { label: 'Delete', value: 'delete' }
    ],
    status: [
      { label: 'All Statuses', value: null },
      { label: 'Pending', value: 'pending' },
      { label: 'Completed', value: 'completed' },
      { label: 'Failed', value: 'failed' }
    ]
  },

  dateRangePicker: {
    enabled: true,
    label: 'Date Range',
    format: 'YYYY-MM-DD'
  }
};

export const SyncHistoryConflictDetails = {
  expandableRows: true,

  conflictColumns: [
    {
      field: 'conflict_id',
      header: 'Conflict',
      width: '80px'
    },
    {
      field: 'record_id',
      header: 'Record',
      width: '100px'
    },
    {
      field: 'field_name',
      header: 'Field',
      width: '140px',
      nullable: true
    },
    {
      field: 'state',
      header: 'Status',
      width: '120px',
      format: 'badge'
    },
    {
      field: 'resolution',
      header: 'Resolution',
      width: '100px',
      format: 'text'
    },
    {
      field: 'resolved_at',
      header: 'Resolved',
      width: '160px',
      format: 'datetime',
      nullable: true
    }
  ],

  detailPane: {
    showJsonDiff: true,
    showTimestamps: true,
    showErrorCategory: true
  }
};

export const SyncHistoryErrorDisplay = {
  errorSummary: {
    title: 'Errors',
    showCount: true,
    expandable: true
  },

  errorCategories: {
    user_correctable: {
      icon: 'exclamation-circle',
      class: 'text-warning',
      label: 'User Correctable'
    },
    system: {
      icon: 'hourglass-start',
      class: 'text-info',
      label: 'System Error'
    },
    unrecoverable: {
      icon: 'exclamation-triangle',
      class: 'text-danger',
      label: 'Unrecoverable'
    }
  }
};

export const SyncHistoryPanelRequirements = {
  cssClasses: [
    'sync-history-panel',
    'sync-history-table',
    'sync-history-loading',
    'sync-history-error',
    'sync-history-empty',
    'sync-history-row',
    'sync-history-row-expanded',
    'conflict-details-pane',
    'conflict-details-json',
    'error-summary',
    'date-range-picker'
  ],

  requiredMethods: [
    'render()',
    'renderTable(operations)',
    'renderRow(operation)',
    'renderConflictDetails(operation)',
    'handleRowExpand(operationId)',
    'handleFilterChange(filters)',
    'handlePaginationChange(page)',
    'formatDuration(ms)',
    'getErrorCategoryIcon(category)',
    'downloadHistoryCSV()'
  ],

  requiredEvents: [
    'history:filtered - Event with applied filters',
    'history:paginated - Event with page number',
    'history:operation-expanded - Event with operation details',
    'history:exported - Event when user exports data'
  ],

  dataExport: {
    formats: ['csv', 'json', 'pdf'],
    includeConflicts: true,
    includeErrors: true
  }
};

export const SyncHistoryPerformance = {
  pageSize: 50,
  maxPageSize: 200,
  lazyLoad: true,
  virtualScrolling: true, // For large lists

  loadingStates: {
    operations: 'Loading history...',
    conflicts: 'Loading conflict details...',
    export: 'Preparing export...'
  }
};

export default SyncHistoryPanelPropTypes;
