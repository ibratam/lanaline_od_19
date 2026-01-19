import apiClient from '../services/apiClient.js';

/**
 * Preview Display Component
 * Shows synchronization preview with conflicts and change counts
 */
export class PreviewDisplay {
  constructor() {
    this.preview = null;
    this.expandedConflicts = new Set();
  }

  /**
   * Load and display preview
   */
  async load(sourceDbId, targetDbId, modelFilter = null) {
    try {
      this.showMessage('Generating preview...', 'info');

      const result = await apiClient.post('/sync/preview', {
        source_db_id: sourceDbId,
        target_db_id: targetDbId,
        model_filter: modelFilter
      });

      this.preview = result;
      return this.render();
    } catch (error) {
      console.error('Error loading preview:', error);
      return this.renderError(error.message);
    }
  }

  /**
   * Render preview
   */
  render() {
    if (!this.preview) {
      return '<p class="text-muted">No preview data.</p>';
    }

    const { summary } = this.preview;
    const modelFilter = this.preview.model_filter;

    let html = `
      <div class="preview-summary card">
        <h3>Synchronization Summary</h3>
        <p>Generated: ${new Date(this.preview.generated_at).toLocaleString()}</p>
        <p>Models: ${modelFilter && modelFilter.length > 0
          ? modelFilter.map(model => this.escapeHtml(model)).join(', ')
          : 'All'}</p>

        <div class="summary-stats flex">
          <div class="stat-card">
            <div class="stat-number">${summary.total_models}</div>
            <div class="stat-label">Models</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #28a745;">${summary.total_records_to_create}</div>
            <div class="stat-label">To Create ✓</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #0066cc;">${summary.total_records_to_update}</div>
            <div class="stat-label">To Update ✏️</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #dc3545;">${summary.total_records_to_delete}</div>
            <div class="stat-label">To Delete ✗</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color: #ffc107;">${summary.total_conflicts}</div>
            <div class="stat-label">Conflicts ⚠️</div>
          </div>
        </div>
      </div>

      <div class="models-detail mt-20">
        <h3>Models Overview</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Creates</th>
              <th>Updates</th>
              <th>Deletes</th>
              <th>Conflicts</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const model of this.preview.models) {
      if (model.skipped) {
        html += `
          <tr>
            <td><strong>${this.escapeHtml(model.model)}</strong></td>
            <td colspan="4" style="color: #6b7280;">${this.escapeHtml(model.skip_reason || 'Skipped')}</td>
            <td>—</td>
          </tr>
        `;
      } else if (model.error) {
        html += `
          <tr>
            <td><strong>${this.escapeHtml(model.model)}</strong></td>
            <td colspan="4" style="color: red;">Error: ${this.escapeHtml(model.error)}</td>
            <td>—</td>
          </tr>
        `;
      } else {
        html += `
          <tr>
            <td><strong>${this.escapeHtml(model.model)}</strong></td>
            <td style="color: #28a745;">${model.to_create.count}</td>
            <td style="color: #0066cc;">${model.to_update.count}</td>
            <td style="color: #dc3545;">${model.to_delete.count}</td>
            <td style="color: #ffc107;">${model.conflicts.length}</td>
            <td>
              ${model.conflicts.length > 0 ?
                `<button class="btn btn-small btn-warning expand-conflicts-btn" data-model="${model.model}">Review</button>`
                : '—'}
            </td>
          </tr>
        `;
      }
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    // Add conflicts section if there are any
    if (summary.total_conflicts > 0) {
      html += this.renderConflicts();
    }

    return html;
  }

  /**
   * Render conflicts section
   */
  renderConflicts() {
    let html = `
      <div class="conflicts-section mt-20">
        <h3>⚠️ Conflicts Detected</h3>
        <p class="text-muted">These records have differences between databases. Review and choose resolution:</p>
    `;

    for (const model of this.preview.models) {
      if (model.conflicts && model.conflicts.length > 0) {
        html += `
          <div class="model-conflicts card mt-10">
            <h4>${this.escapeHtml(model.model)}</h4>
            <div class="conflicts-list">
        `;

        for (const conflict of model.conflicts) {
          const conflictId = `conflict-${model.model}-${conflict.record_id}`;
          html += `
            <div class="conflict-item" id="${conflictId}">
              <div class="conflict-header flex-between">
                <span><strong>Record ID: ${conflict.record_id}</strong></span>
                <button class="btn btn-small btn-secondary toggle-conflict-btn" data-conflict-id="${conflictId}">
                  ${this.expandedConflicts.has(conflictId) ? 'Hide' : 'Show'} Details
                </button>
              </div>
              <div class="conflict-details ${this.expandedConflicts.has(conflictId) ? '' : 'hidden'}">
                <table style="font-size: 12px; margin-top: 10px;">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Source Value</th>
                      <th>Target Value</th>
                      <th>Source Updated</th>
                      <th>Target Updated</th>
                    </tr>
                  </thead>
                  <tbody>
          `;

          for (const [field, diff] of Object.entries(conflict.differences || {})) {
            html += `
              <tr>
                <td><strong>${this.escapeHtml(field)}</strong></td>
                <td><code>${this.formatValue(diff.source)}</code></td>
                <td><code>${this.formatValue(diff.target)}</code></td>
                <td>${this.formatDate(conflict.source_write_date)}</td>
                <td>${this.formatDate(conflict.target_write_date)}</td>
              </tr>
            `;
          }

          html += `
                  </tbody>
                </table>
                <div class="conflict-resolution mt-10">
                  <label>Resolution:</label>
                  <select class="conflict-resolution-select" data-conflict-id="${conflictId}">
                    <option value="">-- Choose resolution --</option>
                    <option value="keep_source">Keep Source Version</option>
                    <option value="keep_target">Keep Target Version</option>
                    <option value="skip">Skip This Record</option>
                  </select>
                </div>
              </div>
            </div>
          `;
        }

        html += `
            </div>
          </div>
        `;
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Render error
   */
  renderError(message) {
    return `<div class="alert alert-danger">Failed to generate preview: ${this.escapeHtml(message)}</div>`;
  }

  /**
   * Attach event handlers
   */
  attachHandlers() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    // Expand/collapse conflicts
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-conflict-btn')) {
        const conflictId = e.target.dataset.conflictId;
        const element = document.getElementById(conflictId);
        if (element) {
          const details = element.querySelector('.conflict-details');
          if (details) {
            details.classList.toggle('hidden');
            this.expandedConflicts[details.classList.contains('hidden') ? 'delete' : 'add'](conflictId);
            e.target.textContent = details.classList.contains('hidden') ? 'Show Details' : 'Hide Details';
          }
        }
      }
    });
  }

  /**
   * Show message
   */
  showMessage(message, type = 'info') {
    const container = document.getElementById('preview-container');
    if (container) {
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert alert-${type}`;
      alertDiv.textContent = message;
      container.innerHTML = '';
      container.appendChild(alertDiv);
    }
  }

  /**
   * Format value for display
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return '<em>null</em>';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value).substring(0, 50) + '...';
    }
    return String(value).substring(0, 100);
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default PreviewDisplay;
