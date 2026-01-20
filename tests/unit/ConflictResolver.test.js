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
  describe('State Machine Transitions', () => {
    it('should transition from detected to resolved', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

      const resolved = resolver.resolve(result.lastInsertRowid, 'local', 10);

      expect(resolved.state).toBe('resolved');

      const conflict = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(result.lastInsertRowid);
      const resolution = db.prepare('SELECT * FROM conflict_resolutions WHERE conflict_id = ?').get(result.lastInsertRowid);

      expect(conflict.state).toBe('resolved');
      expect(resolution.chosen_version).toBe('local');
      expect(resolution.user_id).toBe(10);
      expect(resolution.resolved_at).not.toBeNull();
    });

    it('should support choosing odoo version', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

      resolver.resolve(result.lastInsertRowid, 'odoo', 5);

      const resolution = db.prepare('SELECT * FROM conflict_resolutions WHERE conflict_id = ?').get(result.lastInsertRowid);
      expect(resolution.chosen_version).toBe('odoo');
      expect(resolution.user_id).toBe(5);
    });

    it('should prevent duplicate resolution on already-resolved conflict', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'resolved');

      expect(() => resolver.resolve(result.lastInsertRowid, 'odoo')).toThrow('Conflict already resolved');
    });

    it('should prevent duplicate resolution on applied conflict', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'applied');

      expect(() => resolver.resolve(result.lastInsertRowid, 'local')).toThrow('Conflict already resolved');
    });

    it('should fail on non-existent conflict', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      expect(() => resolver.resolve(9999, 'local')).toThrow('not found');
    });

    it('should validate chosen version parameter', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

      expect(() => resolver.resolve(result.lastInsertRowid, 'invalid')).toThrow('Invalid chosenVersion');
    });

    it('should transition from resolved to applied on successful apply', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

      // First resolve the conflict (creates resolution record)
      resolver.resolve(result.lastInsertRowid, 'local', 10);

      const response = resolver.apply(result.lastInsertRowid);
      expect(response.status).toBe('applied');

      const conflict = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(result.lastInsertRowid);
      expect(conflict.state).toBe('applied');

      const resolution = db.prepare('SELECT * FROM conflict_resolutions WHERE conflict_id = ?').get(result.lastInsertRowid);
      expect(resolution.applied_at).not.toBeNull();
    });

    it('should fail apply if conflict is not resolved', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify({ name: 'A' }), JSON.stringify({ name: 'B' }), 'detected');

      expect(() => resolver.apply(result.lastInsertRowid)).toThrow('not resolved');
    });
  });

  describe('Error Categorization', () => {
    const resolver = new ConflictResolver(createDb());

    it('should categorize validation errors as user-correctable', () => {
      expect(resolver._categorizeError({ message: 'Validation failed' })).toBe('user_correctable');
      expect(resolver._categorizeError({ message: 'Required field missing' })).toBe('user_correctable');
      expect(resolver._categorizeError({ message: 'Constraint violation' })).toBe('user_correctable');
    });

    it('should categorize network errors as system', () => {
      expect(resolver._categorizeError({ message: 'Network timeout' })).toBe('system');
      expect(resolver._categorizeError({ message: 'Connection timeout' })).toBe('system');
      expect(resolver._categorizeError({ message: 'ECONNREFUSED' })).toBe('system');
      expect(resolver._categorizeError({ message: 'ENOTFOUND host' })).toBe('system');
    });

    it('should categorize unknown errors as unrecoverable', () => {
      expect(resolver._categorizeError({ message: 'Fatal error' })).toBe('unrecoverable');
      expect(resolver._categorizeError({ message: 'Database corrupted' })).toBe('unrecoverable');
    });

    it('should handle errors with UC/SE/UR codes', () => {
      expect(resolver._categorizeError({ code: 'UC-001' })).toBe('user_correctable');
      expect(resolver._categorizeError({ code: 'SE-001' })).toBe('system');
      expect(resolver._categorizeError({ code: 'UR-001' })).toBe('unrecoverable');
    });

    it('should handle missing or invalid error objects', () => {
      expect(resolver._categorizeError(null)).toBe('unrecoverable');
      expect(resolver._categorizeError(undefined)).toBe('unrecoverable');
      expect(resolver._categorizeError({})).toBe('unrecoverable');
    });
  });

  describe('Data Parsing', () => {
    it('should parse JSON source and target values', () => {
      const db = createDb();
      const resolver = new ConflictResolver(db);

      const sourceData = { name: 'Product A', price: 100 };
      const targetData = { name: 'Product B', price: 150 };

      const insert = db.prepare(`
        INSERT INTO sync_conflicts (source_values, target_values, state)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(JSON.stringify(sourceData), JSON.stringify(targetData), 'detected');

      const conflict = resolver._getConflict(result.lastInsertRowid);
      expect(conflict.source_values).toEqual(sourceData);
      expect(conflict.target_values).toEqual(targetData);
    });
  });
});
