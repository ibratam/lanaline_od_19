/**
 * Notification Panel Component
 * Displays toast notifications for resolution workflow.
 */
export class NotificationPanel {
  constructor() {
    this.containerId = 'notification-panel';
  }

  render() {
    return `<div id="${this.containerId}" class="notification-panel"></div>`;
  }

  show({ type = 'info', message = 'Update', errorCode = null } = {}) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const item = document.createElement('div');
    item.className = `notification ${type}`;
    item.innerHTML = `
      <div class="notification-message">
        ${this.escapeHtml(message)}
        ${errorCode ? `<span class="notification-code">${this.escapeHtml(errorCode)}</span>` : ''}
      </div>
      <button class="notification-close">×</button>
    `;

    const closeButton = item.querySelector('.notification-close');
    closeButton?.addEventListener('click', () => {
      item.remove();
    });

    container.appendChild(item);
    setTimeout(() => item.remove(), 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }
}

export default NotificationPanel;
