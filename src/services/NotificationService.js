import logger from '../utils/logger.js';

/**
 * Notification Service
 * Placeholder for sending schedule error alerts.
 */
export class NotificationService {
  async sendErrorAlert(schedule, error) {
    if (!schedule?.notification_email || !schedule.notify_on_error) {
      return false;
    }

    logger.warn('Schedule error alert', {
      schedule_id: schedule.id,
      email: schedule.notification_email,
      message: error?.message || String(error)
    });

    return true;
  }
}

export default NotificationService;
