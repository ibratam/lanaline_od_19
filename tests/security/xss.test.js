import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Security: XSS Prevention', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;

  beforeAll(async () => {
    process.env.MIDDLEWARE_SECRET_KEY = 'a'.repeat(32);
    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.db;

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'XSS Source',
        url: 'https://odoo.example.com',
        database_name: 'xss_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'XSS Target',
        url: 'https://odoo.example.com',
        database_name: 'xss_target',
        username: 'admin',
        password: 'password123'
      });

    targetDbId = targetResponse.body.id;
  });

  afterAll(() => {
    if (db && db.close) {
      db.close();
    }
  });

  it('should return JSON content type for user-provided strings', async () => {
    const payload = '<script>alert("xss")</script>';

    const response = await request(app)
      .post('/api/schedule')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId,
        name: payload,
        cron_expression: '0 1 * * *',
        timezone: 'UTC'
      });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.name).toBe(payload);
  });
});
