import express from 'express';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  asyncHandler
} from '../middleware/errorHandler.js';
import ConflictResolver from '../../services/ConflictResolver.js';
import RetryManager from '../../services/RetryManager.js';
import BulkResolutionEngine from '../../services/BulkResolutionEngine.js';
import ConflictFailureHandler from '../../services/ConflictFailureHandler.js';
import ConflictLock from '../../models/ConflictLock.js';
import ConflictResolution from '../../models/ConflictResolution.js';

const STATE_MAP = new Set([
  'detected',
  'resolved',
  'applied',
  'failed_resolution',
  'needs_manual_review'
]);

function parseIntParam(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConflict(conflict) {
  if (!conflict) return conflict;
  return {
    ...conflict,
    source_values: conflict.source_values ? JSON.parse(conflict.source_values) : null,
    target_values: conflict.target_values ? JSON.parse(conflict.target_values) : null
  };
}

export function createConflictsRouter(db, services = {}) {
  const router = express.Router();
  const database = db.getDB();
  const conflictResolver = new ConflictResolver(db, services);
  const retryManager = new RetryManager(conflictResolver);
  const failureHandler = new ConflictFailureHandler(db, services.notificationService);
  const bulkResolutionEngine = new BulkResolutionEngine(db, conflictResolver);
  const lockModel = new ConflictLock(database);
  const resolutionModel = new ConflictResolution(database);

  /**
   * GET /api/conflicts - List conflicts with cursor-based pagination for efficient large dataset queries
   * Query parameters:
   *   - limit: Number of results per page (default: 25, max: 200)
   *   - cursor: Cursor for pagination (base64 encoded JSON: {id, created_at})
   *   - state: Filter by state (detected|resolved|applied|failed_resolution|needs_manual_review)
   *   - model: Filter by model name
   */
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(parseIntParam(req.query.limit, 25), 200);
    const cursorParam = req.query.cursor || null;
    const state = req.query.state || null;
    const model = req.query.model || null;

    if (state && !STATE_MAP.has(state)) {
      throw new ValidationError('state must be detected, resolved, applied, failed_resolution, or needs_manual_review');
    }

    // Parse cursor if provided (format: base64 encoded {id, created_at})
    let cursorId = null;
    let cursorCreatedAt = null;
    if (cursorParam) {
      try {
        const decoded = Buffer.from(cursorParam, 'base64').toString('utf-8');
        const cursorObj = JSON.parse(decoded);
        cursorId = cursorObj.id;
        cursorCreatedAt = cursorObj.created_at;
      } catch (e) {
        throw new ValidationError('Invalid cursor format');
      }
    }

    const params = [];
    let sql = 'SELECT * FROM sync_conflicts WHERE 1=1';

    if (model) {
      sql += ' AND odoo_model = ?';
      params.push(model);
    }

    if (state) {
      sql += ' AND state = ?';
      params.push(state);
    }

    // Cursor-based pagination: fetch by created_at then id for stability with inserts
    if (cursorCreatedAt && cursorId) {
      sql += ' AND (created_at > ? OR (created_at = ? AND id > ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    } else if (cursorId) {
      sql += ' AND id > ?';
      params.push(cursorId);
    }

    sql += ' ORDER BY created_at ASC, id ASC LIMIT ?';
    params.push(limit + 1); // Fetch one extra to determine if there's a next page

    const rows = database.prepare(sql).all(...params);

    // Check if there's a next page
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit).map(normalizeConflict);

    // Generate next cursor if there are more results
    let nextCursor = null;
    if (hasNextPage && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorData = {
        id: lastItem.id,
        created_at: lastItem.created_at
      };
      nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    }

    res.json({
      items,
      next_cursor: nextCursor,
      limit,
      has_more: hasNextPage
    });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }

    const conflict = database.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(id);
    if (!conflict) {
      throw new NotFoundError(`Conflict ${id} not found`);
    }

    const resolution = resolutionModel.getByConflictId(id);
    const retryHistory = database.prepare(`
      SELECT * FROM retry_history
      WHERE conflict_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(id);

    res.json({
      ...normalizeConflict(conflict),
      resolution,
      retry_history: retryHistory,
      suggested_action: failureHandler.getSuggestedAction(resolution)
    });
  }));

  router.post('/:id/lock', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { session_id, user_id } = req.body;

    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }
    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    const existing = lockModel.getByConflictId(id);
    if (existing && !lockModel.isExpired(existing)) {
      throw new ConflictError('Conflict is locked');
    }
    if (existing && lockModel.isExpired(existing)) {
      lockModel.release(id);
    }

    const lock = lockModel.acquire(id, session_id, user_id);
    res.json(lock);
  }));

  router.delete('/:id/lock', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }
    lockModel.release(id);
    res.status(204).send();
  }));

  router.post('/:id/resolve', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { chosen_version, user_id } = req.body;

    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }
    if (!['local', 'odoo'].includes(chosen_version)) {
      throw new ValidationError('chosen_version must be local or odoo');
    }

    const conflict = conflictResolver.resolve(id, chosen_version, user_id);
    res.json(conflict);
  }));

  router.post('/:id/apply', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }

    const { simulate_error } = req.body || {};
    res.status(202).json({ status: 'applying' });

    setImmediate(async () => {
      try {
        if (process.env.NODE_ENV === 'test' && simulate_error) {
          throw new Error('Simulated conflict apply failure');
        }
        await conflictResolver.apply(id);
      } catch (error) {
        try {
          failureHandler.handleApplyFailure(id, error);
        } catch {
          // ignore update errors
        }
      }
    });
  }));

  router.post('/:id/retry', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid conflict id');
    }

    const { simulate_error } = req.body || {};
    res.status(202).json({ status: 'retrying' });

    setImmediate(async () => {
      try {
        conflictResolver.reopenForRetry(id);
        if (process.env.NODE_ENV === 'test' && simulate_error) {
          throw new Error('Simulated conflict retry failure');
        }
        await retryManager.applyWithRetry(id, 3);
      } catch (error) {
        try {
          failureHandler.handleApplyFailure(id, error);
        } catch {
          // ignore update errors
        }
      }
    });
  }));

  router.post('/bulk-resolve', asyncHandler(async (req, res) => {
    const { rule, dry_run } = req.body || {};

    if (!rule) {
      throw new ValidationError('rule is required');
    }

    try {
      if (dry_run) {
        const preview = bulkResolutionEngine.preview(rule);
        res.json({
          dry_run: true,
          rule,
          matching_conflicts: preview.matches,
          preview: preview.preview
        });
        return;
      }

      const result = await bulkResolutionEngine.apply(rule);
      res.json({
        dry_run: false,
        rule,
        resolved_count: result.resolved_count,
        already_resolved_count: result.already_resolved_count,
        failed_count: result.failed_count,
        details: result.details
      });
    } catch (error) {
      throw new ValidationError(error.message);
    }
  }));

  return router;
}

export default createConflictsRouter;
