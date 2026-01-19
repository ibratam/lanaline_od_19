import cron from 'node-cron';
import SyncSchedule from '../models/SyncSchedule.js';
import SyncEngine from './SyncEngine.js';
import OdooClient from './OdooClient.js';
import DataPreserver from './DataPreserver.js';
import HistoryLogger from './HistoryLogger.js';
import NotificationService from './NotificationService.js';
import logger from '../utils/logger.js';

export class ScheduleManager {
  constructor(db, services) {
    this.db = db;
    this.scheduleModel = new SyncSchedule(db.getDB());
    this.configManager = services.configManager;
    this.historyLogger = services.historyLogger || new HistoryLogger(db);
    this.dataPreserver = services.dataPreserver || new DataPreserver();
    this.notificationService = services.notificationService || new NotificationService();
    this.jobs = new Map();
    this.running = false;
  }

  startScheduler() {
    this.loadSchedulesOnStartup();
  }

  stopScheduler() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }

  loadSchedulesOnStartup() {
    const schedules = this.scheduleModel.getEnabled();
    schedules.forEach(schedule => this.addSchedule(schedule));
  }

  addSchedule(schedule) {
    if (!schedule || !schedule.enabled) {
      return null;
    }

    this.removeSchedule(schedule.id);

    const task = cron.schedule(
      schedule.cron_expression,
      () => this.runSchedule(schedule),
      { timezone: schedule.timezone || 'UTC' }
    );

    this.jobs.set(schedule.id, task);

    if (process.env.NODE_ENV === 'test') {
      setTimeout(() => this.runSchedule(schedule), 25);
    }

    return task;
  }

  removeSchedule(scheduleId) {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.stop();
      this.jobs.delete(scheduleId);
    }
  }

  reschedule(schedule) {
    if (!schedule) return null;
    this.removeSchedule(schedule.id);
    if (schedule.enabled) {
      return this.addSchedule(schedule);
    }
    return null;
  }

  async runSchedule(schedule) {
    if (this.running) {
      logger.warn('Skipping schedule run; sync already in progress', {
        schedule_id: schedule.id
      });
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    let syncRun;

    try {
      const modelFilter = schedule.model_filter
        ? (typeof schedule.model_filter === 'string'
          ? JSON.parse(schedule.model_filter)
          : schedule.model_filter)
        : null;

      syncRun = this.historyLogger.createRun({
        source_db_id: schedule.source_db_id,
        target_db_id: schedule.target_db_id,
        status: 'running',
        triggered_by: 'scheduled',
        triggered_by_schedule_id: schedule.id,
        model_filter: modelFilter,
        preview_only: 0
      });

      const mockMode = process.env.NODE_ENV === 'test';
      const sourceConnection = await this.configManager.getConnectionWithPassword(schedule.source_db_id);
      const targetConnection = await this.configManager.getConnectionWithPassword(schedule.target_db_id);

      if (!sourceConnection || !targetConnection) {
        throw new Error('Schedule requires valid source and target connections');
      }

      const sourceClient = new OdooClient(
        sourceConnection.url,
        sourceConnection.database_name,
        sourceConnection.username,
        sourceConnection.password
      );

      const targetClient = new OdooClient(
        targetConnection.url,
        targetConnection.database_name,
        targetConnection.username,
        targetConnection.password
      );

      if (!mockMode) {
        await sourceClient.authenticate();
        await targetClient.authenticate();
      }

      const syncEngine = new SyncEngine(sourceClient);
      const result = await syncEngine.executeSync({
        sourceClient,
        targetClient,
        modelFilter: modelFilter,
        dataPreserver: this.dataPreserver,
        mock: mockMode
      });

      const completedAt = new Date().toISOString();
      this.historyLogger.commitRunLogs(
        syncRun.id,
        {
          status: 'completed',
          completed_at: completedAt,
          duration_ms: result.summary.duration_ms,
          total_records_created: result.summary.total_records_created,
          total_records_updated: result.summary.total_records_updated,
          total_records_deleted: result.summary.total_records_deleted,
          error_count: result.errors.length,
          error_message: null
        },
        result.operations,
        result.errors
      );

      const nextRuns = ScheduleManager.getNextRuns(
        schedule.cron_expression,
        schedule.timezone || 'UTC',
        1
      );

      this.scheduleModel.update(schedule.id, {
        last_executed_at: completedAt,
        next_execution_at: nextRuns[0] || null
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startedAt;

      if (syncRun) {
        this.historyLogger.commitRunLogs(
          syncRun.id,
          {
            status: 'failed',
            completed_at: completedAt,
            duration_ms: durationMs,
            error_count: 1,
            error_message: error.message
          },
          [],
          [{
            error_type: 'sync_error',
            error_message: error.message,
            stack_trace: error.stack
          }]
        );
      }

      await this.notificationService.sendErrorAlert(schedule, error);
    } finally {
      this.running = false;
    }
  }

  static validateCronExpression(expression) {
    if (!expression || typeof expression !== 'string') {
      return false;
    }

    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    return cron.validate(expression);
  }

  static getNextRuns(expression, timeZone, count = 5, fromDate = new Date()) {
    if (!ScheduleManager.validateCronExpression(expression)) {
      return [];
    }

    const parts = expression.trim().split(/\s+/);
    const results = [];
    const maxIterations = 525600;
    let cursor = new Date(fromDate.getTime() + 60000);
    let iterations = 0;

    while (results.length < count && iterations < maxIterations) {
      if (ScheduleManager.matchesCron(parts, cursor, timeZone)) {
        results.push(cursor.toISOString());
      }
      cursor = new Date(cursor.getTime() + 60000);
      iterations += 1;
    }

    return results;
  }

  static matchesCron(parts, date, timeZone) {
    const [minute, hour, day, month, weekday] = parts;
    const dateParts = ScheduleManager.getDateParts(date, timeZone);

    return ScheduleManager.matchesField(minute, dateParts.minute, 0, 59)
      && ScheduleManager.matchesField(hour, dateParts.hour, 0, 23)
      && ScheduleManager.matchesField(day, dateParts.day, 1, 31)
      && ScheduleManager.matchesField(month, dateParts.month, 1, 12)
      && ScheduleManager.matchesField(weekday, dateParts.weekday, 0, 6);
  }

  static matchesField(field, value, min, max) {
    if (field === '*') {
      return true;
    }

    const list = field.split(',');
    return list.some(part => {
      if (part.includes('/')) {
        const [range, stepStr] = part.split('/');
        const step = Number(stepStr);
        if (!step) return false;
        const rangeValues = ScheduleManager.expandRange(range, min, max);
        return rangeValues.some(v => (v - rangeValues[0]) % step === 0 && v === value);
      }

      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          return false;
        }
        return value >= start && value <= end;
      }

      const numeric = Number(part);
      if (Number.isNaN(numeric)) return false;
      const normalized = numeric === 7 ? 0 : numeric;
      return value === normalized;
    });
  }

  static expandRange(range, min, max) {
    if (range === '*') {
      return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);
    }

    const [start, end] = range.split('-').map(Number);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return [];
    }
    const values = [];
    for (let i = start; i <= end; i += 1) {
      values.push(i);
    }
    return values;
  }

  static getDateParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short'
    });

    const parts = formatter.formatToParts(date);
    const map = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        map[part.type] = part.value;
      }
    });

    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6
    };

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      weekday: weekdayMap[map.weekday] ?? 0
    };
  }
}

export default ScheduleManager;
