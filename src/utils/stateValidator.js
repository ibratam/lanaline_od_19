const CONFLICT_TRANSITIONS = {
  detected: ['resolved'],
  resolved: ['applied', 'needs_manual_review', 'failed_resolution'],
  applied: ['failed_resolution'],
  failed_resolution: ['applied', 'needs_manual_review', 'resolved'],
  needs_manual_review: ['resolved']
};

const SYNC_OPERATION_TRANSITIONS = {
  queued: ['running'],
  running: ['completed', 'failed', 'needs_review'],
  failed: ['needs_review'],
  needs_review: [],
  completed: []
};

export function validateConflictTransition(fromState, toState) {
  const allowed = CONFLICT_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

export function validateSyncOperationTransition(fromState, toState) {
  const allowed = SYNC_OPERATION_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

export function ensureConflictTransition(fromState, toState) {
  if (!validateConflictTransition(fromState, toState)) {
    throw new Error(`Invalid conflict state transition: ${fromState} -> ${toState}`);
  }
}

export function ensureSyncOperationTransition(fromState, toState) {
  if (!validateSyncOperationTransition(fromState, toState)) {
    throw new Error(`Invalid sync operation state transition: ${fromState} -> ${toState}`);
  }
}

export default {
  validateConflictTransition,
  validateSyncOperationTransition,
  ensureConflictTransition,
  ensureSyncOperationTransition
};
