/**
 * Integration Test: Scheduled Synchronization Execution
 */

import request from 'supertest';
import { createTestApp } from '../setup.js';

const waitForScheduleExecution = async (app, scheduleId, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request(app).get('/api/schedule');
    const schedule = response.body.find(item => item.id === scheduleId);
    if (schedule && schedule.last_executed_at) {
      return schedule;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for scheduled execution');
};

describe('Scheduled Execution Integration Tests', () => {
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
    db.getDB().prepare('DELETE FROM sync_schedules').run();

    const sourceResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Schedule Source',
        url: 'http://localhost:8069',
        database_name: 'schedule_source',
        username: 'admin',
        password: 'password123'
      });

    sourceDbId = sourceResponse.body.id;

    const targetResponse = await request(app)
      .post('/api/config')
      .send({
        name: 'Schedule Target',
        url: 'http://localhost:8070',
        database_name: 'schedule_target',
        username: 'admin',
        password: 'admin123'
      });

    targetDbId = targetResponse.body.id;
  });

  it('should execute a scheduled sync', async () => {
    const createResponse = await request(app)
      .post('/api/schedule')
      .send({
        source_db_id: sourceDbId,
        target_db_id: targetDbId,
        name: 'Test Schedule',
        cron_expression: '*/5 * * * *',
        timezone: 'UTC'
      })
      .expect(201);

    const scheduleId = createResponse.body.id;
    const schedule = await waitForScheduleExecution(app, scheduleId);

    expect(schedule.last_executed_at).toBeDefined();
  });
});
