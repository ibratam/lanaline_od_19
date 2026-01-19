import apiClient from '../services/apiClient.js';
import ResolutionForm from './ResolutionForm.js';

/**
 * Conflict Detail Component
 * Displays side-by-side conflict data.
 */
export class ConflictDetail {
  constructor() {
    this.conflict = null;
    this.resolutionForm = new ResolutionForm();
  }

  async load(conflictId) {
    this.conflict = await apiClient.getConflict(conflictId);
    return this.render();
  }

  render() {
    if (!this.conflict) {
      return '<p class="text-muted">Select a conflict to view details.</p>';
    }

    const formHtml = this.conflict.state === 'detected'
      ? this.resolutionForm.render(this.conflict.id)
      : '';

    return `
      <div class="conflict-detail">
        <h3>Conflict #${this.conflict.id}</h3>
        <p><strong>Model:</strong> ${this.escapeHtml(this.conflict.odoo_model)}</p>
        <p><strong>Record ID:</strong> ${this.conflict.record_id}</p>
        <p><strong>State:</strong> ${this.escapeHtml(this.conflict.state)}</p>

        <div class="conflict-compare">
          <div>
            <h4>Source</h4>
            <pre>${this.escapeHtml(JSON.stringify(this.conflict.source_values || {}, null, 2))}</pre>
          </div>
          <div>
            <h4>Target</h4>
            <pre>${this.escapeHtml(JSON.stringify(this.conflict.target_values || {}, null, 2))}</pre>
          </div>
        </div>
        ${formHtml}
      </div>
    `;
  }

  attachHandlers(onResolve, onApply) {
    const resolveButton = document.getElementById('resolve-submit');
    const applyButton = document.getElementById('resolve-apply');

    resolveButton?.addEventListener('click', () => {
      if (onResolve && this.conflict) {
        onResolve(this.conflict.id, this.resolutionForm.getChoice());
      }
    });

    applyButton?.addEventListener('click', () => {
      if (onApply && this.conflict) {
        onApply(this.conflict.id);
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default ConflictDetail;
