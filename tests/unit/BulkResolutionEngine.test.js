import Database from 'better-sqlite3';
import { BulkResolutionEngine } from '../../src/services/BulkResolutionEngine.js';

const createDb = () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      odoo_model TEXT NOT NULL,
      field_name TEXT,
      state TEXT DEFAULT 'detected'
    );
  `);
  return db;
};

describe('BulkResolutionEngine', () => {
  it('should preview matching conflicts without applying changes', () => {
    const db = createDb();
    db.prepare('INSERT INTO sync_conflicts (odoo_model, field_name, state) VALUES (?, ?, ?)').run('res.partner', 'name', 'detected');
    db.prepare('INSERT INTO sync_conflicts (odoo_model, field_name, state) VALUES (?, ?, ?)').run('product.product', 'name', 'detected');

    const conflictResolver = {
      resolve: jest.fn(),
      apply: jest.fn()
    };
    const engine = new BulkResolutionEngine(db, conflictResolver);

    const result = engine.preview({ model: 'res.partner', action: 'keep_local' });
    const state = db.prepare('SELECT state FROM sync_conflicts WHERE odoo_model = ?').get('res.partner');

    expect(result.matches).toBe(1);
    expect(state.state).toBe('detected');
    expect(conflictResolver.resolve).not.toHaveBeenCalled();
  });

  it('should apply rules atomically', () => {
    const db = createDb();
    const first = db.prepare('INSERT INTO sync_conflicts (odoo_model, field_name, state) VALUES (?, ?, ?)').run('res.partner', 'name', 'detected');
    const second = db.prepare('INSERT INTO sync_conflicts (odoo_model, field_name, state) VALUES (?, ?, ?)').run('res.partner', 'email', 'detected');

    const conflictResolver = {
      resolve: (id) => db.prepare('UPDATE sync_conflicts SET state = ? WHERE id = ?').run('resolved', id),
      apply: (id) => {
        if (id === second.lastInsertRowid) {
          throw new Error('Apply failed');
        }
        db.prepare('UPDATE sync_conflicts SET state = ? WHERE id = ?').run('applied', id);
      }
    };

    const engine = new BulkResolutionEngine(db, conflictResolver);

    expect(() => engine.apply({ model: 'res.partner', action: 'keep_local' })).toThrow('Apply failed');

    const states = db.prepare('SELECT state FROM sync_conflicts ORDER BY id').all();
    expect(states.every(row => row.state === 'detected')).toBe(true);
  });

  it('should validate rule format', () => {
    const db = createDb();
    const engine = new BulkResolutionEngine(db, { resolve: jest.fn(), apply: jest.fn() });

    expect(() => engine.preview(null)).toThrow('Rule must be an object');
    expect(() => engine.preview({ action: 'keep_local' })).toThrow('Rule requires model');
    expect(() => engine.preview({ model: 'res.partner', action: 'invalid' })).toThrow('Rule action must be keep_local or keep_odoo');
  });
});
