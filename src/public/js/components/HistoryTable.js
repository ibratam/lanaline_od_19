import apiClient from '../services/apiClient.js';

/**
 * History Table Component
 * Displays sync history with filtering, pagination, and detail modal.
 */
export class HistoryTable {
  constructor() {
    this.page = 0;
    this.limit = 10;
    this.statusFilter = '';
    this.triggerFilter = '';
    this.items = [];
    this.total = 0;
  }

  async load() {
    const response = await apiClient.getHistory({
      limit: this.limit,
      offset: this.page * this.limit,
      status: this.statusFilter || undefined,
      triggered_by: this.triggerFilter || undefined
    });

    this.items = response.items || [];
    this.total = response.total || 0;
    return this.render();
  }

  render() {
    const rows = this.items.length
      ? this.items.map(item => `
        <tr data-id="${item.id}">
          <td>${item.id}</td>
          <td>${this.escapeHtml(item.status)}</td>
          <td>${this.escapeHtml(item.triggered_by)}</td>
          <td>${item.started_at ? new Date(item.started_at).toLocaleString() : '—'}</td>
          <td>${item.completed_at ? new Date(item.completed_at).toLocaleString() : '—'}</td>
          <td>${item.total_records_created || 0}</td>
          <td>${item.total_records_updated || 0}</td>
          <td>${item.total_records_deleted || 0}</td>
          <td><button class="btn btn-small btn-secondary history-detail" data-id="${item.id}">Details</button></td>
        </tr>
      `).join('')
      : '<tr><td colspan="9" class="text-muted">No history entries yet.</td></tr>';

    return `
      <div class="history-controls">
        <div class="form-row">
          <div class="form-group">
            <label for="history-status">Status</label>
            <select id="history-status">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
          </div>
          <div class="form-group">
            <label for="history-trigger">Trigger</label>
            <select id="history-trigger">
              <option value="">All</option>
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <div class="form-group">
            <button class="btn btn-secondary" id="history-apply">Apply Filters</button>
          </div>
          <div class="form-group">
            <button class="btn btn-primary" id="history-export-csv">Export CSV</button>
            <button class="btn btn-primary" id="history-export-json">Export JSON</button>
          </div>
        </div>
      </div>

      <table class="history-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Deleted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="history-pagination">
        <button class="btn btn-small btn-secondary" id="history-prev" ${this.page === 0 ? 'disabled' : ''}>Prev</button>
        <span>Page ${this.page + 1} of ${Math.max(1, Math.ceil(this.total / this.limit))}</span>
        <button class="btn btn-small btn-secondary" id="history-next" ${((this.page + 1) * this.limit >= this.total) ? 'disabled' : ''}>Next</button>
      </div>

      <div id="history-modal" class="modal hidden">
        <div class="modal-content">
          <button class="modal-close" id="history-modal-close">×</button>
          <div id="history-modal-body">Loading...</div>
        </div>
      </div>
    `;
  }

  attachHandlers(onRefresh) {
    const container = document.getElementById('history-container');
    if (!container) return;

    const applyFilters = () => {
      this.statusFilter = document.getElementById('history-status').value;
      this.triggerFilter = document.getElementById('history-trigger').value;
      this.page = 0;
      onRefresh();
    };

    document.getElementById('history-apply')?.addEventListener('click', applyFilters);

    document.getElementById('history-prev')?.addEventListener('click', () => {
      if (this.page > 0) {
        this.page -= 1;
        onRefresh();
      }
    });

    document.getElementById('history-next')?.addEventListener('click', () => {
      if ((this.page + 1) * this.limit < this.total) {
        this.page += 1;
        onRefresh();
      }
    });

    document.getElementById('history-export-csv')?.addEventListener('click', () => {
      this.exportHistory('csv');
    });

    document.getElementById('history-export-json')?.addEventListener('click', () => {
      this.exportHistory('json');
    });

    container.addEventListener('click', async (event) => {
      const detailButton = event.target.closest('.history-detail');
      if (detailButton) {
        const id = detailButton.dataset.id;
        await this.showDetails(id);
      }
    });

    document.getElementById('history-modal-close')?.addEventListener('click', () => {
      this.hideModal();
    });
  }

  async showDetails(id) {
    const modal = document.getElementById('history-modal');
    const modalBody = document.getElementById('history-modal-body');
    if (!modal || !modalBody) return;

    modal.classList.remove('hidden');
    modalBody.innerHTML = 'Loading...';

    try {
      const detail = await apiClient.getHistoryDetail(id);
      modalBody.innerHTML = this.renderDetail(detail);
    } catch (error) {
      modalBody.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(error.message)}</div>`;
    }
  }

  hideModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  renderDetail(detail) {
    return `
      <h3>Sync Run #${detail.id}</h3>
      <p><strong>Status:</strong> ${this.escapeHtml(detail.status)}</p>
      <p><strong>Triggered By:</strong> ${this.escapeHtml(detail.triggered_by)}</p>
      <p><strong>Started:</strong> ${detail.started_at ? new Date(detail.started_at).toLocaleString() : '—'}</p>
      <p><strong>Completed:</strong> ${detail.completed_at ? new Date(detail.completed_at).toLocaleString() : '—'}</p>
      <p><strong>Records:</strong> Created ${detail.total_records_created || 0}, Updated ${detail.total_records_updated || 0}, Deleted ${detail.total_records_deleted || 0}</p>

      <h4>Operations</h4>
      <pre>${this.escapeHtml(JSON.stringify(detail.operations || [], null, 2))}</pre>

      <h4>Conflicts</h4>
      <pre>${this.escapeHtml(JSON.stringify(detail.conflicts || [], null, 2))}</pre>

      <h4>Errors</h4>
      <pre>${this.escapeHtml(JSON.stringify(detail.errors || [], null, 2))}</pre>
    `;
  }

  exportHistory(format) {
    const url = apiClient.exportHistory({
      format,
      status: this.statusFilter || undefined,
      triggered_by: this.triggerFilter || undefined
    });
    window.open(url, '_blank');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default HistoryTable;
