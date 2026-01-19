import apiClient from '../services/apiClient.js';

/**
 * Progress Monitor Component
 * Polls sync status and renders progress updates.
 */
export class ProgressMonitor {
  constructor() {
    this.intervalId = null;
    this.status = null;
  }

  start(onComplete) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      try {
        const status = await apiClient.getSyncStatus();
        this.status = status;
        this.render(status);

        if (['completed', 'failed', 'rolled_back', 'rollback_failed'].includes(status.status)) {
          this.stop();
          if (onComplete) {
            onComplete(status);
          }
        }
      } catch (error) {
        this.renderError(error.message);
      }
    }, 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  render(status) {
    const container = document.getElementById('progress-container');
    if (!container) return;

    if (!status || status.status === 'idle') {
      container.innerHTML = '<p class="text-muted">No synchronization running.</p>';
      return;
    }

    const percentage = status.percentage ?? 0;
    const currentModel = status.current_model || 'N/A';

    container.innerHTML = `
      <div class="progress-card">
        <div class="progress-header">
          <strong>Status:</strong> ${status.status}
        </div>
        <div class="progress-meta">
          <span><strong>Current model:</strong> ${currentModel}</span>
          <span><strong>Processed:</strong> ${status.records_processed || 0} / ${status.total_records || 0}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="progress-percent">${percentage}%</div>
      </div>
    `;
  }

  renderError(message) {
    const container = document.getElementById('progress-container');
    if (container) {
      container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
    }
  }
}

export default ProgressMonitor;
