/**
 * DataInconsistency Model
 * Represents a detected mismatch between local database and Odoo
 * Stores: record ID, field name, local value, Odoo value, inconsistency type, suggested repair
 */

export class DataInconsistency {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new data inconsistency record
   * @param {Object} data - Inconsistency details
   * @returns {Object} Created inconsistency record
   */
  create(data) {
    const {
      record_id,
      odoo_model,
      field_name,
      local_value,
      odoo_value,
      inconsistency_type, // data_mismatch, missing_record, extra_record
      suggested_repair, // keep_local, keep_odoo, manual_review
      sync_operation_id
    } = data;

    const stmt = this.db.prepare(`
      INSERT INTO data_inconsistencies (
        record_id, odoo_model, field_name, local_value, odoo_value,
        inconsistency_type, suggested_repair, sync_operation_id, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `);

    const result = stmt.run(
      record_id, odoo_model, field_name, local_value, odoo_value,
      inconsistency_type, suggested_repair, sync_operation_id
    );

    return this.getById(result.lastInsertRowid);
  }

  /**
   * Get inconsistency by ID
   * @param {number} id - Inconsistency ID
   * @returns {Object|null} Inconsistency record or null
   */
  getById(id) {
    const stmt = this.db.prepare(`
      SELECT * FROM data_inconsistencies WHERE id = ?
    `);
    return stmt.get(id);
  }

  /**
   * Get all inconsistencies for a sync operation
   * @param {number} syncOperationId - Sync operation ID
   * @returns {Array} Array of inconsistency records
   */
  getBySyncOperation(syncOperationId) {
    const stmt = this.db.prepare(`
      SELECT * FROM data_inconsistencies
      WHERE sync_operation_id = ?
      ORDER BY inconsistency_type, record_id
    `);
    return stmt.all(syncOperationId);
  }

  /**
   * Get inconsistencies by type (pagination support)
   * @param {string} inconsistencyType - Type of inconsistency (data_mismatch, missing_record, extra_record)
   * @param {number} limit - Number of results
   * @param {number} offset - Offset for pagination
   * @returns {Array} Array of inconsistency records
   */
  getByType(inconsistencyType, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM data_inconsistencies
      WHERE inconsistency_type = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(inconsistencyType, limit, offset);
  }

  /**
   * Get summary of inconsistencies (count by type and status)
   * @param {number} syncOperationId - Sync operation ID (optional)
   * @returns {Object} Summary with counts by type
   */
  getSummary(syncOperationId = null) {
    let query = `
      SELECT
        inconsistency_type,
        status,
        COUNT(*) as count
      FROM data_inconsistencies
    `;

    const params = [];

    if (syncOperationId) {
      query += ` WHERE sync_operation_id = ?`;
      params.push(syncOperationId);
    }

    query += ` GROUP BY inconsistency_type, status`;

    const stmt = this.db.prepare(query);
    const results = params.length > 0 ? stmt.all(...params) : stmt.all();

    const summary = {
      data_mismatch: { pending: 0, resolved: 0, failed: 0 },
      missing_record: { pending: 0, resolved: 0, failed: 0 },
      extra_record: { pending: 0, resolved: 0, failed: 0 },
      total_pending: 0
    };

    results.forEach(row => {
      if (summary[row.inconsistency_type]) {
        summary[row.inconsistency_type][row.status] = row.count;
        if (row.status === 'pending') {
          summary.total_pending += row.count;
        }
      }
    });

    return summary;
  }

  /**
   * Update inconsistency status and repair action
   * @param {number} id - Inconsistency ID
   * @param {string} status - New status (resolved, failed)
   * @param {string} repairAction - Repair that was applied (keep_local, keep_odoo, manual_review)
   * @returns {Object} Updated record
   */
  updateRepair(id, status, repairAction) {
    const stmt = this.db.prepare(`
      UPDATE data_inconsistencies
      SET status = ?, suggested_repair = ?, resolved_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(status, repairAction, id);
    return this.getById(id);
  }

  /**
   * Get all pending inconsistencies for repair
   * @param {number} limit - Number of results
   * @returns {Array} Array of pending inconsistency records
   */
  getPending(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM data_inconsistencies
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Get detailed inconsistency records with samples
   * @param {number} syncOperationId - Sync operation ID
   * @param {number} sampleSize - Number of sample records per type
   * @returns {Object} Detailed report with samples
   */
  getDetailedReport(syncOperationId, sampleSize = 5) {
    const inconsistencies = this.getBySyncOperation(syncOperationId);
    const summary = this.getSummary(syncOperationId);

    // Group by type and get samples
    const samples = {
      data_mismatch: [],
      missing_record: [],
      extra_record: []
    };

    inconsistencies.forEach(inc => {
      if (samples[inc.inconsistency_type] && samples[inc.inconsistency_type].length < sampleSize) {
        samples[inc.inconsistency_type].push(inc);
      }
    });

    return {
      summary,
      samples,
      total_records: inconsistencies.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Delete resolved inconsistencies older than specified days
   * @param {number} daysOld - Delete records older than this many days
   * @returns {number} Number of records deleted
   */
  cleanupResolved(daysOld = 30) {
    const stmt = this.db.prepare(`
      DELETE FROM data_inconsistencies
      WHERE status = 'resolved'
      AND resolved_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(daysOld);
    return result.changes;
  }
}

export default DataInconsistency;
