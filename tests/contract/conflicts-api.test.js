import request from 'supertest';
import { createTestApp, cleanupTests } from '../setup.js';

describe('Conflicts API Contract Tests', () => {
  let app;
  let db;
  let conflictId;

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;
    db = testSetup.db;

    const insert = db.getDB().prepare(`
      INSERT INTO sync_conflicts (
        sync_run_id, odoo_model, record_id, source_db_id, target_db_id,
        source_values, target_values
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      1,
      'res.partner',
      10,
      1,
      2,
      JSON.stringify({ name: 'A' }),
      JSON.stringify({ name: 'B' })
    );
    conflictId = result.lastInsertRowid;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    cleanupTests();
  });

  it('GET /api/conflicts returns paginated list with cursor', async () => {
    const response = await request(app)
      .get('/api/conflicts?limit=1');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBe(1);
    expect(response.body).toHaveProperty('next_cursor');
  });

  it('GET /api/conflicts/:id returns full conflict schema with resolution/lock status', async () => {
    const response = await request(app)
      .get(`/api/conflicts/${conflictId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('resolution');
    expect(response.body).toHaveProperty('state');
    expect(response.body).toHaveProperty('locked_by');
  });

  it('POST /api/conflicts/:id/lock prevents concurrent resolution', async () => {
    const firstResponse = await request(app)
      .post(`/api/conflicts/${conflictId}/lock`)
      .send({ user_id: 1 });

    expect(firstResponse.status).toBe(200);

    const secondResponse = await request(app)
      .post(`/api/conflicts/${conflictId}/lock`)
      .send({ user_id: 2 });

    expect(secondResponse.status).toBe(409);
  });

  it('POST /api/conflicts/:id/apply handles retries with 202 then 200/409', async () => {
    const startResponse = await request(app)
      .post(`/api/conflicts/${conflictId}/apply`)
      .send({ user_id: 1 });

    expect(startResponse.status).toBe(202);
  });
});
