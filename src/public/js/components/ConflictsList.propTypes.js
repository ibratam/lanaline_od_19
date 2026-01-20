/**
 * PropTypes for ConflictsList Component
 * Feature: 002-resolve-conflicts (US1)
 * Task: T001b
 * Date: 2026-01-19
 *
 * ConflictsList displays all conflicts in a paginated table with filtering
 */

import { ComponentPropTypes } from './propTypes.js';

/**
 * ConflictsList Component Props
 *
 * Props:
 *   - conflicts (Array<Conflict>): List of conflict objects to display
 *   - pagination (Pagination): Pagination metadata for table
 *   - loading (boolean): True while loading data
 *   - error (string|null): Error message if load failed
 *   - selectedConflict (Conflict|null): Currently selected conflict
 *   - filters (Object): Current filter state {state, model, page}
 *   - onSelectConflict (function): Called when user clicks conflict row
 *   - onFilterChange (function): Called when user changes filters
 *   - onRefresh (function): Called when user clicks refresh button
 *
 * Usage:
 *   const list = new ConflictsList({
 *     conflicts: fetchedConflicts,
 *     pagination: { page: 1, limit: 50, total: 237, pages: 5 },
 *     loading: false,
 *     error: null,
 *     selectedConflict: null,
 *     filters: { state: 'detected', model: '', page: 1 },
 *     onSelectConflict: (id) => showDetail(id),
 *     onFilterChange: (filters) => refetchConflicts(filters),
 *     onRefresh: () => reloadTable()
 *   });
 */
export const ConflictsListPropTypes = {
  // Data Props
  conflicts: {
    type: 'array',
    items: ComponentPropTypes.Conflict,
    required: true,
    description: 'Array of conflict records to display'
  },

  pagination: {
    type: 'object',
    shape: ComponentPropTypes.Pagination,
    required: true,
    description: 'Pagination metadata for current page'
  },

  // State Props
  loading: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'True while fetching conflict data'
  },

  error: {
    type: ['string', 'null'],
    required: false,
    default: null,
    description: 'Error message if data fetch failed'
  },

  selectedConflict: {
    type: ['object', 'null'],
    shape: ComponentPropTypes.Conflict,
    required: false,
    default: null,
    description: 'Currently highlighted conflict row'
  },

  filters: {
    type: 'object',
    shape: {
      state: ['string', 'null'], // detected|reviewing|resolved|applied|needs_manual_review|null
      model: ['string', 'null'], // e.g. 'product.product' or null for all
      page: 'number'
    },
    required: false,
    default: { state: null, model: null, page: 1 },
    description: 'Current filter and pagination state'
  },

  // Event Handler Props
  onSelectConflict: {
    type: 'function',
    signature: 'function(conflictId: number) => void',
    required: true,
    description: 'Called when user clicks a conflict row'
  },

  onFilterChange: {
    type: 'function',
    signature: 'function(filters: {state?: string, model?: string, page?: number}) => void',
    required: true,
    description: 'Called when user changes state/model filter or pagination'
  },

  onRefresh: {
    type: 'function',
    signature: 'function() => void',
    required: true,
    description: 'Called when user clicks refresh/reload button'
  }
};

/**
 * ConflictsList Rendering Properties
 * Controls display and behavior of the table
 */
export const ConflictsListRenderProps = {
  columns: [
    {
      field: 'id',
      header: 'ID',
      width: '60px',
      sortable: false,
      format: 'number'
    },
    {
      field: 'model_name',
      header: 'Model',
      width: '180px',
      sortable: true,
      format: 'text'
    },
    {
      field: 'record_id',
      header: 'Record',
      width: '100px',
      sortable: true,
      format: 'number'
    },
    {
      field: 'field_name',
      header: 'Field',
      width: '140px',
      sortable: false,
      format: 'text',
      nullable: true
    },
    {
      field: 'state',
      header: 'Status',
      width: '120px',
      sortable: false,
      format: 'badge',
      badgeMap: {
        detected: 'badge-info',
        reviewing: 'badge-warning',
        resolved: 'badge-primary',
        applied: 'badge-success',
        needs_manual_review: 'badge-danger'
      }
    },
    {
      field: 'source_write_date',
      header: 'Source Date',
      width: '160px',
      sortable: true,
      format: 'datetime'
    },
    {
      field: 'target_write_date',
      header: 'Target Date',
      width: '160px',
      sortable: true,
      format: 'datetime'
    }
  ],

  defaultPageSize: 50,
  maxPageSize: 200,

  filterOptions: {
    state: [
      { label: 'All Statuses', value: null },
      { label: 'Detected', value: 'detected' },
      { label: 'Under Review', value: 'reviewing' },
      { label: 'Resolved', value: 'resolved' },
      { label: 'Applied', value: 'applied' },
      { label: 'Needs Manual Review', value: 'needs_manual_review' }
    ]
  },

  loadingIndicator: true,
  emptyStateMessage: 'No conflicts found. Select filters or click Refresh.',
  errorStateMessage: 'Failed to load conflicts. Check your connection and try again.'
};

/**
 * Component Integration Requirements
 */
export const ConflictsListRequirements = {
  cssClasses: [
    'conflicts-list',
    'conflicts-list-table',
    'conflicts-list-loading',
    'conflicts-list-error',
    'conflicts-list-empty',
    'conflicts-list-row',
    'conflicts-list-row-selected'
  ],

  requiredMethods: [
    'render()',
    'handleSelectConflict(conflictId)',
    'handleFilterChange(filters)',
    'handleRefresh()',
    'updateRows(conflicts)',
    'setPagination(pagination)',
    'setLoading(loading)',
    'setError(error)'
  ],

  requiredEvents: [
    'conflict:selected - Event fired when conflict row clicked',
    'filters:changed - Event fired when filter changed',
    'table:refreshed - Event fired when refresh completes'
  ]
};

export default ConflictsListPropTypes;
