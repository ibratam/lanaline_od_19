import ConfigForm from './components/ConfigForm.js';
import ConnectionsList from './components/ConnectionsList.js';
import PreviewDisplay from './components/PreviewDisplay.js';
import ProgressMonitor from './components/ProgressMonitor.js';
import SyncResults from './components/SyncResults.js';
import ScheduleEditor from './components/ScheduleEditor.js';
import HistoryTable from './components/HistoryTable.js';
import ModelSelector from './components/ModelSelector.js';
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
    this.scheduleEditor = new ScheduleEditor();
    this.historyTable = new HistoryTable();
    this.previewModelSelector = new ModelSelector();
    this.syncModelSelector = new ModelSelector();
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
      await this.loadScheduleTab();
      await this.loadHistoryTab();
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
      ${this.previewModelSelector.render('preview-models', 'Preview Models')}
    `;

    this.previewModelSelector.attachHandlers('preview-models');
    await this.loadModelsForSelector('preview-models', 'preview-source', this.previewModelSelector);

    const previewSource = document.getElementById('preview-source');
    previewSource?.addEventListener('change', async () => {
      await this.loadModelsForSelector('preview-models', 'preview-source', this.previewModelSelector);
    });

    const previewButton = document.getElementById('preview-btn');
    previewButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('preview-source')?.value);
      const targetId = Number(document.getElementById('preview-target')?.value);
      const container = document.getElementById('preview-container');
      const modelFilter = this.previewModelSelector.getSelectedModels('preview-models');

      if (!sourceId || !targetId || sourceId === targetId) {
        if (container) {
          container.innerHTML = '<div class="alert alert-warning">Select two different connections.</div>';
        }
        return;
      }

      const html = await this.previewDisplay.load(sourceId, targetId, modelFilter);
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
      ${this.syncModelSelector.render('sync-models', 'Sync Models')}
    `;

    this.syncModelSelector.attachHandlers('sync-models');
    await this.loadModelsForSelector('sync-models', 'sync-source', this.syncModelSelector);

    const syncSource = document.getElementById('sync-source');
    syncSource?.addEventListener('change', async () => {
      await this.loadModelsForSelector('sync-models', 'sync-source', this.syncModelSelector);
    });

    const startButton = document.getElementById('sync-start-btn');
    startButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('sync-source')?.value);
      const targetId = Number(document.getElementById('sync-target')?.value);
      const modelFilter = this.syncModelSelector.getSelectedModels('sync-models');

      if (!sourceId || !targetId || sourceId === targetId) {
        this.showError('Select two different connections to start sync.');
        return;
      }

      try {
        const response = await apiClient.executeSync({
          source_db_id: sourceId,
          target_db_id: targetId,
          model_filter: modelFilter
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
   * Load schedule tab controls
   */
  async loadScheduleTab() {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    const html = await this.scheduleEditor.load();
    container.innerHTML = html;
    this.scheduleEditor.attachHandlers(async () => {
      await this.loadScheduleTab();
    });
  }

  /**
   * Load history tab data
   */
  async loadHistoryTab() {
    const container = document.getElementById('history-container');
    if (!container) return;

    const html = await this.historyTable.load();
    container.innerHTML = html;
    this.historyTable.attachHandlers(async () => {
      await this.loadHistoryTab();
    });
  }

  async loadModelsForSelector(prefix, sourceSelectId, selector) {
    const sourceId = Number(document.getElementById(sourceSelectId)?.value);
    if (!sourceId) {
      selector.setStatus(prefix, 'Select a source connection to load models.');
      return;
    }

    selector.setStatus(prefix, 'Loading models...');
    try {
      const response = await apiClient.getSyncModels(sourceId);
      selector.setModels(prefix, response.models || []);
    } catch (error) {
      selector.setStatus(prefix, error?.data?.message || 'Failed to load models.');
    }
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
    await this.loadScheduleTab();
    await this.loadHistoryTab();
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
