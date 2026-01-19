import apiClient from '../services/apiClient.js';

/**
 * Schedule Editor Component
 * Create, edit, and toggle scheduled synchronizations.
 */
export class ScheduleEditor {
  constructor() {
    this.schedules = [];
    this.connections = [];
    this.editingId = null;
  }

  async load() {
    this.schedules = await apiClient.getSchedules();
    this.connections = await apiClient.getConfigs();
    return this.render();
  }

  render() {
    const connectionOptions = this.connections
      .map(conn => `<option value="${conn.id}">${conn.name}</option>`)
      .join('');

    const timezones = this.getTimezones();
    const timezoneOptions = timezones
      .map(tz => `<option value="${tz}">${tz}</option>`)
      .join('');

    const schedulesTable = this.schedules.length
      ? `
        <table class="schedule-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Cron</th>
              <th>Timezone</th>
              <th>Enabled</th>
              <th>Next Runs</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.schedules.map(schedule => `
              <tr>
                <td>${this.escapeHtml(schedule.name)}</td>
                <td><code>${this.escapeHtml(schedule.cron_expression)}</code></td>
                <td>${this.escapeHtml(schedule.timezone)}</td>
                <td>${schedule.enabled ? 'Yes' : 'No'}</td>
                <td>${(schedule.next_runs || []).slice(0, 2).map(run => new Date(run).toLocaleString()).join('<br>')}</td>
                <td>
                  <button class="btn btn-small btn-secondary schedule-edit" data-id="${schedule.id}">Edit</button>
                  <button class="btn btn-small btn-warning schedule-toggle" data-id="${schedule.id}">${schedule.enabled ? 'Disable' : 'Enable'}</button>
                  <button class="btn btn-small btn-danger schedule-delete" data-id="${schedule.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '<p class="text-muted">No schedules configured.</p>';

    return `
      <div class="card">
        <h3>Existing Schedules</h3>
        ${schedulesTable}
      </div>

      <div class="card">
        <h3>${this.editingId ? 'Edit Schedule' : 'Create Schedule'}</h3>
        <form id="schedule-form">
          <div class="form-row">
            <div class="form-group">
              <label for="schedule-name">Name</label>
              <input type="text" id="schedule-name" required>
            </div>
            <div class="form-group">
              <label for="schedule-source">Source</label>
              <select id="schedule-source" required>
                ${connectionOptions}
              </select>
            </div>
            <div class="form-group">
              <label for="schedule-target">Target</label>
              <select id="schedule-target" required>
                ${connectionOptions}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="schedule-frequency">Frequency</label>
              <select id="schedule-frequency">
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div class="form-group">
              <label for="schedule-time">Time</label>
              <input type="time" id="schedule-time" value="00:00">
            </div>
            <div class="form-group">
              <label for="schedule-weekday">Weekday</label>
              <select id="schedule-weekday">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>
            <div class="form-group">
              <label for="schedule-monthday">Day of Month</label>
              <input type="number" id="schedule-monthday" min="1" max="31" value="1">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="schedule-timezone">Timezone</label>
              <select id="schedule-timezone">${timezoneOptions}</select>
            </div>
            <div class="form-group">
              <label for="schedule-cron">Cron Expression</label>
              <input type="text" id="schedule-cron" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="schedule-email">Notification Email</label>
              <input type="email" id="schedule-email" placeholder="alerts@example.com">
            </div>
            <div class="form-group">
              <label for="schedule-notify-error">Notify on Error</label>
              <select id="schedule-notify-error">
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div class="form-group">
              <label for="schedule-notify-success">Notify on Success</label>
              <select id="schedule-notify-success">
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
          </div>

          <div class="btn-group">
            <button class="btn btn-primary" type="submit">${this.editingId ? 'Update Schedule' : 'Create Schedule'}</button>
            <button class="btn btn-secondary" type="button" id="schedule-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  attachHandlers(onRefresh) {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    container.addEventListener('click', async (event) => {
      const editBtn = event.target.closest('.schedule-edit');
      const toggleBtn = event.target.closest('.schedule-toggle');
      const deleteBtn = event.target.closest('.schedule-delete');

      if (editBtn) {
        const id = Number(editBtn.dataset.id);
        this.populateForm(id);
      }

      if (toggleBtn) {
        const id = Number(toggleBtn.dataset.id);
        await apiClient.toggleSchedule(id);
        if (onRefresh) onRefresh();
      }

      if (deleteBtn) {
        const id = Number(deleteBtn.dataset.id);
        await apiClient.deleteSchedule(id);
        if (onRefresh) onRefresh();
      }
    });

    const form = document.getElementById('schedule-form');
    const frequencySelect = document.getElementById('schedule-frequency');
    const cronInput = document.getElementById('schedule-cron');

    const updateCron = () => {
      const frequency = frequencySelect.value;
      const cron = this.buildCronExpression(frequency);
      cronInput.value = cron;
      cronInput.disabled = frequency !== 'custom';
    };

    updateCron();
    frequencySelect?.addEventListener('change', updateCron);
    document.getElementById('schedule-time')?.addEventListener('change', updateCron);
    document.getElementById('schedule-weekday')?.addEventListener('change', updateCron);
    document.getElementById('schedule-monthday')?.addEventListener('change', updateCron);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = this.collectFormValues();

      if (this.editingId) {
        await apiClient.updateSchedule(this.editingId, payload);
      } else {
        await apiClient.createSchedule(payload);
      }

      this.editingId = null;
      if (onRefresh) onRefresh();
    });

    document.getElementById('schedule-cancel')?.addEventListener('click', () => {
      this.editingId = null;
      if (onRefresh) onRefresh();
    });
  }

  populateForm(id) {
    const schedule = this.schedules.find(item => item.id === id);
    if (!schedule) return;

    this.editingId = id;
    document.getElementById('schedule-name').value = schedule.name || '';
    document.getElementById('schedule-source').value = schedule.source_db_id;
    document.getElementById('schedule-target').value = schedule.target_db_id;
    document.getElementById('schedule-cron').value = schedule.cron_expression;
    document.getElementById('schedule-timezone').value = schedule.timezone || 'UTC';
    document.getElementById('schedule-email').value = schedule.notification_email || '';
    document.getElementById('schedule-notify-error').value = schedule.notify_on_error ? '1' : '0';
    document.getElementById('schedule-notify-success').value = schedule.notify_on_success ? '1' : '0';
  }

  collectFormValues() {
    return {
      name: document.getElementById('schedule-name').value.trim(),
      source_db_id: Number(document.getElementById('schedule-source').value),
      target_db_id: Number(document.getElementById('schedule-target').value),
      cron_expression: document.getElementById('schedule-cron').value.trim(),
      timezone: document.getElementById('schedule-timezone').value,
      notification_email: document.getElementById('schedule-email').value.trim() || null,
      notify_on_error: Number(document.getElementById('schedule-notify-error').value),
      notify_on_success: Number(document.getElementById('schedule-notify-success').value)
    };
  }

  buildCronExpression(frequency) {
    const timeValue = document.getElementById('schedule-time')?.value || '00:00';
    const [hourStr, minuteStr] = timeValue.split(':');
    const minute = Number(minuteStr || 0);
    const hour = Number(hourStr || 0);
    const weekday = Number(document.getElementById('schedule-weekday')?.value || 0);
    const monthday = Number(document.getElementById('schedule-monthday')?.value || 1);

    switch (frequency) {
      case 'hourly':
        return `${minute} * * * *`;
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${weekday}`;
      case 'monthly':
        return `${minute} ${hour} ${monthday} * *`;
      case 'custom':
      default:
        return document.getElementById('schedule-cron')?.value || '0 0 * * *';
    }
  }

  getTimezones() {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
    return ['UTC'];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default ScheduleEditor;
