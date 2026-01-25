import apiClient from '../services/apiClient.js';

/**
 * Resolution Retry Panel
 * Shows failure reason, suggested actions, and retry controls.
 */
export class ResolutionRetryPanel {
  constructor() {
    this.conflict = null;
  }

  setConflict(conflict) {
    this.conflict = conflict;
  }

  render() {
    if (!this.conflict) {
      return '';
    }

    const resolution = this.conflict.resolution;
    const history = this.conflict.retry_history || [];

    if (!resolution || !['failed_resolution', 'needs_manual_review'].includes(this.conflict.state)) {
      return '';
    }

    const historyItems = history.length
      ? history.map(item => `
        <li>
          ${item.created_at ? new Date(item.created_at).toLocaleString() : '—'} -
          ${this.escapeHtml(item.error_category || 'unknown')}:
          ${this.escapeHtml(item.error_message || 'error')}
        </li>
      `).join('')
      : '<li>No retry history recorded.</li>';

    return `
      <div class="resolution-retry-panel">
        <h4>Resolution Retry</h4>
        <p><strong>Last error:</strong> ${this.escapeHtml(resolution.last_error || '—')}</p>
        <p><strong>Category:</strong> ${this.escapeHtml(resolution.last_error_category || '—')}</p>
        <p><strong>Suggested action:</strong> ${this.escapeHtml(this.conflict.suggested_action || '—')}</p>
        <div class="retry-controls">
          <button class="btn btn-small btn-primary conflict-retry">Retry Resolution</button>
        </div>
        <div class="retry-history">
          <h5>Retry History</h5>
          <ul>${historyItems}</ul>
        </div>
      </div>
    `;
  }

  attachHandlers(onRetry) {
    document.querySelector('.conflict-retry')?.addEventListener('click', async () => {
      if (!this.conflict) return;
      try {
        await apiClient.retryConflict(this.conflict.id);
        if (onRetry) {
          await onRetry(this.conflict.id);
        }
      } catch (error) {
        console.error('Conflict retry failed:', error);
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default ResolutionRetryPanel;
