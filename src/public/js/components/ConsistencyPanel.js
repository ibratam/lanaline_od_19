/**
 * ConsistencyPanel Component
 * Manages the overall consistency verification interface
 * Integrates ConsistencyReport and repair history display
 */

import apiClient from '../services/apiClient.js';
import { ConsistencyReport } from './ConsistencyReport.js';

export class ConsistencyPanel {
  constructor() {
    this.container = document.getElementById('consistency-report');
    this.controlsContainer = document.getElementById('consistency-controls');
    this.historyContainer = document.getElementById('consistency-history-container');
    this.statusIndicator = document.getElementById('consistency-status');
    this.checkBtn = document.getElementById('check-consistency-btn');
    this.consistencyReport = new ConsistencyReport('consistency-report');
    this.isRunning = false;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.checkBtn) {
      this.checkBtn.addEventListener('click', () => this.runConsistencyCheck());
    }
  }

  /**
   * Run consistency check
   */
  async runConsistencyCheck() {
    if (this.isRunning) {
      alert('Consistency check already running...');
      return;
    }

    this.isRunning = true;
    this.updateCheckButton('🔄 Running...', true);
    this.updateStatus('checking', 'Checking...');

    try {
      const response = await fetch('/api/consistency/check');

      if (!response.ok) {
        throw new Error(`Check failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Render the consistency report
      this.consistencyReport.render(result.data);

      // Update status
      const status = result.data.status === 'consistent' ? 'consistent' : 'inconsistent';
      this.updateStatus(status,
        status === 'consistent'
          ? '✓ Data is consistent'
          : `⚠ Found ${result.data.summary.total_inconsistencies} inconsistencies`
      );

      // Load repair history
      await this.loadRepairHistory();
    } catch (error) {
      console.error('Consistency check error:', error);
      this.updateStatus('error', `Error: ${error.message}`);
      this.container.innerHTML = `<div class="error-message">Error running consistency check: ${error.message}</div>`;
    } finally {
      this.isRunning = false;
      this.updateCheckButton('🔍 Run Consistency Check', false);
    }
  }

  /**
   * Load repair history
   */
  async loadRepairHistory() {
    try {
      const response = await fetch('/api/consistency/inconsistencies?limit=10');

      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }

      const result = await response.json();
      this.renderRepairHistory(result.data.inconsistencies);
    } catch (error) {
      console.error('Load history error:', error);
      this.historyContainer.innerHTML = `<div class="error-message">Error loading history: ${error.message}</div>`;
    }
  }

  /**
   * Render repair history
   */
  renderRepairHistory(inconsistencies) {
    if (!inconsistencies || inconsistencies.length === 0) {
      this.historyContainer.innerHTML = '<p class="text-muted">No repair history yet.</p>';
      return;
    }

    let html = '<table class="history-table"><thead><tr>';
    html += '<th>Type</th><th>Record ID</th><th>Model</th><th>Status</th><th>Action</th><th>Date</th>';
    html += '</tr></thead><tbody>';

    inconsistencies.forEach(inc => {
      const statusClass = inc.status === 'resolved' ? 'success' : inc.status === 'failed' ? 'error' : 'warning';
      const date = inc.resolved_at
        ? new Date(inc.resolved_at).toLocaleString()
        : new Date(inc.created_at).toLocaleString();

      html += `
        <tr>
          <td><span class="badge ${inc.inconsistency_type}">${inc.inconsistency_type}</span></td>
          <td>${inc.record_id || '—'}</td>
          <td>${inc.odoo_model}</td>
          <td><span class="status ${statusClass}">${inc.status}</span></td>
          <td>${inc.suggested_repair || '—'}</td>
          <td>${date}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    this.historyContainer.innerHTML = html;
  }

  /**
   * Update check button state
   */
  updateCheckButton(label, disabled) {
    if (this.checkBtn) {
      this.checkBtn.textContent = label;
      this.checkBtn.disabled = disabled;
    }
  }

  /**
   * Update status indicator
   */
  updateStatus(status, message) {
    if (this.statusIndicator) {
      this.statusIndicator.className = `status-indicator ${status}`;
      this.statusIndicator.textContent = message;
    }
  }

  /**
   * Initialize the panel
   */
  async init() {
    try {
      // Load initial status
      const response = await fetch('/api/consistency/status');
      if (response.ok) {
        const result = await response.json();
        const status = result.data.overall_status;
        this.updateStatus(status,
          status === 'consistent'
            ? `✓ Consistent (${result.data.pending_count} pending)`
            : `⚠ Inconsistent (${result.data.pending_count} pending)`
        );
      }
    } catch (error) {
      console.error('Init error:', error);
    }
  }
}

export default ConsistencyPanel;
