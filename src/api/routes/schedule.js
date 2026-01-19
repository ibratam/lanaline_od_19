import express from 'express';
import {
  ValidationError,
  NotFoundError,
  asyncHandler
} from '../middleware/errorHandler.js';
import SyncSchedule from '../../models/SyncSchedule.js';
import ScheduleManager from '../../services/ScheduleManager.js';

function ensureTimezone(timezone) {
  if (!timezone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function createScheduleRouter(db, services) {
  const router = express.Router();
  const scheduleModel = new SyncSchedule(db.getDB());
  const scheduleManager = services.scheduleManager;

  const includePreview = (schedule) => {
    const nextRuns = ScheduleManager.getNextRuns(
      schedule.cron_expression,
      schedule.timezone || 'UTC',
      5
    );

    return {
      ...schedule,
      next_runs: nextRuns
    };
  };

  router.get('/', asyncHandler(async (req, res) => {
    const schedules = scheduleModel.getAll();
    res.json(schedules.map(includePreview));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const {
      source_db_id,
      target_db_id,
      name,
      description = null,
      cron_expression,
      timezone = 'UTC',
      notification_email = null,
      notify_on_error = 1,
      notify_on_success = 0,
      model_filter = null
    } = req.body;

    if (!source_db_id || !target_db_id || !name || !cron_expression) {
      throw new ValidationError('source_db_id, target_db_id, name, cron_expression are required');
    }

    if (!ScheduleManager.validateCronExpression(cron_expression)) {
      throw new ValidationError('cron_expression must be a valid 5-part cron string');
    }

    if (!ensureTimezone(timezone)) {
      throw new ValidationError('timezone is invalid');
    }

    const sourceConnection = await services.configManager.getConnection(source_db_id);
    const targetConnection = await services.configManager.getConnection(target_db_id);
    if (!sourceConnection || !targetConnection) {
      throw new NotFoundError('Source or target connection not found');
    }

    const schedule = scheduleModel.create({
      source_db_id,
      target_db_id,
      name,
      description,
      cron_expression,
      timezone,
      notification_email,
      notify_on_error,
      notify_on_success,
      model_filter
    });

    const preview = includePreview(schedule);
    scheduleModel.update(schedule.id, {
      next_execution_at: preview.next_runs[0] || null
    });

    scheduleManager.addSchedule(schedule);

    res.status(201).json(preview);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id);
    const schedule = scheduleModel.getById(scheduleId);

    if (!schedule) {
      throw new NotFoundError(`Schedule ${scheduleId} not found`);
    }

    const updates = { ...req.body };

    if (updates.cron_expression !== undefined) {
      if (!ScheduleManager.validateCronExpression(updates.cron_expression)) {
        throw new ValidationError('cron_expression must be a valid 5-part cron string');
      }
    }

    if (updates.timezone !== undefined && !ensureTimezone(updates.timezone)) {
      throw new ValidationError('timezone is invalid');
    }

    const updated = scheduleModel.update(scheduleId, updates);
    const preview = includePreview(updated);
    scheduleModel.update(scheduleId, { next_execution_at: preview.next_runs[0] || null });

    scheduleManager.reschedule(updated);

    res.json(preview);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id);
    const schedule = scheduleModel.getById(scheduleId);
    if (!schedule) {
      throw new NotFoundError(`Schedule ${scheduleId} not found`);
    }

    scheduleManager.removeSchedule(scheduleId);
    scheduleModel.delete(scheduleId);

    res.status(204).send();
  }));

  router.post('/:id/toggle', asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id);
    const schedule = scheduleModel.getById(scheduleId);
    if (!schedule) {
      throw new NotFoundError(`Schedule ${scheduleId} not found`);
    }

    const updated = scheduleModel.toggle(scheduleId);
    scheduleManager.reschedule(updated);

    res.json(includePreview(updated));
  }));

  return router;
}

export default createScheduleRouter;
