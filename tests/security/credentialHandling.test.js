import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Security: Credential Handling', () => {
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

  it('should not expose plaintext passwords in responses', async () => {
    const createResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Secure DB',
        url: 'https://odoo.example.com',
        database_name: 'secure_db',
        username: 'admin',
        password: 'super-secret'
      })
      .expect(201);

    const response = await request(app)
      .get(`/api/config/${createResponse.body.id}`)
      .expect(200);

    expect(response.body.password).toBeUndefined();
    expect(response.body.password_encrypted).not.toContain('super-secret');
  });
});
