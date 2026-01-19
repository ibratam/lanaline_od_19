import request from 'supertest';
import { createTestApp, cleanupTests } from '../setup.js';

describe('Schedule API Contract Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    db = testSetup.db;

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'schedule-source',
        url: 'https://source.odoo.com',
        database_name: 'source_db',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'schedule-target',
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

  describe('POST /api/schedule', () => {
    it('should create a schedule', async () => {
      const response = await request(app)
        .post('/api/schedule')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          name: 'Daily Sync',
          cron_expression: '0 2 * * *',
          timezone: 'UTC'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('next_runs');
    });
  });

  describe('GET /api/schedule', () => {
    it('should list schedules', async () => {
      const response = await request(app)
        .get('/api/schedule');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('PUT /api/schedule/:id', () => {
    it('should update a schedule', async () => {
      const createResponse = await request(app)
        .post('/api/schedule')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          name: 'Weekly Sync',
          cron_expression: '0 3 * * 1',
          timezone: 'UTC'
        });

      const scheduleId = createResponse.body.id;

      const response = await request(app)
        .put(`/api/schedule/${scheduleId}`)
        .send({
          name: 'Weekly Sync Updated',
          cron_expression: '30 3 * * 1'
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Weekly Sync Updated');
    });
  });

  describe('POST /api/schedule/:id/toggle', () => {
    it('should toggle schedule status', async () => {
      const createResponse = await request(app)
        .post('/api/schedule')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          name: 'Toggle Sync',
          cron_expression: '0 4 * * *',
          timezone: 'UTC'
        });

      const scheduleId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/schedule/${scheduleId}/toggle`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled');
    });
  });

  describe('DELETE /api/schedule/:id', () => {
    it('should delete a schedule', async () => {
      const createResponse = await request(app)
        .post('/api/schedule')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          name: 'Delete Sync',
          cron_expression: '0 5 * * *',
          timezone: 'UTC'
        });

      const scheduleId = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/schedule/${scheduleId}`);

      expect(response.status).toBe(204);
    });
  });
});
