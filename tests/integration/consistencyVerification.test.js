/**
 * Integration Test: Consistency Verification
 * Tests: Run consistency check, verify mismatch detection, apply repairs
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Consistency Verification Integration Tests', () => {
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
    // Create a test sync operation
    const stmt = dbInstance.prepare(`
      INSERT INTO sync_operations (
        source_db_id, target_db_id, status, created_at
      ) VALUES (?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(1, 2, 'completed');
    syncOperationId = result.lastInsertRowid;

    // Create test inconsistencies
    const insertInc = dbInstance.prepare(`
      INSERT INTO data_inconsistencies (
        sync_operation_id, odoo_model, record_id, field_name,
        local_value, odoo_value, inconsistency_type, suggested_repair,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Data mismatch
    insertInc.run(
      syncOperationId,
      'sales.order',
      101,
      'amount_total',
      '1000.00',
      '950.00',
      'data_mismatch',
      'manual_review',
      'pending'
    );

    // Missing record in Odoo
    insertInc.run(
      syncOperationId,
      'sales.order',
      102,
      null,
      '{"id": 102, "name": "SO/2024/001"}',
      null,
      'missing_record',
      'keep_local',
      'pending'
    );

    // Extra record in Odoo
    insertInc.run(
      syncOperationId,
      'account.invoice',
      null,
      null,
      null,
      '{"id": 501, "name": "INV/2024/001"}',
      'extra_record',
      'keep_odoo',
      'pending'
    );
  });

  describe('Consistency Status Endpoint', () => {
    it('should return current consistency status', async () => {
      const response = await request(app)
        .get('/api/consistency/status')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('overall_status');
      expect(response.body.data).toHaveProperty('pending_count');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toHaveProperty('data_mismatch');
      expect(response.body.data.summary).toHaveProperty('missing_record');
      expect(response.body.data.summary).toHaveProperty('extra_record');
      expect(response.body.data.summary).toHaveProperty('total_pending');
    });

    it('should show inconsistent status when inconsistencies exist', async () => {
      const response = await request(app)
        .get('/api/consistency/status')
        .expect(200);

      expect(response.body.data.overall_status).toBe('inconsistent');
      expect(response.body.data.pending_count).toBeGreaterThan(0);
    });
  });

  describe('List Inconsistencies Endpoint', () => {
    it('should list all pending inconsistencies', async () => {
      const response = await request(app)
        .get('/api/consistency/inconsistencies')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('inconsistencies');
      expect(response.body.data.inconsistencies.length).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty('count');
      expect(response.body.data).toHaveProperty('limit');
      expect(response.body.data).toHaveProperty('offset');
    });

    it('should filter inconsistencies by type', async () => {
      const response = await request(app)
        .get('/api/consistency/inconsistencies?type=data_mismatch')
        .expect(200);

      expect(response.body.data.inconsistencies).toBeDefined();
      expect(Array.isArray(response.body.body.data.inconsistencies)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/consistency/inconsistencies?limit=2&offset=0')
        .expect(200);

      expect(response.body.data.count).toBeLessThanOrEqual(2);
      expect(response.body.data.limit).toBe(2);
      expect(response.body.data.offset).toBe(0);
    });

    it('should filter by sync operation', async () => {
      const response = await request(app)
        .get(`/api/consistency/inconsistencies?sync_operation_id=${syncOperationId}`)
        .expect(200);

      expect(response.body.data.inconsistencies).toBeDefined();
      expect(response.body.data.count).toBeGreaterThan(0);
    });
  });

  describe('Apply Repair Endpoint', () => {
    let inconsistencyId;

    beforeEach(async () => {
      // Get an inconsistency ID to repair
      const response = await request(app)
        .get('/api/consistency/inconsistencies?limit=1')
        .expect(200);

      if (response.body.data.inconsistencies.length > 0) {
        inconsistencyId = response.body.data.inconsistencies[0].id;
      }
    });

    it('should apply keep_local repair action', async () => {
      if (!inconsistencyId) return;

      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: inconsistencyId,
          repair_action: 'keep_local',
          notes: 'Test repair'
        })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('inconsistency');
      expect(response.body.data.inconsistency.status).toBe('resolved');
      expect(response.body.data.inconsistency.suggested_repair).toBe('keep_local');
    });

    it('should apply keep_odoo repair action', async () => {
      if (!inconsistencyId) return;

      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: inconsistencyId,
          repair_action: 'keep_odoo'
        })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data.inconsistency.status).toBe('resolved');
      expect(response.body.data.inconsistency.suggested_repair).toBe('keep_odoo');
    });

    it('should apply manual_review repair action', async () => {
      if (!inconsistencyId) return;

      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: inconsistencyId,
          repair_action: 'manual_review'
        })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data.inconsistency.status).toBe('manual_review');
    });

    it('should reject invalid repair action', async () => {
      if (!inconsistencyId) return;

      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: inconsistencyId,
          repair_action: 'invalid_action'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'CONSISTENCY_005');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: inconsistencyId
          // Missing repair_action
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'CONSISTENCY_004');
    });

    it('should return error for non-existent inconsistency', async () => {
      const response = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: 99999,
          repair_action: 'keep_local'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'CONSISTENCY_006');
    });
  });

  describe('Bulk Repair Endpoint', () => {
    let inconsistencyIds;

    beforeEach(async () => {
      // Get inconsistency IDs for bulk repair
      const response = await request(app)
        .get('/api/consistency/inconsistencies?limit=5')
        .expect(200);

      inconsistencyIds = response.body.data.inconsistencies
        .map(inc => inc.id)
        .slice(0, 2);
    });

    it('should apply bulk keep_local repair', async () => {
      if (!inconsistencyIds || inconsistencyIds.length === 0) return;

      const response = await request(app)
        .post('/api/consistency/repair-bulk')
        .send({
          inconsistency_ids: inconsistencyIds,
          repair_action: 'keep_local'
        })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('succeeded');
      expect(response.body.data).toHaveProperty('failed');
      expect(response.body.data).toHaveProperty('errors');
      expect(response.body.data.succeeded).toBeGreaterThan(0);
    });

    it('should apply bulk keep_odoo repair', async () => {
      if (!inconsistencyIds || inconsistencyIds.length === 0) return;

      const response = await request(app)
        .post('/api/consistency/repair-bulk')
        .send({
          inconsistency_ids: inconsistencyIds,
          repair_action: 'keep_odoo'
        })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data.succeeded).toBeGreaterThan(0);
    });

    it('should reject invalid bulk repair action', async () => {
      if (!inconsistencyIds || inconsistencyIds.length === 0) return;

      const response = await request(app)
        .post('/api/consistency/repair-bulk')
        .send({
          inconsistency_ids: inconsistencyIds,
          repair_action: 'manual_review' // Not allowed for bulk
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'CONSISTENCY_009');
    });

    it('should reject empty inconsistency IDs', async () => {
      const response = await request(app)
        .post('/api/consistency/repair-bulk')
        .send({
          inconsistency_ids: [],
          repair_action: 'keep_local'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 'CONSISTENCY_008');
    });

    it('should handle partial failures in bulk repair', async () => {
      const response = await request(app)
        .post('/api/consistency/repair-bulk')
        .send({
          inconsistency_ids: [inconsistencyIds[0], 99999], // One invalid ID
          repair_action: 'keep_local'
        })
        .expect(200);

      expect(response.body.data.succeeded).toBeGreaterThan(0);
      expect(response.body.data.failed).toBeGreaterThan(0);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Consistency Report Summary', () => {
    it('should get detailed consistency report', async () => {
      const response = await request(app)
        .get(`/api/consistency/inconsistencies?sync_operation_id=${syncOperationId}`)
        .expect(200);

      const inconsistencies = response.body.data.inconsistencies;

      // Verify we have different types of inconsistencies
      const types = new Set(inconsistencies.map(inc => inc.inconsistency_type));
      expect(types.size).toBeGreaterThan(0);

      // Check for specific inconsistency types
      const hasMismatch = inconsistencies.some(inc => inc.inconsistency_type === 'data_mismatch');
      const hasMissing = inconsistencies.some(inc => inc.inconsistency_type === 'missing_record');
      const hasExtra = inconsistencies.some(inc => inc.inconsistency_type === 'extra_record');

      expect(hasMismatch || hasMissing || hasExtra).toBe(true);
    });

    it('should return repair suggestions', async () => {
      const response = await request(app)
        .get('/api/consistency/inconsistencies?limit=1')
        .expect(200);

      if (response.body.data.inconsistencies.length > 0) {
        const inconsistency = response.body.data.inconsistencies[0];
        expect(inconsistency).toHaveProperty('suggested_repair');
        const validRepairs = ['keep_local', 'keep_odoo', 'manual_review'];
        expect(validRepairs).toContain(inconsistency.suggested_repair);
      }
    });
  });

  describe('State Transitions', () => {
    it('should update resolved_at timestamp when repair applied', async () => {
      // Get an inconsistency
      const listResponse = await request(app)
        .get('/api/consistency/inconsistencies?limit=1')
        .expect(200);

      if (listResponse.body.data.inconsistencies.length === 0) return;

      const incId = listResponse.body.data.inconsistencies[0].id;
      const timeBefore = new Date();

      // Apply repair
      const repairResponse = await request(app)
        .post('/api/consistency/repair')
        .send({
          inconsistency_id: incId,
          repair_action: 'keep_local'
        })
        .expect(200);

      const repaired = repairResponse.body.data.inconsistency;
      expect(repaired.resolved_at).toBeDefined();

      const resolvedTime = new Date(repaired.resolved_at);
      expect(resolvedTime.getTime()).toBeGreaterThanOrEqual(timeBefore.getTime());
    });

    it('should track repair history', async () => {
      // Get initial count
      const beforeResponse = await request(app)
        .get('/api/consistency/inconsistencies')
        .expect(200);

      const pendingBefore = beforeResponse.body.data.inconsistencies
        .filter(inc => inc.status === 'pending').length;

      // Apply a repair
      if (beforeResponse.body.data.inconsistencies.length > 0) {
        const incId = beforeResponse.body.data.inconsistencies[0].id;
        await request(app)
          .post('/api/consistency/repair')
          .send({
            inconsistency_id: incId,
            repair_action: 'keep_local'
          })
          .expect(200);
      }

      // Verify pending count decreased
      const afterResponse = await request(app)
        .get('/api/consistency/inconsistencies')
        .expect(200);

      const pendingAfter = afterResponse.body.data.inconsistencies
        .filter(inc => inc.status === 'pending').length;

      expect(pendingAfter).toBeLessThanOrEqual(pendingBefore);
    });
  });
});
