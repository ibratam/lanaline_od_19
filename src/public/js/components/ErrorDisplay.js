import apiClient from '../services/apiClient.js';

/**
 * Error Display Component
 * Shows sync failures with corrective actions and retry controls.
 */
export class ErrorDisplay {
  constructor() {
    this.items = [];
  }

  async load() {
    const response = await apiClient.getSyncHistory({ limit: 5 });
    this.items = response.items || [];
    return this.render();
  }

  render() {
    const failures = this.items.filter(item => item.last_failure);
    if (failures.length === 0) {
      return '<p class="text-muted">No sync failures recorded.</p>';
    }

    const rows = failures.map(item => {
      const failure = item.last_failure;
      const recordLabel = failure.record_id
        ? `${failure.odoo_model || 'record'} #${failure.record_id}`
        : (failure.odoo_model || '—');

      const retryHistoryCount = (item.retry_history || []).length;

      return `
        <div class="failure-card">
          <div class="failure-meta">
            <div>
              <div class="failure-title">Run #${item.id} (${item.status})</div>
              <div class="failure-subtitle">${recordLabel}</div>
            </div>
            <div class="badge badge-${failure.error_category || 'neutral'}">
              ${failure.error_category || 'unknown'}
            </div>
          </div>
          <div class="failure-message">${this.escapeHtml(failure.error_message || 'Unknown error')}</div>
          <div class="failure-details">
            <span>Error Code: ${failure.error_code || '—'}</span>
            <span>Retries: ${failure.retry_count || 0} (history: ${retryHistoryCount})</span>
          </div>
          <div class="failure-action">
            Suggested action: ${this.escapeHtml(failure.suggested_action || '—')}
          </div>
          <div class="failure-controls">
            <input type="text" placeholder="Describe your fix" data-correction="${item.id}">
            <button class="btn btn-small btn-primary retry-sync" data-run-id="${item.id}">Retry</button>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="failure-list">${rows}</div>`;
  }

  attachHandlers(onRefresh) {
    document.querySelectorAll('.retry-sync').forEach(button => {
      button.addEventListener('click', async () => {
        const runId = Number(button.dataset.runId);
        const correctionInput = document.querySelector(`[data-correction="${runId}"]`);
        const userCorrection = correctionInput?.value?.trim() || null;
        try {
          await apiClient.retrySync({ sync_run_id: runId, user_correction: userCorrection });
          if (onRefresh) {
            await onRefresh();
          }
        } catch (error) {
          console.error('Retry failed:', error);
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

export default ErrorDisplay;
