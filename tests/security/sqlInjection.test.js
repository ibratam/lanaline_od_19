import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Security: SQL Injection', () => {
  let app;
  let db;

  beforeAll(async () => {
    process.env.MIDDLEWARE_SECRET_KEY = 'a'.repeat(32);
    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  afterAll(() => {
    if (db && db.close) {
      db.close();
    }
  });

  it('should store input safely without breaking tables', async () => {
    const injectionName = "test'); DROP TABLE database_connections; --";

    await request(app)
      .post('/api/config')
      .send({
        name: injectionName,
        url: 'https://odoo.example.com',
        database_name: 'secure_db',
        username: 'admin',
        password: 'password123'
      })
      .expect(201);

    const result = db.getDB().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='database_connections'"
    ).get();

    expect(result).toBeDefined();
  });
});
