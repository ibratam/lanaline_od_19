import { ScheduleManager } from '../../src/services/ScheduleManager.js';

describe('ScheduleManager', () => {
  describe('validateCronExpression', () => {
    it('should accept valid 5-part cron', () => {
      expect(ScheduleManager.validateCronExpression('0 0 * * *')).toBe(true);
      expect(ScheduleManager.validateCronExpression('*/5 * * * *')).toBe(true);
    });

    it('should reject invalid cron', () => {
      expect(ScheduleManager.validateCronExpression('')).toBe(false);
      expect(ScheduleManager.validateCronExpression('* * * *')).toBe(false);
      expect(ScheduleManager.validateCronExpression('invalid cron')).toBe(false);
    });
  });

  describe('getNextRuns', () => {
    it('should return next run timestamps', () => {
      const runs = ScheduleManager.getNextRuns('0 0 * * *', 'UTC', 2, new Date());
      expect(runs.length).toBe(2);
      expect(runs[0]).toMatch(/T/);
    });
  });
});
