import { RetryManager } from '../../src/services/RetryManager.js';

describe('RetryManager', () => {
  it('should retry exactly 3 times with exponential backoff', async () => {
    const conflictResolver = {
      apply: jest.fn(() => {
        const error = new Error('Network timeout');
        error.code = 'SE-001';
        throw error;
      }),
      db: {
        prepare: () => ({ run: jest.fn() })
      }
    };

    const retryManager = new RetryManager(conflictResolver);
    const delays = [];
    retryManager._delay = jest.fn(async (ms) => {
      delays.push(ms);
    });

    await expect(retryManager.applyWithRetry(1, 3)).rejects.toThrow('Network timeout');

    expect(conflictResolver.apply).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([5000, 10000, 20000]);
  });

  it('should move conflict to needs_manual_review after failures', async () => {
    const updateRun = jest.fn();
    const conflictResolver = {
      apply: jest.fn(() => {
        const error = new Error('Validation failed');
        error.code = 'UC-100';
        throw error;
      }),
      db: {
        prepare: () => ({ run: updateRun })
      }
    };

    const retryManager = new RetryManager(conflictResolver);
    retryManager._delay = jest.fn(async () => {});

    await expect(retryManager.applyWithRetry(99, 3)).rejects.toThrow('Validation failed');
    expect(updateRun).toHaveBeenCalledWith(99);
  });

  it('should categorize errors correctly', () => {
    const conflictResolver = { apply: jest.fn(), db: { prepare: () => ({ run: jest.fn() }) } };
    const retryManager = new RetryManager(conflictResolver);

    expect(retryManager._categorizeError({ message: 'Validation error' })).toBe('user_correctable');
    expect(retryManager._categorizeError({ message: 'timeout' })).toBe('system');
    expect(retryManager._categorizeError({ message: 'fatal' })).toBe('unrecoverable');
  });
});
