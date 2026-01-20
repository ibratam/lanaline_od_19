# Data Model: Resolve Conflicts and Solve History

**Date**: 2026-01-19
**Version**: 1.0
**Status**: Approved

---

## Database Schema Changes

### 1. sync_conflicts (EXTENDED)

Extends existing table with conflict state tracking and concurrency control.

```sql
ALTER TABLE sync_conflicts ADD COLUMN state TEXT DEFAULT 'detected' CHECK (state IN ('detected', 'reviewing', 'resolved', 'applied', 'needs_manual_review'));
ALTER TABLE sync_conflicts ADD COLUMN locked_by INTEGER;
ALTER TABLE sync_conflicts ADD COLUMN locked_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_state ON sync_conflicts(state);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_model_state ON sync_conflicts(model_name, state);
```

**Purpose**: Track conflict lifecycle and prevent concurrent resolution attempts

**Columns**:
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | INTEGER | No | PK, auto-increment |
| source_db_id | INTEGER | No | FK to database_connections |
| target_db_id | INTEGER | No | FK to database_connections |
| model_name | TEXT | No | Odoo model (e.g., 'product.product') |
| record_id | INTEGER | No | ID of conflicting record |
| field_name | TEXT | Yes | Field with conflict (NULL if structural) |
| source_value | TEXT | Yes | Value from source (JSON serialized) |
| target_value | TEXT | Yes | Value from target (JSON serialized) |
| source_write_date | DATETIME | Yes | Write timestamp from source |
| target_write_date | DATETIME | Yes | Write timestamp from target |
| state | TEXT | No | 'detected', 'reviewing', 'resolved', 'applied', 'needs_manual_review' |
| locked_by | INTEGER | Yes | Session/user ID holding lock |
| locked_at | DATETIME | Yes | When lock was acquired |
| created_at | DATETIME | No | When conflict detected |
| updated_at | DATETIME | No | Last modification timestamp |

**State Transitions**:
```
detected (initial)
  ↓
reviewing (user viewing details - optional)
  ↓
resolved (user chose version - chosen_version saved)
  ↓
applied (user applied choice - sync executed)
  ↓
terminal (success)

OR

needs_manual_review (if 3 sync retries fail)
```

---

### 2. conflict_resolutions (NEW)

Audit trail of user resolution choices and application outcomes.

```sql
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
  last_error_category TEXT CHECK (last_error_category IS NULL OR last_error_category IN ('user_correctable', 'system', 'unrecoverable')),
  last_retry_at DATETIME,
  next_retry_at DATETIME,
  FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_conflict ON conflict_resolutions(conflict_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_user ON conflict_resolutions(user_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_status ON conflict_resolutions(applied_at, retry_count);
```

**Purpose**: Track who resolved what, when, and what went wrong during application

**Columns**:
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | INTEGER | No | PK |
| conflict_id | INTEGER | No | FK to sync_conflicts (UNIQUE - one resolution per conflict) |
| user_id | INTEGER | Yes | ID of user making resolution (for audit) |
| username | TEXT | Yes | Username snapshot (in case user deleted) |
| chosen_version | TEXT | No | 'local' or 'odoo' |
| resolved_at | DATETIME | No | When user made the choice |
| applied_at | DATETIME | Yes | When sync successfully applied choice |
| retry_count | INTEGER | No | Number of failed apply attempts |
| last_error | TEXT | Yes | Last error message (sanitized, no stack trace) |
| last_error_category | TEXT | Yes | 'user_correctable', 'system', or 'unrecoverable' |
| last_retry_at | DATETIME | Yes | When last retry was attempted |
| next_retry_at | DATETIME | Yes | When next auto-retry scheduled (if system error) |

**Key Relationships**:
- 1:1 with sync_conflicts (each conflict has max one resolution)
- Audit trail preserved even if conflict deleted

---

### 3. conflict_locks (NEW)

Session-based locking to prevent concurrent resolution attempts.

```sql
CREATE TABLE conflict_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  user_id INTEGER,
  locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY(conflict_id) REFERENCES sync_conflicts(id) ON DELETE CASCADE,
  UNIQUE(conflict_id)
);

CREATE INDEX IF NOT EXISTS idx_conflict_locks_session ON conflict_locks(session_id);
CREATE INDEX IF NOT EXISTS idx_conflict_locks_expires ON conflict_locks(expires_at);
```

**Purpose**: Ensure only one user/session can resolve a conflict at a time

**Columns**:
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | INTEGER | No | PK |
| conflict_id | INTEGER | No | FK to sync_conflicts (UNIQUE) |
| session_id | TEXT | No | Browser session ID from header |
| user_id | INTEGER | Yes | ID of lock holder |
| locked_at | DATETIME | No | When lock acquired |
| expires_at | DATETIME | No | Lock auto-expires after 5 minutes |

**Lock Lifecycle**:
1. User clicks "Resolve" → lock acquired (expires_at = now + 5min)
2. If another user clicks same conflict → lock exists error returned
3. On resolution complete → lock deleted
4. If user abandons (browser closes) → lock expires after 5min, auto-cleaned

**Cleanup**: Periodic job removes expired locks (runs every 1 minute)

---

### 4. sync_operations (EXTENDED)

Extends existing operations table with error categorization for better messaging.

```sql
ALTER TABLE sync_operations ADD COLUMN error_category TEXT CHECK (error_category IS NULL OR error_category IN ('user_correctable', 'system', 'unrecoverable'));
ALTER TABLE sync_operations ADD COLUMN user_facing_message TEXT;
ALTER TABLE sync_operations ADD COLUMN internal_error_detail TEXT;
```

**Purpose**: Categorize errors so frontend can show appropriate user guidance

**New Columns**:
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| error_category | TEXT | Yes | 'user_correctable', 'system', 'unrecoverable', or NULL if no error |
| user_facing_message | TEXT | Yes | Safe message to show user (no internals) |
| internal_error_detail | TEXT | Yes | Full error stack trace (for logs only, never shown) |

**Error Examples**:
- UC: "Field 'amount' must be > 0" (Odoo validation)
- SE: "Network timeout, retrying..." (transient)
- UR: "Record deleted in Odoo, contact support (UR-0042)" (permanent)

---

## Entity Relationships

```
database_connections
    ↓
sync_conflicts (N) ← one row per detected conflict
    ├─→ conflict_resolutions (0..1) ← user's choice to resolve
    └─→ conflict_locks (0..1) ← active lock during resolution

sync_operations (N) ← operation history
    └─→ error categorization data
```

---

## State Machine Implementation

### sync_conflicts.state Transitions

```javascript
// Allowed transitions
VALID_TRANSITIONS = {
  'detected': ['reviewing', 'resolved'],      // User can jump directly to resolved
  'reviewing': ['resolved', 'detected'],      // Can go back to view more
  'resolved': ['applied', 'detected'],        // Apply or reset
  'applied': [],                              // Terminal state
  'needs_manual_review': ['resolved'],        // User can re-attempt or contact support
};

// Applied when?
state = 'detected'    // Conflict first found by sync engine
state = 'reviewing'   // (Optional) User clicked to view details
state = 'resolved'    // User clicked "Keep Local" or "Keep Odoo" in UI
state = 'applied'     // Sync successfully applied the choice to both databases
state = 'needs_manual_review' // All 3 retry attempts failed, needs human intervention
```

---

## Validation Rules

### sync_conflicts
- `source_value` and `target_value` must be valid JSON (serialized)
- At least one of `source_value` or `target_value` must differ (else not a conflict)
- `state` must be in enum list (database constraint)
- `locked_by` must be NULL if state is 'detected' or 'applied' (lock should be cleaned)

### conflict_resolutions
- `chosen_version` must match one of the versions in sync_conflicts
- `resolved_at` must be <= `applied_at` (if applied_at is not NULL)
- `retry_count` must be >= 0 and <= 3 (hard limit)
- `last_error_category` must be NULL or in enum (user_correctable|system|unrecoverable)

### conflict_locks
- `expires_at` must be > `locked_at`
- Only one lock per conflict_id (UNIQUE constraint)
- `session_id` must not be empty

---

## Indexes for Performance

```sql
-- Conflict lookup and filtering
CREATE INDEX idx_sync_conflicts_state ON sync_conflicts(state);
CREATE INDEX idx_sync_conflicts_model_state ON sync_conflicts(model_name, state);
CREATE INDEX idx_sync_conflicts_created ON sync_conflicts(created_at DESC);

-- Resolution lookup
CREATE INDEX idx_conflict_resolutions_conflict ON conflict_resolutions(conflict_id);
CREATE INDEX idx_conflict_resolutions_user ON conflict_resolutions(user_id);
CREATE INDEX idx_conflict_resolutions_applied ON conflict_resolutions(applied_at, retry_count);

-- Lock cleanup
CREATE INDEX idx_conflict_locks_expires ON conflict_locks(expires_at);
CREATE INDEX idx_conflict_locks_session ON conflict_locks(session_id);

-- Composite for bulk operations
CREATE INDEX idx_sync_conflicts_model_created ON sync_conflicts(model_name, created_at DESC);
```

---

## Data Flow & Lifecycle

### Single Conflict Lifecycle

```
1. Sync Detection Phase
   - SyncEngine detects conflict (write_date differs)
   - INSERT into sync_conflicts: state='detected'

2. User Viewing
   - GET /api/conflicts/ ← list all conflicts
   - SELECT * WHERE state IN ('detected', 'resolved')
   - GET /api/conflicts/:id ← view one conflict
   - SELECT * + show both versions side-by-side

3. Resolution Phase
   - POST /api/conflicts/:id/lock ← acquire lock
   - INSERT into conflict_locks
   - User selects "keep local" or "keep odoo"
   - POST /api/conflicts/:id/resolve {version: 'local'}
   - UPDATE sync_conflicts SET state='resolved'
   - INSERT into conflict_resolutions: chosen_version, resolved_at

4. Application Phase
   - POST /api/conflicts/:id/apply
   - UPDATE sync_conflicts SET state='applying'
   - Try sync operation (up to 3 retries with backoff)
   - If success: UPDATE sync_conflicts SET state='applied'; DELETE FROM conflict_locks
   - If fail (3 times): UPDATE sync_conflicts SET state='needs_manual_review'; notify user

5. Failure Recovery (Optional)
   - User sees conflict in "needs_manual_review"
   - POST /api/conflicts/:id/retry ← manual retry attempt
   - DELETE FROM conflict_locks (unlock) ← user can try again
```

---

## Migration Path

### SQLite Schema Migrations

**Migration 1**: Add state tracking to sync_conflicts
```sql
BEGIN TRANSACTION;
ALTER TABLE sync_conflicts ADD COLUMN state TEXT DEFAULT 'detected';
ALTER TABLE sync_conflicts ADD COLUMN locked_by INTEGER;
ALTER TABLE sync_conflicts ADD COLUMN locked_at DATETIME;
CREATE INDEX idx_sync_conflicts_state ON sync_conflicts(state);
COMMIT;
```

**Migration 2**: Create new tables
```sql
BEGIN TRANSACTION;
CREATE TABLE conflict_resolutions (...);
CREATE TABLE conflict_locks (...);
CREATE INDEX ... (on new tables)
COMMIT;
```

**Migration 3**: Extend sync_operations
```sql
BEGIN TRANSACTION;
ALTER TABLE sync_operations ADD COLUMN error_category TEXT;
ALTER TABLE sync_operations ADD COLUMN user_facing_message TEXT;
ALTER TABLE sync_operations ADD COLUMN internal_error_detail TEXT;
COMMIT;
```

**No data migration required**: Existing conflicts default to 'detected' state, treated as new.

---

## Backward Compatibility

- All new columns have DEFAULT values (won't break existing queries)
- New tables don't affect existing operations
- Old sync runs continue to work (no state filtering required if not implemented)

---

## Summary

| Artifact | Count | Purpose |
|----------|-------|---------|
| Tables Extended | 2 | sync_conflicts, sync_operations |
| Tables Created | 2 | conflict_resolutions, conflict_locks |
| Columns Added | 7 | state, locked_by, locked_at, error_category, user_facing_message, internal_error_detail |
| Indexes Added | 8 | For state filtering, lock cleanup, bulk operations |
| Relationships | 4 | Conflict → Resolution, Conflict → Lock, Operation → Category |

**Database Impact**: ~2MB for 10k conflicts + metadata (SQLite efficient)
**Query Performance**: All filters use indexed columns, pagination cursor-based
