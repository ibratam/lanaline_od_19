import apiClient from '../services/apiClient.js';

/**
 * Sync History Panel
 * Displays sync operations with filters and detailed changes.
 */
export class SyncHistoryPanel {
  constructor() {
    this.items = [];
    this.selected = null;
    this.filters = {
      status: '',
      model: '',
      start: '',
      end: ''
    };
  }

  async load() {
    const params = {
      status: this.filters.status || undefined,
      model: this.filters.model || undefined,
      start: this.filters.start || undefined,
      end: this.filters.end || undefined
    };
    const response = await apiClient.getHistory(params);
    this.items = response.items || [];
    return this.render();
  }

  render() {
    const rows = this.items.length
      ? this.items.map(item => `
        <tr>
          <td>${item.id}</td>
          <td>${this.escapeHtml(item.status)}</td>
          <td>${this.escapeHtml(item.triggered_by)}</td>
          <td>${item.started_at ? new Date(item.started_at).toLocaleString() : '—'}</td>
          <td>${item.total_records_created || 0}</td>
          <td>${item.total_records_updated || 0}</td>
          <td>${item.total_records_deleted || 0}</td>
          <td><button class="btn btn-small btn-secondary history-detail" data-id="${item.id}">Details</button></td>
        </tr>
      `).join('')
      : '<tr><td colspan="8" class="text-muted">No history entries.</td></tr>';

    return `
      <div class="history-panel">
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
            <label for="history-model">Model</label>
            <input type="text" id="history-model" placeholder="res.partner">
          </div>
          <div class="form-group">
            <label for="history-start">Start</label>
            <input type="date" id="history-start">
          </div>
          <div class="form-group">
            <label for="history-end">End</label>
            <input type="date" id="history-end">
          </div>
          <div class="form-group">
            <button class="btn btn-secondary" id="history-apply">Apply</button>
          </div>
        </div>

        <table class="history-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Trigger</th>
              <th>Started</th>
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

        <div id="history-detail" class="history-detail">
          <p class="text-muted">Select an operation to view changes.</p>
        </div>
      </div>
    `;
  }

  attachHandlers(onRefresh) {
    document.getElementById('history-apply')?.addEventListener('click', () => {
      this.filters.status = document.getElementById('history-status').value;
      this.filters.model = document.getElementById('history-model').value.trim();
      this.filters.start = document.getElementById('history-start').value || '';
      this.filters.end = document.getElementById('history-end').value || '';
      onRefresh();
    });

    document.querySelectorAll('.history-detail').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        const detail = await apiClient.get(`/history/${id}/changes`);
        const container = document.getElementById('history-detail');
        if (container) {
          container.innerHTML = `
            <h4>Changes for #${id}</h4>
            <pre>${this.escapeHtml(JSON.stringify(detail.changes || [], null, 2))}</pre>
          `;
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

export default SyncHistoryPanel;
