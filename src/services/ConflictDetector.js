import logger from '../utils/logger.js';

/**
 * Conflict Detector Service
 * Identifies and analyzes conflicts between records
 */
export class ConflictDetector {
  /**
   * Detect conflicts between source and target records
   */
  detectConflicts(sourceRecord, targetRecord, model = null) {
    const conflicts = [];

    if (!sourceRecord || !targetRecord) {
      return conflicts;
    }

    // Compare all fields
    const allKeys = new Set([
      ...Object.keys(sourceRecord),
      ...Object.keys(targetRecord)
    ]);

    for (const key of allKeys) {
      // Skip system fields
      if (['id', 'create_date', 'write_date', '__last_update'].includes(key)) {
        continue;
      }

      const sourceValue = sourceRecord[key];
      const targetValue = targetRecord[key];

      // If values differ, it's a conflict
      if (!this.valuesEqual(sourceValue, targetValue)) {
        conflicts.push({
          field: key,
          source_value: sourceValue,
          target_value: targetValue,
          type: this.getConflictType(sourceValue, targetValue)
        });
      }
    }

    return conflicts;
  }

  /**
   * Classify conflict type
   */
  getConflictType(sourceValue, targetValue) {
    if (sourceValue === null || sourceValue === undefined) {
      return 'field_added_in_target';
    }
    if (targetValue === null || targetValue === undefined) {
      return 'field_removed_in_target';
    }
    if (typeof sourceValue !== typeof targetValue) {
      return 'type_mismatch';
    }
    return 'value_mismatch';
  }

  /**
   * Get conflict summary
   */
  getConflictSummary(conflicts) {
    const summary = {
      total: conflicts.length,
      by_type: {},
      by_field: {}
    };

    for (const conflict of conflicts) {
      // Count by type
      summary.by_type[conflict.type] = (summary.by_type[conflict.type] || 0) + 1;

      // Count by field
      summary.by_field[conflict.field] = (summary.by_field[conflict.field] || 0) + 1;
    }

    return summary;
  }

  /**
   * Resolve conflict with specified resolution strategy
   */
  resolveConflict(sourceRecord, targetRecord, resolution = 'keep_source') {
    if (resolution === 'keep_source') {
      return sourceRecord;
    } else if (resolution === 'keep_target') {
      return targetRecord;
    } else if (resolution === 'merge') {
      return this.mergeRecords(sourceRecord, targetRecord);
    }
    throw new Error(`Unknown resolution strategy: ${resolution}`);
  }

  /**
   * Merge two records (target takes precedence for non-null fields)
   */
  mergeRecords(sourceRecord, targetRecord) {
    const merged = { ...sourceRecord };

    for (const [key, value] of Object.entries(targetRecord)) {
      // Prefer non-null values from target
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Detect field-level conflicts with detailed diff
   */
  getDetailedDiff(sourceRecord, targetRecord) {
    const diff = {
      added_in_target: {},
      removed_in_target: {},
      modified: {}
    };

    // Fields only in source (removed in target)
    for (const [key, value] of Object.entries(sourceRecord)) {
      if (!(key in targetRecord)) {
        diff.removed_in_target[key] = value;
      }
    }

    // Fields only in target (added in target)
    for (const [key, value] of Object.entries(targetRecord)) {
      if (!(key in sourceRecord)) {
        diff.added_in_target[key] = value;
      }
    }

    // Fields modified in both
    for (const key of Object.keys(sourceRecord)) {
      if (key in targetRecord && !this.valuesEqual(sourceRecord[key], targetRecord[key])) {
        diff.modified[key] = {
          source: sourceRecord[key],
          target: targetRecord[key]
        };
      }
    }

    return diff;
  }

  /**
   * Compare values for equality
   */
  valuesEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    // Compare arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.valuesEqual(val, b[idx]));
    }

    // Compare objects
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.valuesEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Format conflict for display
   */
  formatConflict(conflict, sourceRecord, targetRecord) {
    return {
      field: conflict.field,
      type: conflict.type,
      source: {
        value: conflict.source_value,
        updated: sourceRecord?.write_date
      },
      target: {
        value: conflict.target_value,
        updated: targetRecord?.write_date
      },
      recommendation: this.getRecommendation(sourceRecord, targetRecord)
    };
  }

  /**
   * Get recommendation for conflict resolution
   */
  getRecommendation(sourceRecord, targetRecord) {
    if (!sourceRecord || !targetRecord) {
      return 'skip';
    }

    // If source is newer, recommend keeping source
    const sourceDate = new Date(sourceRecord.write_date || 0);
    const targetDate = new Date(targetRecord.write_date || 0);

    if (sourceDate > targetDate) {
      return 'keep_source (source is newer)';
    } else if (targetDate > sourceDate) {
      return 'keep_target (target is newer)';
    }

    return 'manual_review_required';
  }
}

export default ConflictDetector;
