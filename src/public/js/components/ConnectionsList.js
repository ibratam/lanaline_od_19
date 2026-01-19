import apiClient from '../services/apiClient.js';

/**
 * Connections List Component
 */
export class ConnectionsList {
  constructor() {
    this.connections = [];
  }

  /**
   * Load and render connections
   */
  async load() {
    try {
      this.connections = await apiClient.getConfigs();
      return this.render();
    } catch (error) {
      console.error('Error loading connections:', error);
      return this.renderError(error.message);
    }
  }

  /**
   * Render connections list
   */
  render() {
    if (this.connections.length === 0) {
      return '<p class="text-muted">No connections configured yet.</p>';
    }

    let html = '<table><thead><tr><th>Name</th><th>URL</th><th>Database</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

    for (const conn of this.connections) {
      const statusClass = conn.status === 'connected' ? 'status-connected' : 'status-failed';
      html += `
        <tr>
          <td><strong>${this.escapeHtml(conn.name)}</strong></td>
          <td><small>${this.escapeHtml(conn.url)}</small></td>
          <td><small>${this.escapeHtml(conn.database_name)}</small></td>
          <td><span class="status ${statusClass}">${conn.status || 'untested'}</span></td>
          <td>
            <button class="btn btn-small btn-secondary edit-btn" data-id="${conn.id}">Edit</button>
            <button class="btn btn-small btn-danger delete-btn" data-id="${conn.id}">Delete</button>
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    return html;
  }

  /**
   * Render error message
   */
  renderError(message) {
    return `<div class="alert alert-danger">Failed to load connections: ${this.escapeHtml(message)}</div>`;
  }

  /**
   * Attach event handlers
   */
  attachHandlers(onEdit, onDelete) {
    const container = document.getElementById('connections-container');
    if (!container) return;

    container.addEventListener('click', async (e) => {
      if (e.target.classList.contains('edit-btn')) {
        const id = e.target.dataset.id;
        onEdit?.(id);
      } else if (e.target.classList.contains('delete-btn')) {
        const id = e.target.dataset.id;
        const name = this.connections.find(c => c.id == id)?.name;
        if (confirm(`Are you sure you want to delete "${name}"?`)) {
          try {
            await apiClient.deleteConfig(id);
            await this.load();
            this.attachHandlers(onEdit, onDelete);
            onDelete?.();
          } catch (error) {
            alert(`Error deleting connection: ${error.message}`);
          }
        }
      }
    });
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

export default ConnectionsList;
