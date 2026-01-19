import request from 'supertest';
import { createTestApp, cleanupTests } from '../setup.js';

describe('History API Contract Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;
  let syncRunId;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    db = testSetup.db;

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'history-source',
        url: 'https://source.odoo.com',
        database_name: 'source_db',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'history-target',
        url: 'https://target.odoo.com',
        database_name: 'target_db',
        username: 'admin',
        password: 'password456'
      });

    targetDbId = targetResponse.body.id;

    const insert = db.getDB().prepare(`
      INSERT INTO sync_runs (
        source_db_id, target_db_id, status, triggered_by, started_at, completed_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = insert.run(sourceDbId, targetDbId, 'completed', 'manual');
    syncRunId = result.lastInsertRowid;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    cleanupTests();
  });

  describe('GET /api/history', () => {
    it('should return history list with pagination', async () => {
      const response = await request(app)
        .get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });

  describe('GET /api/history/:id', () => {
    it('should return detailed history entry', async () => {
      const response = await request(app)
        .get(`/api/history/${syncRunId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', syncRunId);
      expect(response.body).toHaveProperty('conflicts');
      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('operations');
    });
  });

  describe('GET /api/history/export', () => {
    it('should export CSV by default', async () => {
      const response = await request(app)
        .get('/api/history/export');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\\/csv/);
    });

    it('should export JSON when requested', async () => {
      const response = await request(app)
        .get('/api/history/export?format=json');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
