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
    this.modelFilters = [];
    this.modules = [];
    this.moduleFilter = [];
    this.connections = [];
    this.sourceId = null;
    this.cursor = null;
  }

  async load() {
    if (!this.connections.length) {
      try {
        this.connections = await apiClient.getConfigs();
        if (!this.sourceId && this.connections.length > 0) {
          this.sourceId = this.connections[0].id;
        }
      } catch {
        this.connections = [];
      }
    }

    if (this.sourceId && this.modules.length === 0) {
      await this.loadModulesForSource(this.sourceId);
    }

    const response = await apiClient.getConflicts({
      state: this.stateFilter || undefined,
      model: this.modelFilter || undefined,
      models: this.modelFilters.length > 0 ? this.modelFilters : undefined,
      cursor: this.cursor || undefined,
      limit: 25
    });

    this.conflicts = response.items || [];
    this.nextCursor = response.next_cursor || null;
    return this.render();
  }

  render() {
    const connectionOptions = this.connections
      .map(conn => `<option value="${conn.id}" ${this.sourceId === conn.id ? 'selected' : ''}>${this.escapeHtml(conn.name)}</option>`)
      .join('');
    const moduleOptions = this.modules
      .map(module => `
        <option value="${module.name}" ${this.moduleFilter.includes(module.name) ? 'selected' : ''}>
          ${this.escapeHtml(module.description || module.name)}
        </option>
      `)
      .join('');

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
            <label for="conflicts-source">Source</label>
            <select id="conflicts-source">
              ${connectionOptions}
            </select>
          </div>
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
            <label for="conflicts-modules">Modules</label>
            <select id="conflicts-modules" multiple size="6">
              ${moduleOptions}
            </select>
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
    document.getElementById('conflicts-source')?.addEventListener('change', async () => {
      const sourceId = Number(document.getElementById('conflicts-source')?.value) || null;
      if (sourceId) {
        this.sourceId = sourceId;
        await this.loadModulesForSource(sourceId);
        onRefresh();
      }
    });

    document.getElementById('conflicts-apply')?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('conflicts-source')?.value) || null;
      if (sourceId && sourceId !== this.sourceId) {
        this.sourceId = sourceId;
        await this.loadModulesForSource(sourceId);
      }
      this.stateFilter = document.getElementById('conflicts-state').value;
      this.modelFilter = document.getElementById('conflicts-model').value.trim();
      this.moduleFilter = this.getSelectedOptions('conflicts-modules');
      this.modelFilters = [];
      if (this.moduleFilter.length > 0 && this.sourceId) {
        try {
          const response = await apiClient.getSyncModuleModels(this.sourceId, this.moduleFilter);
          this.modelFilters = response.models || [];
        } catch {
          this.modelFilters = [];
        }
      }
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

  async loadModulesForSource(sourceId) {
    if (!sourceId) {
      this.modules = [];
      return;
    }
    try {
      const response = await apiClient.getSyncModules(sourceId);
      this.modules = response.modules || [];
    } catch {
      this.modules = [];
    }
  }

  getSelectedOptions(selectId) {
    const select = document.getElementById(selectId);
    if (!select) {
      return [];
    }
    return Array.from(select.selectedOptions)
      .map(option => option.value)
      .filter(Boolean);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default ConflictsList;
