import logger from '../utils/logger.js';
import ErrorCategorizer from './ErrorCategorizer.js';

/**
 * Sync Operation Logger
 * Captures timing, phases, state transitions, and error details.
 */
export class SyncOperationLogger {
  constructor(errorCategorizer = new ErrorCategorizer()) {
    this.errorCategorizer = errorCategorizer;
    this.operationCounter = 0;
    this.operations = new Map();
  }

  startOperation(meta) {
    const id = `${Date.now()}-${this.operationCounter++}`;
    const entry = {
      id,
      ...meta,
      started_at: Date.now(),
      phases: {},
      state_transitions: []
    };
    this.operations.set(id, entry);
    this._log('operation_start', entry);
    return id;
  }

  startPhase(operationId, phase) {
    const entry = this.operations.get(operationId);
    if (!entry) return;
    entry.phases[phase] = { started_at: Date.now() };
    this._log('phase_start', { operationId, phase });
  }

  endPhase(operationId, phase, extra = {}) {
    const entry = this.operations.get(operationId);
    if (!entry || !entry.phases[phase]) return;
    const phaseData = entry.phases[phase];
    phaseData.ended_at = Date.now();
    phaseData.duration_ms = phaseData.ended_at - phaseData.started_at;

    // Capture cumulative timing
    if (!entry.cumulative_timing) {
      entry.cumulative_timing = {};
    }
    entry.cumulative_timing[phase] = phaseData.duration_ms;

    Object.assign(phaseData, extra);
    this._log('phase_end', { operationId, phase, duration_ms: phaseData.duration_ms });
  }

  /**
   * Record records processed in a phase
   * @param {string} operationId - Operation ID
   * @param {string} phase - Phase name
   * @param {number} count - Number of records processed
   */
  recordPhaseProgress(operationId, phase, count) {
    const entry = this.operations.get(operationId);
    if (!entry || !entry.phases[phase]) return;
    const phaseData = entry.phases[phase];
    phaseData.records_processed = (phaseData.records_processed || 0) + count;
    this._log('phase_progress', { operationId, phase, records_processed: phaseData.records_processed });
  }

  /**
   * Record errors in a specific phase
   * @param {string} operationId - Operation ID
   * @param {string} phase - Phase name
   * @param {Error} error - Error object
   */
  recordPhaseError(operationId, phase, error) {
    const entry = this.operations.get(operationId);
    if (!entry || !entry.phases[phase]) return;
    const phaseData = entry.phases[phase];
    if (!phaseData.errors) {
      phaseData.errors = [];
    }
    phaseData.errors.push({
      message: error?.message,
      code: error?.code,
      timestamp: new Date().toISOString()
    });
    phaseData.errors_in_phase = phaseData.errors.length;
    this._log('phase_error', { operationId, phase, error: error?.message });
  }

  /**
   * Get cumulative timing for all phases
   * @param {string} operationId - Operation ID
   * @returns {Object} Cumulative timing by phase
   */
  getCumulativeTiming(operationId) {
    const entry = this.operations.get(operationId);
    if (!entry) return {};
    return entry.cumulative_timing || {};
  }

  /**
   * Get performance summary for completed operation
   * @param {string} operationId - Operation ID
   * @returns {Object} Performance data
   */
  getPerformanceSummary(operationId) {
    const entry = this.operations.get(operationId);
    if (!entry) return null;

    const totalDuration = entry.duration_ms || 0;
    const phases = entry.phases || {};
    const phaseTimings = {};
    let totalRecordsProcessed = 0;
    let totalErrorsRecorded = 0;

    Object.entries(phases).forEach(([phaseName, phaseData]) => {
      phaseTimings[phaseName] = {
        duration_ms: phaseData.duration_ms || 0,
        records_processed: phaseData.records_processed || 0,
        errors_in_phase: phaseData.errors_in_phase || 0,
        percentage_of_total: ((phaseData.duration_ms || 0) / totalDuration * 100).toFixed(1)
      };
      totalRecordsProcessed += phaseData.records_processed || 0;
      totalErrorsRecorded += phaseData.errors_in_phase || 0;
    });

    // Identify slowest phase
    const slowestPhase = Object.entries(phaseTimings).reduce((max, [name, data]) =>
      data.duration_ms > (max.data?.duration_ms || 0) ? { name, data } : max
    , { name: null, data: null });

    return {
      total_duration_ms: totalDuration,
      total_records_processed: totalRecordsProcessed,
      total_errors: totalErrorsRecorded,
      throughput_records_per_sec: totalDuration > 0
        ? (totalRecordsProcessed / (totalDuration / 1000)).toFixed(2)
        : 0,
      phase_timings: phaseTimings,
      slowest_phase: slowestPhase.name,
      slowest_phase_duration_ms: slowestPhase.data?.duration_ms || 0,
      state_transitions_count: entry.state_transitions?.length || 0
    };
  }

  transitionState(operationId, from, to, meta = {}) {
    const entry = this.operations.get(operationId);
    if (!entry) return;
    const transition = {
      from,
      to,
      at: new Date().toISOString(),
      ...meta
    };
    entry.state_transitions.push(transition);
    this._log('state_transition', { operationId, ...transition });
  }

  recordError(operationId, error) {
    const entry = this.operations.get(operationId);
    if (!entry) return;
    const category = this.errorCategorizer.categorize(error);
    entry.error = {
      message: error?.message,
      category: category.category,
      code_prefix: category.prefix,
      status_code: category.statusCode
    };
    this._log('operation_error', { operationId, ...entry.error });
  }

  completeOperation(operationId, data = {}) {
    const entry = this.operations.get(operationId);
    if (!entry) return null;
    entry.completed_at = Date.now();
    entry.duration_ms = entry.completed_at - entry.started_at;
    Object.assign(entry, data);
    this._log('operation_complete', {
      operationId,
      duration_ms: entry.duration_ms,
      status: entry.status
    });
    this.operations.delete(operationId);
    return entry;
  }

  _log(event, payload) {
    logger.info('sync_operation_log', {
      event,
      ...payload
    });
  }
}

export default SyncOperationLogger;
