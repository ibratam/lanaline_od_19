import { BulkResolutionValidation } from './BulkResolutionDialog.propTypes.js';

/**
 * Bulk Resolution Dialog
 * Allows bulk conflict resolution with preview and confirmation.
 */
export class BulkResolutionDialog {
  constructor({ onPreview, onApply, onClose } = {}) {
    this.onPreview = onPreview;
    this.onApply = onApply;
    this.onClose = onClose;
    this.container = null;
    this.isOpen = false;
    this.models = [];
    this.rule = { model: '', field: '', action: 'keep_local' };
    this.previewResult = null;
    this.applyResult = null;
    this.loading = false;
    this.previewing = false;
    this.error = null;
  }

  mount(container) {
    this.container = container;
    this.renderToDom();
  }

  open({ models = [], preselectedModel = '' } = {}) {
    this.isOpen = true;
    this.models = models;
    this.rule = {
      model: preselectedModel || '',
      field: '',
      action: 'keep_local'
    };
    this.previewResult = null;
    this.applyResult = null;
    this.error = null;
    this.renderToDom();
  }

  close() {
    this.isOpen = false;
    this.renderToDom();
    if (this.onClose) {
      this.onClose();
    }
    document.dispatchEvent(new CustomEvent('bulk:cancelled'));
  }

  renderToDom() {
    if (!this.container) return;
    this.container.innerHTML = this.render();
    this.attachHandlers();
  }

  render() {
    const hiddenClass = this.isOpen ? '' : 'hidden';
    const loadingClass = this.loading ? 'bulk-resolution-loading' : '';
    const previewingClass = this.previewing ? 'bulk-resolution-previewing' : '';
    const errorClass = this.error ? 'bulk-resolution-error' : '';

    return `
      <div class="bulk-resolution-modal ${hiddenClass}">
        <div class="bulk-resolution-backdrop"></div>
        <div class="bulk-resolution-dialog ${loadingClass} ${previewingClass} ${errorClass}">
          <div class="bulk-resolution-header">
            <h3>Bulk Resolve Conflicts</h3>
            <button class="bulk-resolution-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="bulk-resolution-body">
            ${this.renderRuleBuilder()}
            ${this.renderPreview(this.previewResult)}
            ${this.renderResults(this.applyResult)}
            ${this.renderErrorState(this.error)}
          </div>
          <div class="bulk-resolution-footer">
            <button class="btn btn-secondary" id="bulk-preview">Preview Changes</button>
            <button class="btn btn-success" id="bulk-apply">Apply Resolution</button>
            <button class="btn btn-secondary" id="bulk-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  renderRuleBuilder() {
    const modelOptions = this.models
      .map(model => `<option value="${this.escapeHtml(model)}"></option>`)
      .join('');

    return `
      <section class="rule-builder">
        <h4>Create Resolution Rule</h4>
        <div class="form-row">
          <div class="form-group">
            <label for="bulk-model">Odoo Model</label>
            <input id="bulk-model" list="bulk-models" placeholder="product.product" value="${this.escapeHtml(this.rule.model)}">
            <datalist id="bulk-models">
              ${modelOptions}
            </datalist>
          </div>
          <div class="form-group">
            <label for="bulk-field">Field (Optional)</label>
            <input id="bulk-field" placeholder="list_price" value="${this.escapeHtml(this.rule.field || '')}">
          </div>
          <div class="form-group">
            <label>Action</label>
            <div class="bulk-action-options">
              <label>
                <input type="radio" name="bulk-action" value="keep_local" ${this.rule.action === 'keep_local' ? 'checked' : ''}>
                Keep Source
              </label>
              <label>
                <input type="radio" name="bulk-action" value="keep_odoo" ${this.rule.action === 'keep_odoo' ? 'checked' : ''}>
                Keep Target
              </label>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderPreview(result) {
    if (!result) return '<section class="preview-section"></section>';
    return `
      <section class="preview-section">
        <h4>Preview</h4>
        <div class="summary-box">
          <div>Matching Conflicts: <strong>${result.matching_conflicts}</strong></div>
          <div>Models Affected: <strong>${result.matching_conflicts ? 1 : 0}</strong></div>
        </div>
        ${this.formatConflictsList(result.preview || [])}
      </section>
    `;
  }

  renderResults(result) {
    if (!result) return '<section class="results-section"></section>';
    return `
      <section class="results-section">
        <h4>Results</h4>
        <div class="summary-box">
          <div class="text-success">Resolved: ${result.resolved_count}</div>
          <div class="text-info">Already Resolved: ${result.already_resolved_count}</div>
          <div class="text-danger">Failed: ${result.failed_count}</div>
        </div>
        ${this.renderFailureDetails(result.details?.failed || [])}
      </section>
    `;
  }

  renderFailureDetails(failures) {
    if (!failures.length) return '';
    const rows = failures
      .map(failure => `
        <tr>
          <td>${failure.conflict_id}</td>
          <td>${this.escapeHtml(failure.reason || 'Failed')}</td>
          <td>${this.escapeHtml(failure.error_code || '')}</td>
        </tr>
      `)
      .join('');

    return `
      <table class="conflict-preview-table">
        <thead>
          <tr>
            <th>Conflict ID</th>
            <th>Reason</th>
            <th>Error Code</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  renderErrorState(error) {
    if (!error) return '';
    return `<div class="bulk-resolution-error-message">${this.escapeHtml(error)}</div>`;
  }

  attachHandlers() {
    const closeButton = this.container.querySelector('.bulk-resolution-close');
    const cancelButton = this.container.querySelector('#bulk-cancel');
    const previewButton = this.container.querySelector('#bulk-preview');
    const applyButton = this.container.querySelector('#bulk-apply');
    const modelInput = this.container.querySelector('#bulk-model');
    const fieldInput = this.container.querySelector('#bulk-field');
    const actionInputs = this.container.querySelectorAll('input[name="bulk-action"]');

    closeButton?.addEventListener('click', () => this.close());
    cancelButton?.addEventListener('click', () => this.close());
    previewButton?.addEventListener('click', () => this.handlePreviewClick());
    applyButton?.addEventListener('click', () => this.handleApplyClick());

    modelInput?.addEventListener('input', (event) => {
      this.handleRuleChange('model', event.target.value.trim());
    });
    fieldInput?.addEventListener('input', (event) => {
      this.handleRuleChange('field', event.target.value.trim());
    });
    actionInputs?.forEach(input => {
      input.addEventListener('change', (event) => {
        this.handleRuleChange('action', event.target.value);
      });
    });
  }

  handleRuleChange(field, value) {
    this.rule = { ...this.rule, [field]: value };
  }

  async handlePreviewClick() {
    if (!this.onPreview) return;
    const validation = this.validateRule(this.rule);
    if (!validation.valid) {
      this.error = validation.error;
      this.previewResult = null;
      this.renderToDom();
      return;
    }

    this.previewing = true;
    this.error = null;
    this.applyResult = null;
    this.renderToDom();
    document.dispatchEvent(new CustomEvent('bulk:preview-requested', { detail: { rule: this.rule } }));

    try {
      const result = await this.onPreview(this.rule);
      if (result.matching_conflicts === 0) {
        this.error = BulkResolutionValidation.errorMessages.noConflicts;
      }
      this.previewResult = result;
      document.dispatchEvent(new CustomEvent('bulk:preview-complete', { detail: result }));
    } catch (error) {
      this.error = error?.data?.error || error?.message || 'Preview failed';
    } finally {
      this.previewing = false;
      this.renderToDom();
    }
  }

  async handleApplyClick() {
    if (!this.onApply) return;
    const validation = this.validateRule(this.rule);
    if (!validation.valid) {
      this.error = validation.error;
      this.renderToDom();
      return;
    }

    const count = this.previewResult?.matching_conflicts;
    if (count && !window.confirm(`Apply bulk resolution to ${count} conflicts?`)) {
      return;
    }

    this.loading = true;
    this.error = null;
    this.renderToDom();
    document.dispatchEvent(new CustomEvent('bulk:apply-requested', { detail: { rule: this.rule } }));

    try {
      const result = await this.onApply(this.rule);
      this.applyResult = result;
      document.dispatchEvent(new CustomEvent('bulk:apply-complete', { detail: result }));
    } catch (error) {
      this.error = error?.data?.error || error?.message || 'Apply failed';
    } finally {
      this.loading = false;
      this.renderToDom();
    }
  }

  formatConflictsList(conflicts) {
    if (!conflicts.length) {
      return '<p class="text-muted">No preview data available.</p>';
    }

    const rows = conflicts
      .map(conflict => `
        <tr>
          <td>${conflict.id}</td>
          <td>${this.escapeHtml(conflict.model_name || conflict.odoo_model || '')}</td>
          <td>${conflict.record_id ?? '—'}</td>
          <td>${this.escapeHtml(conflict.field_name || '—')}</td>
          <td>${this.escapeHtml(conflict.will_apply_version || '—')}</td>
          <td>${this.escapeHtml(conflict.current_state || '—')}</td>
        </tr>
      `)
      .join('');

    return `
      <table class="conflict-preview-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Model</th>
            <th>Record</th>
            <th>Field</th>
            <th>Will Apply</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  validateRule(rule) {
    if (!rule.model) {
      return { valid: false, error: BulkResolutionValidation.errorMessages.modelRequired };
    }

    if (!BulkResolutionValidation.rules.model.pattern.test(rule.model)) {
      return { valid: false, error: BulkResolutionValidation.errorMessages.modelInvalid };
    }

    if (rule.field && !BulkResolutionValidation.rules.field.pattern.test(rule.field)) {
      return { valid: false, error: BulkResolutionValidation.errorMessages.fieldInvalid };
    }

    if (!rule.action) {
      return { valid: false, error: BulkResolutionValidation.errorMessages.actionRequired };
    }

    if (!BulkResolutionValidation.rules.action.enum.includes(rule.action)) {
      return { valid: false, error: BulkResolutionValidation.errorMessages.actionRequired };
    }

    return { valid: true };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default BulkResolutionDialog;
