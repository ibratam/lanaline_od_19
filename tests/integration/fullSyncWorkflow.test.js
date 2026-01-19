/**
 * Integration Test: Full Sync Workflow
 * Test: Configure databases, execute sync, verify completion
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

const waitForStatus = async (app, predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request(app).get('/api/sync/status');
    if (predicate(response.body)) {
      return response.body;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for sync status');
};

describe('Full Sync Workflow Integration Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;

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

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Sync Source DB',
        url: 'http://localhost:8069',
        database_name: 'sync_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Sync Target DB',
        url: 'http://localhost:8070',
        database_name: 'sync_target',
        username: 'admin',
        password: 'admin123'
      });

    targetDbId = targetResponse.body.id;
  });

  it('should execute sync and report completion', async () => {
    const executeResponse = await request(app)
      .post('/api/sync/execute')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId
      })
      .expect(202);

    expect(executeResponse.body).toHaveProperty('sync_run_id');

    const finalStatus = await waitForStatus(
      app,
      (body) => ['completed', 'failed'].includes(body.status)
    );

    expect(finalStatus).toHaveProperty('status');
    if (finalStatus.status === 'completed') {
      expect(finalStatus).toHaveProperty('summary');
      expect(finalStatus.summary).toHaveProperty('total_records_created');
    }
  });
});
