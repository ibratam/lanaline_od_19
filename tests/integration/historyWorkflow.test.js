/**
 * Integration Test: History workflow
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

describe('History Workflow Integration Tests', () => {
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
    db.getDB().prepare('DELETE FROM sync_runs').run();

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'History Source',
        url: 'http://localhost:8069',
        database_name: 'history_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'History Target',
        url: 'http://localhost:8070',
        database_name: 'history_target',
        username: 'admin',
        password: 'admin123'
      });

    targetDbId = targetResponse.body.id;
  });

  it('should show sync runs in history list and detail', async () => {
    await request(app)
      .post('/api/sync/execute')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId
      })
      .expect(202);

    await waitForSyncCompletion(app);

    const listResponse = await request(app)
      .get('/api/history')
      .expect(200);

    expect(listResponse.body.items.length).toBeGreaterThan(0);

    const runId = listResponse.body.items[0].id;
    const detailResponse = await request(app)
      .get(`/api/history/${runId}`)
      .expect(200);

    expect(detailResponse.body.id).toBe(runId);
    expect(detailResponse.body).toHaveProperty('operations');
  });
});
