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
    const metadata = this.preserveRecordMetadata(record);
    return this.applyMetadata(base, metadata);
  }

  /**
   * Prepare values for update operation
   */
  prepareUpdateValues(record) {
    const base = this.stripSystemFields(record);
    const metadata = this.preserveRecordMetadata(record);
    return this.applyMetadata(base, metadata);
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
    return sanitized;
  }

  /**
   * Apply preserved metadata to outgoing values
   */
  applyMetadata(values, metadata) {
    const result = { ...(values || {}) };

    if (metadata) {
      if (metadata.id !== null && metadata.id !== undefined) {
        result.id = metadata.id;
      }
      if (metadata.create_date) {
        result.create_date = metadata.create_date;
      }
      if (metadata.write_date) {
        result.write_date = metadata.write_date;
      }
    }

    return result;
  }
}

export default DataPreserver;
