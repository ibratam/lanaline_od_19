/**
 * OperationLogger Component
 * Displays detailed sync operation logs with timing breakdown, state transitions, and error details
 * Includes search/filter capabilities for debugging operations
 */

export class OperationLogger {
  constructor(containerId = 'operations-log-container') {
    this.container = document.getElementById(containerId);
    this.operations = [];
    this.filteredOperations = [];
    this.selectedOperation = null;
    this.filters = {
      startDate: null,
      endDate: null,
      status: null,
      errorCategory: null,
      searchText: ''
    };
  }

  /**
   * Initialize the logger component
   */
  async init() {
    try {
      await this.loadOperations();
      this.renderOperationsList();
    } catch (error) {
      console.error('Failed to initialize OperationLogger:', error);
      this.container.innerHTML = `<div class="error-message">Error loading operations: ${error.message}</div>`;
    }
  }

  /**
   * Load operations from API
   */
  async loadOperations() {
    try {
      const response = await fetch('/api/sync/history');
      if (!response.ok) {
        throw new Error(`Failed to load operations: ${response.statusText}`);
      }

      const result = await response.json();
      this.operations = result.data || [];
      this.filteredOperations = [...this.operations];
    } catch (error) {
      console.error('Error loading operations:', error);
      throw error;
    }
  }

  /**
   * Render operations list and search/filter controls
   */
  renderOperationsList() {
    if (!this.container) return;

    const html = `
      <div class="operation-logger">
        <div class="logger-header">
          <h3>Sync Operations Log</h3>
          <div class="logger-controls">
            ${this.renderFilterControls()}
          </div>
        </div>

        <div class="logger-content">
          <div class="operations-list">
            ${this.renderOperationsTable()}
          </div>
          <div class="operation-details" id="operation-details">
            <p class="text-muted">Select an operation to view details</p>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  /**
   * Render filter controls
   */
  renderFilterControls() {
    return `
      <div class="filter-row">
        <div class="filter-group">
          <label>Date Range</label>
          <input type="date" id="filter-start-date" class="filter-input" placeholder="Start date">
          <input type="date" id="filter-end-date" class="filter-input" placeholder="End date">
        </div>

        <div class="filter-group">
          <label>Status</label>
          <select id="filter-status" class="filter-input">
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Error Category</label>
          <select id="filter-error-category" class="filter-input">
            <option value="">All</option>
            <option value="user_correctable">User Correctable</option>
            <option value="system">System</option>
            <option value="unrecoverable">Unrecoverable</option>
          </select>
        </div>

        <div class="filter-group search">
          <label>Search</label>
          <input type="text" id="filter-search" class="filter-input" placeholder="Error code, model, record ID">
        </div>

        <button id="filter-clear-btn" class="btn btn-secondary">Clear Filters</button>
      </div>
    `;
  }

  /**
   * Render operations table
   */
  renderOperationsTable() {
    const ops = this.filteredOperations;

    if (ops.length === 0) {
      return '<p class="text-muted">No operations to display</p>';
    }

    let html = `
      <table class="operations-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Model</th>
            <th>Type</th>
            <th>Status</th>
            <th>Records</th>
            <th>Duration</th>
            <th>Error</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
    `;

    ops.forEach(op => {
      const statusClass = op.status === 'completed' ? 'success' : op.status === 'failed' ? 'error' : 'warning';
      const errorCategoryBadge = op.error_category
        ? `<span class="badge ${op.error_category}">${op.error_category}</span>`
        : '—';
      const durationStr = op.duration_ms ? `${(op.duration_ms / 1000).toFixed(2)}s` : '—';
      const createdDate = new Date(op.created_at).toLocaleString();

      html += `
        <tr class="operation-row" data-operation-id="${op.id}">
          <td><strong>#${op.id}</strong></td>
          <td>${op.odoo_model}</td>
          <td>${op.operation_type}</td>
          <td><span class="status ${statusClass}">${op.status}</span></td>
          <td>${op.record_count}</td>
          <td>${durationStr}</td>
          <td>${errorCategoryBadge}</td>
          <td><small>${createdDate}</small></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }

  /**
   * Render detailed operation view
   */
  async renderOperationDetails(operationId) {
    try {
      const response = await fetch(`/api/operations/${operationId}/logs`);
      if (!response.ok) {
        throw new Error(`Failed to load operation logs: ${response.statusText}`);
      }

      const result = await response.json();
      const logs = result.data;

      const html = `
        <div class="operation-detail-view">
          <div class="detail-header">
            <h4>Operation #${operationId} Details</h4>
            <button class="btn btn-secondary" id="close-detail-btn">Close</button>
          </div>

          <div class="detail-sections">
            ${this.renderOperationSummary(logs)}
            ${this.renderTimingBreakdown(logs)}
            ${this.renderStateTransitions(logs)}
            ${this.renderErrorDetails(logs)}
          </div>
        </div>
      `;

      const detailsContainer = document.getElementById('operation-details');
      if (detailsContainer) {
        detailsContainer.innerHTML = html;
        document.getElementById('close-detail-btn')?.addEventListener('click', () => {
          this.selectedOperation = null;
          document.getElementById('operation-details').innerHTML = '<p class="text-muted">Select an operation to view details</p>';
        });
      }
    } catch (error) {
      console.error('Error loading operation details:', error);
      const detailsContainer = document.getElementById('operation-details');
      if (detailsContainer) {
        detailsContainer.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
      }
    }
  }

  /**
   * Render operation summary section
   */
  renderOperationSummary(logs) {
    const summary = logs.summary || {};

    return `
      <div class="detail-section">
        <h5>Operation Summary</h5>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="label">Status</span>
            <span class="value"><span class="badge ${summary.status}">${summary.status}</span></span>
          </div>
          <div class="summary-item">
            <span class="label">Model</span>
            <span class="value">${summary.odoo_model || '—'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Type</span>
            <span class="value">${summary.operation_type || '—'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Records Processed</span>
            <span class="value">${summary.record_count || 0}</span>
          </div>
          <div class="summary-item">
            <span class="label">Total Duration</span>
            <span class="value">${summary.duration_ms ? (summary.duration_ms / 1000).toFixed(2) : '—'}s</span>
          </div>
          <div class="summary-item">
            <span class="label">Errors</span>
            <span class="value error">${summary.error_count || 0}</span>
          </div>
          <div class="summary-item">
            <span class="label">Started</span>
            <span class="value"><small>${new Date(summary.created_at).toLocaleString()}</small></span>
          </div>
          <div class="summary-item">
            <span class="label">Completed</span>
            <span class="value"><small>${summary.completed_at ? new Date(summary.completed_at).toLocaleString() : '—'}</small></span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render timing breakdown section
   */
  renderTimingBreakdown(logs) {
    const phases = logs.phases || {};
    const phaseArray = Object.entries(phases).map(([name, data]) => ({
      name,
      ...data
    }));

    if (phaseArray.length === 0) {
      return '<div class="detail-section"><h5>Phase Timing</h5><p class="text-muted">No phase data</p></div>';
    }

    let html = `
      <div class="detail-section">
        <h5>Phase Timing Breakdown</h5>
        <div class="phase-timeline">
    `;

    phaseArray.forEach(phase => {
      const duration = phase.duration_ms || 0;
      const startTime = new Date(phase.started_at).toLocaleTimeString();
      const endTime = phase.ended_at ? new Date(phase.ended_at).toLocaleTimeString() : 'running';
      const durationStr = `${(duration / 1000).toFixed(2)}s`;

      html += `
        <div class="phase-item">
          <div class="phase-header">
            <span class="phase-name">${phase.name}</span>
            <span class="phase-duration">${durationStr}</span>
          </div>
          <div class="phase-details">
            <small>Started: ${startTime}</small>
            <small>Ended: ${endTime}</small>
            ${phase.records_processed ? `<small>Records: ${phase.records_processed}</small>` : ''}
            ${phase.errors_in_phase ? `<small class="error">Errors: ${phase.errors_in_phase}</small>` : ''}
          </div>
        </div>
      `;
    });

    html += `
        </div>
        ${this.renderBottleneckAnalysis(phaseArray)}
      </div>
    `;

    return html;
  }

  /**
   * Analyze and render bottleneck identification
   */
  renderBottleneckAnalysis(phases) {
    if (phases.length === 0) return '';

    const totalDuration = phases.reduce((sum, p) => sum + (p.duration_ms || 0), 0);
    const slowestPhase = phases.reduce((max, p) => (p.duration_ms || 0) > (max.duration_ms || 0) ? p : max);
    const slowestPercent = ((slowestPhase.duration_ms / totalDuration) * 100).toFixed(1);

    return `
      <div class="bottleneck-analysis">
        <h6>Performance Analysis</h6>
        <div class="analysis-item">
          <span class="label">Slowest Phase</span>
          <span class="value">${slowestPhase.name} (${(slowestPhase.duration_ms / 1000).toFixed(2)}s, ${slowestPercent}%)</span>
        </div>
        <div class="analysis-item">
          <span class="label">Total Duration</span>
          <span class="value">${(totalDuration / 1000).toFixed(2)}s</span>
        </div>
        <div class="phase-distribution">
          ${phases.map(p => {
            const percent = ((p.duration_ms / totalDuration) * 100).toFixed(1);
            return `<div class="phase-bar" style="width: ${percent}%" title="${p.name}: ${percent}%"></div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render state transitions section
   */
  renderStateTransitions(logs) {
    const transitions = logs.state_transitions || [];

    if (transitions.length === 0) {
      return '<div class="detail-section"><h5>State Transitions</h5><p class="text-muted">No state transitions recorded</p></div>';
    }

    let html = `
      <div class="detail-section">
        <h5>State Transitions</h5>
        <div class="transitions-timeline">
    `;

    transitions.forEach((transition, index) => {
      const timestamp = new Date(transition.at).toLocaleTimeString();
      html += `
        <div class="transition-item">
          <div class="transition-step">${index + 1}</div>
          <div class="transition-content">
            <span class="from-state">${transition.from}</span>
            <span class="arrow">→</span>
            <span class="to-state">${transition.to}</span>
            <span class="timestamp">${timestamp}</span>
          </div>
          ${transition.reason ? `<div class="transition-reason">Reason: ${transition.reason}</div>` : ''}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render error details section
   */
  renderErrorDetails(logs) {
    const error = logs.error;

    if (!error) {
      return '<div class="detail-section"><h5>Error Details</h5><p class="text-muted">No errors recorded</p></div>';
    }

    return `
      <div class="detail-section error-section">
        <h5>Error Details</h5>
        <div class="error-details-box">
          <div class="error-item">
            <span class="label">Category</span>
            <span class="value"><span class="badge ${error.category}">${error.category}</span></span>
          </div>
          <div class="error-item">
            <span class="label">Code</span>
            <span class="value"><code>${error.code_prefix}-###</code></span>
          </div>
          <div class="error-item">
            <span class="label">HTTP Status</span>
            <span class="value">${error.status_code}</span>
          </div>
          <div class="error-item full-width">
            <span class="label">Message</span>
            <pre class="error-message">${this._escapeHtml(error.message)}</pre>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Apply filters and update display
   */
  applyFilters() {
    this.filteredOperations = this.operations.filter(op => {
      // Date range filter
      if (this.filters.startDate) {
        const opDate = new Date(op.created_at);
        if (opDate < new Date(this.filters.startDate)) return false;
      }

      if (this.filters.endDate) {
        const opDate = new Date(op.created_at);
        if (opDate > new Date(this.filters.endDate)) return false;
      }

      // Status filter
      if (this.filters.status && op.status !== this.filters.status) return false;

      // Error category filter
      if (this.filters.errorCategory && op.error_category !== this.filters.errorCategory) return false;

      // Search filter
      if (this.filters.searchText) {
        const searchLower = this.filters.searchText.toLowerCase();
        const searchableFields = [
          op.error_code,
          op.odoo_model,
          op.error_message,
          op.id.toString(),
          op.record_count.toString()
        ].filter(Boolean).join(' ').toLowerCase();

        if (!searchableFields.includes(searchLower)) return false;
      }

      return true;
    });

    this.renderOperationsList();
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.filters = {
      startDate: null,
      endDate: null,
      status: null,
      errorCategory: null,
      searchText: ''
    };

    this.filteredOperations = [...this.operations];
    this.renderOperationsList();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Operation selection
    document.querySelectorAll('.operation-row').forEach(row => {
      row.addEventListener('click', () => {
        const opId = row.dataset.operationId;
        this.renderOperationDetails(opId);
      });
    });

    // Filter controls
    document.getElementById('filter-start-date')?.addEventListener('change', (e) => {
      this.filters.startDate = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-end-date')?.addEventListener('change', (e) => {
      this.filters.endDate = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-status')?.addEventListener('change', (e) => {
      this.filters.status = e.target.value || null;
      this.applyFilters();
    });

    document.getElementById('filter-error-category')?.addEventListener('change', (e) => {
      this.filters.errorCategory = e.target.value || null;
      this.applyFilters();
    });

    document.getElementById('filter-search')?.addEventListener('input', (e) => {
      this.filters.searchText = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-clear-btn')?.addEventListener('click', () => {
      this.clearFilters();
    });
  }

  /**
   * Escape HTML special characters
   */
  _escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

export default OperationLogger;
