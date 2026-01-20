import request from 'supertest';
import { createTestApp, cleanupTests } from '../setup.js';

describe('Configuration API Contract Tests', () => {
  let app;
  let db;

  beforeAll(async () => {
    // Create test app with database
    const testSetup = await createTestApp();
    app = testSetup.app;
    db = testSetup.db;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    cleanupTests();
  });

  describe('POST /api/config', () => {
    it('should save a new database connection', async () => {
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'test-source',
          url: 'https://source.odoo.com',
          database_name: 'source_db',
          username: 'admin',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test-source');
      expect(response.body.url).toBe('https://source.odoo.com');
      expect(response.body.database_name).toBe('source_db');
      expect(response.body.username).toBe('admin');
      // Password should not be exposed
      expect(response.body.password).toBeUndefined();
      expect(response.body.password_encrypted).toBeDefined();
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'incomplete-config'
          // Missing other required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(true);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid URL', async () => {
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'bad-url-config',
          url: 'not-a-valid-url',
          database_name: 'db',
          username: 'user',
          password: 'pass'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(true);
    });

    it('should reject duplicate connection names', async () => {
      // Create first connection
      await request(app)
        .post('/api/config')
        .send({
          name: 'unique-name',
          url: 'https://odoo1.com',
          database_name: 'db1',
          username: 'admin',
          password: 'pass1'
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'unique-name',
          url: 'https://odoo2.com',
          database_name: 'db2',
          username: 'admin',
          password: 'pass2'
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CONFLICT');
    });
  });

  describe('GET /api/config/:id', () => {
    let connectionId;

    beforeAll(async () => {
      // Create a test connection
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'test-get-config',
          url: 'https://odoo.com',
          database_name: 'testdb',
          username: 'admin',
          password: 'secret123'
        });

      connectionId = response.body.id;
    });

    it('should retrieve connection with password masked', async () => {
      const response = await request(app)
        .get(`/api/config/${connectionId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(connectionId);
      expect(response.body.name).toBe('test-get-config');
      expect(response.body.username).toBe('admin');
      // Password should be masked
      expect(response.body.password_encrypted).toMatch(/•{8}/);
      expect(response.body.password).toBeUndefined();
    });

    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .get('/api/config/99999');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/config/:id', () => {
    let connectionId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'test-update-config',
          url: 'https://odoo.com',
          database_name: 'testdb',
          username: 'admin',
          password: 'secret123'
        });

      connectionId = response.body.id;
    });

    it('should update connection details', async () => {
      const response = await request(app)
        .put(`/api/config/${connectionId}`)
        .send({
          url: 'https://new-odoo.com',
          username: 'newadmin'
        });

      expect(response.status).toBe(200);
      expect(response.body.url).toBe('https://new-odoo.com');
      expect(response.body.username).toBe('newadmin');
      expect(response.body.name).toBe('test-update-config');
    });

    it('should update password', async () => {
      const response = await request(app)
        .put(`/api/config/${connectionId}`)
        .send({
          password: 'newpassword456'
        });

      expect(response.status).toBe(200);
      expect(response.body.password_encrypted).toBeDefined();
    });

    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .put('/api/config/99999')
        .send({ username: 'test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/config/:id', () => {
    let connectionId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/config')
        .send({
          name: 'test-delete-config',
          url: 'https://odoo.com',
          database_name: 'testdb',
          username: 'admin',
          password: 'secret123'
        });

      connectionId = response.body.id;
    });

    it('should delete a connection', async () => {
      const response = await request(app)
        .delete(`/api/config/${connectionId}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 after deletion', async () => {
      const response = await request(app)
        .get(`/api/config/${connectionId}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .delete('/api/config/99999');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/config/test (Connection Test)', () => {
    it('should test connection without saving', async () => {
      const response = await request(app)
        .post('/api/config/test')
        .send({
          url: 'https://source.odoo.com',
          database_name: 'source_db',
          username: 'admin',
          password: 'password123'
      });

      // Should return test result (success/failure)
      expect([200, 400, 401]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
    });

    it('should return error for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/config/test')
        .send({
          url: 'https://invalid.odoo.com',
          database_name: 'invalid_db',
          username: 'invalid',
          password: 'invalid'
        });

      // Should indicate test failure
      expect(response.body.success).toBeFalsy();
    });

    it('should return error for invalid URL', async () => {
      const response = await request(app)
        .post('/api/config/test')
        .send({
          url: 'not-a-valid-url',
          database_name: 'db',
          username: 'user',
          password: 'pass'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/config (List all)', () => {
    beforeAll(async () => {
      // Create multiple test connections
      await request(app)
        .post('/api/config')
        .send({
          name: 'list-test-1',
          url: 'https://odoo1.com',
          database_name: 'db1',
          username: 'admin',
          password: 'pass1'
        });

      await request(app)
        .post('/api/config')
        .send({
          name: 'list-test-2',
          url: 'https://odoo2.com',
          database_name: 'db2',
          username: 'admin',
          password: 'pass2'
        });
    });

    it('should return list of all connections', async () => {
      const response = await request(app)
        .get('/api/config');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Verify passwords are masked
      response.body.forEach(conn => {
        expect(conn.password).toBeUndefined();
        expect(conn.password_encrypted).toMatch(/•{8}/);
      });
    });
  });
});
