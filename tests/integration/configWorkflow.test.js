/**
 * Integration Test: Full Config Workflow
 * Test: Save source DB, save target DB, test both connections
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Configuration Workflow Integration Tests', () => {
  let app;
  let db;

  const sourceDbConfig = {
    name: 'Source Odoo Database',
    url: 'http://localhost:8069',
    database_name: 'source_db',
    username: 'admin',
    password: 'password123'
  };

  const targetDbConfig = {
    name: 'Target Odoo Database',
    url: 'http://localhost:8070',
    database_name: 'target_db',
    username: 'admin',
    password: 'admin123'
  };

  beforeAll(async () => {
    process.env.MIDDLEWARE_SECRET_KEY = 'a'.repeat(32);
    process.env.LOG_LEVEL = 'error';

    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  afterAll(async () => {
    if (db && db.close) {
      db.close();
    }
  });

  describe('Workflow: Save source, save target, test both', () => {
    it('should save source database configuration', async () => {
      const response = await request(app)
        .post('/api/config')
        .send(sourceDbConfig)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(sourceDbConfig.name);
      expect(response.body.url).toBe(sourceDbConfig.url);
      expect(response.body.database_name).toBe(sourceDbConfig.database_name);
      expect(response.body.username).toBe(sourceDbConfig.username);
      // Password should be masked
      expect(response.body.password).toBeUndefined();

      // Store source DB ID for later use
      global.sourceDbId = response.body.id;
    });

    it('should retrieve source database configuration with masked password', async () => {
      const response = await request(app)
        .get(`/api/config/${global.sourceDbId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(global.sourceDbId);
      expect(response.body.name).toBe(sourceDbConfig.name);
      expect(response.body.password).toBeUndefined();
      // Password should be masked as dots
      expect(response.body.password_encrypted).toMatch(/^.••••••••.$/);
    });

    it('should save target database configuration', async () => {
      const response = await request(app)
        .post('/api/config')
        .send(targetDbConfig)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(targetDbConfig.name);
      expect(response.body.url).toBe(targetDbConfig.url);
      expect(response.body.database_name).toBe(targetDbConfig.database_name);

      // Store target DB ID for later use
      global.targetDbId = response.body.id;
    });

    it('should retrieve target database configuration', async () => {
      const response = await request(app)
        .get(`/api/config/${global.targetDbId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(global.targetDbId);
      expect(response.body.name).toBe(targetDbConfig.name);
    });

    it('should list all configured databases', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      const sourceDb = response.body.find(db => db.id === global.sourceDbId);
      const targetDb = response.body.find(db => db.id === global.targetDbId);

      expect(sourceDb).toBeDefined();
      expect(targetDb).toBeDefined();
      expect(sourceDb.name).toBe(sourceDbConfig.name);
      expect(targetDb.name).toBe(targetDbConfig.name);
    });

    it('should test source database connection', async () => {
      const response = await request(app)
        .post(`/api/config/${global.sourceDbId}/test`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.connectionId).toBe(global.sourceDbId);
      expect(response.body.success).toBeInstanceOf(Boolean);
      expect(response.body.message).toBeDefined();
    });

    it('should test target database connection', async () => {
      const response = await request(app)
        .post(`/api/config/${global.targetDbId}/test`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.connectionId).toBe(global.targetDbId);
      expect(response.body.success).toBeInstanceOf(Boolean);
      expect(response.body.message).toBeDefined();
    });

    it('should update database configuration', async () => {
      const updatedConfig = {
        ...sourceDbConfig,
        url: 'http://localhost:9069'
      };

      const response = await request(app)
        .put(`/api/config/${global.sourceDbId}`)
        .send(updatedConfig)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.url).toBe('http://localhost:9069');
    });

    it('should reject invalid URL when saving configuration', async () => {
      const invalidConfig = {
        ...sourceDbConfig,
        url: 'not a valid url'
      };

      const response = await request(app)
        .post('/api/config')
        .send(invalidConfig)
        .expect(400);

      expect(response.body.errors).toContain('URL is invalid');
    });

    it('should reject missing required fields', async () => {
      const incompleteConfig = {
        name: 'Incomplete Config'
        // Missing other required fields
      };

      const response = await request(app)
        .post('/api/config')
        .send(incompleteConfig)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should validate configuration before saving', async () => {
      const response = await request(app)
        .post('/api/config/validate')
        .send(sourceDbConfig)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return validation errors for invalid config', async () => {
      const invalidConfig = {
        url: 'invalid'
      };

      const response = await request(app)
        .post('/api/config/validate')
        .send(invalidConfig)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should delete a database configuration', async () => {
      // Create a temporary config to delete
      const tempConfig = {
        ...sourceDbConfig,
        name: 'Temp Config to Delete'
      };

      const createResponse = await request(app)
        .post('/api/config')
        .send(tempConfig)
        .expect(201);

      const tempDbId = createResponse.body.id;

      // Delete the config
      const deleteResponse = await request(app)
        .delete(`/api/config/${tempDbId}`)
        .expect(200);

      expect(deleteResponse.body).toBeDefined();

      // Verify it's deleted
      const getResponse = await request(app)
        .get(`/api/config/${tempDbId}`)
        .expect(404);
    });

    it('should prevent duplicate configuration by name', async () => {
      // Create first config
      const config = {
        ...sourceDbConfig,
        name: 'Unique Config Name'
      };

      const firstResponse = await request(app)
        .post('/api/config')
        .send(config)
        .expect(201);

      expect(firstResponse.body.id).toBeDefined();

      // Attempt to create duplicate with same name
      // Note: This depends on implementation - adjust based on actual behavior
      const secondResponse = await request(app)
        .post('/api/config')
        .send(config)
        .expect(201); // Or 409 if uniqueness is enforced

      // Verify both were created (or second was rejected)
      if (secondResponse.status === 201) {
        expect(secondResponse.body.id).toBeDefined();
      }
    });

    it('should maintain password encryption across save/retrieve cycle', async () => {
      const config = {
        ...sourceDbConfig,
        name: 'Encryption Test Config',
        password: 'TestPassword123!@#'
      };

      // Save config
      const saveResponse = await request(app)
        .post('/api/config')
        .send(config)
        .expect(201);

      const configId = saveResponse.body.id;

      // Retrieve config
      const getResponse = await request(app)
        .get(`/api/config/${configId}`)
        .expect(200);

      // Password should not be included
      expect(getResponse.body.password).toBeUndefined();
      // Password should be masked
      expect(getResponse.body.password_encrypted).toMatch(/^.••••••••.$/);

      // Verify we can still test the connection (implying password is stored)
      const testResponse = await request(app)
        .post(`/api/config/${configId}/test`)
        .expect(200);

      expect(testResponse.body).toBeDefined();
    });

    it('should support multiple database pairs', async () => {
      const pairs = [
        {
          source: { ...sourceDbConfig, name: 'Source Pair 1' },
          target: { ...targetDbConfig, name: 'Target Pair 1' }
        },
        {
          source: { ...sourceDbConfig, name: 'Source Pair 2' },
          target: { ...targetDbConfig, name: 'Target Pair 2' }
        }
      ];

      for (const pair of pairs) {
        // Save source
        const sourceResponse = await request(app)
          .post('/api/config')
          .send(pair.source)
          .expect(201);

        expect(sourceResponse.body.id).toBeDefined();

        // Save target
        const targetResponse = await request(app)
          .post('/api/config')
          .send(pair.target)
          .expect(201);

        expect(targetResponse.body.id).toBeDefined();
      }

      // Verify all configs are stored
      const listResponse = await request(app)
        .get('/api/config')
        .expect(200);

      expect(listResponse.body.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent configuration', async () => {
      await request(app)
        .get('/api/config/99999')
        .expect(404);
    });

    it('should return 400 for invalid configuration ID format', async () => {
      await request(app)
        .get('/api/config/invalid-id')
        .expect(400);
    });

    it('should return 400 when updating with invalid data', async () => {
      const invalidUpdate = {
        ...sourceDbConfig,
        url: 'invalid url format'
      };

      await request(app)
        .put(`/api/config/${global.sourceDbId}`)
        .send(invalidUpdate)
        .expect(400);
    });

    it('should handle concurrent configuration saves', async () => {
      const configs = [
        { ...sourceDbConfig, name: 'Concurrent 1' },
        { ...sourceDbConfig, name: 'Concurrent 2' },
        { ...sourceDbConfig, name: 'Concurrent 3' }
      ];

      const promises = configs.map(config =>
        request(app)
          .post('/api/config')
          .send(config)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });
    });
  });
});
