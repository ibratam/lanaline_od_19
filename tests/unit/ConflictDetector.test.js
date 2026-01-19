import { ConflictDetector } from '../../src/services/ConflictDetector.js';

describe('ConflictDetector', () => {
  let conflictDetector;

  beforeEach(() => {
    conflictDetector = new ConflictDetector();
  });

  describe('detectConflicts()', () => {
    it('should detect field value differences', () => {
      const sourceRecord = {
        id: 1,
        name: 'Source Name',
        email: 'source@example.com'
      };

      const targetRecord = {
        id: 1,
        name: 'Target Name',
        email: 'source@example.com'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe('name');
      expect(conflicts[0].source_value).toBe('Source Name');
      expect(conflicts[0].target_value).toBe('Target Name');
    });

    it('should detect multiple field conflicts', () => {
      const sourceRecord = {
        id: 1,
        name: 'Source Name',
        email: 'source@example.com',
        active: true
      };

      const targetRecord = {
        id: 1,
        name: 'Target Name',
        email: 'target@example.com',
        active: false
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts.length).toBe(3);
      expect(conflicts.map(c => c.field).sort()).toEqual(['active', 'email', 'name']);
    });

    it('should ignore system fields (id, create_date, write_date)', () => {
      const sourceRecord = {
        id: 1,
        name: 'Same Name',
        create_date: '2025-01-01',
        write_date: '2025-01-15'
      };

      const targetRecord = {
        id: 2,
        name: 'Same Name',
        create_date: '2025-01-02',
        write_date: '2025-01-14'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts).toHaveLength(0);
    });

    it('should ignore __last_update field', () => {
      const sourceRecord = {
        id: 1,
        name: 'Same Name',
        __last_update: '1234567890'
      };

      const targetRecord = {
        id: 1,
        name: 'Same Name',
        __last_update: '1234567891'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle null/undefined source record', () => {
      const targetRecord = { id: 1, name: 'Name' };

      const conflicts = conflictDetector.detectConflicts(null, targetRecord);

      expect(conflicts).toEqual([]);
    });

    it('should handle null/undefined target record', () => {
      const sourceRecord = { id: 1, name: 'Name' };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, null);

      expect(conflicts).toEqual([]);
    });

    it('should detect when field is added in target', () => {
      const sourceRecord = {
        id: 1,
        name: 'Name'
      };

      const targetRecord = {
        id: 1,
        name: 'Name',
        new_field: 'value'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe('new_field');
      expect(conflicts[0].source_value).toBeUndefined();
      expect(conflicts[0].target_value).toBe('value');
    });

    it('should detect when field is removed in target', () => {
      const sourceRecord = {
        id: 1,
        name: 'Name',
        old_field: 'value'
      };

      const targetRecord = {
        id: 1,
        name: 'Name'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe('old_field');
      expect(conflicts[0].source_value).toBe('value');
      expect(conflicts[0].target_value).toBeUndefined();
    });

    it('should classify conflict types correctly', () => {
      const sourceRecord = {
        id: 1,
        value_mismatch: 'source',
        removed: 'value'
      };

      const targetRecord = {
        id: 1,
        value_mismatch: 'target',
        added: 'value'
      };

      const conflicts = conflictDetector.detectConflicts(sourceRecord, targetRecord);

      const conflictMap = {};
      conflicts.forEach(c => {
        conflictMap[c.field] = c.type;
      });

      expect(conflictMap.value_mismatch).toBe('value_mismatch');
      expect(conflictMap.removed).toBe('field_removed_in_target');
      expect(conflictMap.added).toBe('field_added_in_target');
    });
  });

  describe('getConflictType()', () => {
    it('should identify field_added_in_target', () => {
      const type = conflictDetector.getConflictType(null, 'value');
      expect(type).toBe('field_added_in_target');
    });

    it('should identify field_removed_in_target', () => {
      const type = conflictDetector.getConflictType('value', null);
      expect(type).toBe('field_removed_in_target');
    });

    it('should identify type_mismatch', () => {
      const type = conflictDetector.getConflictType('string', 123);
      expect(type).toBe('type_mismatch');
    });

    it('should identify value_mismatch', () => {
      const type = conflictDetector.getConflictType('value1', 'value2');
      expect(type).toBe('value_mismatch');
    });

    it('should handle undefined properly', () => {
      const type = conflictDetector.getConflictType(undefined, 'value');
      expect(type).toBe('field_added_in_target');
    });
  });

  describe('getConflictSummary()', () => {
    it('should summarize conflicts by type and field', () => {
      const conflicts = [
        { field: 'name', type: 'value_mismatch' },
        { field: 'email', type: 'value_mismatch' },
        { field: 'new_field', type: 'field_added_in_target' },
        { field: 'email', type: 'value_mismatch' }
      ];

      const summary = conflictDetector.getConflictSummary(conflicts);

      expect(summary.total).toBe(4);
      expect(summary.by_type.value_mismatch).toBe(3);
      expect(summary.by_type.field_added_in_target).toBe(1);
      expect(summary.by_field.name).toBe(1);
      expect(summary.by_field.email).toBe(2);
      expect(summary.by_field.new_field).toBe(1);
    });

    it('should handle empty conflicts array', () => {
      const summary = conflictDetector.getConflictSummary([]);

      expect(summary.total).toBe(0);
      expect(Object.keys(summary.by_type)).toHaveLength(0);
      expect(Object.keys(summary.by_field)).toHaveLength(0);
    });
  });

  describe('resolveConflict()', () => {
    const sourceRecord = { id: 1, name: 'Source', email: 'source@example.com' };
    const targetRecord = { id: 1, name: 'Target', email: 'target@example.com' };

    it('should keep source record when keep_source strategy', () => {
      const resolved = conflictDetector.resolveConflict(sourceRecord, targetRecord, 'keep_source');

      expect(resolved).toEqual(sourceRecord);
    });

    it('should keep target record when keep_target strategy', () => {
      const resolved = conflictDetector.resolveConflict(sourceRecord, targetRecord, 'keep_target');

      expect(resolved).toEqual(targetRecord);
    });

    it('should merge records when merge strategy', () => {
      const sourceWithExtra = { ...sourceRecord, extra_field: 'source' };
      const targetWithExtra = { ...targetRecord, extra_field: 'target' };

      const resolved = conflictDetector.resolveConflict(sourceWithExtra, targetWithExtra, 'merge');

      expect(resolved.name).toBe('Source');
      expect(resolved.email).toBe('Target');
    });

    it('should throw error for unknown strategy', () => {
      expect(() => {
        conflictDetector.resolveConflict(sourceRecord, targetRecord, 'invalid_strategy');
      }).toThrow('Unknown resolution strategy');
    });

    it('should default to keep_source strategy', () => {
      const resolved = conflictDetector.resolveConflict(sourceRecord, targetRecord);

      expect(resolved).toEqual(sourceRecord);
    });
  });

  describe('mergeRecords()', () => {
    it('should merge records preferring target non-null values', () => {
      const sourceRecord = {
        id: 1,
        name: 'Source',
        email: 'source@example.com',
        phone: null
      };

      const targetRecord = {
        id: 1,
        name: 'Source',
        email: 'target@example.com',
        phone: '123456'
      };

      const merged = conflictDetector.mergeRecords(sourceRecord, targetRecord);

      expect(merged.id).toBe(1);
      expect(merged.name).toBe('Source');
      expect(merged.email).toBe('target@example.com');
      expect(merged.phone).toBe('123456');
    });

    it('should preserve source fields not in target', () => {
      const sourceRecord = { id: 1, name: 'Name', source_only: 'value' };
      const targetRecord = { id: 1, name: 'Name' };

      const merged = conflictDetector.mergeRecords(sourceRecord, targetRecord);

      expect(merged.source_only).toBe('value');
    });
  });

  describe('getDetailedDiff()', () => {
    it('should identify added, removed, and modified fields', () => {
      const sourceRecord = {
        id: 1,
        name: 'Source Name',
        removed_field: 'value'
      };

      const targetRecord = {
        id: 1,
        name: 'Target Name',
        added_field: 'value'
      };

      const diff = conflictDetector.getDetailedDiff(sourceRecord, targetRecord);

      expect(diff.removed_in_target.removed_field).toBe('value');
      expect(diff.added_in_target.added_field).toBe('value');
      expect(diff.modified.name).toEqual({
        source: 'Source Name',
        target: 'Target Name'
      });
    });

    it('should handle identical records', () => {
      const record = { id: 1, name: 'Name', email: 'test@example.com' };

      const diff = conflictDetector.getDetailedDiff(record, record);

      expect(Object.keys(diff.removed_in_target)).toHaveLength(0);
      expect(Object.keys(diff.added_in_target)).toHaveLength(0);
      expect(Object.keys(diff.modified)).toHaveLength(0);
    });
  });

  describe('valuesEqual()', () => {
    it('should consider identical primitives as equal', () => {
      expect(conflictDetector.valuesEqual('value', 'value')).toBe(true);
      expect(conflictDetector.valuesEqual(123, 123)).toBe(true);
      expect(conflictDetector.valuesEqual(true, true)).toBe(true);
    });

    it('should consider different primitives as not equal', () => {
      expect(conflictDetector.valuesEqual('value1', 'value2')).toBe(false);
      expect(conflictDetector.valuesEqual(123, 456)).toBe(false);
      expect(conflictDetector.valuesEqual(true, false)).toBe(false);
    });

    it('should handle null and undefined correctly', () => {
      expect(conflictDetector.valuesEqual(null, null)).toBe(true);
      expect(conflictDetector.valuesEqual(undefined, undefined)).toBe(true);
      expect(conflictDetector.valuesEqual(null, undefined)).toBe(false);
    });

    it('should compare arrays deeply', () => {
      expect(conflictDetector.valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(conflictDetector.valuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(conflictDetector.valuesEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('should compare objects deeply', () => {
      expect(conflictDetector.valuesEqual(
        { name: 'John', age: 30 },
        { name: 'John', age: 30 }
      )).toBe(true);

      expect(conflictDetector.valuesEqual(
        { name: 'John', age: 30 },
        { name: 'Jane', age: 30 }
      )).toBe(false);
    });

    it('should compare nested structures', () => {
      expect(conflictDetector.valuesEqual(
        { user: { name: 'John', hobbies: ['reading', 'coding'] } },
        { user: { name: 'John', hobbies: ['reading', 'coding'] } }
      )).toBe(true);

      expect(conflictDetector.valuesEqual(
        { user: { name: 'John', hobbies: ['reading', 'coding'] } },
        { user: { name: 'John', hobbies: ['reading', 'gaming'] } }
      )).toBe(false);
    });

    it('should handle different types', () => {
      expect(conflictDetector.valuesEqual('123', 123)).toBe(false);
      expect(conflictDetector.valuesEqual([1], { '0': 1 })).toBe(false);
    });
  });

  describe('formatConflict()', () => {
    it('should format conflict with source and target info', () => {
      const conflict = {
        field: 'name',
        source_value: 'Source Name',
        target_value: 'Target Name',
        type: 'value_mismatch'
      };

      const sourceRecord = {
        id: 1,
        name: 'Source Name',
        write_date: '2025-01-15'
      };

      const targetRecord = {
        id: 1,
        name: 'Target Name',
        write_date: '2025-01-10'
      };

      const formatted = conflictDetector.formatConflict(conflict, sourceRecord, targetRecord);

      expect(formatted.field).toBe('name');
      expect(formatted.type).toBe('value_mismatch');
      expect(formatted.source.value).toBe('Source Name');
      expect(formatted.source.updated).toBe('2025-01-15');
      expect(formatted.target.value).toBe('Target Name');
      expect(formatted.target.updated).toBe('2025-01-10');
      expect(formatted.recommendation).toBeDefined();
    });
  });

  describe('getRecommendation()', () => {
    it('should recommend keep_source when source is newer', () => {
      const sourceRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const targetRecord = {
        id: 1,
        write_date: '2025-01-10T10:00:00'
      };

      const recommendation = conflictDetector.getRecommendation(sourceRecord, targetRecord);

      expect(recommendation).toContain('keep_source');
    });

    it('should recommend keep_target when target is newer', () => {
      const sourceRecord = {
        id: 1,
        write_date: '2025-01-10T10:00:00'
      };

      const targetRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const recommendation = conflictDetector.getRecommendation(sourceRecord, targetRecord);

      expect(recommendation).toContain('keep_target');
    });

    it('should recommend manual review when both have same write date', () => {
      const sourceRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const targetRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const recommendation = conflictDetector.getRecommendation(sourceRecord, targetRecord);

      expect(recommendation).toBe('manual_review_required');
    });

    it('should return skip for null records', () => {
      const recommendation = conflictDetector.getRecommendation(null, null);

      expect(recommendation).toBe('skip');
    });

    it('should handle missing write_date gracefully', () => {
      const sourceRecord = { id: 1 };
      const targetRecord = { id: 1 };

      const recommendation = conflictDetector.getRecommendation(sourceRecord, targetRecord);

      expect(recommendation).toBe('manual_review_required');
    });
  });
});
