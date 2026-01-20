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
  const database = db.getDB();
  const syncRunModel = new SyncRun(database);
  const syncConflictModel = new SyncConflict(database);
  const syncErrorModel = new SyncError(database);
  const syncOperationModel = new SyncOperation(database);

  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(parseIntParam(req.query.limit, 25), 200);
    const offset = parseIntParam(req.query.offset, 0);
    const status = req.query.status || undefined;
    const triggered_by = req.query.triggered_by || undefined;
    const filter = req.query.filter || undefined;
    const model = req.query.model || undefined;
    const start = req.query.start || undefined;
    const end = req.query.end || undefined;

    let runIds = null;
    if (model) {
      const rows = database.prepare(`
        SELECT DISTINCT sync_run_id
        FROM sync_operations
        WHERE odoo_model = ?
      `).all(model);
      runIds = rows.map(row => row.sync_run_id);
      if (runIds.length === 0) {
        res.json({ items: [], total: 0, limit, offset });
        return;
      }
    }

    const params = [];
    let sql = 'SELECT * FROM sync_runs WHERE 1=1';

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (triggered_by) {
      sql += ' AND triggered_by = ?';
      params.push(triggered_by);
    }
    if (start && end) {
      sql += ' AND started_at BETWEEN ? AND ?';
      params.push(start, end);
    }
    if (runIds) {
      const placeholders = runIds.map(() => '?').join(',');
      sql += ` AND id IN (${placeholders})`;
      params.push(...runIds);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = database.prepare(sql).all(...params).map(normalizeRun);

    let total = syncRunModel.getCount({
      status,
      triggered_by
    });

    if (filter === 'conflicts') {
      const conflicts = database.prepare(`
        SELECT sync_run_id, COUNT(*) AS count,
          SUM(CASE WHEN state = 'detected' THEN 1 ELSE 0 END) AS detected,
          SUM(CASE WHEN state = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN state = 'applied' THEN 1 ELSE 0 END) AS applied,
          SUM(CASE WHEN state = 'needs_manual_review' THEN 1 ELSE 0 END) AS needs_manual_review
        FROM sync_conflicts
        GROUP BY sync_run_id
      `).all();
      const map = new Map(conflicts.map(row => [row.sync_run_id, row]));
      const filtered = items.filter(run => map.has(run.id)).map(run => ({
        ...run,
        conflict_summary: map.get(run.id)
      }));
      res.json({
        items: filtered,
        total: filtered.length,
        limit,
        offset
      });
      return;
    }

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

  router.get('/:id/changes', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid history id');
    }

    const run = syncRunModel.getById(id);
    if (!run) {
      throw new NotFoundError(`Sync run ${id} not found`);
    }

    const operations = syncOperationModel.getBySyncRunId(id).map(operation => ({
      ...operation,
      records: [] // Record-level details not stored in current schema
    }));

    res.json({
      ...normalizeRun(run),
      changes: operations,
      conflicts: syncConflictModel.getBySyncRunId(id),
      errors: syncErrorModel.getBySyncRunId(id)
    });
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
