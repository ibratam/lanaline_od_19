/**
 * Sync Results Component
 * Displays summary after sync execution.
 */
export class SyncResults {
  render(summary) {
    const container = document.getElementById('sync-results');
    if (!container) return;

    if (!summary) {
      container.innerHTML = '<p class="text-muted">No results yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="results-card">
        <h3>Sync Results</h3>
        <div class="results-grid">
          <div>
            <div class="stat-number">${summary.total_records_created ?? 0}</div>
            <div class="stat-label">Created</div>
          </div>
          <div>
            <div class="stat-number">${summary.total_records_updated ?? 0}</div>
            <div class="stat-label">Updated</div>
          </div>
          <div>
            <div class="stat-number">${summary.total_records_deleted ?? 0}</div>
            <div class="stat-label">Deleted</div>
          </div>
          <div>
            <div class="stat-number">${summary.duration_ms ?? 0} ms</div>
            <div class="stat-label">Duration</div>
          </div>
        </div>
      </div>
    `;
  }
}

export default SyncResults;
