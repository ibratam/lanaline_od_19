import ConfigForm from './components/ConfigForm.js';
import ConnectionsList from './components/ConnectionsList.js';

/**
 * Main Application
 */
class OdooSyncApp {
  constructor() {
    this.configForm = new ConfigForm();
    this.connectionsList = new ConnectionsList();
    this.activeTab = 'config';
  }

  /**
   * Initialize application
   */
  async init() {
    try {
      this.setupTabNavigation();
      await this.loadConfigTab();
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new OdooSyncApp();
  app.init();

  // Make app available globally for debugging
  window.app = app;
});
