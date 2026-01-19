# Research Phase: Odoo 19 Database Synchronization Middleware

**Date**: 2026-01-19
**Status**: Phase 0 Complete
**Purpose**: Resolve all technical clarifications for implementation planning

---

## 1. Odoo RPC Integration for Node.js

### Decision: Use `odoo-jsonrpc` library

**Rationale**:
- Native JSON-RPC 2.0 support (Odoo 19 standard)
- Promise-based API (modern async/await support)
- Active maintenance and good error handling
- Well-documented for Odoo integration
- Supports authentication and session management

**Alternatives Considered**:
- **odoo-rpc-client**: Good but XML-RPC focused (legacy)
- **Manual xmlrpc2**: Too low-level, would require custom session management
- **REST API wrapper**: Odoo RPC is more reliable than REST for bulk operations

**Implementation Details**:
- Wrap in OdooClient service class for abstraction
- Implement connection pooling for performance
- Add retry logic for transient failures
- Implement timeout handling for large record batches

---

## 2. SQLite Database Choice

### Decision: Use `better-sqlite3` for core operations + `sqlite3` for async contexts

**Rationale**:
- `better-sqlite3`: Synchronous API perfect for transactional sync operations
  - Guarantees atomic operations (commit/rollback in single transaction)
  - No callback hell, cleaner error handling
  - Better performance for frequent small queries

- `sqlite3`: Async API for non-blocking history queries
  - Prevents blocking on large history exports
  - Suitable for web requests where latency is acceptable

**Alternatives Considered**:
- **TypeORM**: Overkill for embedded database, adds complexity
- **Sequelize**: Better suited for multi-database projects
- **Pure sqlite3**: Callback-based, harder to manage transactions

**Implementation Details**:
- Use `better-sqlite3` for sync transaction management
- Use `sqlite3` wrapper for async queries in API handlers
- Migrations handled via SQL schema versioning

---

## 3. Task Scheduling in Node.js

### Decision: Use `node-cron` for scheduled synchronization

**Rationale**:
- Simple, lightweight cron expression syntax
- No external database required (schedules stored in app SQLite)
- Perfect for small-scale task management
- Easy timezone support via `moment-timezone`
- Reliable for production use (Odoo compatible)

**Alternatives Considered**:
- **Agenda**: Requires MongoDB/external DB (adds dependency)
- **Bull**: Redis-based (adds infrastructure complexity)
- **node-schedule**: Less flexible than cron expressions

**Implementation Details**:
- Store cron expressions in SQLite (SyncSchedule model)
- Load active schedules on app startup
- Fire scheduled jobs in separate async context (non-blocking)
- Log all scheduled executions to history

---

## 4. Configuration Encryption & Secrets Management

### Decision: Hybrid approach - dotenv + file-based encryption

**Rationale**:
- **Environment Variables** (.env file):
  - Deploy-time secrets (Odoo DB URLs, credentials)
  - Not committed to version control
  - Easy to manage in Docker/production environments

- **Application-Level Encryption**:
  - Stored database configurations encrypted at rest in SQLite
  - Use `crypto` built-in Node.js module (no external dependency)
  - AES-256 encryption for credentials
  - Encryption key from environment variable

**Alternatives Considered**:
- **AWS Secrets Manager**: Overkill for self-hosted middleware
- **Vault**: Too complex for internal network use case
- **Plain text config**: Security risk

**Implementation Details**:
- Store encryption key in `.env` (MIDDLEWARE_SECRET_KEY)
- Encrypt/decrypt on read-write to database
- Never log or display decrypted credentials
- Rotate encryption key documented in deployment guide

---

## 5. API Contract Format

### Decision: OpenAPI 3.0 specification

**Rationale**:
- Industry standard for REST API documentation
- Machine-readable for automated testing
- Excellent tooling (Swagger UI, code generation)
- Supports all required endpoint definitions
- Frontend can auto-generate API clients

**Alternatives Considered**:
- **GraphQL**: Overkill for simple CRUD + sync operations
- **AsyncAPI**: Not suitable for REST API
- **Custom JSON spec**: Reinventing wheel, less tooling

**Implementation Details**:
- Generate OpenAPI spec in `contracts/openapi.yaml`
- Each endpoint includes request/response schemas
- Automated contract testing via Supertest

---

## 6. Frontend Architecture - No Framework Approach

### Decision: Vanilla JavaScript + HTML5 with modular components

**Rationale**:
- **Lightweight**: No build step, minimal dependencies
- **No Login Required**: Static HTML with embedded JS works out-of-box
- **Modular**: Vanilla JS supports component patterns (constructor functions + encapsulation)
- **Fast Loading**: Single page, ~50KB total (HTML + CSS + JS)
- **Maintainable**: Easy to understand, no framework learning curve

**Alternatives Considered**:
- **React**: Overkill for single-page UI, requires build tools, adds 100KB+ bundle
- **Vue/Svelte**: Similar overhead as React
- **jQuery**: Dated approach, not component-oriented

**Implementation Details**:
- Organize code as modules (ConfigForm.js, PreviewDisplay.js, etc.)
- Each component exports constructor & methods
- Central apiClient handles all backend communication
- Form validation before API calls
- Graceful degradation (works even if JS fails to load)

---

## 7. Testing Framework

### Decision: Jest + Supertest for Node.js backend

**Rationale**:
- **Jest**: Zero-config, fast, excellent coverage reporting
- **Supertest**: Perfect for Express.js API testing
- **Mock Support**: Great for mocking Odoo RPC calls
- **Test Organization**: Clear separation of unit/integration/contract tests

**Alternatives Considered**:
- **Mocha + Chai**: More verbose, requires more setup
- **Jasmine**: Good but Jest is more modern
- **Cypress**: For frontend (not primary focus here)

**Implementation Details**:
- Contract tests: Validate API responses match OpenAPI spec
- Integration tests: Full sync workflows with mock Odoo data
- Unit tests: Individual services (conflict detection, data preservation)
- Coverage target: ≥80% for critical paths

---

## 8. Deployment Model

### Decision: Docker containerization (optional but recommended)

**Rationale**:
- Reproducible environment (Node.js LTS + dependencies)
- Easy deployment on any Linux server
- Volume mounting for persistent SQLite database
- Environment variable injection for secrets

**Alternatives Considered**:
- **Bare Metal**: Possible but requires manual dependency management
- **PM2 Process Manager**: Good for standalone, less isolation than Docker

**Implementation Details**:
- Single-stage Dockerfile (lightweight, ~200MB final image)
- Volume mount for `/app/data/` (persist SQLite database)
- Environment variables for configuration
- Health check endpoint for monitoring

---

## Summary of Decisions

| Decision | Choice | Key Reason |
|----------|--------|-----------|
| Odoo SDK | odoo-jsonrpc | JSON-RPC 2.0, Promise-based, modern |
| Database | better-sqlite3 + sqlite3 | Transactional integrity + async flexibility |
| Scheduling | node-cron | Lightweight, cron expressions, no external DB |
| Encryption | Hybrid (env + app-level) | Balance security and simplicity |
| API Spec | OpenAPI 3.0 | Industry standard, excellent tooling |
| Frontend | Vanilla JS | Lightweight, no framework overhead, modular |
| Testing | Jest + Supertest | Zero-config, great for Express, excellent coverage |
| Deployment | Docker (optional) | Reproducibility and isolation |

---

## Phase 1 Readiness

✅ All technical clarifications resolved
✅ Technology stack finalized
✅ Architecture decisions documented
✅ Rationale provided for all choices

**Next Step**: Generate data-model.md, API contracts, and quickstart.md in Phase 1.
