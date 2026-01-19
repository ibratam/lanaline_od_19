import ConfigForm from './components/ConfigForm.js';
import ConnectionsList from './components/ConnectionsList.js';
import PreviewDisplay from './components/PreviewDisplay.js';
import ProgressMonitor from './components/ProgressMonitor.js';
import SyncResults from './components/SyncResults.js';
import apiClient from './services/apiClient.js';

/**
 * Main Application
 */
class OdooSyncApp {
  constructor() {
    this.configForm = new ConfigForm();
    this.connectionsList = new ConnectionsList();
    this.previewDisplay = new PreviewDisplay();
    this.progressMonitor = new ProgressMonitor();
    this.syncResults = new SyncResults();
    this.activeTab = 'config';
    this.lastSyncRunId = null;
  }

  /**
   * Initialize application
   */
  async init() {
    try {
      this.setupTabNavigation();
      await this.loadConfigTab();
      await this.loadPreviewTab();
      await this.loadSyncTab();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }

  /**
   * Setup tab navigation
   */
  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Hide all tabs except the first
    tabContents.forEach((content, index) => {
      if (index !== 0) {
        content.classList.add('hidden');
      }
    });
  }

  /**
   * Switch active tab
   */
  switchTab(tabName) {
    // Update active button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(tabName)?.classList.remove('hidden');

    this.activeTab = tabName;
  }

  /**
   * Load configuration tab
   */
  async loadConfigTab() {
    // Load and display connections list
    const connectionsHtml = await this.connectionsList.load();
    const connectionsContainer = document.getElementById('connections-container');
    if (connectionsContainer) {
      connectionsContainer.innerHTML = connectionsHtml;
    }

    // Setup connection list handlers
    this.connectionsList.attachHandlers(
      (id) => this.editConnection(id),
      () => this.loadConfigTab() // Refresh after delete
    );

    // Load form
    this.loadConfigForm();
  }

  /**
   * Load preview tab controls
   */
  async loadPreviewTab() {
    const controls = document.getElementById('preview-controls');
    if (!controls) return;

    const connections = await apiClient.getConfigs();
    const options = this.renderConnectionOptions(connections);

    controls.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label for="preview-source">Source</label>
          <select id="preview-source">${options}</select>
        </div>
        <div class="form-group">
          <label for="preview-target">Target</label>
          <select id="preview-target">${options}</select>
        </div>
        <div class="form-group">
          <button class="btn btn-primary" id="preview-btn">Generate Preview</button>
        </div>
      </div>
    `;

    const previewButton = document.getElementById('preview-btn');
    previewButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('preview-source')?.value);
      const targetId = Number(document.getElementById('preview-target')?.value);
      const container = document.getElementById('preview-container');

      if (!sourceId || !targetId || sourceId === targetId) {
        if (container) {
          container.innerHTML = '<div class="alert alert-warning">Select two different connections.</div>';
        }
        return;
      }

      const html = await this.previewDisplay.load(sourceId, targetId);
      if (container) {
        container.innerHTML = html;
      }
      this.previewDisplay.attachHandlers();
    });
  }

  /**
   * Load sync tab controls
   */
  async loadSyncTab() {
    const controls = document.getElementById('sync-controls');
    if (!controls) return;

    const connections = await apiClient.getConfigs();
    const options = this.renderConnectionOptions(connections);

    controls.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label for="sync-source">Source</label>
          <select id="sync-source">${options}</select>
        </div>
        <div class="form-group">
          <label for="sync-target">Target</label>
          <select id="sync-target">${options}</select>
        </div>
        <div class="form-group">
          <button class="btn btn-primary" id="sync-start-btn">Start Sync</button>
          <button class="btn btn-secondary" id="sync-rollback-btn">Rollback</button>
        </div>
      </div>
    `;

    const startButton = document.getElementById('sync-start-btn');
    startButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('sync-source')?.value);
      const targetId = Number(document.getElementById('sync-target')?.value);

      if (!sourceId || !targetId || sourceId === targetId) {
        this.showError('Select two different connections to start sync.');
        return;
      }

      try {
        const response = await apiClient.executeSync({
          source_db_id: sourceId,
          target_db_id: targetId
        });
        this.lastSyncRunId = response.sync_run_id;
        this.progressMonitor.start((status) => {
          this.syncResults.render(status.summary);
        });
      } catch (error) {
        this.showError(error.message);
      }
    });

    const rollbackButton = document.getElementById('sync-rollback-btn');
    rollbackButton?.addEventListener('click', async () => {
      if (!this.lastSyncRunId) {
        this.showError('Run a synchronization before requesting a rollback.');
        return;
      }

      try {
        await apiClient.rollbackSync({ sync_run_id: this.lastSyncRunId });
        this.progressMonitor.start((status) => {
          this.syncResults.render(status.summary);
        });
      } catch (error) {
        this.showError(error.message);
      }
    });
  }

  /**
   * Load and render configuration form
   */
  loadConfigForm(connectionId = null) {
    const formContainer = document.getElementById('config-form-container');
    if (!formContainer) return;

    const formHtml = this.configForm.render(connectionId);
    formContainer.innerHTML = formHtml;

    // Load connection data if editing
    if (connectionId) {
      this.configForm.loadConnection(connectionId);
    }

    // Attach form handlers
    this.configForm.attachHandlers(
      () => this.onConnectionSaved(),
      () => this.loadConfigForm() // Cancel - reload blank form
    );
  }

  /**
   * Edit connection
   */
  async editConnection(id) {
    this.loadConfigForm(id);

    // Scroll to form
    const formContainer = document.getElementById('config-form-container');
    if (formContainer) {
      formContainer.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Handle connection saved
   */
  async onConnectionSaved() {
    // Reload connections list
    await this.loadConfigTab();
    await this.loadPreviewTab();
    await this.loadSyncTab();
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.querySelector('.container');
    if (container) {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-danger';
      alertDiv.textContent = message;
      container.insertBefore(alertDiv, container.firstChild);

      setTimeout(() => alertDiv.remove(), 5000);
    }
  }

  /**
   * Render connection <option> list
   */
  renderConnectionOptions(connections) {
    if (!connections || connections.length === 0) {
      return '<option value="">No connections available</option>';
    }

    return connections
      .map(connection => `<option value="${connection.id}">${connection.name}</option>`)
      .join('');
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new OdooSyncApp();
  app.init();

  // Make app available globally for debugging
  window.app = app;
});
