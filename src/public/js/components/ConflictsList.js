import apiClient from '../services/apiClient.js';

/**
 * Conflicts List Component
 * Displays conflicts with filtering and selection.
 */
export class ConflictsList {
  constructor() {
    this.conflicts = [];
    this.stateFilter = 'detected';
    this.modelFilter = '';
    this.cursor = null;
  }

  async load() {
    const response = await apiClient.getConflicts({
      state: this.stateFilter || undefined,
      model: this.modelFilter || undefined,
      cursor: this.cursor || undefined,
      limit: 25
    });

    this.conflicts = response.items || [];
    this.nextCursor = response.next_cursor || null;
    return this.render();
  }

  render() {
    const rows = this.conflicts.length
      ? this.conflicts.map(conflict => `
        <tr>
          <td>${this.escapeHtml(conflict.odoo_model)}</td>
          <td>${conflict.record_id}</td>
          <td>${this.escapeHtml(conflict.state)}</td>
          <td>${conflict.created_at ? new Date(conflict.created_at).toLocaleString() : '—'}</td>
          <td>
            <button class="btn btn-small btn-secondary conflict-view" data-id="${conflict.id}">View</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" class="text-muted">No conflicts found.</td></tr>';

    return `
      <div class="conflicts-filters">
        <div class="form-row">
          <div class="form-group">
            <label for="conflicts-state">State</label>
            <select id="conflicts-state">
              <option value="">All</option>
              <option value="detected" ${this.stateFilter === 'detected' ? 'selected' : ''}>Detected</option>
              <option value="resolved" ${this.stateFilter === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="failed_resolution" ${this.stateFilter === 'failed_resolution' ? 'selected' : ''}>Failed Resolution</option>
              <option value="needs_manual_review" ${this.stateFilter === 'needs_manual_review' ? 'selected' : ''}>Needs Manual Review</option>
              <option value="applied" ${this.stateFilter === 'applied' ? 'selected' : ''}>Applied</option>
            </select>
          </div>
          <div class="form-group">
            <label for="conflicts-model">Model</label>
            <input type="text" id="conflicts-model" placeholder="res.partner" value="${this.escapeHtml(this.modelFilter)}">
          </div>
          <div class="form-group">
            <button class="btn btn-secondary" id="conflicts-apply">Apply</button>
          </div>
          <div class="form-group">
            <button class="btn btn-secondary" id="conflicts-bulk-open">Bulk Resolve</button>
          </div>
        </div>
      </div>

      <table class="conflicts-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Record ID</th>
            <th>State</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="conflicts-pagination">
        <button class="btn btn-small btn-secondary" id="conflicts-next" ${this.nextCursor ? '' : 'disabled'}>Next</button>
      </div>
    `;
  }

  attachHandlers(onRefresh, onSelectConflict) {
    document.getElementById('conflicts-apply')?.addEventListener('click', () => {
      this.stateFilter = document.getElementById('conflicts-state').value;
      this.modelFilter = document.getElementById('conflicts-model').value.trim();
      this.cursor = null;
      onRefresh();
    });

    document.getElementById('conflicts-next')?.addEventListener('click', () => {
      if (this.nextCursor) {
        this.cursor = this.nextCursor;
        onRefresh();
      }
    });

    document.querySelectorAll('.conflict-view').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (onSelectConflict) {
          onSelectConflict(id);
        }
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default ConflictsList;
