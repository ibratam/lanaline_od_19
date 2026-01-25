import ConfigForm from './components/ConfigForm.js';
import ConnectionsList from './components/ConnectionsList.js';
import PreviewDisplay from './components/PreviewDisplay.js';
import ProgressMonitor from './components/ProgressMonitor.js';
import SyncResults from './components/SyncResults.js';
import ScheduleEditor from './components/ScheduleEditor.js';
import HistoryTable from './components/HistoryTable.js';
import ModelSelector from './components/ModelSelector.js';
import ConflictsList from './components/ConflictsList.js';
import ConflictDetail from './components/ConflictDetail.js';
import NotificationPanel from './components/NotificationPanel.js';
import SyncHistoryPanel from './components/SyncHistoryPanel.js';
import BulkResolutionDialog from './components/BulkResolutionDialog.js';
import ErrorDisplay from './components/ErrorDisplay.js';
import ConsistencyPanel from './components/ConsistencyPanel.js';
import OperationLogger from './components/OperationLogger.js';
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
    this.syncHistoryPanel = new SyncHistoryPanel();
    this.previewModelSelector = new ModelSelector();
    this.syncModelSelector = new ModelSelector();
    this.conflictsList = new ConflictsList();
    this.conflictDetail = new ConflictDetail();
    this.notificationPanel = new NotificationPanel();
    this.errorDisplay = new ErrorDisplay();
    this.consistencyPanel = new ConsistencyPanel();
    this.operationLogger = new OperationLogger();
    this.bulkResolutionDialog = new BulkResolutionDialog({
      onPreview: (rule) => apiClient.previewBulkResolution(rule),
      onApply: async (rule) => {
        const result = await apiClient.applyBulkResolution(rule);
        this.notificationPanel.show({
          type: result.failed_count ? 'error' : 'success',
          message: `Bulk resolved ${result.resolved_count} conflicts (${result.failed_count} failed).`
        });
        return result;
      },
      onClose: () => {
        this.loadConflictsTab();
      }
    });
    this.activeTab = 'config';
    this.lastSyncRunId = null;
    this.autoRefreshIntervalId = null;
    this.autoRefreshRunning = false;
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
      await this.loadConflictsTab();
      await this.loadConsistencyTab();
      await this.loadOperationsTab();
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
    this.refreshTab(tabName);
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
          <label for="preview-company">Company</label>
          <select id="preview-company">
            <option value="">All companies</option>
          </select>
        </div>
        <div class="form-group">
          <label for="preview-sample-flag">Sample Flag (x_studio_sample_flag)</label>
          <input type="text" id="preview-sample-flag" placeholder="true / false / value">
        </div>
        <div class="form-group">
          <button class="btn btn-primary" id="preview-btn">Generate Preview</button>
        </div>
      </div>
      ${this.previewModelSelector.render('preview-models', 'Preview Models')}
    `;

    this.previewModelSelector.attachHandlers('preview-models');
    await this.loadModelsForSelector('preview-models', 'preview-source', this.previewModelSelector);
    await this.loadCompaniesForSelect('preview-company', 'preview-source');

    const previewSource = document.getElementById('preview-source');
    previewSource?.addEventListener('change', async () => {
      await this.loadModelsForSelector('preview-models', 'preview-source', this.previewModelSelector);
      await this.loadCompaniesForSelect('preview-company', 'preview-source');
    });

    const previewButton = document.getElementById('preview-btn');
    previewButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('preview-source')?.value);
      const targetId = Number(document.getElementById('preview-target')?.value);
      const container = document.getElementById('preview-container');
      const modelFilter = this.previewModelSelector.getSelectedModels('preview-models');
      const companyId = Number(document.getElementById('preview-company')?.value) || null;
      const sampleFlagValue = document.getElementById('preview-sample-flag')?.value?.trim() || null;

      if (!sourceId || !targetId || sourceId === targetId) {
        if (container) {
          container.innerHTML = '<div class="alert alert-warning">Select two different connections.</div>';
        }
        return;
      }

      const mergedFilter = this.mergeFilters(modelFilter);
      const html = await this.previewDisplay.load(sourceId, targetId, mergedFilter, companyId, sampleFlagValue);
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
          <label for="sync-company">Company</label>
          <select id="sync-company">
            <option value="">All companies</option>
          </select>
        </div>
        <div class="form-group">
          <label for="sync-sample-flag">Sample Flag (x_studio_sample_flag)</label>
          <input type="text" id="sync-sample-flag" placeholder="true / false / value">
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
    await this.loadCompaniesForSelect('sync-company', 'sync-source');

    const syncSource = document.getElementById('sync-source');
    syncSource?.addEventListener('change', async () => {
      await this.loadModelsForSelector('sync-models', 'sync-source', this.syncModelSelector);
      await this.loadCompaniesForSelect('sync-company', 'sync-source');
    });

    const startButton = document.getElementById('sync-start-btn');
    startButton?.addEventListener('click', async () => {
      const sourceId = Number(document.getElementById('sync-source')?.value);
      const targetId = Number(document.getElementById('sync-target')?.value);
      const modelFilter = this.syncModelSelector.getSelectedModels('sync-models');
      const companyId = Number(document.getElementById('sync-company')?.value) || null;
      const sampleFlagValue = document.getElementById('sync-sample-flag')?.value?.trim() || null;

      if (!sourceId || !targetId || sourceId === targetId) {
        this.showError('Select two different connections to start sync.');
        return;
      }

      try {
        const mergedFilter = this.mergeFilters(modelFilter);
        const response = await apiClient.executeSync({
          source_db_id: sourceId,
          target_db_id: targetId,
          model_filter: mergedFilter,
          company_id: companyId,
          sample_flag_value: sampleFlagValue
        });
        this.lastSyncRunId = response.sync_run_id;
        this.progressMonitor.start((status) => {
          this.syncResults.render(status.summary);
          this.loadSyncFailures();
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
          this.loadSyncFailures();
        });
      } catch (error) {
        this.showError(error.message);
      }
    });

    await this.loadSyncFailures();
  }

  /**
   * Load schedule tab controls
   */
  async loadScheduleTab() {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    const html = await this.scheduleEditor.load();
    container.innerHTML = html;
    await this.scheduleEditor.attachHandlers(async () => {
      await this.loadScheduleTab();
    });
  }

  /**
   * Load history tab data
   */
  async loadHistoryTab() {
    const container = document.getElementById('history-container');
    if (!container) return;

    const html = await this.syncHistoryPanel.load();
    container.innerHTML = html;
    this.syncHistoryPanel.attachHandlers(async () => {
      await this.loadHistoryTab();
    });
  }

  async loadSyncFailures() {
    const container = document.getElementById('sync-failures-container');
    if (!container) return;

    const html = await this.errorDisplay.load();
    container.innerHTML = html;
    this.errorDisplay.attachHandlers(async () => {
      await this.loadSyncFailures();
    });
  }

  /**
   * Load conflicts tab data
   */
  async loadConflictsTab() {
    const container = document.getElementById('conflicts-container');
    if (!container) return;

    const html = await this.conflictsList.load();
    container.innerHTML = `
      ${this.notificationPanel.render()}
      <div class="conflicts-layout">
        <div class="conflicts-list">
          ${html}
        </div>
        <div class="conflicts-detail" id="conflict-detail">
          <p class="text-muted">Select a conflict to view details.</p>
        </div>
      </div>
      <div id="bulk-resolution-root"></div>
    `;

    this.bulkResolutionDialog.mount(document.getElementById('bulk-resolution-root'));

    this.conflictsList.attachHandlers(
      async () => {
        await this.loadConflictsTab();
      },
      async (id) => {
        const detailHtml = await this.conflictDetail.load(id);
        const detailContainer = document.getElementById('conflict-detail');
        if (detailContainer) {
          detailContainer.innerHTML = detailHtml;
        }

        this.conflictDetail.attachHandlers(
          async (conflictId, choice) => {
            try {
              await apiClient.resolveConflict(conflictId, {
                chosen_version: choice,
                user_id: 1
              });
              this.notificationPanel.show({
                type: 'success',
                message: 'Conflict resolved. Ready to apply.'
              });
              await this.loadConflictsTab();
            } catch (error) {
              this.notificationPanel.show({
                type: 'error',
                message: error.message,
                errorCode: 'UC-RESOLVE'
              });
              this.showError(error.message);
            }
          },
          async (conflictId) => {
            try {
              await apiClient.applyConflict(conflictId);
              this.notificationPanel.show({
                type: 'info',
                message: 'Applying resolution...'
              });
              await this.loadConflictsTab();
            } catch (error) {
              this.notificationPanel.show({
                type: 'error',
                message: error.message,
                errorCode: 'SE-APPLY'
              });
              this.showError(error.message);
            }
          },
          async () => {
            this.notificationPanel.show({
              type: 'info',
              message: 'Retrying resolution...'
            });
            await this.loadConflictsTab();
          }
        );
      },
      async () => {
        const filters = [];
        if (this.conflictsList.stateFilter) {
          filters.push(`state=${this.conflictsList.stateFilter}`);
        }
        if (this.conflictsList.modelFilter) {
          filters.push(`model=${this.conflictsList.modelFilter}`);
        }
        const filterLabel = filters.length > 0 ? ` (${filters.join(', ')})` : '';
        if (!window.confirm(`Clear conflicts${filterLabel}? This removes them from the database.`)) {
          return;
        }
        try {
          const result = await apiClient.clearConflicts({
            state: this.conflictsList.stateFilter || undefined,
            model: this.conflictsList.modelFilter || undefined
          });
          this.notificationPanel.show({
            type: 'success',
            message: `Cleared ${result.deleted_count || 0} conflicts.`
          });
          await this.loadConflictsTab();
        } catch (error) {
          this.notificationPanel.show({
            type: 'error',
            message: error.message,
            errorCode: 'CF-CLEAR'
          });
          this.showError(error.message);
        }
      }
    );

    document.getElementById('conflicts-bulk-open')?.addEventListener('click', () => {
      const models = [...new Set(this.conflictsList.conflicts
        .map(conflict => conflict.odoo_model)
        .filter(Boolean))].sort();
      this.bulkResolutionDialog.open({
        models,
        preselectedModel: this.conflictsList.modelFilter
      });
    });
  }

  /**
   * Load consistency tab data
   */
  async loadConsistencyTab() {
    try {
      await this.consistencyPanel.init();
    } catch (error) {
      console.error('Failed to load consistency tab:', error);
      this.showError('Failed to load consistency tab');
    }
  }

  /**
   * Load operations tab data
   */
  async loadOperationsTab() {
    try {
      await this.operationLogger.init();
    } catch (error) {
      console.error('Failed to load operations tab:', error);
      this.showError('Failed to load operations tab');
    }
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

  async loadCompaniesForSelect(selectId, sourceSelectId) {
    const select = document.getElementById(selectId);
    const sourceId = Number(document.getElementById(sourceSelectId)?.value);
    if (!select) {
      return;
    }
    if (!sourceId) {
      select.innerHTML = '<option value="">All companies</option>';
      return;
    }

    select.innerHTML = '<option value="">Loading companies...</option>';
    try {
      const response = await apiClient.getSyncCompanies(sourceId);
      const companies = response.companies || [];
      const options = companies
        .map(company => `<option value="${company.id}">${this.escapeHtml(company.name)}</option>`)
        .join('');
      select.innerHTML = `<option value="">All companies</option>${options}`;
    } catch (error) {
      select.innerHTML = '<option value="">All companies</option>';
    }
  }

  mergeFilters(modelFilter) {
    const models = Array.isArray(modelFilter) ? modelFilter : [];
    return models.length > 0 ? models : null;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
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
    await this.loadConflictsTab();
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

  async refreshTab(tabName) {
    if (this.autoRefreshRunning) {
      return;
    }
    this.autoRefreshRunning = true;
    try {
      switch (tabName) {
        case 'config':
          await this.loadConfigTab();
          break;
        case 'preview':
          await this.loadPreviewTab();
          break;
        case 'sync':
          await this.loadSyncTab();
          break;
        case 'schedule':
          await this.loadScheduleTab();
          break;
        case 'history':
          await this.loadHistoryTab();
          break;
        case 'conflicts':
          await this.loadConflictsTab();
          break;
        case 'consistency':
          await this.loadConsistencyTab();
          break;
        case 'operations':
          await this.loadOperationsTab();
          break;
        default:
          break;
      }
    } finally {
      this.autoRefreshRunning = false;
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new OdooSyncApp();
  app.init();

  // Make app available globally for debugging
  window.app = app;
});
