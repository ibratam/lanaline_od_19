# Implementation Plan: Fix Synchronization and Conflicts Feature

**Branch**: `003-fix-sync-conflicts` | **Date**: 2026-01-20 | **Spec**: [Feature Specification](./spec.md)
**Input**: Feature specification from `/specs/003-fix-sync-conflicts/spec.md`

## Summary

This feature extends the existing Odoo sync middleware with comprehensive failure recovery and diagnostics for sync operations and conflict resolution. Users need to quickly identify why syncs and conflict resolutions fail, understand root causes, and recover by retrying after fixing underlying issues. Key capabilities include:

- **Smart Error Categorization**: User-correctable (validation), System (transient), Unrecoverable (permanent)
- **Intelligent Retry Strategy**: Different handling for 4xx (fail immediately), 429/timeout (exponential backoff), 5xx (retry once then manual review)
- **Limited State Reversibility**: Applied conflicts can revert to Failed Resolution; Needs Manual Review can revert to Resolved for retry
- **Data Consistency Verification**: Compare key fields between local and Odoo, identify inconsistencies, suggest repairs
- **Automatic Table Creation**: Detect missing target tables, notify users, create tables with all dependencies (FK, indexes, constraints)
- **Comprehensive Operation Logging**: Detailed timing, state transitions, error details for debugging

## Technical Context

**Language/Version**: JavaScript/Node.js 18+ LTS (ES Modules)
**Primary Dependencies**: Express.js, better-sqlite3, node-cron, Winston (logging)
**Storage**: SQLite3 with better-sqlite3 (synchronous operations)
**Testing**: Jest 29.7.0 with unit, integration, and contract tests
**Target Platform**: Linux server (internal network, no authentication)
**Project Type**: Full-stack (Node.js Express backend + Vanilla JavaScript frontend)
**Performance Goals**: Load conflicts list <2s, resolve single conflict <1 min, bulk resolve 100+ in <30s
**Constraints**: Conflict locking during resolution, exponential backoff (5s/10s/20s), create missing tables <30s
**Scale/Scope**: Handle 1000+ conflicts, maintain full audit trail, support pagination for large histories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Assessment

| Principle | Status | Details |
|-----------|--------|---------|
| I. Component-Driven Architecture | ✓ PASS | New error handling components modular; existing services extended; clear separation of concerns. |
| II. Full-Stack Integration | ✓ PASS | API contracts defined in spec; frontend validates responses; backend returns structured errors with codes. |
| III. Test-Driven Development | ✓ PASS | Phase 7 of 002-resolve-conflicts implemented TDD: failing tests written first, then services implemented. Unit tests for error categorization, retry logic, state machine. |
| IV. Security by Design | ✓ PASS | Error messages sanitized (PII removed); access control simplified (no RBAC); audit logging of all operations; no secrets in error messages. |

### Security Requirements Check

| Category | Requirement | Status | Implementation Notes |
|----------|-------------|--------|----------------------|
| Data Protection | Sensitive data in error logs | ✓ PASS | Error categorization sanitizes user-facing messages; full details in internal logs only. Error codes (UC/SE/UR) provide classification without exposing data. |
| Auth/AuthZ | Access control for resolution | ✓ PASS | All authenticated users can retry (simplified; internal network context). Error messages are sanitized, not role-gated. |
| Code Security | Input validation | ✓ PASS | Existing validators.js extended; parameterized queries; state machine validates transitions. |

### Violations Detected: None

All constitution principles achievable. Security managed via error sanitization and comprehensive audit logging.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-sync-conflicts/
├── spec.md              # Feature specification (complete with clarifications)
├── plan.md              # This file - implementation architecture
├── research.md          # Phase 0 output (technical decisions & best practices)
├── data-model.md        # Phase 1 output (entities, state machine, schemas)
├── quickstart.md        # Phase 1 output (integration guide for existing code)
├── contracts/           # Phase 1 output (API request/response schemas)
│   ├── sync-errors-api.md
│   ├── conflict-recovery-api.md
│   └── data-consistency-api.md
└── checklists/
    └── requirements.md  # Quality checklist (all passed)
```

### Source Code (repository root - Existing Single Project Structure)

```text
src/
├── api/
│   ├── routes/
│   │   ├── sync.js          # EXTEND: Add error diagnostics, retry endpoints
│   │   ├── conflicts.js     # EXTEND: Add failure recovery, state transitions
│   │   └── consistency.js   # NEW: Data consistency verification endpoint
│   └── middleware/
│       ├── errorHandler.js  # EXTEND: Smart error categorization (Phase 7)
│       └── errorSanitizer.js # NEW: Sanitize sensitive data (Phase 7)
├── services/
│   ├── SyncEngine.js        # EXTEND: Add table creation, error recovery
│   ├── ConflictResolver.js  # EXTEND: State reversibility (Phase 7)
│   ├── RetryManager.js      # EXTEND: Smart retry strategy (Phase 7)
│   ├── ErrorCategorizer.js  # NEW: Unified error classification
│   ├── TableCreator.js      # NEW: Auto-create missing tables with dependencies
│   └── ConsistencyChecker.js # NEW: Verify data consistency between DBs
├── models/
│   ├── SyncOperation.js     # EXTEND: Add error details, timing info
│   ├── SyncFailure.js       # NEW: Track sync failures with categorization
│   └── TableSchema.js       # NEW: Manage table metadata for creation
└── db/
    ├── migrations/
    │   └── 004_add_sync_diagnostics.js # NEW: Add columns for error tracking
    └── init.js              # EXTEND: Initialize new services

tests/
├── unit/
│   ├── ConflictResolver.test.js  # EXTEND: State reversibility (Phase 7)
│   ├── ErrorCategorizer.test.js  # NEW: Error classification logic
│   ├── TableCreator.test.js      # NEW: Table creation with dependencies
│   └── RetryManager.test.js      # EXTEND: Smart retry strategy (Phase 7)
├── integration/
│   ├── syncFailureRecovery.test.js  # NEW: End-to-end failure recovery
│   └── tableAutoCreation.test.js    # NEW: Auto-creation workflow
└── contract/
    ├── sync-errors-api.test.js      # NEW: Error response contracts
    └── consistency-api.test.js      # NEW: Verification endpoint contracts

public/
├── js/
│   ├── components/
│   │   └── ErrorDisplay.js      # NEW: Show categorized errors with actions
│   └── services/
│       └── ErrorHandler.js      # NEW: Client-side error handling
└── html/
    └── dashboard.html           # EXTEND: Add error diagnostics panel
```

**Structure Decision**: Extends existing single-project architecture. No new projects or major reorganization. Error handling, retry logic, and table creation services added to existing `src/services/`. API routes extended with new endpoints for error recovery and data consistency. Frontend updated with error display components.

## Complexity Tracking

> **No Constitution Check violations. Justified exceptions to simplicity principles:**

| Consideration | Decision | Rationale |
|---|---|---|
| Table auto-creation complexity | Accepted - TableCreator service | Required by FR-017; attempts to create missing tables risk data corruption if not handled carefully; isolated service allows thorough testing |
| Smart retry strategy vs simple retry | Accepted - ErrorCategorizer service | Prevents wasted retries on 4xx (futile); catches rate limits immediately; differentiates between transient and permanent failures |
| State machine reversibility | Accepted - Limited reversibility | Balances recovery needs (users need to retry) with clear state management; prevents duplicate records and confusion |

---

## Phase 0: Research & Clarification

**Status**: Complete (3 clarifications already answered in `/speckit.clarify`)

**Clarifications Resolved**:
1. State machine reversibility: Limited reversibility model adopted
2. User access control: No RBAC - all users can retry/recover
3. Odoo API error handling: Smart categorization strategy adopted

**Technical Research Completed**:
- Error categorization patterns: UC (validation) / SE (network) / UR (permission)
- Retry strategies: Exponential backoff, selective retry by error type
- Table creation best practices: Schema discovery, dependency resolution, transaction safety
- Data consistency verification: Field-level comparison, inconsistency reporting

---

## Phase 1: Design & API Contracts

**Deliverables**:
1. `research.md` - Technical decisions and best practices
2. `data-model.md` - Entity definitions, state machines, database schema extensions
3. `quickstart.md` - Integration guide for developers adding this to existing system
4. `contracts/` - API request/response schemas for error handling, consistency verification
5. Updated agent context files with technology stack

**Key Design Decisions**:

### Error Categorization Strategy
- **User-Correctable (UC-001-999)**: Validation errors, missing fields, constraint violations → User-facing detail shown, retry button offered
- **System (SE-001-999)**: Timeouts, connection resets, rate limits → Auto-retry with exponential backoff (5s, 10s, 20s)
- **Unrecoverable (UR-001-999)**: Permission denied, record deleted, auth failure → "Contact support" message with error code

### State Machine Design
```
Conflict States:
  detected ──resolve──> resolved ──apply──> applied (terminal)
                           ↑                    ↓
                           ← (if error)    needs_manual_review
                                              ↓
                                        (user fixes) ──> resolved (retry)

Sync Operation States:
  queued ──start──> running ──complete──> completed (terminal)
                       ↓
                      fail ──retry──> running
                       ↓
                   needs_review (terminal after 3 retries)
```

### Table Creation Workflow
```
1. Sync operation starts
2. Attempt connect to target DB
3. If table missing:
   a. Notify user: "Table X not found, creating..."
   b. Discover schema from source
   c. Resolve dependencies (FK references, indexes)
   d. Create table with all constraints
   e. Confirm: "Table X created successfully"
4. Proceed with sync
```

### Data Consistency Verification
```
1. Compare key fields (status, amount, date_modified) between local & Odoo
2. For each mismatch:
   a. Categorize: data_mismatch vs missing_record vs extra_record
   b. Store in inconsistency report
3. Suggest repair: keep_local, keep_odoo, manual_review
4. Return report to user with affected record count and sample details
```

---

**Ready to proceed to Phase 2**: Generate `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
