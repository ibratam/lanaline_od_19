import apiClient from '../services/apiClient.js';

/**
 * Configuration Form Component
 */
export class ConfigForm {
  constructor() {
    this.form = null;
    this.editingId = null;
  }

  /**
   * Render the configuration form
   */
  render(connectionId = null) {
    this.editingId = connectionId;
    const isEditing = !!connectionId;

    const html = `
      <form id="config-form" class="config-form">
        <div class="form-group">
          <label for="conn-name">Connection Name *</label>
          <input
            type="text"
            id="conn-name"
            name="name"
            placeholder="e.g., Source Database"
            required
            ${isEditing ? 'readonly' : ''}
          >
          <small class="text-muted">Unique identifier for this connection</small>
        </div>

        <div class="form-group">
          <label for="conn-url">Odoo URL *</label>
          <input
            type="url"
            id="conn-url"
            name="url"
            placeholder="https://odoo.example.com"
            required
          >
        </div>

        <div class="form-group">
          <label for="conn-database">Database Name *</label>
          <input
            type="text"
            id="conn-database"
            name="database_name"
            placeholder="odoo_production"
            required
          >
        </div>

        <div class="form-group">
          <label for="conn-username">Username *</label>
          <input
            type="text"
            id="conn-username"
            name="username"
            placeholder="admin"
            required
          >
        </div>

        <div class="form-group">
          <label for="conn-password">Password *</label>
          <input
            type="password"
            id="conn-password"
            name="password"
            placeholder="••••••••"
            ${isEditing ? '' : 'required'}
          >
          ${isEditing ? '<small class="text-muted">Leave blank to keep current password</small>' : ''}
        </div>

        <div class="btn-group">
          <button type="button" id="test-btn" class="btn btn-secondary">
            Test Connection
          </button>
          <button type="submit" class="btn btn-primary">
            ${isEditing ? 'Update Connection' : 'Save Connection'}
          </button>
          ${isEditing ? `<button type="button" id="cancel-btn" class="btn btn-secondary">Cancel</button>` : ''}
        </div>

        <div id="form-message"></div>
      </form>
    `;

    return html;
  }

  /**
   * Attach event handlers
   */
  attachHandlers(onSave, onCancel = null) {
    this.form = document.getElementById('config-form');
    const testBtn = document.getElementById('test-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    if (testBtn) {
      testBtn.addEventListener('click', (e) => this.handleTest(e));
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => onCancel?.());
    }

    this.form.addEventListener('submit', (e) => this.handleSubmit(e, onSave));
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e, onSave) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const data = Object.fromEntries(formData);

    // Validate
    const validation = this.validate(data);
    if (!validation.valid) {
      this.showMessage(validation.error, 'danger');
      return;
    }

    try {
      this.showMessage('Saving connection...', 'info');

      if (this.editingId) {
        // Update existing
        await apiClient.updateConfig(this.editingId, data);
        this.showMessage('Connection updated successfully!', 'success');
      } else {
        // Create new
        await apiClient.createConfig(data);
        this.showMessage('Connection saved successfully!', 'success');
        this.form.reset();
      }

      if (onSave) {
        setTimeout(() => onSave(), 500);
      }
    } catch (error) {
      this.showMessage(error.data?.message || error.message, 'danger');
    }
  }

  /**
   * Handle connection test
   */
  async handleTest(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const data = Object.fromEntries(formData);

    // Validate required fields
    if (!data.url || !data.database_name || !data.username || !data.password) {
      this.showMessage('Please fill in all required fields', 'warning');
      return;
    }

    try {
      this.showMessage('Testing connection...', 'info');
      const result = await apiClient.testConnection(data);

      if (result.success) {
        this.showMessage(`✓ Connection successful! (UID: ${result.uid})`, 'success');
      } else {
        this.showMessage(`✗ Connection failed: ${result.message}`, 'danger');
      }
    } catch (error) {
      this.showMessage(error.message, 'danger');
    }
  }

  /**
   * Validate form data
   */
  validate(data) {
    if (!data.name || data.name.trim() === '') {
      return { valid: false, error: 'Connection name is required' };
    }

    if (!data.url || data.url.trim() === '') {
      return { valid: false, error: 'URL is required' };
    }

    try {
      new URL(data.url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    if (!data.database_name || data.database_name.trim() === '') {
      return { valid: false, error: 'Database name is required' };
    }

    if (!data.username || data.username.trim() === '') {
      return { valid: false, error: 'Username is required' };
    }

    if (!data.password || data.password.trim() === '') {
      return { valid: false, error: 'Password is required' };
    }

    return { valid: true };
  }

  /**
   * Show message
   */
  showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('form-message');
    if (!messageDiv) return;

    messageDiv.className = `alert alert-${type} mt-10`;
    messageDiv.textContent = message;
  }

  /**
   * Load connection data into form
   */
  async loadConnection(id) {
    try {
      const connection = await apiClient.getConfig(id);
      const form = document.getElementById('config-form');

      if (form) {
        document.getElementById('conn-name').value = connection.name;
        document.getElementById('conn-url').value = connection.url;
        document.getElementById('conn-database').value = connection.database_name;
        document.getElementById('conn-username').value = connection.username;
      }
    } catch (error) {
      console.error('Error loading connection:', error);
    }
  }
}

export default ConfigForm;
