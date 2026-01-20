/**
 * CreateTablePanel Component
 * Displays missing table creation status and progress
 */
class CreateTablePanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = {
      isVisible: false,
      missingTables: [],
      creatingTables: new Set(),
      createdTables: new Set(),
      failedTables: new Set(),
      progress: {}
    };
  }

  /**
   * Render the panel
   */
  render() {
    if (!this.container) {
      console.error('Container not found for CreateTablePanel');
      return;
    }

    const html = `
      <div class="table-creation-panel ${!this.state.isVisible ? 'hidden' : ''}">
        <div class="panel-header">
          <h3>Missing Table Creation</h3>
          <button class="close-btn" onclick="createTablePanel.hide()">×</button>
        </div>

        <div class="panel-content">
          ${this.renderMissingTablesList()}
          ${this.renderProgress()}
          ${this.renderCreationStatus()}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  /**
   * Render missing tables list
   */
  renderMissingTablesList() {
    if (this.state.missingTables.length === 0) {
      return '<div class="info">No missing tables detected.</div>';
    }

    const tablesHtml = this.state.missingTables.map(table => {
      const status = this.getTableStatus(table.table_name);
      const statusClass = `status-${status}`;

      let icon = '';
      if (status === 'created') {
        icon = '✓';
      } else if (status === 'failed') {
        icon = '✗';
      } else if (status === 'creating') {
        icon = '⟳';
      } else {
        icon = '○';
      }

      return `
        <div class="table-item ${statusClass}">
          <div class="table-info">
            <span class="status-icon">${icon}</span>
            <span class="table-name">${table.table_name}</span>
            <span class="columns-count">(${table.schema?.columns?.length || 0} columns)</span>
          </div>
          <div class="table-details">
            ${table.dependencies?.length > 0 ? `
              <div class="dependencies">
                Dependencies: ${table.dependencies.join(', ')}
              </div>
            ` : ''}
            ${this.state.progress[table.table_name] ? `
              <div class="progress-info">
                ${this.state.progress[table.table_name].message}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="tables-list">
        <h4>Missing Tables (${this.state.missingTables.length})</h4>
        ${tablesHtml}
      </div>
    `;
  }

  /**
   * Render creation progress
   */
  renderProgress() {
    const total = this.state.missingTables.length;
    const created = this.state.createdTables.size;
    const failed = this.state.failedTables.size;
    const remaining = total - created - failed;

    if (total === 0) {
      return '';
    }

    const percentage = total > 0 ? Math.round((created / total) * 100) : 0;

    return `
      <div class="progress-section">
        <div class="progress-header">
          <span class="label">Creation Progress</span>
          <span class="stats">
            <span class="created">${created} created</span>
            <span class="failed">${failed} failed</span>
            <span class="remaining">${remaining} remaining</span>
          </span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="progress-percentage">${percentage}%</span>
        </div>
        <div class="progress-details">
          ${this.renderProgressDetails()}
        </div>
      </div>
    `;
  }

  /**
   * Render progress details for creating tables
   */
  renderProgressDetails() {
    const creating = Array.from(this.state.creatingTables);
    if (creating.length === 0) {
      return '';
    }

    return `
      <div class="creating-tables">
        ${creating.map(tableName => `
          <div class="creating-item">
            <span class="spinner">⟳</span>
            <span class="name">${tableName}</span>
            <span class="message">${this.state.progress[tableName]?.message || 'Creating...'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render creation status summary
   */
  renderCreationStatus() {
    const failed = Array.from(this.state.failedTables);
    if (failed.length === 0) {
      return '';
    }

    return `
      <div class="status-summary">
        <h4>Creation Errors (${failed.length})</h4>
        ${failed.map(tableName => `
          <div class="error-item">
            <span class="table-name">${tableName}</span>
            <span class="error-message">${this.state.progress[tableName]?.error || 'Unknown error'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Get table status
   */
  getTableStatus(tableName) {
    if (this.state.createdTables.has(tableName)) return 'created';
    if (this.state.failedTables.has(tableName)) return 'failed';
    if (this.state.creatingTables.has(tableName)) return 'creating';
    return 'pending';
  }

  /**
   * Show missing tables
   */
  showMissingTables(missingTables) {
    this.state.missingTables = missingTables;
    this.state.isVisible = true;
    this.render();
  }

  /**
   * Update table as creating
   */
  startCreating(tableName) {
    this.state.creatingTables.add(tableName);
    this.state.progress[tableName] = {
      status: 'creating',
      message: 'Creating table...'
    };
    this.render();
  }

  /**
   * Update table creation progress
   */
  updateProgress(tableName, message) {
    if (!this.state.progress[tableName]) {
      this.state.progress[tableName] = {};
    }
    this.state.progress[tableName].message = message;
    this.render();
  }

  /**
   * Mark table as successfully created
   */
  markAsCreated(tableName, details = {}) {
    this.state.creatingTables.delete(tableName);
    this.state.createdTables.add(tableName);
    this.state.progress[tableName] = {
      status: 'created',
      message: `Created successfully (${details.column_count || 0} columns)`,
      ...details
    };
    this.render();
  }

  /**
   * Mark table as failed
   */
  markAsFailed(tableName, error) {
    this.state.creatingTables.delete(tableName);
    this.state.failedTables.add(tableName);
    this.state.progress[tableName] = {
      status: 'failed',
      error: error.message || error,
      message: 'Creation failed'
    };
    this.render();
  }

  /**
   * Clear all progress
   */
  clear() {
    this.state = {
      isVisible: false,
      missingTables: [],
      creatingTables: new Set(),
      createdTables: new Set(),
      failedTables: new Set(),
      progress: {}
    };
  }

  /**
   * Hide the panel
   */
  hide() {
    this.state.isVisible = false;
    this.render();
  }

  /**
   * Show the panel
   */
  show() {
    this.state.isVisible = true;
    this.render();
  }
}

// Global instance
window.createTablePanel = new CreateTablePanel('table-creation-panel');

export default CreateTablePanel;
