# API Contracts: Conflict Resolution

**Version**: 1.0
**Date**: 2026-01-19
**Base URL**: `/api/conflicts`

---

## Conflict Resource Schema

```json
{
  "Conflict": {
    "id": "number",
    "model_name": "string (e.g., 'product.product')",
    "record_id": "number",
    "field_name": "string or null (null = structural conflict)",
    "source_value": "object (JSON)",
    "target_value": "object (JSON)",
    "source_write_date": "ISO8601 datetime",
    "target_write_date": "ISO8601 datetime",
    "state": "enum: 'detected' | 'reviewing' | 'resolved' | 'applied' | 'needs_manual_review'",
    "locked_by": "number or null",
    "locked_at": "ISO8601 datetime or null",
    "created_at": "ISO8601 datetime",
    "updated_at": "ISO8601 datetime",
    "resolution": "ConflictResolution or null (if resolved)"
  },
  "ConflictResolution": {
    "id": "number",
    "conflict_id": "number",
    "chosen_version": "enum: 'local' | 'odoo'",
    "resolved_at": "ISO8601 datetime",
    "applied_at": "ISO8601 datetime or null",
    "retry_count": "number (0-3)",
    "last_error": "string or null",
    "last_error_category": "enum: 'user_correctable' | 'system' | 'unrecoverable' | null",
    "next_retry_at": "ISO8601 datetime or null"
  }
}
```

---

## Endpoints

### 1. List Conflicts (with Pagination & Filtering)

**Request**:
```
GET /api/conflicts?state=detected&model=product.product&page=1&limit=50
```

**Query Parameters**:
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| state | enum | all | Filter by state (detected\|reviewing\|resolved\|applied\|needs_manual_review\|*) |
| model | string | all | Filter by model name (e.g., 'product.product') |
| page | number | 1 | Page number (1-based) |
| limit | number | 50 | Records per page (max 200) |
| sort | string | -created_at | Sort by field (created_at, updated_at, etc.) |

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": 1,
      "model_name": "product.product",
      "record_id": 42,
      "field_name": "list_price",
      "source_value": 99.99,
      "target_value": 109.99,
      "state": "detected",
      "locked_by": null,
      "created_at": "2026-01-19T10:30:00Z",
      "updated_at": "2026-01-19T10:30:00Z",
      "resolution": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 237,
    "pages": 5,
    "next_cursor": "eyJpZCI6MzIsImNyZWF0ZWRfYXQiOiIyMDI2LTAxLTE5VDEwOjMwOjAwWiJ9"
  }
}
```

**Error** (400 Bad Request):
```json
{
  "error": "Invalid state filter",
  "code": "VALIDATION_ERROR"
}
```

---

### 2. Get Single Conflict

**Request**:
```
GET /api/conflicts/:id
```

**Response** (200 OK):
```json
{
  "data": {
    "id": 1,
    "model_name": "product.product",
    "record_id": 42,
    "field_name": "list_price",
    "source_value": 99.99,
    "target_value": 109.99,
    "source_write_date": "2026-01-18T15:45:00Z",
    "target_write_date": "2026-01-19T08:00:00Z",
    "state": "detected",
    "locked_by": null,
    "locked_at": null,
    "created_at": "2026-01-19T10:30:00Z",
    "updated_at": "2026-01-19T10:30:00Z",
    "resolution": null
  }
}
```

**Error** (404 Not Found):
```json
{
  "error": "Conflict not found",
  "code": "NOT_FOUND"
}
```

---

### 3. Acquire Lock

**Request**:
```
POST /api/conflicts/:id/lock
Content-Type: application/json

{
  "session_id": "abc123xyz789"
}
```

**Response** (200 OK):
```json
{
  "data": {
    "conflict_id": 1,
    "locked_at": "2026-01-19T10:35:00Z",
    "expires_at": "2026-01-19T10:40:00Z"
  }
}
```

**Error** (409 Conflict):
```json
{
  "error": "Conflict is being resolved by another user",
  "code": "CONFLICT_LOCKED",
  "locked_by": 5,
  "locked_at": "2026-01-19T10:34:00Z"
}
```

**Error** (410 Gone):
```json
{
  "error": "Conflict has already been resolved",
  "code": "CONFLICT_RESOLVED",
  "resolution": {
    "chosen_version": "local",
    "resolved_at": "2026-01-19T10:34:00Z"
  }
}
```

---

### 4. Resolve Conflict (User Selects Version)

**Request**:
```
POST /api/conflicts/:id/resolve
Content-Type: application/json

{
  "chosen_version": "local",
  "session_id": "abc123xyz789"
}
```

**Request Body**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| chosen_version | enum | Yes | 'local' or 'odoo' |
| session_id | string | Yes | Must match lock session |

**Response** (200 OK):
```json
{
  "data": {
    "id": 1,
    "state": "resolved",
    "resolution": {
      "id": 5,
      "conflict_id": 1,
      "chosen_version": "local",
      "resolved_at": "2026-01-19T10:35:30Z",
      "applied_at": null,
      "retry_count": 0
    }
  }
}
```

**Error** (400 Bad Request):
```json
{
  "error": "Invalid version choice",
  "code": "VALIDATION_ERROR",
  "details": "chosen_version must be 'local' or 'odoo'"
}
```

**Error** (409 Conflict):
```json
{
  "error": "Lock session mismatch or expired",
  "code": "LOCK_INVALID"
}
```

---

### 5. Apply Resolution (Execute Sync)

**Request**:
```
POST /api/conflicts/:id/apply
Content-Type: application/json

{
  "session_id": "abc123xyz789"
}
```

**Response** (202 Accepted - Processing):
```json
{
  "data": {
    "id": 1,
    "state": "applying",
    "resolution": {
      "conflict_id": 1,
      "chosen_version": "local",
      "resolved_at": "2026-01-19T10:35:30Z",
      "applied_at": null,
      "retry_count": 0
    },
    "status": "Syncing to Odoo (attempt 1/3)..."
  }
}
```

**Response** (200 OK - Completed Successfully):
```json
{
  "data": {
    "id": 1,
    "state": "applied",
    "resolution": {
      "conflict_id": 1,
      "chosen_version": "local",
      "resolved_at": "2026-01-19T10:35:30Z",
      "applied_at": "2026-01-19T10:36:15Z",
      "retry_count": 0
    }
  }
}
```

**Error** (202 Accepted - Retrying):
```json
{
  "data": {
    "id": 1,
    "state": "resolved",
    "resolution": {
      "conflict_id": 1,
      "chosen_version": "local",
      "last_error": "Network timeout",
      "last_error_category": "system",
      "retry_count": 1,
      "next_retry_at": "2026-01-19T10:36:10Z"
    },
    "status": "Auto-retrying in 5 seconds... (attempt 2/3)"
  }
}
```

**Error** (409 Conflict - Give Up):
```json
{
  "error": "Failed to apply after 3 retries",
  "code": "APPLY_FAILED",
  "data": {
    "id": 1,
    "state": "needs_manual_review",
    "resolution": {
      "conflict_id": 1,
      "chosen_version": "local",
      "last_error": "Record no longer exists in Odoo",
      "last_error_category": "unrecoverable",
      "retry_count": 3
    }
  }
}
```

---

### 6. Bulk Resolve Conflicts

**Request**:
```
POST /api/conflicts/bulk-resolve
Content-Type: application/json

{
  "rule": {
    "model": "product.product",
    "field": null,
    "action": "keep_local"
  },
  "dry_run": false
}
```

**Request Body**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| rule.model | string | Yes | Model name to match |
| rule.field | string | No | Field name (null = all fields of model) |
| rule.action | enum | Yes | 'keep_local' or 'keep_odoo' |
| dry_run | boolean | No | If true, shows preview without applying |

**Response** (200 OK - Dry Run):
```json
{
  "data": {
    "dry_run": true,
    "rule": {
      "model": "product.product",
      "action": "keep_local"
    },
    "matching_conflicts": 42,
    "preview": [
      {
        "id": 1,
        "field_name": "list_price",
        "will_apply_version": "local",
        "current_state": "detected"
      }
    ]
  }
}
```

**Response** (200 OK - Applied):
```json
{
  "data": {
    "rule": {
      "model": "product.product",
      "action": "keep_local"
    },
    "resolved_count": 42,
    "already_resolved_count": 3,
    "failed_count": 1,
    "details": {
      "resolved": [1, 2, 3, ...],
      "already_resolved": [101, 102],
      "failed": [205]
    }
  }
}
```

**Error** (400 Bad Request):
```json
{
  "error": "Invalid bulk rule",
  "code": "VALIDATION_ERROR",
  "details": "action must be 'keep_local' or 'keep_odoo'"
}
```

---

### 7. Release Lock

**Request**:
```
DELETE /api/conflicts/:id/lock
Content-Type: application/json

{
  "session_id": "abc123xyz789"
}
```

**Response** (204 No Content):
```
(empty body)
```

**Error** (404 Not Found):
```json
{
  "error": "Lock not found for this conflict",
  "code": "NOT_FOUND"
}
```

---

### 8. Manual Retry

**Request**:
```
POST /api/conflicts/:id/retry
Content-Type: application/json

{
  "session_id": "abc123xyz789"
}
```

**Response** (202 Accepted):
```json
{
  "data": {
    "id": 1,
    "state": "applying",
    "resolution": {
      "retry_count": 1,
      "next_retry_at": null
    },
    "status": "Retrying application..."
  }
}
```

**Error** (410 Gone):
```json
{
  "error": "Conflict is already applied",
  "code": "CONFLICT_RESOLVED"
}
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": "Additional context (optional)",
  "timestamp": "2026-01-19T10:36:00Z"
}
```

### Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| NOT_FOUND | 404 | Conflict not found |
| CONFLICT_LOCKED | 409 | Conflict being edited by another user |
| CONFLICT_RESOLVED | 410 | Conflict already resolved/applied |
| LOCK_INVALID | 409 | Session lock mismatch or expired |
| APPLY_FAILED | 409 | Failed to apply after retries |
| INTERNAL_ERROR | 500 | Server error |

---

## State Diagram (API Perspective)

```
GET / → [detected, resolved, needs_manual_review]
  ↓
POST /:id/lock → acquire lock
  ↓
POST /:id/resolve → state → "resolved"
  ↓
POST /:id/apply → (attempt sync)
  ↓
  ├─→ Success → state → "applied" (terminal)
  ├─→ Retry → auto-retry 3x, show countdown
  └─→ Unrecoverable → state → "needs_manual_review"
       ↓
    POST /:id/retry → re-attempt from "needs_manual_review"
```

---

## Rate Limiting

No explicit rate limiting (internal network). However, bulk operations are throttled:
- Max 1 bulk-resolve per minute
- Max 100 conflicts per bulk operation
- Concurrent lock limit: 10 per session

---

## Testing Checklist

- [ ] GET / returns paginated list with cursor
- [ ] GET /:id returns full conflict with resolution (if resolved)
- [ ] POST /:id/lock prevents concurrent resolution (409)
- [ ] POST /:id/resolve updates state + creates resolution record
- [ ] POST /:id/apply returns 202 (processing) then 200 (success) or 409 (failed)
- [ ] Bulk resolve with dry_run shows preview without side effects
- [ ] Bulk resolve applies atomically (all or nothing)
- [ ] DELETE /:id/lock cleans up lock
- [ ] POST /:id/retry works only from needs_manual_review state
- [ ] Error messages are sanitized (no internal details in user-facing messages)
