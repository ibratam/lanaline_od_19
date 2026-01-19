import express from 'express';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  asyncHandler
} from '../middleware/errorHandler.js';
import ConflictResolver from '../../services/ConflictResolver.js';
import RetryManager from '../../services/RetryManager.js';
import ConflictLock from '../../models/ConflictLock.js';
import ConflictResolution from '../../models/ConflictResolution.js';

const STATE_MAP = new Set(['detected', 'resolved']);

function parseIntParam(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConflict(conflict) {
  if (!conflict) return conflict;
  return {
    ...conflict,
    source_values: conflict.source_values ? JSON.parse(conflict.source_values) : null,
    target_values: conflict.target_values ? JSON.parse(conflict.target_values) : null,
    state: conflict.resolution ? 'resolved' : 'detected'
  };
}

export function createConflictsRouter(db) {
  const router = express.Router();
  const database = db.getDB();
  const conflictResolver = new ConflictResolver(db);
  const retryManager = new RetryManager(conflictResolver);
  const lockModel = new ConflictLock(database);
  const resolutionModel = new ConflictResolution(database);

  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(parseIntParam(req.query.limit, 25), 200);
    const cursor = parseIntParam(req.query.cursor, null);
    const state = req.query.state || null;
    const model = req.query.model || null;

    if (state && !STATE_MAP.has(state)) {
      throw new ValidationError('state must be detected or resolved');
    }

    const params = [];
    let sql = 'SELECT * FROM sync_conflicts WHERE 1=1';

    if (model) {
      sql += ' AND odoo_model = ?';
      params.push(model);
    }

    if (state === 'detected') {
      sql += ' AND resolution IS NULL';
    } else if (state === 'resolved') {
      sql += ' AND resolution IS NOT NULL';
    }

    if (cursor) {
      sql += ' AND id > ?';
      params.push(cursor);
    }

    sql += ' ORDER BY id ASC LIMIT ?';
    params.push(limit);

    const rows = database.prepare(sql).all(...params);
    const items = rows.map(normalizeConflict);
    const nextCursor = items.length === limit ? items[items.length - 1].id : null;

    res.json({
      items,
      next_cursor: nextCursor,
      limit
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

    res.json(normalizeConflict(conflict));
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

    res.status(202).json({ status: 'applying' });

    setImmediate(() => {
      try {
        conflictResolver.apply(id);
      } catch (error) {
        // update resolution with last error category if available
        try {
          const category = conflictResolver._categorizeError(error);
          resolutionModel.updateError(id, error.message, category);
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

    res.status(202).json({ status: 'retrying' });

    setImmediate(async () => {
      try {
        await retryManager.applyWithRetry(id, 3);
      } catch (error) {
        try {
          const category = retryManager._categorizeError(error);
          resolutionModel.updateError(id, error.message, category);
        } catch {
          // ignore update errors
        }
      }
    });
  }));

  return router;
}

export default createConflictsRouter;
