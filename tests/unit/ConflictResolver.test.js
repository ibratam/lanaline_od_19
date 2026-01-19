import Database from 'better-sqlite3';
import { ConflictResolver } from '../../src/services/ConflictResolver.js';

const createDb = () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_values TEXT,
      target_values TEXT,
      state TEXT DEFAULT 'detected',
      resolution TEXT,
      updated_at DATETIME
    );
    CREATE TABLE conflict_resolutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conflict_id INTEGER UNIQUE,
      user_id INTEGER,
      chosen_version TEXT,
      resolved_at DATETIME,
      applied_at DATETIME,
      last_error TEXT,
      last_error_category TEXT,
      last_retry_at DATETIME
    );
  `);
  return db;
};

describe('ConflictResolver', () => {
  it('should transition detected -> resolved', () => {
    const db = createDb();
    const resolver = new ConflictResolver(db);

    const insert = db.prepare(`
      INSERT INTO sync_conflicts (source_values, target_values, state)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

    resolver.resolve(result.lastInsertRowid, 'local', 10);

    const conflict = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(result.lastInsertRowid);
    const resolution = db.prepare('SELECT * FROM conflict_resolutions WHERE conflict_id = ?').get(result.lastInsertRowid);

    expect(conflict.state).toBe('resolved');
    expect(resolution.chosen_version).toBe('local');
  });

  it('should prevent duplicate resolution on resolved conflict', () => {
    const db = createDb();
    const resolver = new ConflictResolver(db);

    const insert = db.prepare(`
      INSERT INTO sync_conflicts (source_values, target_values, state)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'resolved');

    expect(() => resolver.resolve(result.lastInsertRowid, 'odoo')).toThrow('Conflict already resolved');
  });

  it('should categorize errors into UC/SE/UR', () => {
    const resolver = new ConflictResolver(createDb());

    expect(resolver._categorizeError({ message: 'Validation failed' })).toBe('user_correctable');
    expect(resolver._categorizeError({ message: 'Network timeout' })).toBe('system');
    expect(resolver._categorizeError({ message: 'Fatal error' })).toBe('unrecoverable');
  });
});
