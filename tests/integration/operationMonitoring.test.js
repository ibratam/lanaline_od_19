/**
 * Integration Test: Operation Monitoring and Logging
 * Tests: Run sync operation, verify logs captured, verify timing data, analyze operations
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Operation Monitoring Integration Tests', () => {
  let app;
  let db;
  let dbInstance;
  let syncOperationId;

  beforeAll(async () => {
    process.env.MIDDLEWARE_SECRET_KEY = 'a'.repeat(32);
    process.env.LOG_LEVEL = 'error';

    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.db;
    dbInstance = db.getDB();
  });

  afterAll(async () => {
    if (db && db.close) {
      db.close();
    }
  });

  beforeEach(async () => {
    // Create a test sync operation with timing data
    const opStmt = dbInstance.prepare(`
      INSERT INTO sync_operations (
        source_db_id, target_db_id, odoo_model, operation_type,
        record_count, error_count, duration_ms, status,
        error_code, error_category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = opStmt.run(
      1, 2, 'sales.order', 'sync',
      1000, 5, 45000, 'completed',
      null, null
    );
    syncOperationId = result.lastInsertRowid;

    // Create test status transitions
    const statusStmt = dbInstance.prepare(`
      INSERT INTO sync_operation_status (
        sync_operation_id, previous_status, status, created_at
      ) VALUES (?, ?, ?, datetime('now'))
    `);

    statusStmt.run(syncOperationId, null, 'queued');
    statusStmt.run(syncOperationId, 'queued', 'running');
    statusStmt.run(syncOperationId, 'running', 'completed');

    // Create test retry history
    const retryStmt = dbInstance.prepare(`
      INSERT INTO retry_history (
        sync_operation_id, error_code, error_category,
        error_message, created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `);

    retryStmt.run(syncOperationId, 'SE-001', 'system', 'Network timeout');

    // Create test failures
    const failuresStmt = dbInstance.prepare(`
      INSERT INTO sync_failures (
        sync_operation_id, odoo_model, record_id,
        error_code, error_category, error_message,
        failure_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    failuresStmt.run(
      syncOperationId, 'sales.order', 101,
      'UC-001', 'user_correctable',
      'Validation error: amount_total is required',
      'Invalid record data'
    );

    failuresStmt.run(
      syncOperationId, 'sales.order', 102,
      'SE-002', 'system',
      'Odoo connection error',
      'Network issue'
    );
  });

  describe('Operations Logs Endpoint', () => {
    it('should retrieve detailed logs for a specific operation', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('phases');
      expect(response.body.data).toHaveProperty('state_transitions');
      expect(response.body.data).toHaveProperty('error');
      expect(response.body.data).toHaveProperty('failures');
      expect(response.body.data).toHaveProperty('retries');
    });

    it('should return operation summary', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const summary = response.body.data.summary;
      expect(summary.id).toBe(syncOperationId);
      expect(summary.status).toBe('completed');
      expect(summary.odoo_model).toBe('sales.order');
      expect(summary.record_count).toBe(1000);
      expect(summary.error_count).toBe(5);
      expect(summary.duration_ms).toBe(45000);
    });

    it('should include phase breakdown', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const phases = response.body.data.phases;
      expect(phases).toBeDefined();
      expect(Object.keys(phases).length).toBeGreaterThan(0);
    });

    it('should include state transitions', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const transitions = response.body.data.state_transitions;
      expect(Array.isArray(transitions)).toBe(true);
      expect(transitions.length).toBeGreaterThan(0);
      expect(transitions[0]).toHaveProperty('from');
      expect(transitions[0]).toHaveProperty('to');
      expect(transitions[0]).toHaveProperty('at');
    });

    it('should include failures list', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const failures = response.body.data.failures;
      expect(Array.isArray(failures)).toBe(true);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0]).toHaveProperty('error_code');
      expect(failures[0]).toHaveProperty('error_category');
    });

    it('should return error for non-existent operation', async () => {
      const response = await request(app)
        .get('/api/operations/99999/logs')
        .expect(404);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'OPERATIONS_001');
      expect(response.body).toHaveProperty('message', 'Operation not found');
    });
  });

  describe('Operation Analysis Endpoint', () => {
    it('should analyze operation for bottlenecks and recommendations', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/analysis`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('operation_id', syncOperationId);
      expect(response.body.data).toHaveProperty('total_duration_ms');
      expect(response.body.data).toHaveProperty('total_records');
      expect(response.body.data).toHaveProperty('total_errors');
      expect(response.body.data).toHaveProperty('retry_count');
      expect(response.body.data).toHaveProperty('failure_count');
    });

    it('should calculate performance metrics', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/analysis`)
        .expect(200);

      const analysis = response.body.data;
      expect(analysis.throughput).toBeDefined();
      expect(analysis.error_rate).toBeDefined();
      expect(parseFloat(analysis.throughput)).toBeGreaterThan(0);
    });

    it('should identify bottlenecks', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/analysis`)
        .expect(200);

      const bottlenecks = response.body.data.bottlenecks;
      expect(Array.isArray(bottlenecks)).toBe(true);
    });

    it('should provide recommendations', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/analysis`)
        .expect(200);

      const recommendations = response.body.data.recommendations;
      expect(Array.isArray(recommendations)).toBe(true);

      if (recommendations.length > 0) {
        const rec = recommendations[0];
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('message');
        expect(rec).toHaveProperty('priority');
      }
    });

    it('should return error for non-existent operation', async () => {
      const response = await request(app)
        .get('/api/operations/99999/analysis')
        .expect(404);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'OPERATIONS_001');
    });
  });

  describe('Timing Data Verification', () => {
    it('should include accurate timing data in logs', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const summary = response.body.data.summary;
      expect(summary.duration_ms).toBe(45000);
    });

    it('should capture phase durations', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const phases = response.body.data.phases;
      Object.values(phases).forEach(phase => {
        if (phase.duration_ms) {
          expect(typeof phase.duration_ms).toBe('number');
          expect(phase.duration_ms).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should show timestamp for each state transition', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const transitions = response.body.data.state_transitions;
      transitions.forEach(transition => {
        expect(transition.at).toBeDefined();
        const transitionDate = new Date(transition.at);
        expect(transitionDate).toBeInstanceOf(Date);
        expect(transitionDate.getTime()).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Details Verification', () => {
    it('should include error details when operation has errors', async () => {
      // Create a failed operation
      const failedOpStmt = dbInstance.prepare(`
        INSERT INTO sync_operations (
          source_db_id, target_db_id, odoo_model, operation_type,
          record_count, error_count, duration_ms, status,
          error_code, error_category, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = failedOpStmt.run(
        1, 2, 'account.invoice', 'sync',
        500, 50, 30000, 'failed',
        'SE-005', 'system', 'Connection timeout'
      );

      const response = await request(app)
        .get(`/api/operations/${result.lastInsertRowid}/logs`)
        .expect(200);

      const error = response.body.data.error;
      expect(error).toBeDefined();
      expect(error.category).toBe('system');
      expect(error.message).toBe('Connection timeout');
    });

    it('should categorize error types correctly', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const failures = response.body.data.failures;
      expect(failures.some(f => f.error_category === 'user_correctable')).toBe(true);
      expect(failures.some(f => f.error_category === 'system')).toBe(true);
    });
  });

  describe('Failure and Retry Tracking', () => {
    it('should track retry history', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const retries = response.body.data.retries;
      expect(Array.isArray(retries)).toBe(true);
      expect(retries.length).toBeGreaterThan(0);
    });

    it('should track detailed failures', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const failures = response.body.data.failures;
      expect(failures.length).toBe(2);

      // Verify first failure
      expect(failures[0].error_code).toBe('UC-001');
      expect(failures[0].error_category).toBe('user_correctable');
      expect(failures[0].record_id).toBe(101);

      // Verify second failure
      expect(failures[1].error_code).toBe('SE-002');
      expect(failures[1].error_category).toBe('system');
      expect(failures[1].record_id).toBe(102);
    });
  });

  describe('Data Consistency in Logs', () => {
    it('should maintain consistency between summary and details', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const data = response.body.data;

      // Summary should match operation data
      expect(data.summary.record_count).toBe(1000);
      expect(data.summary.error_count).toBe(5);
      expect(data.summary.duration_ms).toBe(45000);
    });

    it('should include all required fields in response', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const requiredFields = ['summary', 'phases', 'state_transitions', 'error', 'failures', 'retries', 'inconsistencies'];
      requiredFields.forEach(field => {
        expect(response.body.data).toHaveProperty(field);
      });
    });
  });

  describe('Response Format and Metadata', () => {
    it('should return properly formatted response', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include timestamp in response', async () => {
      const response = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should analyze operation for multiple operations', async () => {
      // Create a second operation
      const op2Stmt = dbInstance.prepare(`
        INSERT INTO sync_operations (
          source_db_id, target_db_id, odoo_model, operation_type,
          record_count, error_count, duration_ms, status,
          error_code, error_category, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      op2Stmt.run(1, 2, 'purchase.order', 'sync', 500, 2, 20000, 'completed', null, null);

      // Both operations should be retrievable
      const response1 = await request(app)
        .get(`/api/operations/${syncOperationId}/logs`)
        .expect(200);

      expect(response1.body.data.summary.record_count).toBe(1000);
    });
  });
});
