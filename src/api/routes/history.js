import express from 'express';
import {
  ValidationError,
  NotFoundError,
  asyncHandler
} from '../middleware/errorHandler.js';
import SyncRun from '../../models/SyncRun.js';
import SyncConflict from '../../models/SyncConflict.js';
import SyncError from '../../models/SyncError.js';
import SyncOperation from '../../models/SyncOperation.js';

const CSV_HEADERS = [
  'id',
  'source_db_id',
  'target_db_id',
  'status',
  'triggered_by',
  'triggered_by_user',
  'triggered_by_schedule_id',
  'started_at',
  'completed_at',
  'duration_ms',
  'total_records_created',
  'total_records_updated',
  'total_records_deleted',
  'error_count',
  'error_message',
  'preview_only',
  'model_filter',
  'rollback_completed_at',
  'created_at'
];

function parseIntParam(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRun(run) {
  if (!run) return run;
  return {
    ...run,
    model_filter: run.model_filter ? JSON.parse(run.model_filter) : null
  };
}

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function buildCsv(rows) {
  const lines = [
    CSV_HEADERS.join(',')
  ];

  rows.forEach(row => {
    const values = CSV_HEADERS.map(key => toCsvValue(row[key]));
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

export function createHistoryRouter(db) {
  const router = express.Router();
  const syncRunModel = new SyncRun(db.getDB());
  const syncConflictModel = new SyncConflict(db.getDB());
  const syncErrorModel = new SyncError(db.getDB());
  const syncOperationModel = new SyncOperation(db.getDB());

  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(parseIntParam(req.query.limit, 25), 200);
    const offset = parseIntParam(req.query.offset, 0);
    const status = req.query.status || undefined;
    const triggered_by = req.query.triggered_by || undefined;

    const items = syncRunModel.getAll({
      status,
      triggered_by,
      limit,
      offset
    }).map(normalizeRun);

    const total = syncRunModel.getCount({
      status,
      triggered_by
    });

    res.json({
      items,
      total,
      limit,
      offset
    });
  }));

  router.get('/export', asyncHandler(async (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();
    const status = req.query.status || undefined;
    const triggered_by = req.query.triggered_by || undefined;

    if (!['csv', 'json'].includes(format)) {
      throw new ValidationError('format must be csv or json');
    }

    const runs = syncRunModel.getAll({
      status,
      triggered_by
    }).map(normalizeRun);

    if (format === 'csv') {
      const csv = buildCsv(runs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sync-history.csv"');
      res.send(csv);
      return;
    }

    const detailed = runs.map(run => ({
      ...run,
      conflicts: syncConflictModel.getBySyncRunId(run.id),
      errors: syncErrorModel.getBySyncRunId(run.id),
      operations: syncOperationModel.getBySyncRunId(run.id)
    }));

    res.json(detailed);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid history id');
    }

    const run = syncRunModel.getById(id);
    if (!run) {
      throw new NotFoundError(`Sync run ${id} not found`);
    }

    res.json({
      ...normalizeRun(run),
      conflicts: syncConflictModel.getBySyncRunId(id),
      errors: syncErrorModel.getBySyncRunId(id),
      operations: syncOperationModel.getBySyncRunId(id)
    });
  }));

  return router;
}

export default createHistoryRouter;
