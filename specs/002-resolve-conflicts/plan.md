# Implementation Plan: Resolve Conflicts and Solve History

**Branch**: `002-resolve-conflicts` | **Date**: 2026-01-19 | **Spec**: `specs/002-resolve-conflicts/spec.md`
**Input**: Feature specification from `/specs/002-resolve-conflicts/spec.md`

**Note**: This plan extends existing Odoo sync middleware with conflict resolution UI, state management, and retry logic.

## Summary

The Odoo sync middleware currently detects conflicts but requires manual resolution via database updates. This feature implements a complete conflict resolution workflow with:
- **Conflict Management UI**: Display detected conflicts with side-by-side comparison of local vs. Odoo versions
- **Resolution Interface**: Allow users to choose which version to keep and apply the resolution
- **State Machine**: Track conflict lifecycle (Detected → Reviewing → Resolved → Applied → terminal/Needs Manual Review)
- **Automatic Retry**: Failed syncs auto-retry up to 3 times with exponential backoff; critical failures notify user
- **Sync History Enhancement**: Comprehensive audit trail of all operations with filtering and export
- **Bulk Operations**: Allow pattern-based bulk resolution of similar conflicts
- **Concurrency Control**: Lock conflicts during resolution to prevent race conditions

## Technical Context

**Language/Version**: JavaScript/Node.js 18+ LTS (ES Modules)
**Primary Dependencies**: Express.js, better-sqlite3, node-cron, Winston (logging)
**Storage**: SQLite3 with better-sqlite3 (synchronous operations)
**Testing**: Jest 29.7.0 with unit, integration, and contract tests
**Target Platform**: Linux server (internal network, no authentication)
**Project Type**: Full-stack (Node.js Express backend + Vanilla JavaScript frontend)
**Performance Goals**: Load conflicts list in <2s, resolve single conflict in <1 minute, bulk resolve 100+ in <30s
**Constraints**: Conflict locking during resolution, exponential backoff retry strategy (5s, 10s, 20s)
**Scale/Scope**: Handle 1000+ conflicts, maintain full audit trail, support pagination for large sync histories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Assessment

| Principle | Status | Details |
|-----------|--------|---------|
| I. Component-Driven Architecture | ✓ PASS | New frontend components will be modular (ConflictsList, ConflictDetail, ResolutionForm, BulkResolutionDialog). Each with clear responsibilities and props contracts. |
| II. Full-Stack Integration | ✓ PASS | API contracts defined in spec (FR-001-015). Backend endpoints will return conflict data structure; frontend validates responses before rendering. |
| III. Test-Driven Development | ✓ PASS | Jest already integrated. Feature will include unit tests (conflict state machine, retry logic), integration tests (full resolution workflow), contract tests (API endpoints). Target ≥80% coverage on critical paths. |
| IV. Security by Design | ⚠️ CONDITIONAL PASS | Feature has security considerations: (1) Conflict data contains record values—must not expose sensitive fields in error logs per FR-015 categorization. (2) Concurrency locking (FR-013) prevents race conditions. (3) All user resolutions logged for audit trail (FR-006). No additional authentication required—relies on existing (absent) network-level security. |

### Security Requirements Check

| Category | Requirement | Status | Implementation Notes |
|----------|-------------|--------|----------------------|
| Data Protection | Sensitive data in audit logs | ✓ PASS | Error categorization (FR-015) will sanitize user-facing messages; full details stored in internal logs only. No PII in UI. |
| Auth/AuthZ | RBAC for resolution access | ✓ PASS | FR-011 allows all authenticated users (no role restriction). Consistent with existing no-auth design. |
| Code Security | Input validation | ✓ PASS | Existing validators.js will extend to conflict selection, resolution choice parameters. Parameterized queries prevent SQL injection. |

### Violations Detected: None
All constitution principles are achievable. Security considerations are explicitly managed via FR-015 error categorization.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── routes/
│   │   ├── config.js       # Existing connections
│   │   ├── sync.js         # Existing sync execution
│   │   └── conflicts.js    # NEW: Conflict resolution endpoints
│   └── middleware/         # Existing error handling
├── services/
│   ├── SyncEngine.js       # Existing, needs state tracking extension
│   ├── ConflictDetector.js # Existing
│   ├── ConflictResolver.js # NEW: Implements state machine + locking
│   ├── RetryManager.js     # NEW: Handles exponential backoff retries
│   ├── HistoryLogger.js    # Existing, extends for history queries
│   └── NotificationService.js # Existing, extends for failure notifications
├── models/
│   ├── SyncConflict.js     # Existing, extend with state column
│   ├── ConflictResolution.js # NEW: Track user resolutions
│   ├── ConflictLock.js     # NEW: Manage concurrent access
│   └── SyncOperation.js    # Existing, extends for detailed audit
└── db/
    └── schema.sql          # Schema updates for new tables

public/
├── js/
│   ├── components/
│   │   ├── ConflictsList.js        # NEW: Display conflicts
│   │   ├── ConflictDetail.js       # NEW: Side-by-side comparison
│   │   ├── ResolutionForm.js       # NEW: Choose version + apply
│   │   ├── BulkResolutionDialog.js # NEW: Bulk rule application
│   │   ├── SyncHistoryPanel.js     # NEW: Enhanced history view
│   │   └── NotificationPanel.js    # NEW: Failure notifications
│   └── routes/
│       └── conflicts.js            # NEW: Router for conflicts UI

tests/
├── unit/
│   ├── ConflictResolver.test.js    # NEW: State machine logic
│   ├── RetryManager.test.js        # NEW: Backoff strategy
│   └── conflictLocking.test.js     # NEW: Concurrency safety
├── integration/
│   ├── conflictResolution.test.js  # NEW: Full workflow
│   └── bulkResolution.test.js      # NEW: Pattern-based resolution
└── contract/
    └── conflicts-api.test.js       # NEW: API contract validation
```

**Structure Decision**: Extends existing single-project architecture (no new projects). All new code follows existing patterns:
- **Backend**: New service layer (ConflictResolver, RetryManager) + API routes (conflicts.js) + models
- **Database**: Schema extends sync_conflicts table with state tracking + new lock/resolution tracking tables
- **Frontend**: New vanilla JS components following existing modular pattern
- **Tests**: New test suites in existing Jest structure maintaining coverage targets

## Phase 0: Research & Clarification

**Status**: Complete - No unknowns requiring research
- Technical stack identified: Node.js/Express/SQLite with Jest testing
- Odoo sync implementation analyzed and understood
- All architectural decisions made via clarifications workflow
- Constitution principles validated

**Artifacts to generate in Phase 1**: research.md (consolidating findings), data-model.md, API contracts, quickstart.md

## Phase 1: Design & API Contracts

### Data Model

**New/Extended Database Tables**:

1. **sync_conflicts** (EXTEND existing)
   - Add columns: `state` (enum: detected|reviewing|resolved|applied|needs_manual_review), `locked_by` (user_id or NULL), `locked_at` (timestamp)
   - Keep existing: `source_id`, `target_id`, `model_name`, `field_name`, `source_value`, `target_value`, `created_at`

2. **conflict_resolutions** (NEW)
   - `id` (PK), `conflict_id` (FK), `user_id`, `chosen_version` (enum: local|odoo), `resolved_at`, `applied_at`, `retry_count`, `last_error`
   - Tracks who resolved what conflict and when

3. **conflict_locks** (NEW)
   - `id` (PK), `conflict_id` (FK), `user_id`, `locked_at`, `session_id`
   - Manages optimistic locks to prevent concurrent resolution

4. **sync_operations** (EXTEND existing)
   - Add columns: `error_category` (enum: user_correctable|system|unrecoverable), `error_message` (sanitized for UI)
   - Existing: operation type, record counts, status

### API Endpoints (RESTful)

**Conflicts Management** (`/api/conflicts`):
- `GET /` - List all conflicts (with pagination, filters by status/type/model)
- `GET /:id` - Get conflict details with both versions
- `POST /:id/resolve` - User selects version (local|odoo) → state: resolved
- `POST /:id/apply` - Apply resolved conflict → state: applying → applied/needs_manual_review
- `POST /bulk-resolve` - Bulk resolve with rule (e.g., `{"model": "product.product", "action": "keep_local"}`)
- `POST /:id/lock` - Acquire lock for resolution (prevents concurrent edits)
- `DELETE /:id/lock` - Release lock on completion

**History & Audit** (EXTEND `/api/history`):
- `GET /?filter=conflicts` - Filter history by conflict-related operations
- `GET /:id/changes` - Detailed changes for a specific operation
- `GET /export?format=csv|json` - Export with conflict resolution history

**Retry Management** (`/api/conflicts/:id/retry`):
- `POST /` - Manually trigger retry for "needs_manual_review" conflicts
- `GET /status` - Check current retry state + next retry time

### Frontend Components

1. **ConflictsList** - Table view of all conflicts with status badges, filters
2. **ConflictDetail** - Modal showing side-by-side JSON comparison + metadata
3. **ResolutionForm** - Radio selection (keep local|keep odoo) + apply button with progress indicator
4. **BulkResolutionDialog** - Rule builder (model + action) + preview + confirm
5. **SyncHistoryPanel** - Extended history with conflict operation details
6. **NotificationPanel** - Toast notifications for auto-retries, failures, completion
7. **ConflictLockWarning** - Alerts user if conflict is locked by another session

### Error Categorization Strategy (FR-015)

**User-Correctable** (code: UC-001-999):
- Odoo validation error (e.g., "Sales amount must be > 0")
- Local data constraint violation
- Missing required field in one version
- UI Action: Show error detail + retry button

**System Errors** (code: SE-001-999):
- Network timeout, connection refused
- Odoo API temporarily unavailable
- Database lock timeout
- UI Action: Show "Retrying... (attempt N/3)" with backoff countdown

**Unrecoverable** (code: UR-001-999):
- Record deleted in Odoo after conflict detected
- Permission denied on both sides
- Local database is corrupted
- UI Action: Show "Contact support" with error code + timestamp for manual investigation

---

## Phase 2: Task Decomposition

**Status**: Generated by `/speckit.tasks` (not by /speckit.plan)

**Preview of Task Categories**:
1. Database migrations (schema updates for state tracking, locks, resolutions)
2. Backend services (ConflictResolver state machine, RetryManager backoff logic)
3. Backend API routes (conflict CRUD, resolution endpoints, retry trigger)
4. Frontend components (6 new components + notifications)
5. Frontend routing (conflicts page integration)
6. Tests (unit, integration, contract covering all critical paths)
7. Documentation (API docs, deployment guide, conflict resolution workflow)

---

**Plan Complete**: Ready for `/speckit.tasks` to generate actionable task breakdown.
