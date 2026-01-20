/**
 * Integration Test: Conflict recovery workflow
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

const waitForConflictState = async (app, conflictId, expected, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request(app).get(`/api/conflicts/${conflictId}`);
    if (response.body.state === expected) {
      return response.body;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for conflict ${conflictId} to reach ${expected}`);
};

describe('Conflict Recovery Integration Tests', () => {
  let app;
  let db;
  let sourceDbId;
  let targetDbId;
  let conflictId;

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
    sqlite.prepare('DELETE FROM conflict_resolutions').run();
    sqlite.prepare('DELETE FROM sync_conflicts').run();
    sqlite.prepare('DELETE FROM sync_runs').run();
    sqlite.prepare('DELETE FROM database_connections').run();

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Conflict Source',
        url: 'http://localhost:8069',
        database_name: 'conflict_source',
        username: 'admin',
        password: 'password123'
      });
    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Conflict Target',
        url: 'http://localhost:8070',
        database_name: 'conflict_target',
        username: 'admin',
        password: 'admin123'
      });
    targetDbId = targetResponse.body.id;

    const runResult = sqlite.prepare(`
      INSERT INTO sync_runs (source_db_id, target_db_id, status, triggered_by)
      VALUES (?, ?, 'completed', 'manual')
    `).run(sourceDbId, targetDbId);

    const conflictResult = sqlite.prepare(`
      INSERT INTO sync_conflicts (
        sync_run_id,
        odoo_model,
        record_id,
        source_db_id,
        target_db_id,
        source_values,
        target_values,
        state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runResult.lastInsertRowid,
      'res.partner',
      100,
      sourceDbId,
      targetDbId,
      JSON.stringify({ name: 'Local' }),
      JSON.stringify({ name: 'Odoo' }),
      'resolved'
    );

    conflictId = conflictResult.lastInsertRowid;

    sqlite.prepare(`
      INSERT INTO conflict_resolutions (conflict_id, chosen_version)
      VALUES (?, 'local')
    `).run(conflictId);
  });

  it('should move conflict to needs_manual_review after failed retries and recover', async () => {
    await request(app)
      .post(`/api/conflicts/${conflictId}/apply`)
      .send({ simulate_error: true })
      .expect(202);

    await waitForConflictState(app, conflictId, 'failed_resolution');

    await request(app)
      .post(`/api/conflicts/${conflictId}/retry`)
      .send({ simulate_error: true })
      .expect(202);

    await waitForConflictState(app, conflictId, 'failed_resolution');

    await request(app)
      .post(`/api/conflicts/${conflictId}/retry`)
      .send({ simulate_error: true })
      .expect(202);

    await waitForConflictState(app, conflictId, 'needs_manual_review');

    await request(app)
      .post(`/api/conflicts/${conflictId}/retry`)
      .send({})
      .expect(202);

    await waitForConflictState(app, conflictId, 'applied');
  });
});
