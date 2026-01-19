import { SyncEngine } from '../../src/services/SyncEngine.js';

describe('Performance: Sync Load', () => {
  it('should complete mock sync quickly', async () => {
    const syncEngine = new SyncEngine({});
    const start = Date.now();

    await syncEngine.executeSync({
      sourceClient: {},
      targetClient: {},
      modelFilter: ['res.partner'],
      dataPreserver: {
        prepareCreateValues: (value) => value,
        prepareUpdateValues: (value) => value
      },
      mock: true
    });

    const durationMs = Date.now() - start;
    // Mock execution should be far under 5 minutes.
    expect(durationMs).toBeLessThan(5 * 60 * 1000);
  });
});
