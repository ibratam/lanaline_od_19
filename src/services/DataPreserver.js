/**
 * Data Preserver Service
 * Ensures original IDs and timestamps are retained during sync operations.
 */
export class DataPreserver {
  /**
   * Extract metadata from a source record
   */
  preserveRecordMetadata(record) {
    if (!record || typeof record !== 'object') {
      return {
        id: null,
        create_date: null,
        write_date: null
      };
    }

    return {
      id: record.id ?? null,
      create_date: record.create_date ?? null,
      write_date: record.write_date ?? null
    };
  }

  /**
   * Prepare values for create operation
   */
  prepareCreateValues(record) {
    const base = this.stripSystemFields(record);
    return this.normalizeValues(base);
  }

  /**
   * Prepare values for update operation
   */
  prepareUpdateValues(record) {
    const base = this.stripSystemFields(record);
    return this.normalizeValues(base);
  }

  /**
   * Remove system fields that should not be written directly
   */
  stripSystemFields(record) {
    if (!record || typeof record !== 'object') {
      return {};
    }

    const sanitized = { ...record };
    delete sanitized.__last_update;
    delete sanitized.id;
    delete sanitized.create_date;
    delete sanitized.write_date;
    delete sanitized.display_name;
    return sanitized;
  }

  /**
   * Normalize values for write operations
   */
  normalizeValues(values) {
    const result = { ...(values || {}) };

    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        if (value.length === 2 && typeof value[1] === 'string') {
          result[key] = value[0] || false;
        } else {
          delete result[key];
        }
      }
    }

    return result;
  }
}

export default DataPreserver;
