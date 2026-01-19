# Quickstart Guide: Conflict Resolution Feature

**Version**: 1.0
**Date**: 2026-01-19
**Audience**: Developers implementing this feature

---

## Overview

This guide walks you through implementing the conflict resolution feature in logical phases.

---

## Phase 1: Database Schema & Models

### Step 1.1: Create Database Migrations

1. **Extend sync_conflicts table** with state tracking:
   ```javascript
   // src/db/migrations/001_add_conflict_state.js
   import Database from 'better-sqlite3';

   export function migrate(db) {
     db.exec(`
       ALTER TABLE sync_conflicts
       ADD COLUMN state TEXT DEFAULT 'detected'
       CHECK (state IN ('detected', 'reviewing', 'resolved', 'applied', 'needs_manual_review'));

       ALTER TABLE sync_conflicts ADD COLUMN locked_by INTEGER;
       ALTER TABLE sync_conflicts ADD COLUMN locked_at DATETIME;

       CREATE INDEX idx_sync_conflicts_state ON sync_conflicts(state);
     `);
   }
   ```

2. **Create conflict_resolutions table**:
   ```javascript
   // src/db/migrations/002_create_conflict_resolutions.js
   export function migrate(db) {
     db.exec(`
       CREATE TABLE conflict_resolutions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         conflict_id INTEGER NOT NULL UNIQUE,
         user_id INTEGER,
         username TEXT,
         chosen_version TEXT NOT NULL CHECK (chosen_version IN ('local', 'odoo')),
         resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         applied_at DATETIME,
         retry_count INTEGER DEFAULT 0,
         last_error TEXT,
         last_error_category TEXT CHECK (last_error_category IN ('user_correctable', 'system', 'unrecoverable')),
         next_retry_at DATETIME,
         FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE
       );

       CREATE INDEX idx_conflict_resolutions_conflict ON conflict_resolutions(conflict_id);
       CREATE INDEX idx_conflict_resolutions_applied ON conflict_resolutions(applied_at);
     `);
   }
   ```

3. **Create conflict_locks table**:
   ```javascript
   // src/db/migrations/003_create_conflict_locks.js
   export function migrate(db) {
     db.exec(`
       CREATE TABLE conflict_locks (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         conflict_id INTEGER NOT NULL UNIQUE,
         session_id TEXT NOT NULL,
         user_id INTEGER,
         locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         expires_at DATETIME NOT NULL,
         FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE
       );

       CREATE INDEX idx_conflict_locks_expires ON conflict_locks(expires_at);
     `);
   }
   ```

### Step 1.2: Create Models

1. **Extend SyncConflict model** (src/models/SyncConflict.js):
   ```javascript
   export class SyncConflict {
     static getByState(db, state, limit = 50, offset = 0) {
       const stmt = db.prepare(`
         SELECT * FROM sync_conflicts
         WHERE state = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?
       `);
       return stmt.all(state, limit, offset);
     }

     static updateState(db, id, newState) {
       const stmt = db.prepare(`
         UPDATE sync_conflicts
         SET state = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
       `);
       return stmt.run(newState, id);
     }
   }
   ```

2. **Create ConflictResolution model** (src/models/ConflictResolution.js):
   ```javascript
   export class ConflictResolution {
     static create(db, conflictId, userId, chosenVersion) {
       const stmt = db.prepare(`
         INSERT INTO conflict_resolutions
         (conflict_id, user_id, chosen_version, resolved_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       `);
       return stmt.run(conflictId, userId, chosenVersion);
     }

     static getByConflictId(db, conflictId) {
       const stmt = db.prepare(`
         SELECT * FROM conflict_resolutions
         WHERE conflict_id = ?
       `);
       return stmt.get(conflictId);
     }

     static updateApplied(db, id, appliedAt) {
       const stmt = db.prepare(`
         UPDATE conflict_resolutions
         SET applied_at = ?
         WHERE id = ?
       `);
       return stmt.run(appliedAt, id);
     }
   }
   ```

3. **Create ConflictLock model** (src/models/ConflictLock.js):
   ```javascript
   export class ConflictLock {
     static acquire(db, conflictId, sessionId, userId) {
       const expiresAt = new Date(Date.now() + 5 * 60000); // 5 min
       const stmt = db.prepare(`
         INSERT INTO conflict_locks
         (conflict_id, session_id, user_id, locked_at, expires_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
       `);
       try {
         return stmt.run(conflictId, sessionId, userId, expiresAt.toISOString());
       } catch (e) {
         if (e.message.includes('UNIQUE')) {
           // Conflict already locked
           return null;
         }
         throw e;
       }
     }

     static release(db, conflictId) {
       const stmt = db.prepare(`
         DELETE FROM conflict_locks WHERE conflict_id = ?
       `);
       return stmt.run(conflictId);
     }
   }
   ```

---

## Phase 2: Backend Services

### Step 2.1: ConflictResolver Service

Create `src/services/ConflictResolver.js`:

```javascript
import { ConflictResolution, ConflictLock, SyncConflict } from '../models/index.js';

export class ConflictResolver {
  constructor(db, historyLogger) {
    this.db = db;
    this.historyLogger = historyLogger;
  }

  // User selects which version to keep
  resolve(conflictId, chosenVersion, userId, sessionId) {
    const conflict = SyncConflict.getById(this.db, conflictId);
    if (!conflict) throw new Error('Conflict not found');

    if (conflict.state !== 'resolved' && conflict.state !== 'detected') {
      throw new Error('Conflict already resolved or applied');
    }

    // Create resolution record
    ConflictResolution.create(
      this.db, conflictId, userId, chosenVersion
    );

    // Update conflict state
    SyncConflict.updateState(this.db, conflictId, 'resolved');

    // Log for audit
    this.historyLogger.log(
      'conflict_resolved',
      { conflictId, userId, chosenVersion }
    );

    return { state: 'resolved', resolution: { chosenVersion } };
  }

  // Apply resolution by syncing to Odoo
  async apply(conflictId, sessionId) {
    const conflict = SyncConflict.getById(this.db, conflictId);
    const resolution = ConflictResolution.getByConflictId(this.db, conflictId);

    if (conflict.state !== 'resolved') {
      throw new Error('Conflict must be in resolved state to apply');
    }

    SyncConflict.updateState(this.db, conflictId, 'applying');

    try {
      // Execute sync operation
      const result = await this._performSync(conflict, resolution.chosen_version);

      // Mark as applied
      ConflictResolution.updateApplied(
        this.db,
        resolution.id,
        new Date().toISOString()
      );
      SyncConflict.updateState(this.db, conflictId, 'applied');

      // Clean up lock
      ConflictLock.release(this.db, conflictId);

      this.historyLogger.log('conflict_applied', { conflictId });
      return { state: 'applied' };
    } catch (error) {
      // Error handling delegated to RetryManager
      throw error;
    }
  }

  async _performSync(conflict, chosenVersion) {
    // Implementation: Update local or Odoo based on chosenVersion
    // This hooks into existing SyncEngine
    if (chosenVersion === 'local') {
      // Push local value to Odoo
      return await this._pushToOdoo(conflict);
    } else {
      // Pull from Odoo and update local
      return await this._pullFromOdoo(conflict);
    }
  }
}
```

### Step 2.2: RetryManager Service

Create `src/services/RetryManager.js`:

```javascript
import { ConflictResolution, SyncConflict } from '../models/index.js';

export class RetryManager {
  constructor(db, conflictResolver, historyLogger) {
    this.db = db;
    this.conflictResolver = conflictResolver;
    this.historyLogger = historyLogger;
  }

  async applyWithRetry(conflictId, sessionId, maxRetries = 3) {
    let retryCount = 0;
    const backoffMs = [5000, 10000, 20000]; // 5s, 10s, 20s

    while (retryCount < maxRetries) {
      try {
        const result = await this.conflictResolver.apply(conflictId, sessionId);
        return result; // Success
      } catch (error) {
        const errorCategory = this._categorizeError(error);
        const resolution = ConflictResolution.getByConflictId(this.db, conflictId);

        retryCount++;

        // Update resolution with error info
        const stmt = this.db.prepare(`
          UPDATE conflict_resolutions
          SET retry_count = ?, last_error = ?, last_error_category = ?,
              last_retry_at = CURRENT_TIMESTAMP, next_retry_at = ?
          WHERE id = ?
        `);

        const nextRetryAt = retryCount < maxRetries
          ? new Date(Date.now() + backoffMs[retryCount - 1])
          : null;

        stmt.run(
          retryCount,
          error.message,
          errorCategory,
          nextRetryAt?.toISOString() || null,
          resolution.id
        );

        if (retryCount === maxRetries) {
          // Escalate to manual review
          SyncConflict.updateState(this.db, conflictId, 'needs_manual_review');
          this.historyLogger.log('conflict_escalated_to_manual_review', {
            conflictId,
            lastError: error.message
          });

          throw new Error(`Failed after ${maxRetries} retries`);
        }

        // Wait before next retry
        await this._delay(backoffMs[retryCount - 1]);
      }
    }
  }

  _categorizeError(error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('network') || msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
      return 'system';
    }

    if (msg.includes('validation') || msg.includes('constraint') || msg.includes('required')) {
      return 'user_correctable';
    }

    if (msg.includes('deleted') || msg.includes('permission') || msg.includes('corrupted')) {
      return 'unrecoverable';
    }

    return 'system'; // Default to system (safer for auto-retry)
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Phase 3: API Routes

### Step 3.1: Create Conflicts Router

Create `src/api/routes/conflicts.js`:

```javascript
import express from 'express';
import { ConflictResolver, RetryManager } from '../../services/index.js';
import { SyncConflict, ConflictLock } from '../../models/index.js';

export function createConflictsRouter(db, historyLogger) {
  const router = express.Router();
  const conflictResolver = new ConflictResolver(db, historyLogger);
  const retryManager = new RetryManager(db, conflictResolver, historyLogger);

  // GET / - List conflicts
  router.get('/', (req, res) => {
    const { state, model, page = 1, limit = 50 } = req.query;

    let query = 'SELECT * FROM sync_conflicts WHERE 1=1';
    const params = [];

    if (state) {
      query += ' AND state = ?';
      params.push(state);
    }
    if (model) {
      query += ' AND model_name = ?';
      params.push(model);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);

    const stmt = db.prepare(query);
    const data = stmt.all(...params);

    res.json({ data, pagination: { page, limit, total: data.length } });
  });

  // GET /:id - Get single conflict
  router.get('/:id', (req, res) => {
    const conflict = SyncConflict.getById(db, req.params.id);
    if (!conflict) return res.status(404).json({ error: 'Not found' });
    res.json({ data: conflict });
  });

  // POST /:id/lock - Acquire lock
  router.post('/:id/lock', (req, res) => {
    const { session_id } = req.body;
    const lock = ConflictLock.acquire(db, req.params.id, session_id, req.user?.id);

    if (!lock) {
      return res.status(409).json({
        error: 'Conflict is being resolved',
        code: 'CONFLICT_LOCKED'
      });
    }

    res.json({ data: { conflict_id: req.params.id, locked_at: new Date() } });
  });

  // POST /:id/resolve - User selects version
  router.post('/:id/resolve', (req, res) => {
    const { chosen_version, session_id } = req.body;

    try {
      const result = conflictResolver.resolve(
        req.params.id,
        chosen_version,
        req.user?.id,
        session_id
      );
      res.json({ data: result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /:id/apply - Apply resolution
  router.post('/:id/apply', async (req, res) => {
    const { session_id } = req.body;

    try {
      // Start async retry process
      retryManager.applyWithRetry(req.params.id, session_id)
        .then(() => {
          // Success - client will poll for updated state
        })
        .catch(error => {
          // Already escalated to needs_manual_review in RetryManager
        });

      // Return 202 Accepted (processing)
      res.status(202).json({
        data: {
          id: req.params.id,
          state: 'applying',
          status: 'Processing...'
        }
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /:id/lock - Release lock
  router.delete('/:id/lock', (req, res) => {
    ConflictLock.release(db, req.params.id);
    res.status(204).send();
  });

  return router;
}
```

### Step 3.2: Register Router in App

In `src/app.js`:

```javascript
import { createConflictsRouter } from './api/routes/conflicts.js';

// ... existing code ...

app.use('/api/conflicts', createConflictsRouter(db, historyLogger));
```

---

## Phase 4: Frontend Components

### Step 4.1: ConflictsList Component

Create `public/js/components/ConflictsList.js`:

```javascript
export class ConflictsList {
  constructor(container, apiClient) {
    this.container = container;
    this.apiClient = apiClient;
    this.conflicts = [];
  }

  async load() {
    try {
      const response = await this.apiClient.get('/api/conflicts?state=detected');
      this.conflicts = response.data;
      this.render();
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    }
  }

  render() {
    const html = `
      <div class="conflicts-list">
        <h2>Conflicts (${this.conflicts.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Field</th>
              <th>State</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.conflicts.map(c => `
              <tr>
                <td>${c.model_name}</td>
                <td>${c.field_name || '-'}</td>
                <td><span class="badge badge-${c.state}">${c.state}</span></td>
                <td>${new Date(c.created_at).toLocaleString()}</td>
                <td>
                  <button onclick="window.onViewConflict(${c.id})">View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    this.container.innerHTML = html;
  }
}
```

### Step 4.2: ResolutionForm Component

Create `public/js/components/ResolutionForm.js`:

```javascript
export class ResolutionForm {
  constructor(container, conflictId, apiClient) {
    this.container = container;
    this.conflictId = conflictId;
    this.apiClient = apiClient;
    this.sessionId = this._getSessionId();
  }

  async load(conflict) {
    this.conflict = conflict;
    this.render();
  }

  render() {
    const html = `
      <div class="resolution-form">
        <h3>Resolve Conflict</h3>
        <div class="comparison">
          <div class="side">
            <h4>Local</h4>
            <pre>${JSON.stringify(this.conflict.source_value, null, 2)}</pre>
          </div>
          <div class="side">
            <h4>Odoo</h4>
            <pre>${JSON.stringify(this.conflict.target_value, null, 2)}</pre>
          </div>
        </div>
        <div class="form-group">
          <label>
            <input type="radio" name="version" value="local" checked> Keep Local
          </label>
          <label>
            <input type="radio" name="version" value="odoo"> Keep Odoo
          </label>
        </div>
        <button onclick="window.onApplyResolution(${this.conflictId})">Apply</button>
      </div>
    `;
    this.container.innerHTML = html;
  }

  async apply() {
    const version = document.querySelector('input[name="version"]:checked').value;

    try {
      // Lock conflict
      await this.apiClient.post(`/api/conflicts/${this.conflictId}/lock`, {
        session_id: this.sessionId
      });

      // Resolve
      await this.apiClient.post(`/api/conflicts/${this.conflictId}/resolve`, {
        chosen_version: version,
        session_id: this.sessionId
      });

      // Apply
      await this.apiClient.post(`/api/conflicts/${this.conflictId}/apply`, {
        session_id: this.sessionId
      });

      alert('Resolution applied!');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  _getSessionId() {
    return sessionStorage.getItem('sessionId') ||
      (sessionStorage.setItem('sessionId', this._uuid()),
       sessionStorage.getItem('sessionId'));
  }

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
```

---

## Phase 5: Testing

### Step 5.1: Unit Test Template

Create `tests/unit/ConflictResolver.test.js`:

```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { ConflictResolver } from '../../src/services/ConflictResolver.js';

describe('ConflictResolver', () => {
  let db, resolver;

  beforeEach(() => {
    db = new Database(':memory:');
    // ... initialize schema ...
    resolver = new ConflictResolver(db, { log: jest.fn() });
  });

  it('should resolve a detected conflict', () => {
    // ... test conflict resolution ...
  });

  it('should prevent double resolution', () => {
    // ... test state machine ...
  });

  it('should categorize errors correctly', () => {
    // ... test error categorization ...
  });
});
```

---

## Implementation Checklist

- [ ] Phase 1: Database migrations and models
- [ ] Phase 2: ConflictResolver and RetryManager services
- [ ] Phase 3: API routes registered
- [ ] Phase 4: Frontend components integrated
- [ ] Phase 5: Unit tests passing (≥80% coverage)
- [ ] Integration tests for full workflow
- [ ] Contract tests for API responses
- [ ] Manual testing via browser UI
- [ ] Code review & approval
- [ ] Deployment

---

## Next Steps

After completing these phases:
1. Run `/speckit.tasks` to generate detailed implementation tasks
2. Follow task breakdown for systematic development
3. Maintain ≥80% test coverage throughout
4. Regular commits after each phase completion
