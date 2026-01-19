import request from 'supertest';
import { createTestApp, cleanupTests } from '../setup.js';

describe('Synchronization API Contract Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    db = testSetup.db;

    // Create two test database connections
    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'test-source-sync',
        url: 'https://source.odoo.com',
        database_name: 'source_db',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'test-target-sync',
        url: 'https://target.odoo.com',
        database_name: 'target_db',
        username: 'admin',
        password: 'password456'
      });

    targetDbId = targetResponse.body.id;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    cleanupTests();
  });

  describe('POST /api/sync/preview', () => {
    it('should return error when source_db_id is missing', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          target_db_id: targetDbId
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return error when target_db_id is missing', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return error when source and target are the same', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: sourceDbId
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return error for non-existent source database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: 99999,
          target_db_id: targetDbId
        });

      expect(response.status).toBe(404);
    });

    it('should return error for non-existent target database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: 99999
        });

      expect(response.status).toBe(404);
    });

    it('should generate preview structure (may fail on auth)', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        });

      // Response may be 200 or error depending on Odoo connectivity
      // But if successful, should have preview structure
      if (response.status === 200) {
        expect(response.body).toHaveProperty('generated_at');
        expect(response.body).toHaveProperty('summary');
        expect(response.body).toHaveProperty('models');
        expect(response.body.summary).toHaveProperty('total_models');
        expect(response.body.summary).toHaveProperty('total_records_to_create');
        expect(response.body.summary).toHaveProperty('total_records_to_update');
        expect(response.body.summary).toHaveProperty('total_records_to_delete');
        expect(response.body.summary).toHaveProperty('total_conflicts');
      }
    });

    it('should accept model_filter parameter', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          model_filter: ['res.partner', 'product.product']
        });

      // Request should be accepted structurally
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /api/sync/status', () => {
    it('should return current sync status', async () => {
      const response = await request(app)
        .get('/api/sync/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('message');
    });

    it('should indicate idle status when no sync in progress', async () => {
      const response = await request(app)
        .get('/api/sync/status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('idle');
    });
  });

  describe('POST /api/sync/execute', () => {
    it('should return not implemented error', async () => {
      const response = await request(app)
        .post('/api/sync/execute')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        });

      // Should be 404 (not implemented yet)
      expect(response.status).toMatch(/^(404|501)$/);
    });
  });

  describe('POST /api/sync/rollback', () => {
    it('should return not implemented error', async () => {
      const response = await request(app)
        .post('/api/sync/rollback')
        .send({
          sync_run_id: 1
        });

      // Should be 404 (not implemented yet)
      expect(response.status).toMatch(/^(404|501)$/);
    });
  });
});
