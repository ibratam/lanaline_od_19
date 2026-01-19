import logger from '../utils/logger.js';

export class ConflictLock {
  constructor(db) {
    this.db = db;
  }

  acquire(conflictId, sessionId, userId = null, ttlMs = 5 * 60 * 1000) {
    try {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO conflict_locks (conflict_id, session_id, user_id, expires_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(conflictId, sessionId, userId, expiresAt);
      return this.getByConflictId(conflictId);
    } catch (error) {
      logger.error(`Error acquiring lock for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  release(conflictId) {
    try {
      const stmt = this.db.prepare('DELETE FROM conflict_locks WHERE conflict_id = ?');
      stmt.run(conflictId);
      return true;
    } catch (error) {
      logger.error(`Error releasing lock for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  getByConflictId(conflictId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM conflict_locks WHERE conflict_id = ?');
      return stmt.get(conflictId);
    } catch (error) {
      logger.error(`Error getting lock for conflict ${conflictId}:`, error);
      throw error;
    }
  }

  cleanup() {
    try {
      const stmt = this.db.prepare('DELETE FROM conflict_locks WHERE expires_at <= CURRENT_TIMESTAMP');
      stmt.run();
      return true;
    } catch (error) {
      logger.error('Error cleaning up conflict locks:', error);
      throw error;
    }
  }

  isExpired(lock) {
    if (!lock?.expires_at) return true;
    return new Date(lock.expires_at).getTime() <= Date.now();
  }
}

export default ConflictLock;
