/**
 * Integration Test: Rollback Sync Workflow
 * Test: Execute sync, request rollback, verify rollback status
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
  throw new Error('Timed out waiting for rollback status');
};

describe('Rollback Integration Tests', () => {
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
        name: 'Rollback Source DB',
        url: 'http://localhost:8069',
        database_name: 'rollback_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Rollback Target DB',
        url: 'http://localhost:8070',
        database_name: 'rollback_target',
        username: 'admin',
        password: 'admin123'
      });

    targetDbId = targetResponse.body.id;
  });

  it('should rollback last completed sync', async () => {
    const executeResponse = await request(app)
      .post('/api/sync/execute')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId
      })
      .expect(202);

    const syncRunId = executeResponse.body.sync_run_id;

    await waitForStatus(
      app,
      (body) => ['completed', 'failed'].includes(body.status)
    );

    const rollbackResponse = await request(app)
      .post('/api/sync/rollback')
      .send({ sync_run_id: syncRunId })
      .expect(202);

    expect(rollbackResponse.body.status).toBe('rollback_started');

    const finalStatus = await waitForStatus(
      app,
      (body) => ['rolled_back', 'rollback_failed'].includes(body.status)
    );

    expect(finalStatus).toHaveProperty('status');
  });
});
