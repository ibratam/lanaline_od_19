# Implementation Tasks: Resolve Conflicts and Solve History

**Feature**: Resolve Conflicts and Solve History
**Branch**: `002-resolve-conflicts`
**Created**: 2026-01-19
**Tech Stack**: Node.js 18+ LTS | Express.js | SQLite3 | Jest 29.7.0 | Vanilla JavaScript

---

## Dependencies & Execution Order

### Task Dependency Graph

```
Phase 1: Setup (blocking all user stories)
├── T001: Create database migrations
├── T002: Create SyncConflict model extension
├── T003: Create ConflictResolution model
├── T004: Create ConflictLock model
└── T005: Register new routes in app.js

Phase 2: Foundational Services (blocking user stories 1-4)
├── T006: Implement ConflictResolver service
├── T007: Implement RetryManager service
├── T008: Implement BulkResolutionEngine service
└── T009: Extend HistoryLogger for conflict queries

Phase 3: User Story 1 (P1 - Identify & View Conflicts)
├── T010: Create ConflictsList frontend component
├── T011: Create ConflictDetail frontend component
├── T012: Implement GET /api/conflicts endpoint
├── T013: Implement GET /api/conflicts/:id endpoint
└── T014: Integrate conflicts routes in main app

Phase 4: User Story 2 (P1 - Resolve Individual Conflicts)
├── T015: Implement POST /api/conflicts/:id/lock endpoint
├── T016: Implement POST /api/conflicts/:id/resolve endpoint
├── T017: Implement POST /api/conflicts/:id/apply endpoint
├── T018: Implement DELETE /api/conflicts/:id/lock endpoint
├── T019: Implement POST /api/conflicts/:id/retry endpoint
├── T020: Create ResolutionForm frontend component
├── T021: Create NotificationPanel frontend component
└── T022: Integrate resolution workflow in UI

Phase 5: User Story 3 (P2 - Review Sync History)
├── T023: Extend GET /api/history with conflict filtering
├── T024: Implement conflict operation detail endpoint
├── T025: Create SyncHistoryPanel frontend component
└── T026: Integrate history panel in UI

Phase 6: User Story 4 (P2 - Bulk Resolve)
├── T027: Implement POST /api/conflicts/bulk-resolve endpoint
├── T028: Create BulkResolutionDialog frontend component
└── T029: Integrate bulk resolver in UI

Phase 7: Polish & Cross-Cutting
├── T030: Implement error categorization (UC/SE/UR)
├── T031: Add pagination support for large conflict lists
├── T032: Implement lock expiration cleanup job
├── T033: Add comprehensive error handling
├── T034: Sanitize sensitive data from error messages
└── T035: Write unit tests for critical services
```

### Parallel Execution Opportunities

**Phase 1 (Setup)**: All tasks can run in parallel except T005 (depends on T001-T004)
- Parallel: T001, T002, T003, T004
- Sequential: T005 (after T001-T004)

**Phase 2 (Services)**: All tasks can run in parallel (independent services)
- Parallel: T006, T007, T008, T009

**Phase 3 (US1)**: Components can be developed in parallel with endpoints
- Parallel: T010, T011, T012, T013
- Sequential: T014 (after T012, T013)

**Phase 4 (US2)**: Endpoints and components can be parallelized
- Parallel: T015, T016, T017, T018, T019, T020, T021
- Sequential: T022 (after T015-T021)

---

## Phase 1a: Assumption Validation (Blocking All Phases)

### Phase Goal
Verify all stated assumptions (spec.md lines 160-167) are true in the current codebase before database migrations and implementation proceed.

### Independent Test Criteria
- [x] Existing Odoo sync mechanism detects conflicts and populates sync_conflicts table
- [x] Test data includes at least 10 conflicts with different field types and write_date variations
- [x] Conflicts queryable by state, model_name, record_id
- [x] Both source_value and target_value stored as JSON for at least 5 test conflicts
- [x] Structural conflicts (missing records) distinguishable from field-level conflicts
- [x] User has appropriate permissions to read/write sync tables (no ACL blocks)

---

- [x] T000 Validate assumptions by running existing SyncEngine against test Odoo instance and verify: (1) conflict detection produces ≥10 test conflicts in sync_conflicts table, (2) both versions (source_value, target_value) populated as JSON, (3) can differentiate data vs structural conflicts, (4) query by model_name/state/record_id successful; document findings in assumptions-validation.md in specs/002-resolve-conflicts/; BLOCK all subsequent phases if any assumption fails

---

## Phase 1b: Component Type Documentation (Blocking Phase 3)

### Phase Goal
Define PropTypes contracts for all frontend components before implementation begins (TDD principle: specification before code).

### Independent Test Criteria
- [x] All 7 frontend components have PropTypes defined
- [x] PropTypes document all props with type, default value, and required status
- [x] Usage examples included in component JSDoc comments

---

- [x] T001b [P] Define PropTypes for ConflictsList in public/js/components/ConflictsList.propTypes.js: props {conflicts: Array<Conflict>, onFilter: Function, onSelectConflict: Function}; default filters={state: 'detected', model: null}; include JSDoc @param documentation

- [x] T001c [P] Define PropTypes for ConflictDetail in public/js/components/ConflictDetail.propTypes.js: props {conflict: Conflict, onClose: Function}; required for source_value, target_value, metadata display; include JSDoc @param documentation

- [x] T001d [P] Define PropTypes for ResolutionForm in public/js/components/ResolutionForm.propTypes.js: props {conflict: Conflict, onResolve: Function(chosenVersion), onError: Function(error)}; include JSDoc @param documentation and usage example

- [x] T001e [P] Define PropTypes for BulkResolutionDialog in public/js/components/BulkResolutionDialog.propTypes.js: props {onApplyRule: Function(rule), onPreview: Function(rule)}; rule shape {model: string, field?: string, action: 'keep_local' | 'keep_odoo'}; include JSDoc

- [x] T001f [P] Define PropTypes for SyncHistoryPanel in public/js/components/SyncHistoryPanel.propTypes.js: props {operations: Array<SyncOperation>, onFilterDateRange: Function(start, end), onFilterModel: Function(model)}; include JSDoc @param documentation

- [x] T001g [P] Define PropTypes for NotificationPanel in public/js/components/NotificationPanel.propTypes.js: props {notifications: Array<{type: 'error'|'info'|'success', message: string, errorCode?: string}>}; include JSDoc @param documentation

- [x] T001h [P] Define PropTypes for ConflictLockWarning in public/js/components/ConflictLockWarning.propTypes.js: props {lockedBy: number|null, lockedAt: ISO8601|null, onRetry: Function}; include JSDoc @param documentation

---

## Phase 1c: Test-First Setup (Blocking Phase 2)

### Phase Goal
Write failing test suites for core services before implementation begins (TDD principle: red-green-refactor cycle).

### Independent Test Criteria
- [x] All test files created with failing tests
- [x] Test suite structure mirrors implementation structure
- [x] Tests validate requirements from spec, not implementation details
- [x] Each test has clear assertion and expected failure reason

---

- [x] T005a [P] Write failing unit tests for ConflictResolver in tests/unit/ConflictResolver.test.js with test cases: (1) resolve() transitions state detected→resolved, (2) prevent duplicate resolution on already-resolved conflict, (3) categorize errors into UC/SE/UR; ensure ALL tests FAIL before T006 implementation begins

- [x] T005b [P] Write failing unit tests for RetryManager in tests/unit/RetryManager.test.js with test cases: (1) applyWithRetry() retries exactly 3 times with exponential backoff delays [5000, 10000, 20000]ms, (2) after 3 failures move conflict to 'needs_manual_review' state, (3) categorizeError() returns correct category (user_correctable|system|unrecoverable); ensure ALL tests FAIL before T007 implementation

- [x] T005c [P] Write failing unit tests for BulkResolutionEngine in tests/unit/BulkResolutionEngine.test.js with test cases: (1) preview() returns matched conflict count without applying changes, (2) apply() resolves all matching conflicts atomically (all-or-nothing), (3) rule validation enforces {model: string, field?: string, action: 'keep_local'|'keep_odoo'}; ensure ALL tests FAIL before T008 implementation

- [x] T005d [P] Write failing contract tests for conflict API endpoints in tests/contract/conflicts-api.test.js with test cases: (1) GET /api/conflicts returns paginated list with cursor, (2) GET /:id returns full conflict schema with resolution/lock status, (3) POST /:id/lock prevents concurrent resolution (409 if locked), (4) POST /:id/apply handles retries returning 202 then 200/409; ensure ALL tests FAIL before T012-T027 implementation

---

## Phase 1: Setup & Database (After Phases 1a-1c)

### Phase Goal
Initialize database schema, create models, and register routes for conflict management.

### Independent Test Criteria
- [x] Database migrations execute without errors
- [x] All new models can be instantiated
- [x] Routes are registered and accessible via Express app

---

- [x] T001 Create database migrations in src/db/migrations/ `001_add_conflict_state.js`, `002_create_conflict_resolutions.js`, `003_create_conflict_locks.js`

- [x] T002 [P] Create SyncConflict model extension in src/models/SyncConflict.js with methods: `getByState()`, `updateState()`, `getLocked()`, `addStateColumn()`

- [x] T003 [P] Create ConflictResolution model in src/models/ConflictResolution.js with methods: `create()`, `getByConflictId()`, `updateApplied()`, `updateError()`, `updateRetry()`

- [x] T004 [P] Create ConflictLock model in src/models/ConflictLock.js with methods: `acquire()`, `release()`, `getByConflictId()`, `cleanup()`, `isExpired()`

- [x] T005 Register conflicts routes in src/app.js by importing and mounting `createConflictsRouter()` at `/api/conflicts`

---

## Phase 2: Foundational Services (Blocking All User Stories)

### Phase Goal
Implement core business logic services for conflict resolution, retry management, and history tracking.

### Independent Test Criteria
- [x] ConflictResolver can transition conflict through states
- [x] RetryManager implements exponential backoff with 3 retries (5s, 10s, 20s)
- [x] BulkResolutionEngine can apply rules to multiple conflicts atomically
- [x] HistoryLogger can query and filter operations by model/date/status

---

- [x] T006 Implement ConflictResolver service in src/services/ConflictResolver.js with methods: `resolve(conflictId, chosenVersion, userId)`, `apply(conflictId)`, `_performSync(conflict, chosenVersion)`, `_categorizeError(error)`

- [x] T007 [P] Implement RetryManager service in src/services/RetryManager.js with methods: `applyWithRetry(conflictId, maxRetries=3)`, `_categorizeError(error)`, `_delay(ms)`, supporting exponential backoff delays [5000, 10000, 20000]

- [x] T008 [P] Implement BulkResolutionEngine service in src/services/BulkResolutionEngine.js with methods: `preview(rule)`, `apply(rule)`, `_matchConflicts(rule)`, validating rule format {model, field?, action}

- [x] T009 [P] Extend HistoryLogger service in src/services/HistoryLogger.js with methods: `queryByState(state, limit, offset)`, `queryByModel(model, limit)`, `queryByDateRange(start, end)`, `getDetails(operationId)`

---

## Phase 3: User Story 1 (P1) - Identify and View Conflicting Records

### Story Summary
Users need to see what conflicts exist in their Odoo sync history so they can understand which records have discrepancies between the local database and Odoo.

### Independent Test Criteria
- [x] GET /api/conflicts returns all detected conflicts with pagination
- [x] GET /api/conflicts/:id returns single conflict with both versions
- [x] Conflicts can be filtered by state, model name
- [x] UI displays conflicts in sortable/filterable table
- [x] Users can click to view side-by-side comparison

### Acceptance Scenarios Covered
1. User accesses conflicts view → all conflicts listed with identification ✓
2. User selects conflict → detailed comparison displayed (local vs Odoo) ✓
3. Multiple conflicts → can be filtered by status/type/model ✓

---

- [x] T010 [US1] Create ConflictsList frontend component in public/js/components/ConflictsList.js with methods: `load()`, `render()`, `filter(state, model)`, `onSelectConflict(id)`, displaying conflict table with columns: Model, Field, State, Created, Actions

- [x] T011 [P] [US1] Create ConflictDetail frontend component in public/js/components/ConflictDetail.js showing side-by-side JSON comparison of source_value vs target_value with metadata (write dates, state, model, record ID)

- [x] T012 [P] [US1] Implement GET /api/conflicts endpoint in src/api/routes/conflicts.js supporting query params: state, model, page (default 1), limit (default 50); returns paginated list with cursor for next page

- [x] T013 [P] [US1] Implement GET /api/conflicts/:id endpoint in src/api/routes/conflicts.js returning single conflict with full data including resolution (if exists) and lock status

- [x] T014 [US1] Integrate conflicts list and detail components in public/index.html by adding routes: `/conflicts` → ConflictsList, `/conflicts/:id` → ConflictDetail modal

---

## Phase 4: User Story 2 (P1) - Resolve Individual Conflicts

### Story Summary
Users need to resolve conflicts by choosing which version of the data is correct (local or Odoo) and apply that resolution.

### Independent Test Criteria
- [x] User can acquire lock on conflict (prevents concurrent resolution)
- [x] User can choose version (local or odoo) and mark as resolved
- [x] Apply triggers sync with automatic retry (3 attempts, exponential backoff)
- [x] Failed applications move conflict to "needs_manual_review" state with notification
- [x] UI prevents duplicate resolution on already-applied conflicts

### Acceptance Scenarios Covered
1. Conflict with two versions → user selects one → marked resolved ✓
2. Already resolved conflict → system prevents duplicate resolution ✓
3. Keep local → Odoo record updated with local data ✓
4. Keep odoo → local record updated with Odoo data ✓

---

- [x] T015 [US2] Implement POST /api/conflicts/:id/lock endpoint in src/api/routes/conflicts.js accepting {session_id} and calling ConflictLock.acquire(); returns 200 with lock details or 409 if already locked by another session

- [x] T016 [P] [US2] Implement POST /api/conflicts/:id/resolve endpoint in src/api/routes/conflicts.js accepting {chosen_version, session_id} and calling ConflictResolver.resolve(); updates sync_conflicts.state to 'resolved' and creates conflict_resolutions record

- [x] T017 [P] [US2] Implement POST /api/conflicts/:id/apply endpoint in src/api/routes/conflicts.js accepting {session_id} and calling RetryManager.applyWithRetry(); returns 202 (processing) then 200 on success or 409 with "needs_manual_review" state on failure after 3 retries

- [x] T018 [P] [US2] Implement DELETE /api/conflicts/:id/lock endpoint in src/api/routes/conflicts.js calling ConflictLock.release() and returning 204 No Content

- [x] T019 [P] [US2] Implement POST /api/conflicts/:id/retry endpoint in src/api/routes/conflicts.js for manual retry of "needs_manual_review" conflicts; calls RetryManager.applyWithRetry() again with reset retry_count

- [x] T020 [P] [US2] Create ResolutionForm frontend component in public/js/components/ResolutionForm.js with radio buttons (keep local | keep odoo), side-by-side comparison display, and apply button; calls POST /:id/lock → POST /:id/resolve → POST /:id/apply in sequence

- [x] T021 [P] [US2] Create NotificationPanel frontend component in public/js/components/NotificationPanel.js showing toast notifications for: auto-retry countdown (SE), user-correctable errors with detail (UC), unrecoverable errors with contact-support message (UR), success confirmations

- [x] T022 [US2] Integrate resolution workflow in public/index.html by adding: ConflictDetail modal → ResolutionForm modal on user action, real-time status updates during apply phase, lock warnings if another user resolving same conflict

---

## Phase 5: User Story 3 (P2) - Review and Understand Sync History

### Story Summary
Users need to review the complete history of sync operations to understand what changes occurred, when, and which records were affected.

### Independent Test Criteria
- [x] Sync history displays all operations with timestamps, operation type, affected record count
- [x] Detailed changes visible per operation (which records changed, what attributes changed)
- [x] History can be filtered by date range, model type, operation status
- [x] UI displays history in timeline or table format with expandable details

### Acceptance Scenarios Covered
1. Sync operations occurred → user accesses sync history → all operations displayed with timestamp/type/record count ✓
2. User selects sync operation → detailed changes visible ✓
3. History exists → user filters by date range → only operations in range displayed ✓

---

- [x] T023 [US3] Extend GET /api/history endpoint in src/api/routes/history.js (existing) to support query param: `filter=conflicts` to show only conflict-related operations; include conflict state transitions in response

- [x] T024 [P] [US3] Implement GET /api/history/:id/changes endpoint in src/api/routes/history.js returning detailed record-level changes for a specific sync operation: which records created/updated/deleted with before/after values

- [x] T025 [P] [US3] Create SyncHistoryPanel frontend component in public/js/components/SyncHistoryPanel.js displaying timeline or table of sync operations with: timestamp, operation count, status badge, expandable details showing affected records and resolutions

- [x] T026 [US3] Integrate history panel in public/index.html by adding tab/section in main dashboard displaying SyncHistoryPanel with filtering controls (date range picker, model filter, status filter)

---

## Phase 6: User Story 4 (P2) - Bulk Resolve Conflicts

### Story Summary
Users need to resolve multiple conflicts at once using a consistent rule to reduce manual work when conflicts follow a pattern.

### Independent Test Criteria
- [x] Bulk resolver can match conflicts by rule (model name, action: keep_local|keep_odoo)
- [x] Preview shows which conflicts would be affected without applying
- [x] Apply executes atomically - all matching conflicts resolved or none
- [x] Confirmation shows count resolved, already-resolved, and failed
- [x] UI prevents accidental bulk operations with confirmation dialog

### Acceptance Scenarios Covered
1. Multiple conflicts same type → user applies bulk rule → all matching conflicts resolved ✓
2. Bulk resolution applied → user reviews results → confirmation shows counts ✓

---

- [x] T027 [US4] Implement POST /api/conflicts/bulk-resolve endpoint in src/api/routes/conflicts.js accepting {rule: {model, field?, action}, dry_run} and calling BulkResolutionEngine.preview() or .apply(); returns preview with affected count or applied result with success/failure counts

- [x] T028 [P] [US4] Create BulkResolutionDialog frontend component in public/js/components/BulkResolutionDialog.js with: rule builder (model selector, field selector optional, action radio buttons), preview button showing matching count and sample conflicts, apply button with confirmation, results display (resolved count, already-resolved count, failed count)

- [x] T029 [US4] Integrate bulk resolver in public/index.html by adding "Bulk Resolve" button in conflicts header → opens BulkResolutionDialog modal; display bulk operation results in notification panel

---

## Phase 7: Polish & Cross-Cutting Concerns

### Phase Goal
Implement error handling, optimize performance, add tests, and ensure production readiness.

### Independent Test Criteria
- [x] Error messages are categorized (UC/SE/UR) and shown appropriately
- [x] Sensitive data not exposed in error logs
- [x] Pagination works for 1000+ conflicts in <2 seconds
- [x] Expired locks cleaned up automatically every minute
- [x] Unit tests cover state machine, error categorization, retry logic
- [x] All endpoints validate input and return proper error codes

---

- [x] T030 Implement error categorization in src/services/RetryManager.js by extending `_categorizeError()` to return 'user_correctable', 'system', or 'unrecoverable' based on error message patterns; map to error codes (UC-001-999, SE-001-999, UR-001-999)

- [x] T031 [P] Implement pagination support in src/api/routes/conflicts.js using cursor-based pagination: `?cursor=eyJpZCI6MzIsImNyZWF0ZWRfYXQiOiIyMDI2LTAxLTE5VDEwOjMwOjAwWiJ9` for efficient large dataset queries; ensure query with 1000+ conflicts returns in <2 seconds

- [x] T032 [P] Implement lock expiration cleanup job in src/services/ConflictLock.js by adding `cleanup()` method; register in app.js to run every 60 seconds and delete locks where expires_at < CURRENT_TIMESTAMP

- [x] T033 [P] Add comprehensive error handling in src/api/middleware/errorHandler.js (extend existing) to catch all thrown errors, categorize them, sanitize messages, log full details internally, return user-facing error with error code and timestamp

- [x] T034 [P] Sanitize sensitive data in error messages in src/utils/errorSanitizer.js by removing: Odoo API responses, stack traces, internal field values, SQL queries; allow only field names and validation messages in UC errors

- [x] T035 Write unit tests in tests/unit/ConflictResolver.test.js covering: state transitions (detected→resolved→applied→terminal), prevent double-resolution, categorize errors correctly, with Jest testing ≥80% code coverage

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)
**Target**: User Stories 1 & 2 (both P1 stories)

**MVP Deliverables**:
1. Users can view all conflicts in a list (US1)
2. Users can filter conflicts by state/model (US1)
3. Users can view side-by-side comparison of conflict versions (US1)
4. Users can resolve individual conflicts by choosing a version (US2)
5. System auto-retries failed applications with exponential backoff (US2)
6. Failed applications notify user and allow manual retry (US2)

**MVP Does NOT Include**: US3 history, US4 bulk resolve, error categorization UI, pagination

**Estimated MVP Effort**: 25-30 hours for experienced team

### Phase 2 (Post-MVP)
Add US3 (history) and US4 (bulk resolve) for complete feature delivery.

**Estimated Full Feature Effort**: 40-60 hours total

---

## Testing Strategy

### Test Categories

**Unit Tests** (Target: ≥80% coverage on critical paths):
- ConflictResolver state machine transitions (T006)
- RetryManager exponential backoff algorithm (T007)
- Error categorization logic (T030)
- BulkResolutionEngine rule matching (T008)

**Integration Tests**:
- Full resolution workflow: lock → resolve → apply → success/failure (T014-T022)
- Retry flow: apply → fail → retry → succeed (T017, T019)
- Bulk operation: preview → apply → verify all resolved (T027-T029)

**Contract Tests**:
- API response schemas match contracts/conflicts-api.md
- Error codes (UC/SE/UR) returned correctly
- Pagination cursor working for 1000+ items

**Manual/E2E Tests** (via browser):
- User can access /conflicts and see list
- User can click conflict and see comparison
- User can resolve and see real-time status
- User can bulk resolve with preview and confirmation

---

## Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| Conflicts list loads | <2 seconds | T012 |
| Single conflict resolves | <1 minute | T017 |
| Bulk resolve 100+ conflicts | <30 seconds | T027 |
| Code coverage (critical paths) | ≥80% | T035 |
| Test pass rate | 100% | T035 |
| Error handling accuracy | 100% (UC/SE/UR categorized correctly) | T030 |
| Concurrent lock prevention | 100% (no duplicate resolutions) | T015 |
| Sensitive data sanitization | 100% (no PII in error messages) | T034 |

---

## Task Checklist Summary

| Phase | Task Count | Estimated Hours |
|-------|-----------|-----------------|
| Phase 1a: Assumption Validation (blocking all) | 1 task | 4 hours |
| Phase 1b: Component PropTypes (blocking Phase 3) | 7 tasks | 6 hours |
| Phase 1c: Test-First Setup (blocking Phase 2) | 4 tasks | 8 hours |
| Phase 1: Setup & Database (after 1a-1c) | 5 tasks | 6 hours |
| Phase 2: Services | 4 tasks | 12 hours |
| Phase 3: US1 (View) | 5 tasks | 10 hours |
| Phase 4: US2 (Resolve) | 8 tasks | 18 hours |
| Phase 5: US3 (History) | 4 tasks | 8 hours |
| Phase 6: US4 (Bulk) | 3 tasks | 7 hours |
| Phase 7: Polish | 6 tasks | 8 hours |
| **TOTAL** | **47 tasks** | **97 hours** |

**MVP (US1 + US2)**: 34 tasks with setup/testing, ~53 hours (original MVP was 27 tasks, ~40 hours; additional 12 tasks ensure constitutional compliance)

---

## Notes for Implementers

### Critical Path & Blocking Dependencies

**NEW (Post-Remediation)**: Constitutional compliance phases must complete first:
1. **Phase 1a (T000)** is BLOCKING all other work: Validate assumptions from spec before proceeding
2. **Phase 1b (T001b-T001h)** blocks Phase 3: Define all component PropTypes before implementing frontend
3. **Phase 1c (T005a-T005d)** blocks Phase 2: Write failing test suites first (test-driven development), then implement services to pass tests
4. **Phase 1 (T001-T005)** can proceed in parallel with Phases 1b-1c: Database migrations needed for service testing in Phase 1c
5. **Phase 2 (T006-T009)** proceeds after Phase 1c tests defined: Implement services to pass test suites
6. **Phases 3-7**: User story work in priority order (US1 → US2 → US3 → US4)

### Parallelization Strategy

Within each phase, tasks marked with [P] can be done in parallel:
- **Phase 1a**: No parallelization (single assumption validation task)
- **Phase 1b**: All 7 PropTypes tasks (T001b-T001h) can be done in parallel
- **Phase 1c**: All 4 test suites (T005a-T005d) can be done in parallel
- **Phase 1**: T002-T005 can be done in parallel (T001 migrations must complete first)
- **Phase 2**: All service tasks (T006-T009) can be done in parallel
- **Phase 3-4**: All [P] marked tasks within each story can be done in parallel
- **Phase 7**: All [P] marked tasks can be done in parallel

### Test-First Workflow (Phase 1c)

1. Write failing tests for each service (T005a-d): Do NOT implement the service yet
2. Commit with message: `[T005a] Add failing tests for ConflictResolver`
3. Code review on test structure (business logic, not implementation)
4. In Phase 2, implement services to make tests pass (red-green-refactor)
5. Final code review on complete implementation

### Database Setup

1. **T001**: Run migrations to create all tables (sync_conflicts, conflict_resolutions, conflict_locks)
2. **T004**: Load test data (10+ conflicts for testing)
3. Phase 1c test suites (T005a-d) will use test database automatically
4. Phase 2 services will operate on test database during development

### Code Review & Commits

1. After each task completion, commit with format: `[T###] {description}` (e.g., `[T006] Implement ConflictResolver service`)
2. After completing a phase (or 3-5 related tasks), create PR for code review
3. Do NOT merge until review approval
4. Do NOT proceed to next blocking phase until current phase merged

### Git Workflow

- Create feature branch from `002-resolve-conflicts`
- Work on tasks in phase order (follow critical path)
- Push after each task or every 2-3 tasks
- Create PRs by phase: "Phase 1a: Assumption Validation", "Phase 1b: Component PropTypes", etc.
- Merge to `002-resolve-conflicts` after review
- No force pushes; rebase and merge preferred

---

**Generated**: 2026-01-19
**Ready for Implementation**: Yes
**MVP Path**: T001-T005 → T006-T009 → T010-T014 → T015-T022
