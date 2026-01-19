---

description: "Task list for Odoo 19 Database Synchronization Middleware implementation"

---

# Tasks: Odoo 19 Database Synchronization Middleware

**Input**: Design documents from `/specs/001-odoo-sync-middleware/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, contracts/, research.md

**Tests**: Contract tests (Jest + Supertest) and integration tests are REQUIRED per Constitution Principle III (Test-Driven Development).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- All paths assume Node.js project structure with Express.js backend + vanilla JS frontend

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure: src/, tests/, data/ directories with package.json
- [x] T002 [P] Initialize Node.js project with dependencies: express, dotenv, better-sqlite3, sqlite3, node-cron, winston, jest, supertest in package.json
- [x] T003 [P] Create .env.example with NODE_ENV, PORT, HOST, MIDDLEWARE_SECRET_KEY, DB_PATH, LOG_LEVEL
- [x] T004 [P] Create .gitignore excluding node_modules/, .env, data/*, coverage/
- [x] T005 Create src/app.js with Express app initialization, middleware setup, error handling
- [x] T006 [P] Create src/utils/logger.js with winston structured logging configuration
- [x] T007 [P] Create src/utils/encryption.js with AES-256 encrypt/decrypt functions for credentials
- [x] T008 [P] Create src/utils/validators.js with input validation functions (URL, database name, email, etc.)
- [x] T009 Create jest.config.js with test suite configuration (unit, integration, contract paths)
- [x] T010 Create README.md with deployment instructions, prerequisites, and usage overview

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Create src/db/schema.sql with all database tables: database_connections, sync_runs, sync_conflicts, sync_operations, sync_schedules, sync_errors
- [x] T012 Create src/models/DatabaseConnection.js with CRUD operations (create, read, update, delete, test connection)
- [x] T013 [P] Create src/models/SyncRun.js with query and insert methods for sync execution records
- [x] T014 [P] Create src/models/SyncConflict.js with conflict logging and retrieval methods
- [x] T015 [P] Create src/models/SyncSchedule.js with schedule CRUD operations
- [x] T016 [P] Create src/models/SyncError.js with error logging methods
- [x] T017 Create src/services/ConfigManager.js with encrypted storage/retrieval of database configurations
- [x] T018 Create src/db/init.js that initializes SQLite database, runs schema.sql on first launch
- [x] T019 Create src/api/middleware/errorHandler.js for centralized error handling and validation
- [x] T020 [P] Create src/api/middleware/requestLogger.js for request/response logging via winston
- [x] T021 Create src/utils/database.js with SQLite connection pool and transaction management
- [x] T022 Create src/services/OdooClient.js wrapper around odoo-jsonrpc for Odoo RPC communication (connect, search, read, write operations)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Configure Source and Target Databases (Priority: P1) 🎯 MVP

**Goal**: Allow administrators to securely configure connections to two Odoo databases

**Independent Test**: Configure two test Odoo databases (or mock connections) via web UI and verify connection status without triggering sync

### Contract Tests for User Story 1 (REQUIRED - TDD)

- [x] T023 [P] [US1] Contract test: POST /api/config saves database connection in tests/contract/config.test.js
- [x] T024 [P] [US1] Contract test: GET /api/config/{id} retrieves connection with password masked in tests/contract/config.test.js
- [x] T025 [P] [US1] Contract test: PUT /api/config/{id} updates connection in tests/contract/config.test.js
- [x] T026 [P] [US1] Contract test: DELETE /api/config/{id} deletes connection in tests/contract/config.test.js
- [x] T027 [P] [US1] Contract test: GET /api/config/test validates connectivity without saving in tests/contract/config.test.js
- [x] T028 [US1] Integration test: Full config workflow (save source, save target, test both) in tests/integration/configWorkflow.test.js

### Implementation for User Story 1

- [x] T029 [P] [US1] Create src/api/routes/config.js with GET /api/config, POST /api/config, PUT /api/config/{id}, DELETE /api/config/{id}
- [x] T030 [P] [US1] Create src/api/routes/config.js GET /api/config/test endpoint for connectivity validation
- [x] T031 [US1] Create src/public/js/components/ConfigForm.js - UI component for entering database credentials (source/target)
- [x] T032 [US1] Create src/public/js/services/apiClient.js - HTTP client for frontend API calls
- [x] T033 [US1] Create src/public/index.html - main UI page with tab navigation (Config, Preview, Sync, History, Schedules)
- [x] T034 [US1] Create src/public/css/styles.css - minimal CSS styling for forms and tables (no framework)
- [x] T035 [US1] Create src/public/js/components/ConnectionsList.js - display component showing configured connections
- [x] T036 [US1] Add connection validation in ConfigForm.js: test button shows success/failure before saving
- [x] T037 [US1] Add password encryption when saving: call ConfigManager.saveConnection() with encrypted password
- [x] T038 [US1] Add password masking in GET responses: return "••••••••" instead of actual password
- [x] T039 [US1] Unit test: src/utils/encryption.js encrypt/decrypt functions in tests/unit/encryption.test.js
- [x] T040 [US1] Unit test: ConfigManager.saveConnection() and ConfigManager.getConnection() in tests/unit/ConfigManager.test.js

**Checkpoint**: User Story 1 complete - two Odoo databases can be configured and tested

---

## Phase 4: User Story 2 - Preview and Validate Synchronization Scope (Priority: P1)

**Goal**: Display what data will sync and identify conflicts before execution

**Independent Test**: Configure databases (US1) → click preview → see sync scope report without changes to either database

### Contract Tests for User Story 2 (REQUIRED - TDD)

- [x] T041 [P] [US2] Contract test: POST /api/sync/preview generates preview in tests/contract/sync.test.js
- [x] T042 [P] [US2] Contract test: /api/sync/preview returns records to create/update/delete counts in tests/contract/sync.test.js
- [x] T043 [P] [US2] Contract test: /api/sync/preview detects and returns conflicts with field diffs in tests/contract/sync.test.js
- [x] T044 [US2] Integration test: Preview with conflicts detected in tests/integration/previewWorkflow.test.js

### Implementation for User Story 2

- [x] T045 [P] [US2] Create src/services/SyncEngine.js with compareRecords() method to detect create/update/delete operations
- [x] T046 [P] [US2] Create src/services/ConflictDetector.js with detectConflicts() to identify field differences between databases
- [x] T047 [US2] Create src/api/routes/sync.js POST /api/sync/preview endpoint
- [x] T048 [US2] Implement preview logic: fetch all records from source, compare with target, generate diff report
- [x] T049 [US2] Create src/public/js/components/PreviewDisplay.js - UI component showing preview report (creates, updates, deletes, conflicts)
- [x] T050 [US2] Add conflict expansion UI: click conflict → show source vs target field values with original IDs and dates
- [x] T051 [US2] Create src/public/js/utils/formatters.js - format sync counts and timestamps for display
- [x] T052 [US2] Unit test: ConflictDetector.detectConflicts() with mock data in tests/unit/ConflictDetector.test.js
- [x] T053 [US2] Unit test: SyncEngine.compareRecords() with test records in tests/unit/SyncEngine.test.js

**Checkpoint**: User Story 2 complete - administrators can preview sync scope and conflicts

---

## Phase 5: User Story 3 - Execute Synchronization with Rollback Capability (Priority: P1)

**Goal**: Execute sync, preserve IDs/dates, display progress, enable rollback

**Independent Test**: Configure (US1) → Preview (US2) → Execute sync → verify records sync'd correctly with original IDs/dates preserved

### Contract Tests for User Story 3 (REQUIRED - TDD)

- [x] T054 [P] [US3] Contract test: POST /api/sync/execute starts sync in tests/contract/sync.test.js
- [x] T055 [P] [US3] Contract test: GET /api/sync/status returns progress (current_model, records_processed, %) in tests/contract/sync.test.js
- [x] T056 [P] [US3] Contract test: POST /api/sync/rollback reverses changes in tests/contract/sync.test.js
- [x] T057 [US3] Integration test: Full sync workflow with data preservation in tests/integration/fullSyncWorkflow.test.js
- [x] T058 [US3] Integration test: Sync with rollback reverting changes in tests/integration/rollback.test.js

### Implementation for User Story 3

- [x] T059 [P] [US3] Create src/services/DataPreserver.js with preserveRecordMetadata() to maintain original IDs, create_date, write_date
- [x] T060 [US3] Enhance SyncEngine.js with executeSync() method implementing atomic sync transaction
- [x] T061 [US3] Create src/services/HistoryLogger.js logging each sync operation with duration, status, error tracking
- [x] T062 [US3] Create src/api/routes/sync.js POST /api/sync/execute endpoint that spawns async sync process
- [x] T063 [US3] Create src/api/routes/sync.js GET /api/sync/status endpoint returning real-time progress
- [x] T064 [US3] Create src/api/routes/sync.js POST /api/sync/rollback endpoint (rolls back last completed sync)
- [x] T065 [US3] Implement sync execution: OdooClient.search() all records, identify differences, OdooClient.write() to target with preserved metadata
- [x] T066 [US3] Implement atomic transaction: wrap sync in SQLite transaction, commit on success, rollback on error
- [x] T067 [US3] Create rollback logic: restore target database to pre-sync state using SyncRun.operations log
- [x] T068 [US3] Create src/public/js/components/ProgressMonitor.js - live progress display (current_model, records_processed, %)
- [x] T069 [US3] Add progress polling in frontend: apiClient polls /api/sync/status every 1 second during sync
- [x] T070 [US3] Create src/public/js/components/SyncResults.js - summary display (created/updated/deleted counts, errors, duration)
- [x] T071 [US3] Unit test: DataPreserver.preserveRecordMetadata() with various record types in tests/unit/DataPreserver.test.js
- [x] T072 [US3] Unit test: SyncEngine.executeSync() with mock Odoo clients in tests/unit/SyncEngine.test.js

**Checkpoint**: User Story 3 complete - Full synchronization flow works end-to-end with data preservation

---

## Phase 6: User Story 4 - Configure Automatic Scheduled Synchronization (Priority: P2)

**Goal**: Set up recurring syncs (cron-based) that execute automatically

**Independent Test**: Create daily schedule → verify next run time → manually trigger time to verify execution

### Contract Tests for User Story 4 (REQUIRED - TDD)

- [x] T073 [P] [US4] Contract test: POST /api/schedule creates schedule in tests/contract/schedule.test.js
- [x] T074 [P] [US4] Contract test: GET /api/schedule lists all schedules in tests/contract/schedule.test.js
- [x] T075 [P] [US4] Contract test: PUT /api/schedule/{id} updates schedule in tests/contract/schedule.test.js
- [x] T076 [P] [US4] Contract test: DELETE /api/schedule/{id} removes schedule in tests/contract/schedule.test.js
- [x] T077 [P] [US4] Contract test: POST /api/schedule/{id}/toggle enables/disables schedule in tests/contract/schedule.test.js
- [x] T078 [US4] Integration test: Schedule creation and execution in tests/integration/scheduledExecution.test.js

### Implementation for User Story 4

- [x] T079 [P] [US4] Create src/services/ScheduleManager.js with startScheduler(), stopScheduler(), addSchedule() using node-cron
- [x] T080 [P] [US4] Enhance ScheduleManager with loadSchedulesOnStartup() to restore active schedules from database
- [x] T081 [US4] Create src/api/routes/schedule.js with GET /api/schedule, POST /api/schedule, PUT /api/schedule/{id}, DELETE /api/schedule/{id}
- [x] T082 [US4] Create src/api/routes/schedule.js POST /api/schedule/{id}/toggle endpoint
- [x] T083 [US4] Implement cron validation: validate frequency string is valid cron expression (5-part format)
- [x] T084 [US4] Implement schedule preview: calculate next 5 scheduled run times from frequency + timezone
- [x] T085 [US4] Create src/public/js/components/ScheduleEditor.js - UI component for creating/editing schedules (frequency dropdown, time picker, timezone)
- [x] T086 [US4] Add frequency options: hourly, daily, weekly, monthly, custom cron expression
- [x] T087 [US4] Add timezone selector using IANA timezone list
- [x] T088 [US4] Add email notification configuration in ScheduleEditor (optional email for error alerts)
- [x] T089 [US4] Create src/services/NotificationService.js for sending error alerts (email or in-app notification)
- [x] T090 [US4] When scheduled sync encounters errors: call NotificationService to send alert to configured recipients
- [x] T091 [US4] Unit test: ScheduleManager.addSchedule() with various cron expressions in tests/unit/ScheduleManager.test.js
- [x] T092 [US4] Unit test: Cron expression validation in tests/unit/ScheduleManager.test.js

**Checkpoint**: User Story 4 complete - Recurring syncs can be scheduled and execute automatically

---

## Phase 7: User Story 5 - Monitor Synchronization History (Priority: P2)

**Goal**: View past synchronizations with audit trail and export capability

**Independent Test**: Execute multiple syncs (manual + scheduled) → view history → verify all details logged → export to CSV/JSON

### Contract Tests for User Story 5 (REQUIRED - TDD)

- [x] T093 [P] [US5] Contract test: GET /api/history returns list with pagination in tests/contract/history.test.js
- [x] T094 [P] [US5] Contract test: GET /api/history/{id} returns sync details with conflicts/errors in tests/contract/history.test.js
- [x] T095 [P] [US5] Contract test: GET /api/history/export exports as CSV/JSON in tests/contract/history.test.js
- [x] T096 [US5] Integration test: History display and export in tests/integration/historyWorkflow.test.js

### Implementation for User Story 5

- [x] T097 [P] [US5] Create src/api/routes/history.js with GET /api/history endpoint (supports limit, offset, status, triggered_by filters)
- [x] T098 [P] [US5] Create src/api/routes/history.js with GET /api/history/{id} endpoint returning detailed sync info
- [x] T099 [P] [US5] Create src/api/routes/history.js with GET /api/history/export endpoint (format: csv or json query param)
- [x] T100 [US5] Create src/public/js/components/HistoryTable.js - UI component displaying sync history with pagination
- [x] T101 [US5] Add history filters: status dropdown (pending, running, completed, failed, rolled_back), trigger type (manual, scheduled)
- [x] T102 [US5] Add sync detail modal: click row → show full details (affected models, record counts per model, errors, timestamps)
- [x] T103 [US5] Add export button: export current filtered history as CSV or JSON file
- [x] T104 [US5] Implement CSV export: format sync_runs table as CSV with headers and all fields
- [x] T105 [US5] Implement JSON export: format as JSON array of sync run objects with related conflicts/errors
- [x] T106 [US5] Unit test: HistoryLogger.logSyncOperation() in tests/unit/HistoryLogger.test.js

**Checkpoint**: User Story 5 complete - Full audit trail with history viewing and export

---

## Phase 8: User Story 6 - Configure Selective Model Synchronization (Priority: P3)

**Goal**: Allow filtering which Odoo models to sync (e.g., only res.partner, product.product)

**Independent Test**: Configure model filter → preview shows only selected models → sync only syncs selected models

### Contract Tests for User Story 6 (REQUIRED - TDD)

- [x] T107 [P] [US6] Contract test: /api/sync/preview with model_filter returns only selected models in tests/contract/sync.test.js
- [x] T108 [P] [US6] Contract test: /api/sync/execute with model_filter syncs only selected models in tests/contract/sync.test.js

### Implementation for User Story 6

- [x] T109 [P] [US6] Enhance SyncEngine to support model_filter parameter
- [x] T110 [P] [US6] Modify OdooClient.search() to filter by model names if model_filter provided
- [x] T111 [US6] Create src/public/js/components/ModelSelector.js - UI component for selecting which models to sync (multi-select)
- [x] T112 [US6] Add model filter to PreviewDisplay: show which models will be synced
- [x] T113 [US6] Add model filter to SyncEditor: option to select specific models or sync all
- [x] T114 [US6] Unit test: SyncEngine with model_filter in tests/unit/SyncEngine.test.js

**Checkpoint**: User Story 6 complete - Selective model synchronization enabled

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final quality, optimization, security hardening, documentation

- [ ] T115 [P] Performance test: Sync 100,000 records should complete in <5 minutes in tests/performance/syncLoad.test.js
- [ ] T116 [P] Security test: Verify credentials never logged or exposed in logs in tests/security/credentialHandling.test.js
- [ ] T117 [P] Security test: Verify SQL injection prevention (parameterized queries) in tests/security/sqlInjection.test.js
- [ ] T118 [P] Security test: Verify XSS prevention (no unescaped HTML in responses) in tests/security/xss.test.js
- [ ] T119 [P] Add comprehensive error messages for common failure scenarios in src/utils/errors.js
- [ ] T120 [P] Add request/response logging for all API endpoints via winston
- [ ] T121 [P] Create Docker setup: Dockerfile, docker-compose.yml for containerized deployment
- [ ] T122 [P] Create deployment documentation: README.md section on Docker, PM2, production setup
- [ ] T123 [P] Code coverage report: Run `npm run test:coverage` and verify ≥80% for critical paths (SyncEngine, ConflictDetector, DataPreserver)
- [ ] T124 [P] Add comprehensive test fixtures in tests/fixtures/ (mock Odoo data, test database states)
- [ ] T125 Run full test suite: `npm test` - all tests pass (unit, integration, contract)
- [ ] T126 Run linting: Add eslint configuration, fix any linting errors
- [ ] T127 Update quickstart.md with actual deployment steps and troubleshooting for production
- [ ] T128 Update README.md with architecture overview and contribution guidelines
- [ ] T129 Create CONTRIBUTING.md with development setup and testing requirements
- [ ] T130 Tag initial release: git tag v1.0.0, verify all tests pass on clean checkout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 completion (needs configured databases)
- **User Story 3 (P1)**: Depends on US2 completion (needs preview working)
- **User Story 4 (P2)**: Depends on US3 completion (needs sync logic working)
- **User Story 5 (P2)**: Depends on US3 completion (needs sync runs to log)
- **User Story 6 (P3)**: Depends on US3 completion (filters existing sync logic)

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before UI components
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks (Phase 1) can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, P1 stories can be distributed across team:
  - Developer A: US1 (Configuration)
  - Developer B: US2 (Preview) - waits for US1
  - Developer C: US3 (Execution) - waits for US2
  - After US3, US4/US5 can proceed in parallel
- All tests for a story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on sequentially within one developer's context

---

## Parallel Example: User Story 1

```bash
# Launch all contract tests for User Story 1 together:
Task: T023 - Contract test POST /api/config
Task: T024 - Contract test GET /api/config/{id}
Task: T025 - Contract test PUT /api/config/{id}
Task: T026 - Contract test DELETE /api/config/{id}
Task: T027 - Contract test GET /api/config/test

# Launch all implementation tasks for User Story 1 (after tests fail):
Task: T029 - Create config routes
Task: T030 - Create test endpoint
Task: T031 - [P] Create ConfigForm component
Task: T032 - [P] Create API client
Task: T033 - [P] Create index.html
Task: T034 - [P] Create styles.css
Task: T035 - [P] Create ConnectionStatus component
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Database Configuration)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

**MVP Deliverable**: Administrators can configure two Odoo databases and test connectivity

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo (Core feature)
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Add User Story 6 → Test independently → Deploy/Demo
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (~2-3 days)
2. Once Foundational is done:
   - Developer A: User Story 1 (3-4 days)
   - Developer B: Prepares to start US2 (parallel setup)
3. When US1 done:
   - Developer B: User Story 2 (2-3 days)
   - Developer A: Starts US3 prep
4. When US2 done:
   - Developer A: User Story 3 (3-4 days)
   - Developer B: Starts US4
5. Stories US4-US6 proceed in parallel or sequence based on team capacity

---

## Notes

- [P] tasks = different files, no dependencies (can be parallelized)
- [Story] label = US1-US6, maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD approach per Constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- **All tests are REQUIRED** (TDD mandatory per Constitution Principle III)
- **Contract tests come first** (define API before implementing)
- **All code MUST be reviewable** before merge (per Constitution Principle II)
