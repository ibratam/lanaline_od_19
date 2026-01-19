import logger from '../utils/logger.js';
import { ConflictDetector } from './ConflictDetector.js';

/**
 * Sync Engine Service
 * Core synchronization logic for comparing and syncing records
 */
export class SyncEngine {
  constructor(odooClient) {
    this.odooClient = odooClient;
    this.conflictDetector = new ConflictDetector();
  }

  /**
   * Generate preview of synchronization
   * Compares source and target databases, identifies conflicts
   */
  async generatePreview(sourceClient, targetClient, modelFilter = null) {
    try {
      logger.info('Generating sync preview...');

      const preview = {
        generated_at: new Date().toISOString(),
        summary: {
          total_models: 0,
          total_records_to_create: 0,
          total_records_to_update: 0,
          total_records_to_delete: 0,
          total_conflicts: 0
        },
        models: []
      };

      // Get list of models to sync
      const models = await this.getModelsToSync(sourceClient, modelFilter);
      preview.summary.total_models = models.length;

      // Compare each model
      for (const model of models) {
        logger.debug(`Comparing model: ${model}`);

        try {
          const modelComparison = await this.compareModel(
            sourceClient,
            targetClient,
            model
          );

          preview.models.push(modelComparison);

          // Update summary
          preview.summary.total_records_to_create += modelComparison.to_create.count;
          preview.summary.total_records_to_update += modelComparison.to_update.count;
          preview.summary.total_records_to_delete += modelComparison.to_delete.count;
          preview.summary.total_conflicts += modelComparison.conflicts.length;
        } catch (error) {
          logger.warn(`Error comparing model ${model}: ${error.message}`);
          preview.models.push({
            model,
            error: error.message,
            to_create: { count: 0, records: [] },
            to_update: { count: 0, records: [] },
            to_delete: { count: 0, records: [] },
            conflicts: []
          });
        }
      }

      logger.info('Preview generation complete', {
        models: preview.summary.total_models,
        creates: preview.summary.total_records_to_create,
        updates: preview.summary.total_records_to_update,
        deletes: preview.summary.total_records_to_delete,
        conflicts: preview.summary.total_conflicts
      });

      return preview;
    } catch (error) {
      logger.error('Error generating preview:', error);
      throw error;
    }
  }

  /**
   * Get list of models to sync
   */
  async getModelsToSync(sourceClient, modelFilter = null) {
    try {
      // Get all available models
      const allModels = await sourceClient.getModels();

      // Extract model names
      let models = allModels
        .map(m => m.model)
        .filter(m => m && !m.startsWith('_')); // Exclude internal models

      // Filter by model_filter if provided
      if (modelFilter && Array.isArray(modelFilter) && modelFilter.length > 0) {
        models = models.filter(m => modelFilter.includes(m));
      }

      logger.info(`Models to sync: ${models.length}`);
      return models;
    } catch (error) {
      logger.error('Error getting models:', error);
      throw error;
    }
  }

  /**
   * Compare a single model between source and target
   */
  async compareModel(sourceClient, targetClient, model) {
    try {
      logger.debug(`Comparing model: ${model}`);

      // Get all records from source
      const sourceRecords = await sourceClient.search(model, [], 0, 0);
      logger.debug(`Source: ${sourceRecords.length} records in ${model}`);

      // Get all records from target
      const targetRecords = await targetClient.search(model, [], 0, 0);
      logger.debug(`Target: ${targetRecords.length} records in ${model}`);

      // Get full record data
      const sourceData = sourceRecords.length > 0 ?
        await sourceClient.read(model, sourceRecords, []) : [];
      const targetData = targetRecords.length > 0 ?
        await targetClient.read(model, targetRecords, []) : [];

      // Convert to maps for easier lookup
      const sourceMap = new Map(sourceData.map(r => [r.id, r]));
      const targetMap = new Map(targetData.map(r => [r.id, r]));

      const comparison = {
        model,
        to_create: { count: 0, records: [] },
        to_update: { count: 0, records: [] },
        to_delete: { count: 0, records: [] },
        conflicts: []
      };

      // Find records to create (in source but not in target)
      for (const [id, sourceRecord] of sourceMap) {
        if (!targetMap.has(id)) {
          comparison.to_create.records.push({
            id,
            data: sourceRecord
          });
          comparison.to_create.count++;
        }
      }

      // Find records to update or conflicts
      for (const [id, sourceRecord] of sourceMap) {
        const targetRecord = targetMap.get(id);
        if (targetRecord) {
          // Compare records for differences
          const diff = this.compareRecords(sourceRecord, targetRecord);
          if (diff.hasDifferences) {
            // Check if it's a conflict (both have different values)
            const hasConflict = this.detectConflict(sourceRecord, targetRecord, diff);
            if (hasConflict) {
              comparison.conflicts.push({
                record_id: id,
                source_values: sourceRecord,
                target_values: targetRecord,
                differences: diff.differences,
                source_create_date: sourceRecord.create_date,
                target_create_date: targetRecord.create_date,
                source_write_date: sourceRecord.write_date,
                target_write_date: targetRecord.write_date
              });
            } else {
              // Regular update
              comparison.to_update.records.push({
                id,
                source: sourceRecord,
                target: targetRecord,
                differences: diff.differences
              });
              comparison.to_update.count++;
            }
          }
        }
      }

      // Find records to delete (in target but not in source)
      for (const [id, targetRecord] of targetMap) {
        if (!sourceMap.has(id)) {
          comparison.to_delete.records.push({
            id,
            data: targetRecord
          });
          comparison.to_delete.count++;
        }
      }

      logger.debug(`Model ${model}: creates=${comparison.to_create.count}, updates=${comparison.to_update.count}, deletes=${comparison.to_delete.count}, conflicts=${comparison.conflicts.length}`);

      return comparison;
    } catch (error) {
      logger.error(`Error comparing model ${model}:`, error);
      throw error;
    }
  }

  /**
   * Compare two records for differences
   */
  compareRecords(sourceRecord, targetRecord) {
    const differences = {};
    let hasDifferences = false;

    // Compare all fields from source record
    for (const [key, sourceValue] of Object.entries(sourceRecord)) {
      // Skip system fields
      if (['id', 'create_date', 'write_date', '__last_update'].includes(key)) {
        continue;
      }

      const targetValue = targetRecord[key];

      // Compare values (deep comparison for objects/arrays)
      if (!this.valuesEqual(sourceValue, targetValue)) {
        differences[key] = {
          source: sourceValue,
          target: targetValue
        };
        hasDifferences = true;
      }
    }

    // Check for fields in target but not in source
    for (const key of Object.keys(targetRecord)) {
      if (['id', 'create_date', 'write_date', '__last_update'].includes(key)) {
        continue;
      }

      if (!(key in sourceRecord)) {
        differences[key] = {
          source: undefined,
          target: targetRecord[key]
        };
        hasDifferences = true;
      }
    }

    return { hasDifferences, differences };
  }

  /**
   * Detect if records have a conflict (both modified)
   */
  detectConflict(sourceRecord, targetRecord, diff) {
    // Simple heuristic: if both have different write dates, it's a conflict
    if (sourceRecord.write_date && targetRecord.write_date) {
      const sourceDate = new Date(sourceRecord.write_date);
      const targetDate = new Date(targetRecord.write_date);

      // If both were recently modified, consider it a conflict
      if (sourceDate.getTime() !== targetDate.getTime()) {
        return true;
      }
    }

    return false;
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
}

export default SyncEngine;
