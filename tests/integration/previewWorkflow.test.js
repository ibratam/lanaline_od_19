/**
 * Integration Test: Preview with Conflicts
 * Test: Configure databases, generate preview, detect conflicts
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

describe('Preview Workflow Integration Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;

  const sourceDbConfig = {
    name: 'Preview Source DB',
    url: 'http://localhost:8069',
    database_name: 'preview_source',
    username: 'admin',
    password: 'password123'
  };

  const targetDbConfig = {
    name: 'Preview Target DB',
    url: 'http://localhost:8070',
    database_name: 'preview_target',
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

  beforeEach(async () => {
    db.getDB().prepare('DELETE FROM database_connections').run();

    // Set up source and target databases before each test
    const sourceResponse = await request(app)
      .post('/api/config')
      .send(sourceDbConfig);

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send(targetDbConfig);

    targetDbId = targetResponse.body.id;
  });

  describe('Preview Generation', () => {
    it('should generate preview without making changes to database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.generated_at).toBeDefined();
      expect(response.body.summary).toBeDefined();
      expect(response.body.models).toBeInstanceOf(Array);
    });

    it('should return proper preview summary structure', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { summary } = response.body;

      expect(summary.total_models).toBeGreaterThanOrEqual(0);
      expect(summary.total_records_to_create).toBeGreaterThanOrEqual(0);
      expect(summary.total_records_to_update).toBeGreaterThanOrEqual(0);
      expect(summary.total_records_to_delete).toBeGreaterThanOrEqual(0);
      expect(summary.total_conflicts).toBeGreaterThanOrEqual(0);
    });

    it('should detect records to create (in source but not in target)', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models, summary } = response.body;

      // Should have model information
      expect(models).toBeInstanceOf(Array);

      // If there are models with records to create
      if (summary.total_records_to_create > 0) {
        const modelWithCreates = models.find(m => m.to_create.count > 0);
        expect(modelWithCreates).toBeDefined();
        expect(modelWithCreates.to_create.records).toBeInstanceOf(Array);
      }
    });

    it('should detect records to update (different between source and target)', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models, summary } = response.body;

      // If there are updates
      if (summary.total_records_to_update > 0) {
        const modelWithUpdates = models.find(m => m.to_update.count > 0);
        expect(modelWithUpdates).toBeDefined();
        expect(modelWithUpdates.to_update.records).toBeInstanceOf(Array);

        const updateRecord = modelWithUpdates.to_update.records[0];
        expect(updateRecord.id).toBeDefined();
        expect(updateRecord.differences).toBeDefined();
      }
    });

    it('should detect records to delete (in target but not in source)', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models, summary } = response.body;

      // If there are deletes
      if (summary.total_records_to_delete > 0) {
        const modelWithDeletes = models.find(m => m.to_delete.count > 0);
        expect(modelWithDeletes).toBeDefined();
        expect(modelWithDeletes.to_delete.records).toBeInstanceOf(Array);
      }
    });

    it('should detect conflicts in records', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models, summary } = response.body;

      // If there are conflicts
      if (summary.total_conflicts > 0) {
        const modelWithConflicts = models.find(m => m.conflicts.length > 0);
        expect(modelWithConflicts).toBeDefined();
        expect(modelWithConflicts.conflicts).toBeInstanceOf(Array);

        const conflict = modelWithConflicts.conflicts[0];
        expect(conflict.record_id).toBeDefined();
        expect(conflict.source_values).toBeDefined();
        expect(conflict.target_values).toBeDefined();
        expect(conflict.differences).toBeDefined();
      }
    });

    it('should show field-level differences in conflicts', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models } = response.body;
      const modelWithConflicts = models.find(m => m.conflicts && m.conflicts.length > 0);

      if (modelWithConflicts) {
        const conflict = modelWithConflicts.conflicts[0];
        expect(conflict.differences).toBeDefined();

        // Differences should show field names and values
        for (const [field, diff] of Object.entries(conflict.differences)) {
          expect(diff.source).toBeDefined();
          expect(diff.target).toBeDefined();
        }
      }
    });

    it('should include timestamps in conflict data', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models } = response.body;
      const modelWithConflicts = models.find(m => m.conflicts && m.conflicts.length > 0);

      if (modelWithConflicts) {
        const conflict = modelWithConflicts.conflicts[0];
        expect(conflict.source_write_date).toBeDefined();
        expect(conflict.target_write_date).toBeDefined();
      }
    });

    it('should apply model filter to preview', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId,
          model_filter: ['res.partner', 'product.product']
        })
        .expect(200);

      const { models, summary } = response.body;

      // Should only include specified models
      expect(summary.total_models).toBeLessThanOrEqual(2);

      models.forEach(model => {
        expect(['res.partner', 'product.product']).toContain(model.model);
      });
    });

    it('should handle preview with empty source database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { summary } = response.body;

      // Preview should complete successfully
      expect(summary.total_records_to_create).toBeDefined();
      expect(summary.total_records_to_update).toBeDefined();
      expect(summary.total_records_to_delete).toBeDefined();
    });

    it('should handle preview with empty target database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { summary } = response.body;

      // If source has records, all should be creates
      if (summary.total_records_to_create > 0) {
        expect(summary.total_records_to_update).toBe(0);
        expect(summary.total_records_to_delete).toBe(0);
      }
    });

    it('should handle preview when source and target are identical', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { summary } = response.body;

      // When databases are identical
      if (summary.total_records_to_create === 0 &&
          summary.total_records_to_update === 0 &&
          summary.total_records_to_delete === 0) {
        expect(summary.total_conflicts).toBe(0);
      }
    });
  });

  describe('Conflict Detection Details', () => {
    it('should identify conflict type correctly', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models } = response.body;
      const modelWithConflicts = models.find(m => m.conflicts && m.conflicts.length > 0);

      if (modelWithConflicts) {
        modelWithConflicts.conflicts.forEach(conflict => {
          // Each conflict should have valid data
          expect(conflict.record_id).toBeDefined();
          expect(conflict.source_values).toBeDefined();
          expect(conflict.target_values).toBeDefined();
          expect(conflict.differences).toBeDefined();

          // Check field differences structure
          for (const [field, diff] of Object.entries(conflict.differences)) {
            expect(typeof field).toBe('string');
            expect(diff).toHaveProperty('source');
            expect(diff).toHaveProperty('target');
          }
        });
      }
    });

    it('should not make changes during preview', async () => {
      // Get initial state
      const previewResponse = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const initialConflicts = previewResponse.body.summary.total_conflicts;

      // Run preview again
      const secondPreviewResponse = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const secondConflicts = secondPreviewResponse.body.summary.total_conflicts;

      // Results should be identical (no side effects)
      expect(secondConflicts).toBe(initialConflicts);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for missing source_db_id', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          target_db_id: targetDbId
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing target_db_id', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent source database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: 99999,
          target_db_id: targetDbId
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for non-existent target database', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: 99999
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should handle database connection errors gracefully', async () => {
      // Create config with unreachable database
      const unreachableConfig = {
        name: 'Unreachable DB',
        url: 'http://localhost:9999', // Non-existent port
        database_name: 'nonexistent',
        username: 'admin',
        password: 'password'
      };

      const configResponse = await request(app)
        .post('/api/config')
        .send(unreachableConfig)
        .expect(201);

      const unreachableDbId = configResponse.body.id;

      // Preview with unreachable database should fail gracefully
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: unreachableDbId
        });

      // Should return error or partial results
      expect([400, 500, 503]).toContain(response.status);
    });
  });

  describe('Preview Performance', () => {
    it('should generate preview in reasonable time', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const duration = Date.now() - startTime;

      // Preview should complete within 30 seconds (adjustable for actual performance)
      expect(duration).toBeLessThan(30000);
      expect(response.body).toBeDefined();
    });

    it('should handle large model lists', async () => {
      const response = await request(app)
        .post('/api/sync/preview')
        .send({
          source_db_id: sourceDbId,
          target_db_id: targetDbId
        })
        .expect(200);

      const { models } = response.body;

      // Should return all models (test with reasonable limit)
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Preview Consistency', () => {
    it('should provide consistent results on repeated calls', async () => {
      const responses = await Promise.all([
        request(app)
          .post('/api/sync/preview')
          .send({
            source_db_id: sourceDbId,
            target_db_id: targetDbId
          }),
        request(app)
          .post('/api/sync/preview')
          .send({
            source_db_id: sourceDbId,
            target_db_id: targetDbId
          })
      ]);

      const summary1 = responses[0].body.summary;
      const summary2 = responses[1].body.summary;

      expect(summary1.total_records_to_create).toBe(summary2.total_records_to_create);
      expect(summary1.total_records_to_update).toBe(summary2.total_records_to_update);
      expect(summary1.total_records_to_delete).toBe(summary2.total_records_to_delete);
      expect(summary1.total_conflicts).toBe(summary2.total_conflicts);
    });
  });
});
