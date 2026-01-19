# Feature Specification: Resolve Conflicts and Solve History

**Feature Branch**: `002-resolve-conflicts`
**Created**: 2026-01-19
**Status**: Draft
**Input**: User description: "resolve conflicts and solve history"

## Clarifications

### Session 2026-01-19

- Q: Should different user roles have different conflict resolution permissions? → A: All authenticated users can view and resolve any conflict (no role-based restrictions)
- Q: What are the possible states a conflict can transition through? → A: Detected → Reviewing (optional) → Resolved → Applied (terminal). Failed applications revert to Resolved state.
- Q: How should concurrent resolution attempts on the same conflict be handled? → A: Lock conflict during resolution; second user sees "conflict is being resolved" error and must retry.
- Q: What should happen if a resolved conflict fails to sync to Odoo? → A: Auto-retry 3 times with exponential backoff (5s, 10s, 20s); if all fail, move to "Needs Manual Review" state and notify user.
- Q: How should different error types be categorized and communicated? → A: User-Correctable (show specific error, allow retry), System (show auto-retry message), Unrecoverable (show "contact support" message).

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Identify and View Conflicting Records (Priority: P1)

Users need to see what conflicts exist in their Odoo sync history so they can understand which records have discrepancies between the local database and Odoo.

**Why this priority**: Core foundation - users cannot resolve conflicts without first knowing they exist. This is the prerequisite for all conflict resolution.

**Independent Test**: Can be fully tested by viewing a dashboard/list of conflicts and verifying each conflict displays the source record, conflicting record, and the nature of the conflict (data mismatch, missing record, etc.)

**Acceptance Scenarios**:

1. **Given** conflicting records exist in the sync history, **When** user accesses the conflicts view, **Then** all conflicts are listed with clear identification of affected records
2. **Given** a conflict exists, **When** user selects a conflict, **Then** detailed comparison is displayed (original value vs. conflicting value)
3. **Given** multiple conflicts exist, **When** user views the conflict list, **Then** conflicts can be filtered by status, type, or record

---

### User Story 2 - Resolve Individual Conflicts (Priority: P1)

Users need to resolve conflicts by choosing which version of the data is correct (local or Odoo) and apply that resolution.

**Why this priority**: Core functionality - without ability to resolve, the conflicts remain unresolved. This directly delivers value by clearing conflict state.

**Independent Test**: Can be fully tested by resolving a single conflict and verifying the chosen version is applied and the conflict status changes to resolved.

**Acceptance Scenarios**:

1. **Given** a conflict exists with two versions available, **When** user selects one version as the correct one, **Then** that version is applied and the conflict is marked as resolved
2. **Given** a conflict is resolved, **When** user attempts to resolve it again, **Then** system prevents duplicate resolution or clearly indicates it's already resolved
3. **Given** conflicting data, **When** user chooses to keep the local version, **Then** the Odoo record is updated with the local data
4. **Given** conflicting data, **When** user chooses to keep the Odoo version, **Then** the local record is updated with the Odoo data

---

### User Story 3 - Review and Understand Sync History (Priority: P2)

Users need to review the complete history of sync operations to understand what changes occurred, when, and which records were affected.

**Why this priority**: Important for audit trail and understanding past operations, but not blocking other functionality. Users can still work while this is not fully implemented.

**Independent Test**: Can be fully tested by viewing a timestamped history of all sync operations with record changes, timestamps, and operation status (success/failure/conflict).

**Acceptance Scenarios**:

1. **Given** sync operations have occurred, **When** user accesses sync history, **Then** all operations are displayed with timestamp, operation type, and affected record count
2. **Given** a sync operation in history, **When** user selects it, **Then** detailed changes for that operation are visible (which records changed, what changed about them)
3. **Given** sync history exists, **When** user filters by date range, **Then** only operations within that range are displayed

---

### User Story 4 - Bulk Resolve Conflicts (Priority: P2)

Users need to resolve multiple conflicts at once using a consistent rule to reduce manual work when conflicts follow a pattern.

**Why this priority**: Nice-to-have efficiency improvement. Users can resolve conflicts one by one if needed, but bulk resolution improves efficiency.

**Independent Test**: Can be fully tested by applying a rule (e.g., "keep local version for all Product conflicts") and verifying all matching conflicts are resolved accordingly.

**Acceptance Scenarios**:

1. **Given** multiple conflicts exist with the same type, **When** user applies a bulk resolution rule (e.g., "keep local for Product records"), **Then** all matching conflicts are resolved
2. **Given** a bulk resolution is applied, **When** user reviews the results, **Then** confirmation shows count of resolved conflicts and any that couldn't be resolved automatically

### Edge Cases

**Conflict State Edge Cases**:
- What happens when a conflict is resolved but the subsequent sync operation encounters the same conflict again? (System should detect and flag as duplicate)
- How does the system handle conflicts where both versions are identical (ghost conflicts)? (System should mark as auto-resolved and not require user action)
- What if a user attempts to resolve a conflict while another user is modifying the same record? (Lock conflict during resolution; second user gets "being resolved" error)
- How are conflicts handled if the external record (in Odoo) is deleted after a conflict is detected but before resolution? (Unrecoverable error; show "record no longer exists, contact support")

**Error Scenarios**:
- Network timeout during sync attempt → System error, auto-retry with notification
- Odoo API returns validation error (e.g., "Sales amount must be > 0") → User-Correctable, show specific error with retry option
- Local database constraint violation → Unrecoverable, show "cannot apply due to local constraint, contact support"
- Concurrent modification: record changed in Odoo during resolution window → System should detect version mismatch, revert to "Resolved" state, notify user

**Scale Edge Cases**:
- What happens when sync history becomes very large (thousands of operations)? (Implement pagination and filtering to manage performance)

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST identify and track all conflicts between local records and Odoo records during sync operations
- **FR-002**: System MUST display conflicting records with clear comparison of the two versions (local vs. Odoo)
- **FR-003**: System MUST allow users to select which version (local or Odoo) is the correct one for any conflict
- **FR-004**: System MUST apply the user's resolution choice and update the appropriate record(s) accordingly
- **FR-005**: System MUST mark resolved conflicts so they are not presented as unresolved
- **FR-006**: System MUST maintain a complete audit trail of all sync operations with timestamps and details of what changed
- **FR-007**: System MUST allow users to filter sync history by date range, record type, operation status, or other relevant criteria
- **FR-008**: System MUST provide a way to bulk-resolve conflicts that match specified criteria (e.g., all conflicts of a certain type)
- **FR-009**: System MUST prevent users from resolving a conflict that has already been resolved
- **FR-010**: System MUST handle edge cases where a conflict resolution fails (e.g., record no longer exists) with appropriate error messaging
- **FR-011**: System MUST allow all authenticated users to view and resolve conflicts without role-based restrictions
- **FR-012**: System MUST track conflict state transitions (Detected → Reviewing → Resolved → Applied) and revert failed applications back to Resolved state
- **FR-013**: System MUST implement conflict locking to prevent concurrent resolution attempts; when a conflict is locked, other users attempting to resolve it MUST receive a "conflict is being resolved" error message
- **FR-014**: System MUST automatically retry failed sync operations up to 3 times with exponential backoff (5s, 10s, 20s); if all retries fail, move conflict to "Needs Manual Review" state and notify the user
- **FR-015**: System MUST categorize all resolution failures into three types and display appropriate user-facing messages: (1) User-Correctable errors (e.g., validation failures) with specific details and retry option, (2) System errors (e.g., network timeout) with auto-retry notification, (3) Unrecoverable errors (e.g., record deleted) with "contact support" guidance

### Key Entities *(include if feature involves data)*

- **Conflict**: Represents a discrepancy between a local record and its Odoo counterpart, including both versions of the data, conflict type, and current state. State lifecycle: Detected → Reviewing (optional) → Resolved → Applied (terminal) OR Needs Manual Review (if sync retries fail). Failed applications revert to Resolved state awaiting retry.
- **Sync Operation**: A historical record of a sync event including timestamp, operation type (push/pull), affected records, and outcome
- **Resolution**: The user's choice to keep either the local or Odoo version of conflicting data, with timestamp and user information

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: Users can view all existing conflicts within 2 seconds of loading the conflicts interface
- **SC-002**: Users can resolve a single conflict in under 1 minute (identify the right version, make the choice, apply it)
- **SC-003**: 100% of conflicts have a resolution path available (no conflicts are unresolvable)
- **SC-004**: Sync history displays all operations with complete accuracy - no sync operation is missing or misrepresented
- **SC-005**: Users can bulk-resolve 100+ conflicts in under 30 seconds when using bulk resolution rules
- **SC-006**: System achieves 99.9% accuracy in conflict detection - false positives should be less than 0.1%
- **SC-007**: All resolved conflicts remain resolved across subsequent sync cycles (no re-emergence of the same conflict)

## Assumptions

- The system already has a working Odoo sync mechanism that can detect conflicts
- Users have appropriate permissions to view and resolve conflicts
- Conflicts are stored in a queryable format with both versions of the data available
- The system can differentiate between data-level conflicts (different values) and structural conflicts (missing records)
- Users are reasonably familiar with their data and can make informed decisions about which version is correct
- Performance is measured from user action to UI update completion
