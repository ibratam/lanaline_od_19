/**
 * ConsistencyReport Component
 * Displays data consistency verification report
 * Shows: inconsistency breakdown by type, affected record count, detailed list, repair options
 */

export class ConsistencyReport {
  constructor(containerId = 'consistency-report') {
    this.container = document.getElementById(containerId);
    this.reportData = null;
  }

  /**
   * Render consistency report
   * @param {Object} report - Report data from API
   */
  render(report) {
    this.reportData = report;

    if (!this.container) {
      console.error('ConsistencyReport container not found');
      return;
    }

    const { summary, samples, total_records } = report;
    const isConsistent = report.status === 'consistent';

    let html = `
      <div class="consistency-report">
        <div class="report-header">
          <h3>Data Consistency Report</h3>
          <div class="report-status ${isConsistent ? 'consistent' : 'inconsistent'}">
            <span class="status-badge">${isConsistent ? '✓ Consistent' : '⚠ Inconsistencies Found'}</span>
            <span class="timestamp">${new Date(report.timestamp).toLocaleString()}</span>
          </div>
        </div>

        <div class="report-summary">
          <div class="summary-item">
            <div class="summary-label">Total Records Checked</div>
            <div class="summary-value">${total_records}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Data Mismatches</div>
            <div class="summary-value error">${summary.data_mismatch.pending || 0}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Missing Records</div>
            <div class="summary-value warning">${summary.missing_record.pending || 0}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Extra Records</div>
            <div class="summary-value warning">${summary.extra_record.pending || 0}</div>
          </div>
        </div>
    `;

    if (summary.total_pending > 0) {
      html += this._renderInconsistencySamples(samples, summary);
      html += this._renderRepairOptions();
    } else {
      html += '<div class="no-inconsistencies">✓ No inconsistencies detected. Data is consistent.</div>';
    }

    html += '</div>';
    this.container.innerHTML = html;
  }

  /**
   * Render samples of inconsistencies found
   * @param {Object} samples - Sample inconsistencies by type
   * @param {Object} summary - Summary counts
   * @returns {string} HTML for inconsistency samples
   */
  _renderInconsistencySamples(samples, summary) {
    let html = '<div class="inconsistency-details"><h4>Sample Inconsistencies</h4>';

    // Data Mismatches
    if (samples.data_mismatch.length > 0) {
      html += `
        <div class="inconsistency-type">
          <h5 class="type-header">Data Mismatches (${summary.data_mismatch.pending})</h5>
          <div class="inconsistency-list">
      `;
      samples.data_mismatch.forEach(inc => {
        html += `
          <div class="inconsistency-item mismatch">
            <div class="item-header">
              <span class="record-id">Record ID: ${inc.record_id}</span>
              <span class="field-name">${inc.field_name}</span>
            </div>
            <div class="item-values">
              <div class="value local">
                <span class="label">Local:</span>
                <span class="value-content">${this._truncate(inc.local_value, 50)}</span>
              </div>
              <div class="value odoo">
                <span class="label">Odoo:</span>
                <span class="value-content">${this._truncate(inc.odoo_value, 50)}</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    // Missing Records
    if (samples.missing_record.length > 0) {
      html += `
        <div class="inconsistency-type">
          <h5 class="type-header">Missing Records (${summary.missing_record.pending})</h5>
          <div class="inconsistency-list">
      `;
      samples.missing_record.forEach(inc => {
        html += `
          <div class="inconsistency-item missing">
            <div class="item-header">
              <span class="record-id">Record ID: ${inc.record_id}</span>
              <span class="status">Missing in Odoo</span>
            </div>
            <div class="item-note">Exists locally but not found in Odoo</div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    // Extra Records
    if (samples.extra_record.length > 0) {
      html += `
        <div class="inconsistency-type">
          <h5 class="type-header">Extra Records (${summary.extra_record.pending})</h5>
          <div class="inconsistency-list">
      `;
      samples.extra_record.forEach(inc => {
        html += `
          <div class="inconsistency-item extra">
            <div class="item-header">
              <span class="status">Extra in Odoo</span>
            </div>
            <div class="item-note">Exists in Odoo but not found locally</div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Render repair options
   * @returns {string} HTML for repair options
   */
  _renderRepairOptions() {
    return `
      <div class="repair-options">
        <h4>Repair Options</h4>
        <div class="option-group">
          <label>
            <input type="radio" name="repair-action" value="keep_local">
            <span class="option-label">Keep Local</span>
            <span class="option-description">Update Odoo with local data</span>
          </label>
          <label>
            <input type="radio" name="repair-action" value="keep_odoo">
            <span class="option-label">Keep Odoo</span>
            <span class="option-description">Update local database with Odoo data</span>
          </label>
          <label>
            <input type="radio" name="repair-action" value="manual_review">
            <span class="option-label">Manual Review</span>
            <span class="option-description">Flag for manual review</span>
          </label>
        </div>
        <button id="repair-btn" class="btn btn-primary" onclick="window.consistencyReport?.applyRepair()">
          Apply Repair
        </button>
      </div>
    `;
  }

  /**
   * Apply selected repair action
   */
  async applyRepair() {
    const selectedAction = document.querySelector('input[name="repair-action"]:checked');
    if (!selectedAction) {
      alert('Please select a repair action');
      return;
    }

    const repairAction = selectedAction.value;

    try {
      const response = await fetch('/api/consistency/repair-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inconsistency_ids: this._getInconsistencyIds(),
          repair_action: repairAction
        })
      });

      if (!response.ok) {
        throw new Error(`Repair failed: ${response.statusText}`);
      }

      const result = await response.json();
      alert(`Repair applied: ${result.data.succeeded} fixed, ${result.data.failed} failed`);

      // Refresh report
      window.consistencyReport?.refreshReport();
    } catch (error) {
      console.error('Repair error:', error);
      alert(`Error applying repair: ${error.message}`);
    }
  }

  /**
   * Get inconsistency IDs from current report
   * @returns {Array} Array of inconsistency IDs
   */
  _getInconsistencyIds() {
    // Extract from the report data or DOM
    // This would need to be enhanced based on actual data structure
    return [];
  }

  /**
   * Refresh the report by fetching latest data
   */
  async refreshReport() {
    try {
      const response = await fetch('/api/consistency/check');
      if (!response.ok) {
        throw new Error(`Check failed: ${response.statusText}`);
      }

      const result = await response.json();
      this.render(result.data);
    } catch (error) {
      console.error('Refresh error:', error);
      this.container.innerHTML = `<div class="error">Error refreshing report: ${error.message}</div>`;
    }
  }

  /**
   * Truncate string to specified length
   * @param {string} str - String to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated string
   */
  _truncate(str, length) {
    if (!str) return '(empty)';
    if (str.length > length) {
      return str.substring(0, length) + '...';
    }
    return str;
  }
}

export default ConsistencyReport;
