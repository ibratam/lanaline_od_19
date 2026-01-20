# Task Breakdown: Fix Synchronization and Conflicts Feature

**Feature**: Fix Synchronization and Conflicts Feature
**Branch**: `003-fix-sync-conflicts`
**Spec**: [Feature Specification](./spec.md) | **Plan**: [Implementation Plan](./plan.md)

## Task Organization & Strategy

### User Stories (Priority Order)

| Priority | Story | Independent Test | Completion Dependency |
|----------|-------|------------------|----------------------|
| P1 | US1: Identify & Fix Sync Failures | Failed sync marked with diagnosis; user can retry after fix | Phase 3 (foundational services complete) |
| P1 | US2: Handle Conflict Resolution Failures | Failed resolution shows reason; user can retry after fix | Phase 4 (conflict recovery complete) |
| P2 | US3: Verify Data Consistency | Consistency check runs; detects and reports mismatches | Phase 5 (verification service complete) |
| P2 | US4: Monitor & Debug Sync Operations | Detailed logs visible; timing breakdown available | Phase 6 (logging complete) |

### Implementation Strategy

**MVP Scope**: User Story 1 (P1) + Foundational Services
- Sync failure diagnostics
- Error categorization (UC/SE/UR)
- Retry mechanism with smart backoff
- Core logging infrastructure

**Full Scope**: All 4 user stories + polish
- Conflict recovery with state reversibility
- Data consistency verification and repair
- Comprehensive operation logging and debugging
- Automatic table creation

**Parallelization**: US1 and US2 can be developed in parallel (separate error handling paths). US3 and US4 depend on core services from US1.

---

## Phase 1: Setup & Project Initialization

### Phase Goal
Initialize project structure, database schema updates, and core logging infrastructure for all downstream tasks.

### Independent Test Criteria
- Project structure created per plan
- Database migration runs successfully
- Winston logger configured and tested
- Core error classes defined and exportable

---

- [X] T001 Create database migration 004_add_sync_diagnostics.js in src/db/migrations/ with columns for error tracking, retry attempts, and state transitions
- [X] T002 Initialize Winston logger configuration in src/utils/logger.js with appropriate log levels and format for error categorization (UC/SE/UR)
- [X] T003 Create base error classes in src/api/middleware/errors.js: ValidationError, SystemError, UnrecoverableError extending from Error
- [X] T004 Create SyncFailure model in src/models/SyncFailure.js to track sync operations with error details, failure reason, and categorization
- [X] T005 [P] Create TableSchema model in src/models/TableSchema.js to manage table metadata for auto-creation with dependency resolution
- [X] T006 [P] Add initialization script in src/db/init.js to create new tables: sync_failures, table_schemas, inconsistencies

---

## Phase 2: Foundational Services

### Phase Goal
Build core services that all user stories depend on: error categorization, retry logic, state management, and logging infrastructure.

### Independent Test Criteria
- Error categorization works for UC/SE/UR
- Retry manager respects backoff strategy (4xx fail, 429/timeout backoff, 5xx once then review)
- Sync operation state machine transitions are valid
- Logging captures full operation lifecycle

---

- [ ] T007 Implement ErrorCategorizer service in src/services/ErrorCategorizer.js with methods to categorize errors (UC-001-999, SE-001-999, UR-001-999) based on error type, Odoo API code, and message patterns
- [ ] T008 Enhance RetryManager in src/services/RetryManager.js with smart retry strategy: 4xx → fail immediately, 429/timeout → exponential backoff (5s/10s/20s), 5xx → retry once then manual review
- [ ] T009 Create RetryHistory model in src/models/RetryHistory.js to track all retry attempts with timestamps, errors encountered, and user corrections
- [ ] T010 [P] Implement SyncOperationLogger in src/services/SyncOperationLogger.js to log all sync operations with timing, state transitions, phase breakdowns, and error details
- [ ] T011 [P] Enhance SyncEngine in src/services/SyncEngine.js to record operation start/end times, phase timing, and detailed state transitions for audit trail
- [ ] T012 Implement state machine validator in src/utils/stateValidator.js to enforce limited reversibility: Applied ↔ Failed Resolution, Needs Manual Review → Resolved (after user fixes)
- [ ] T013 Create SyncOperationStatus model in src/models/SyncOperationStatus.js to track: queued, running, completed, failed, needs_review with appropriate transitions and terminal states
- [ ] T014 Implement concurrency prevention in src/services/ConcurrencyManager.js to prevent duplicate sync operations using optimistic locking on sync_operations table

---

## Phase 3: User Story 1 - Identify and Fix Sync Failures (P1)

### Story Goal
Users can identify sync failures with clear diagnostics, understand root causes, and retry after making fixes.

### Independent Test Criteria
- Failed sync operation is marked with error category (UC/SE/UR) and specific reason
- Error message includes suggested corrective actions per error type
- User can access retry history for failed operations
- Retry respects smart backoff strategy and succeeds after fix

### Acceptance Scenarios
1. Failed sync marked with diagnosis; diagnostic info visible in UI
2. User applies fix (corrects validation, waits for network, etc.); retries sync; succeeds
3. Multiple failures show patterns (e.g., all related to specific field or record)

---

- [ ] T015 [US1] Create SyncFailureTracker in src/services/SyncFailureTracker.js to record sync failures with error category, affected records, root cause, and suggested corrections
- [ ] T016 [US1] Enhance POST /api/sync/execute endpoint in src/api/routes/sync.js to capture and categorize sync errors, store in SyncFailure model, return error code + category + suggested actions
- [ ] T017 [US1] Extend GET /api/sync/history endpoint to include error details, retry count, last_error, and suggested corrective actions per failure
- [ ] T018 [P] [US1] Implement POST /api/sync/retry endpoint in src/api/routes/sync.js to allow retry of failed sync with validation that user has had time to apply fixes
- [ ] T019 [P] [US1] Create ErrorDisplay component in src/public/js/components/ErrorDisplay.js to show error category, user-facing message, and suggested corrective actions in dashboard
- [ ] T020 [US1] Extend dashboard.html to add sync failures panel showing: operation status, error category, affected records, retry history, retry button
- [ ] T021 [US1] Add test scenario in tests/integration/syncFailureRecovery.test.js: Create failing sync, verify error displayed, apply fix, retry, verify success
- [ ] T022 [US1] Update tasks.md to mark T015-T021 as completed after implementation

---

## Phase 4: User Story 2 - Handle Conflict Resolution Failures (P1)

### Story Goal
Users understand why conflict resolutions fail, see clear recovery guidance, and can retry after fixing underlying data issues.

### Independent Test Criteria
- Failed resolution shows in "needs_manual_review" state with failure reason
- Suggested corrective actions are specific to the failure type
- User can retry after fixing data; retry succeeds
- State transitions respect limited reversibility (Applied → Failed Resolution, Needs Manual Review → Resolved)

### Acceptance Scenarios
1. Conflict resolution fails during apply; failure reason shown with suggestions
2. Conflict in needs_manual_review; user reviews suggestions, fixes data, retries, succeeds
3. Failed resolution with validation error; user corrects data; retry succeeds

---

- [ ] T023 [US2] Enhance ConflictResolver in src/services/ConflictResolver.js to implement limited state reversibility: Applied can transition to Failed Resolution if error detected during apply, Needs Manual Review can revert to Resolved after user fixes data
- [ ] T024 [US2] Create ConflictFailureHandler in src/services/ConflictFailureHandler.js to capture and categorize conflict resolution failures with suggested corrective actions (fix validation, update record data, resolve stale cache)
- [ ] T025 [US2] Extend POST /api/conflicts/{id}/resolve endpoint in src/api/routes/conflicts.js to: apply resolution, detect failures, move to needs_manual_review if 3 failed retries, notify user with specific actions
- [ ] T026 [US2] Create POST /api/conflicts/{id}/retry endpoint in src/api/routes/conflicts.js to allow retry of failed resolution after user has applied fixes; validate state machine transition
- [ ] T027 [P] [US2] Implement NotificationService extension in src/services/NotificationService.js to notify users when conflicts move to needs_manual_review with actionable next steps
- [ ] T028 [P] [US2] Create ResolutionRetryPanel component in src/public/js/components/ResolutionRetryPanel.js to show: failure reason, suggested actions, retry button, resolution history
- [ ] T029 [US2] Update conflicts.html dashboard to add resolution failures panel showing conflicts in needs_manual_review with suggested corrective actions
- [ ] T030 [US2] Add test scenario in tests/integration/conflictRecoveryTest.js: Resolve conflict, simulate failure, verify needs_manual_review state, user fixes data, retry, verify applied state
- [ ] T031 [US2] Update tasks.md to mark T023-T030 as completed after implementation

---

## Phase 5: User Story 3 - Verify Data Consistency After Sync (P2)

### Story Goal
Users can verify data consistency between local and Odoo, identify specific field mismatches, and get repair suggestions based on conflict categorization.

### Independent Test Criteria
- Consistency check runs for 1000+ records in <30 seconds
- Detects: data_mismatch, missing_record, extra_record inconsistencies
- Reports specific records/fields with inconsistencies
- Suggests repairs: keep_local, keep_odoo, manual_review

### Acceptance Scenarios
1. After sync, user runs consistency check; report shows status by data type
2. Inconsistencies detected; report shows specific records/fields with mismatches
3. User initiates repair; system suggests resolution options based on categorization

---

- [ ] T032 [US3] Create ConsistencyChecker service in src/services/ConsistencyChecker.js to: compare key fields (status, amount, date_modified) between local DB and Odoo, categorize mismatches (data_mismatch, missing_record, extra_record), store in data_inconsistencies table
- [ ] T033 [US3] Implement GET /api/consistency/check endpoint in src/api/routes/consistency.js to: run consistency verification, return report with affected record count, sample inconsistencies, categorization breakdown
- [ ] T034 [P] [US3] Create DataInconsistency model in src/models/DataInconsistency.js to store: record ID, field name, local value, odoo value, inconsistency type, suggested repair action
- [ ] T035 [P] [US3] Implement POST /api/consistency/repair endpoint to: apply suggested repair (keep_local updates Odoo, keep_odoo updates local, manual_review flags for user), track repair in audit log
- [ ] T036 [US3] Create ConsistencyReport component in src/public/js/components/ConsistencyReport.js to display: inconsistency breakdown by type, affected record count, detailed list of mismatches, repair options
- [ ] T037 [US3] Extend dashboard.html to add data consistency panel with: check button, consistency status, repair options, history
- [ ] T038 [US3] Add test scenario in tests/integration/consistencyVerification.test.js: Run consistency check, verify detection of mismatches, verify repair options, apply repair, verify consistency
- [ ] T039 [US3] Update tasks.md to mark T032-T038 as completed after implementation

---

## Phase 6: User Story 4 - Monitor and Debug Sync Operations (P2)

### Story Goal
Power users and administrators can access comprehensive logs showing sync operation details, timing breakdown, state transitions, and error details for troubleshooting.

### Independent Test Criteria
- Detailed logs available for sync operations with timing and transitions
- Each phase has timing breakdown (detection, resolution, apply, verification)
- Error details include categorization and full context
- Logs searchable by date, operation type, error category, affected records

### Acceptance Scenarios
1. Sync operation details show timing, state transitions, processing steps
2. Complex sync shows all internal steps logged with timestamps
3. Performance issues visible via timing breakdown showing which phase is slow

---

- [ ] T040 [US4] Create OperationLogger component in src/public/js/components/OperationLogger.js to display: sync operation logs, timing breakdown by phase, state transitions, error details with categorization
- [ ] T041 [US4] Implement GET /api/operations/{id}/logs endpoint in src/api/routes/operations.js to retrieve detailed logs for specific sync operation with full timing data and phase breakdown
- [ ] T042 [P] [US4] Enhance SyncOperationLogger to capture: phase start/end times, records processed per phase, errors per phase, cumulative timing for performance analysis
- [ ] T043 [P] [US4] Create OperationAnalyzer service in src/services/OperationAnalyzer.js to: parse operation logs, identify bottlenecks, suggest performance improvements based on phase timing
- [ ] T044 [US4] Extend dashboard.html to add operation monitoring panel with: log viewer, timing breakdown chart, phase performance analysis, bottleneck identification
- [ ] T045 [US4] Implement log search/filter in OperationLogger component: filter by date range, operation status, error category, affected records, specific error codes
- [ ] T046 [US4] Add test scenario in tests/integration/operationMonitoring.test.js: Run sync operation, verify logs captured, verify timing data complete, verify phase breakdown, verify error details
- [ ] T047 [US4] Update tasks.md to mark T040-T046 as completed after implementation

---

## Phase 7: Automatic Table Creation

### Phase Goal
Implement automatic table creation with dependency resolution to handle missing target tables gracefully.

### Independent Test Criteria
- Missing table detected within 5 seconds
- User notified with clear message and progress
- Table created with all dependencies (FKs, indexes, constraints) in <30 seconds
- Creation tracked in audit log with confirmation message

---

- [ ] T048 [P] Create TableCreator service in src/services/TableCreator.js to: detect missing target tables, discover schema from source, resolve dependencies (FK references, indexes), create tables with constraints
- [ ] T049 [P] Implement GET /api/tables/missing endpoint in src/api/routes/tables.js to identify missing target tables and their dependencies
- [ ] T050 Create TableCreationNotifier in src/services/TableCreationNotifier.js to: notify user of missing table, show creation progress, confirm successful creation with table name and column count
- [ ] T051 Enhance POST /api/sync/execute to: detect missing tables before sync, create missing tables with dependencies, notify user, then proceed with sync
- [ ] T052 [P] Create CreateTablePanel component in src/public/js/components/CreateTablePanel.js to show: missing table name, creation progress, estimated time, confirmation of successful creation
- [ ] T053 Create POST /api/tables/create endpoint to: initiate table creation, track progress, return status updates to frontend for real-time feedback
- [ ] T054 Create migration script in src/db/migrations/005_extend_table_metadata.js to add columns for tracking table creation attempts and dependencies
- [ ] T055 Add test scenario in tests/integration/tableAutoCreation.test.js: Detect missing table, initiate creation, verify table created with dependencies, verify audit log entry
- [ ] T056 Update tasks.md to mark T048-T055 as completed after implementation

---

## Phase 8: Polish & Cross-Cutting Concerns

### Phase Goal
Implement comprehensive error handling, security measures, performance optimization, and production readiness.

### Independent Test Criteria
- All endpoints return properly categorized errors with user-facing messages
- Error messages never expose sensitive data
- Rate limiting prevents API abuse
- Performance metrics meet targets
- Full audit trail for all operations
- Tests cover 80%+ of critical paths

---

- [ ] T057 [P] Enhance error handler middleware in src/api/middleware/errorHandler.js to: categorize all errors, sanitize sensitive data (remove Odoo API responses, SQL queries, file paths), log full details internally, return error code + user message
- [ ] T058 [P] Implement error sanitization in src/utils/errorSanitizer.js: remove PII, SQL patterns, API responses, credentials from all error messages shown to users
- [ ] T059 Create rate limiting middleware in src/api/middleware/rateLimiter.js to prevent API abuse: max 100 requests/min per operation type, exponential backoff for retry endpoints
- [ ] T060 [P] Implement comprehensive audit logging for all operations: sync start/end, conflict resolution, data repair, table creation, state transitions; store in audit_log table
- [ ] T061 [P] Add input validation in src/utils/validators.js: validate sync parameters, conflict IDs, repair actions, state transitions; prevent invalid operations early
- [ ] T062 Create rollback capability in src/services/RollbackManager.js for failed syncs: detect unexpected results, provide rollback endpoint, verify data consistency after rollback
- [ ] T063 [P] Optimize database queries: add indexes on sync_operations (status, created_at), conflict_resolutions (state, created_at), data_inconsistencies (record_id); profile slow queries
- [ ] T064 Add comprehensive unit tests in tests/unit/ for critical services: ErrorCategorizer, RetryManager, TableCreator, ConsistencyChecker; target 80%+ coverage
- [ ] T065 [P] Add contract tests in tests/contract/: sync-errors-api.test.js (error responses), conflict-recovery-api.test.js (state transitions), consistency-api.test.js (repair operations)
- [ ] T066 Create performance test in tests/performance/: verify consistency check <30s for 1000 records, verify table creation <30s, verify retry backoff meets targets
- [ ] T067 [P] Update documentation: Add API endpoint docs in /api/docs/, state machine diagrams, error code reference, troubleshooting guide
- [ ] T068 Create CHANGELOG.md documenting all new features, breaking changes, migration steps for existing systems
- [ ] T069 Add sample error codes reference in src/utils/errorCodes.js: UC-001-999, SE-001-999, UR-001-999 with descriptions and user-facing messages
- [ ] T070 Implement feature flags in src/config/features.js to enable/disable new capabilities: error_diagnostics, auto_table_creation, consistency_verification, operation_logging; allow testing without full deployment
- [ ] T071 Update tasks.md to mark T057-T070 as completed after implementation

---

## Dependency Graph

### Critical Path (Must Complete in Order)
```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2)
                                              ↓
                                         Phase 5 (US3)
                                              ↓
                                         Phase 6 (US4)
```

### Parallelization Opportunities

**Phase 1**: All tasks can run in parallel (independent DB/util setup)

**Phase 2**:
- T007-T009 (Error categorization + retry) can run in parallel with
- T010-T014 (Logging + state machine + concurrency)

**Phase 3 & 4**: Can partially overlap (different endpoints, independent services)
- T015-T020 (US1 sync failures) vs T023-T029 (US2 conflict failures) can be parallel

**Phase 5 & 6**: Sequential after Phase 2, but can parallelize within each:
- T032-T035 (ConsistencyChecker) vs T040-T043 (Logging)

**Phase 7**: Independent of Phase 5-6; can start after Phase 2

**Phase 8**: Can start after Phase 3 (error handling early), others after respective phases

### Recommended Parallel Execution Plan

**Iteration 1** (Establish foundation):
- Phase 1 (all tasks): 4 hours
- Phase 2 (all tasks): 6 hours
- **Subtotal**: 10 hours

**Iteration 2** (P1 stories - core MVP):
- Phase 3 (US1): 8 hours
- Phase 4 (US2): 8 hours in parallel → 8 hours total
- **Subtotal**: 8 hours

**Iteration 3** (P2 stories + infrastructure):
- Phase 5 (US3): 6 hours
- Phase 6 (US4): 6 hours in parallel → 6 hours total
- Phase 7 (Table creation): 6 hours in parallel → 6 hours total
- **Subtotal**: 6 hours

**Iteration 4** (Polish & completion):
- Phase 8 (all tasks): 10 hours
- **Subtotal**: 10 hours

**Total Estimated Time**: 34 hours (sequential) → 28 hours (with optimal parallelization)

---

## Implementation Strategy

### MVP (Minimum Viable Product)
**Scope**: User Story 1 (Identify & Fix Sync Failures) + Foundational Services
**Delivery**: Phase 1 + Phase 2 + Phase 3
**Value**: Users can identify sync failures, see clear diagnostics, retry after fixing issues
**Estimated**: 18 hours

### Incremental Delivery
1. **Release 1 (MVP)**: Phases 1-3 (sync failure diagnostics + retry) - 18 hours
2. **Release 2**: Phase 4 (conflict resolution recovery) - 8 hours
3. **Release 3**: Phases 5-6 (data verification + monitoring) - 12 hours
4. **Release 4**: Phase 7 + 8 (table creation + polish) - 16 hours

### Risk Mitigation
- **State Machine Complexity**: Implement and test state transitions early (Phase 2, T012)
- **Data Consistency**: Design ConsistencyChecker carefully with sampling strategy (Phase 5, T032)
- **Backward Compatibility**: Keep new fields optional; existing code continues working
- **Performance**: Profile queries early; index heavily used tables before go-live
- **Error Messages**: User-test error messages; ensure clarity without technical jargon

---

## Task Execution Checklist

After each phase completes, verify:

- [ ] All tasks in phase marked [x] in this file
- [ ] Code committed with clear messages referencing task IDs
- [ ] Tests pass for completed tasks
- [ ] Documentation updated for user-facing changes
- [ ] Code review completed; PR merged to branch
- [ ] No regressions in existing functionality

---

## Success Metrics

✓ **Feature Complete When**:
- All 71 tasks completed and tested
- 80%+ test coverage for critical services
- Error messages user-tested and clear
- Performance meets targets (consistency <30s, creation <30s)
- Full audit trail for all operations
- Documentation complete (API docs, troubleshooting guide, error codes)
- Zero critical bugs in QA testing
- One successful production deployment

---

**Generated**: 2026-01-20 | **Branch**: `003-fix-sync-conflicts` | **Status**: Ready for Implementation
