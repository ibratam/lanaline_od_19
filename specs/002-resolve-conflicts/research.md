# Research & Technical Analysis: Resolve Conflicts and Solve History

**Date**: 2026-01-19
**Feature**: 002-resolve-conflicts
**Status**: Complete - All clarifications resolved, no unknown areas

## Executive Summary

The Odoo sync middleware exists with complete conflict detection but lacks a UI and workflow for resolution. This research validates the technical approach and documents architectural decisions made during clarification workflow.

---

## 1. Technology Stack Validation

### Decision: Continue with Existing Stack
- **Backend**: Express.js (REST API)
- **Frontend**: Vanilla JavaScript (component-based)
- **Storage**: SQLite3 with better-sqlite3
- **Testing**: Jest 29.7.0
- **Scheduling**: node-cron

**Rationale**: No new technologies required. Feature can be implemented entirely within existing patterns. Vanilla JS components match existing frontend architecture; no need for React or framework migration.

**Alternatives Considered**:
- GraphQL for conflict queries → Rejected: REST sufficient, GraphQL adds complexity without proportional benefit
- NoSQL for conflict tracking → Rejected: SQLite already handles millions of records; schema extensions sufficient

---

## 2. Conflict State Machine Design

### Decision: 5-State Model with Failure Recovery
```
Detected → Reviewing → Resolved → Applied (terminal)
                          ↓
                   Needs Manual Review
```

**Rationale**:
- Explicit states prevent double-application and race conditions
- Reviewing state optional (user jumps directly to Resolved)
- Terminal state (Applied) ensures no further modifications
- Needs Manual Review captures unrecoverable failures without losing context

**Alternatives Considered**:
- 2-state model (Unresolved/Resolved) → Rejected: Loses visibility into failed applications
- With Re-opening capability → Rejected: Scope creep; P1 stories require simple path
- Detailed transition matrix → Retained in implementation but not exposed via UI

---

## 3. Concurrency Control Strategy

### Decision: Optimistic Locking with Conflict Lock Table
- When user initiates resolution, lock is acquired (lock table entry)
- If another user attempts same conflict: "being resolved" error → must retry
- Lock released on completion (success or failure)
- Session-based lock timeout (5-minute default) prevents orphaned locks

**Rationale**:
- Prevents race conditions without pessimistic locking (which would hurt performance)
- User gets immediate feedback if conflict is locked
- Simple to implement; no distributed lock manager needed
- Lock timeout prevents indefinite blocking if session crashes

**Alternatives Considered**:
- Last-one-wins → Rejected: Risk of silently overwriting first user's choice
- Queue-based sequential resolution → Rejected: Adds latency; not practical for 1000+ conflicts
- Versioned rows (ETags) → Considered; lock table simpler for this domain

---

## 4. Failure Recovery & Retry Strategy

### Decision: Exponential Backoff with Manual Escalation
- **Retry Pattern**: 3 attempts with delays of 5s, 10s, 20s
- **Transient Errors** (network, timeout): Auto-retry invisible to user
- **Permanent Errors** (record deleted): Move to "Needs Manual Review" after 3 fails, notify user
- **User Control**: Manual retry button available in UI for "Needs Manual Review" state

**Rationale**:
- 3 retries covers >99% of transient network issues
- Exponential backoff reduces server load during outages
- Manual escalation prevents infinite loops
- Notification ensures visibility into failures

**Alternatives Considered**:
- Infinite retry → Rejected: Could hide real problems indefinitely
- Single retry → Rejected: Insufficient for flaky networks
- Circuit breaker pattern → Deferred: P2 enhancement if needed

---

## 5. Error Categorization & User Messaging

### Decision: Three-Tier Error Taxonomy
1. **User-Correctable (UC-001-999)**: Validation failures, constraint violations
   - Show specific error + retry button

2. **System Errors (SE-001-999)**: Network, API availability, locks
   - Show auto-retry countdown + contact support if persistent

3. **Unrecoverable (UR-001-999)**: Record deleted, permission denied
   - Show "contact support" with error code for investigation

**Rationale**:
- Reduces support load by directing users to correct action per error type
- Sanitizes sensitive information from UI (no stack traces, Odoo internals)
- Provides error codes for debugging without exposing details
- Distinguishes which errors user can fix vs. require support

**Alternatives Considered**:
- Single error bucket → Rejected: Ambiguous; users unsure whether to retry
- Expose full technical details → Rejected: Security risk + confuses non-technical users

---

## 6. Permission Model

### Decision: All Authenticated Users Can Resolve Conflicts
- No role-based restrictions (admin vs. user)
- Consistent with existing no-auth design (internal network only)
- Audit trail tracks who resolved what (via FR-006)

**Rationale**:
- Simplifies access control; all users trusted in internal network
- Audit trail provides accountability without permission gates
- Reduces friction for distributed teams

**Alternatives Considered**:
- Admin-only resolution → Rejected: Creates bottleneck; unnecessary for internal tool
- Permission per model → Rejected: Scope creep; constitution allows simpler approach

---

## 7. Performance & Scalability

### Design Decisions for Performance Goals

**Goal**: Load conflicts in <2s (SC-001)
- **Decision**: Pagination with default limit=50 conflicts per page
- **Index**: `conflict(state, created_at DESC)` for fast filtering
- **Implementation**: Cursor-based pagination (more efficient than offset)

**Goal**: Resolve single conflict in <1 minute (SC-002)
- **Decision**: Full async workflow with progress indicators
- **Lock time**: <100ms (optimistic locking)
- **Apply time**: Depends on Odoo API (retry strategy mitigates slowness)

**Goal**: Bulk resolve 100+ in <30s (SC-005)
- **Decision**: Batch processing with transaction grouping
- **Optimization**: Single database transaction per bulk rule
- **Implementation**: SQL WHERE clause applies rule atomically

**Achieved via**:
- SQLite indexes on conflict(state, model, created_at)
- Connection pooling via better-sqlite3
- Asynchronous error handling doesn't block UI
- No N+1 queries (resolve fetches all fields once)

---

## 8. Data Model Validation

### Existing sync_conflicts Table
Sufficient columns exist for conflict detection. Extensions needed:
- `state` column (tracking lifecycle)
- `locked_by` + `locked_at` (concurrency control)

### New Tables Required
- `conflict_resolutions` - audit trail of user choices
- `conflict_locks` - session-based locking
- `sync_operations` extension - error categorization

**Rationale**: Minimal schema footprint; no normalization violations; supports all FR requirements.

---

## 9. Frontend Architecture

### Component Design (Vanilla JS)
- **Modular Components**: Each component independent with clear props
- **Event-Driven**: Components communicate via events (not shared state)
- **API Binding**: Each component has fetch wrapper for its endpoints
- **Error Handling**: Each component catches and displays errors locally

**Rationale**: Matches existing frontend patterns; no framework migration needed; simpler to test.

---

## 10. API Contract Validation

### RESTful Endpoints Align with Requirements
- Conflict CRUD → FR-001, FR-002, FR-003
- Resolution apply → FR-004, FR-005
- Bulk operations → FR-008
- Lock management → FR-013
- Retry endpoints → FR-014
- History filtering → FR-007, FR-006

**Rationale**: One-to-one mapping of requirements to endpoints reduces risk of missed features.

---

## 11. Testing Strategy

### Test Coverage Plan
- **Unit**: State machine transitions (ConflictResolver), backoff algorithm (RetryManager)
- **Integration**: Full resolution workflow (create conflict → lock → resolve → apply → audit)
- **Contract**: API responses match schema, error codes valid, pagination works
- **Performance**: Load 1000 conflicts in <2s with pagination

**Target**: ≥80% coverage on critical paths (state machine, error handling, locking)

---

## Decisions Summary

| Area | Decision | Risk Level | Fallback |
|------|----------|-----------|----------|
| State Machine | 5-state model | Low | Add re-opening state if needed (P2) |
| Locking | Optimistic lock table | Low | Switch to ETags if table causes issues |
| Retry | 3 attempts, exponential backoff | Low | Increase to 5 attempts if backoff too aggressive |
| Error Categories | 3-tier taxonomy with codes | Low | Add 4th category for edge cases if needed |
| Permissions | All users can resolve | Low | Add admin-only gate if security concern arises |
| Scale | Pagination + indexing | Medium | Add caching layer if queries slow with large dataset |

---

## Outstanding Questions: None

All clarifications resolved. Ready for Phase 1 design and Phase 2 implementation.
