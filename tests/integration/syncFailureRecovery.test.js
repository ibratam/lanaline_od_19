/**
 * Integration Test: Sync failure recovery
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

const waitForSyncCompletion = async (app, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request(app).get('/api/sync/status');
    if (['completed', 'failed'].includes(response.body.status)) {
      return response.body;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for sync completion');
};

describe('Sync Failure Recovery Integration Tests', () => {
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
    const sqlite = db.getDB();
    sqlite.prepare('DELETE FROM retry_history').run();
    sqlite.prepare('DELETE FROM sync_failures').run();
    sqlite.prepare('DELETE FROM sync_runs').run();
    sqlite.prepare('DELETE FROM database_connections').run();

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Failure Source',
        url: 'http://localhost:8069',
        database_name: 'failure_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Failure Target',
        url: 'http://localhost:8070',
        database_name: 'failure_target',
        username: 'admin',
        password: 'admin123'
      });

    targetDbId = targetResponse.body.id;
  });

  it('should record sync failure and allow retry after fix', async () => {
    await request(app)
      .post('/api/sync/execute')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId,
        simulate_error: true
      })
      .expect(202);

    const failureStatus = await waitForSyncCompletion(app);
    expect(failureStatus.status).toBe('failed');
    expect(failureStatus.error_code).toBeTruthy();

    const historyResponse = await request(app)
      .get('/api/sync/history')
      .expect(200);

    const failedRun = historyResponse.body.items.find(item => item.status === 'failed');
    expect(failedRun).toBeTruthy();
    expect(failedRun.last_failure).toBeTruthy();
    expect(failedRun.last_failure.error_category).toBeTruthy();
    expect(failedRun.suggested_action).toBeTruthy();

    await new Promise(resolve => setTimeout(resolve, 10));

    await request(app)
      .post('/api/sync/retry')
      .send({
        sync_run_id: failedRun.id,
        user_correction: 'Fixed validation issue'
      })
      .expect(202);

    const retryStatus = await waitForSyncCompletion(app);
    expect(retryStatus.status).toBe('completed');
  });
});
