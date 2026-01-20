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
    Object.assign(phaseData, extra);
    this._log('phase_end', { operationId, phase, duration_ms: phaseData.duration_ms });
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
