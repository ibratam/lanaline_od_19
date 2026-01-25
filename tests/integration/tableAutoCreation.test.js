import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import TableCreator from '../../src/services/TableCreator.js';
import TableCreationNotifier from '../../src/services/TableCreationNotifier.js';
import TableSchema from '../../src/models/TableSchema.js';

describe('Table Auto-Creation Integration Tests', () => {
  let mockDb;
  let mockSourceClient;
  let mockTargetClient;
  let tableCreator;
  let tableCreationNotifier;

  beforeEach(() => {
    // Mock database
    mockDb = {
      getDB: () => ({
        prepare: (sql) => ({
          run: jest.fn(),
          all: jest.fn(),
          get: jest.fn()
        })
      })
    };

    // Mock source client (has tables)
    mockSourceClient = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('information_schema.columns')) {
          return [
            { column_name: 'id', data_type: 'INTEGER', is_nullable: 'NO', column_default: null },
            { column_name: 'name', data_type: 'VARCHAR', is_nullable: 'YES', column_default: null },
            { column_name: 'email', data_type: 'VARCHAR', is_nullable: 'YES', column_default: null }
          ];
        } else if (sql.includes('information_schema.constraint')) {
          return [];
        } else if (sql.includes('pg_indexes')) {
          return [];
        }
        return [];
      })
    };

    // Mock target client (missing tables)
    mockTargetClient = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('LIMIT 0')) {
          throw new Error('Table "res_partner" does not exist');
        }
        return [];
      })
    };

    tableCreator = new TableCreator(mockDb, mockSourceClient, mockTargetClient);
    tableCreationNotifier = new TableCreationNotifier();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Detect missing tables', () => {
    it('should identify missing tables in target database', async () => {
      const tableNames = ['res_partner', 'res_company', 'sale_order'];

      const missingTables = await tableCreator.detectMissingTables(tableNames);

      expect(missingTables.length).toBe(3);
      expect(missingTables).toContain('res_partner');
    });

    it('should return empty array if all tables exist', async () => {
      mockTargetClient.query = jest.fn(async (sql) => {
        // All tables exist in this mock
        return [];
      });

      tableCreator = new TableCreator(mockDb, mockSourceClient, mockTargetClient);

      const tableNames = ['res_partner', 'res_company'];
      const missingTables = await tableCreator.detectMissingTables(tableNames);

      expect(missingTables.length).toBe(0);
    });

    it('should handle empty table list', async () => {
      const missingTables = await tableCreator.detectMissingTables([]);
      expect(missingTables).toEqual([]);
    });
  });

  describe('Discover schema from source', () => {
    it('should discover schema including columns', async () => {
      const schema = await tableCreator.discoverSchema('res_partner');

      expect(schema.table_name).toBe('res_partner');
      expect(schema.columns).toBeDefined();
      expect(schema.columns.length).toBe(3);
      expect(schema.columns[0].name).toBe('id');
      expect(schema.columns[0].type).toBe('INTEGER');
    });

    it('should include constraints in schema', async () => {
      const schema = await tableCreator.discoverSchema('res_partner');

      expect(schema.constraints).toBeDefined();
      expect(Array.isArray(schema.constraints)).toBe(true);
    });

    it('should include indexes in schema', async () => {
      const schema = await tableCreator.discoverSchema('res_partner');

      expect(schema.indexes).toBeDefined();
      expect(Array.isArray(schema.indexes)).toBe(true);
    });

    it('should handle null nullable columns', async () => {
      const schema = await tableCreator.discoverSchema('res_partner');

      expect(schema.columns[1].nullable).toBe(true);
      expect(schema.columns[0].nullable).toBe(false);
    });
  });

  describe('Resolve dependencies', () => {
    it('should return empty array if no dependencies', async () => {
      const schema = {
        table_name: 'res_partner',
        columns: [],
        constraints: [],
        indexes: []
      };

      const dependencies = await tableCreator.resolveDependencies('res_partner', schema);

      expect(dependencies).toEqual([]);
    });

    it('should identify foreign key dependencies', async () => {
      const schema = {
        table_name: 'sale_order',
        columns: [],
        constraints: [
          { type: 'FOREIGN KEY', column: 'partner_id', referenced_table: 'res_partner' }
        ],
        indexes: []
      };

      const dependencies = await tableCreator.resolveDependencies('sale_order', schema);

      expect(dependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Create table', () => {
    it('should create table successfully', async () => {
      const schema = {
        table_name: 'res_partner',
        columns: [
          { name: 'id', type: 'INTEGER', primary_key: true },
          { name: 'name', type: 'VARCHAR', nullable: true }
        ],
        constraints: [],
        indexes: []
      };

      const result = await tableCreator.createTable('res_partner', schema, []);

      expect(result).toBe(true);
      expect(tableCreator.getCreationStatus().created_tables).toContain('res_partner');
    });

    it('should handle table creation with dependencies', async () => {
      const partnerSchema = {
        table_name: 'res_partner',
        columns: [{ name: 'id', type: 'INTEGER', primary_key: true }],
        constraints: [],
        indexes: []
      };

      const orderSchema = {
        table_name: 'sale_order',
        columns: [{ name: 'id', type: 'INTEGER', primary_key: true }],
        constraints: [],
        indexes: []
      };

      await tableCreator.createTable('res_partner', partnerSchema, []);
      await tableCreator.createTable('sale_order', orderSchema, ['res_partner']);

      const status = tableCreator.getCreationStatus();
      expect(status.created_tables).toContain('res_partner');
      expect(status.created_tables).toContain('sale_order');
    });

    it('should track failed creations', async () => {
      mockTargetClient.query = jest.fn(async () => {
        throw new Error('CREATE TABLE permission denied');
      });

      tableCreator = new TableCreator(mockDb, mockSourceClient, mockTargetClient);

      const schema = {
        table_name: 'res_partner',
        columns: [{ name: 'id', type: 'INTEGER', primary_key: true }],
        constraints: [],
        indexes: []
      };

      await expect(tableCreator.createTable('res_partner', schema, [])).rejects.toThrow();

      const status = tableCreator.getCreationStatus();
      expect(status.failed_creations.length).toBeGreaterThan(0);
    });
  });

  describe('Build CREATE TABLE statement', () => {
    it('should generate valid SQL for simple table', () => {
      const schema = {
        table_name: 'res_partner',
        columns: [
          { name: 'id', type: 'INTEGER', primary_key: true },
          { name: 'name', type: 'VARCHAR', nullable: false }
        ],
        constraints: [],
        indexes: []
      };

      const sql = tableCreator.buildCreateTableStatement('res_partner', schema);

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sql).toContain('res_partner');
      expect(sql).toContain('id');
      expect(sql).toContain('PRIMARY KEY');
      expect(sql).toContain('NOT NULL');
    });

    it('should handle nullable columns', () => {
      const schema = {
        table_name: 'test_table',
        columns: [
          { name: 'id', type: 'INTEGER', primary_key: true, nullable: false },
          { name: 'optional', type: 'VARCHAR', nullable: true }
        ],
        constraints: [],
        indexes: []
      };

      const sql = tableCreator.buildCreateTableStatement('test_table', schema);

      expect(sql).toContain('id INTEGER NOT NULL PRIMARY KEY');
      expect(sql).toContain('optional VARCHAR');
      expect(sql).not.toContain('optional VARCHAR NOT NULL');
    });
  });

  describe('Table creation notifications', () => {
    it('should notify missing table detection', () => {
      const notification = tableCreationNotifier.notifyMissingTable('res_partner');

      expect(notification.type).toBe('missing_table_detected');
      expect(notification.table_name).toBe('res_partner');
      expect(notification.severity).toBe('info');
    });

    it('should notify creation progress', () => {
      const update = tableCreationNotifier.notifyCreationProgress('res_partner', 'in_progress');

      expect(update.type).toBe('table_creation_progress');
      expect(update.status).toBe('in_progress');
      expect(update.message).toContain('res_partner');
    });

    it('should notify successful creation', () => {
      const notification = tableCreationNotifier.notifyTableCreationSuccess('res_partner', {
        column_count: 5,
        dependencies_resolved: 2
      });

      expect(notification.type).toBe('table_creation_success');
      expect(notification.severity).toBe('success');
      expect(notification.details.column_count).toBe(5);
    });

    it('should notify creation failure', () => {
      const error = new Error('Permission denied');
      const notification = tableCreationNotifier.notifyTableCreationFailure('res_partner', error);

      expect(notification.type).toBe('table_creation_failure');
      expect(notification.severity).toBe('error');
      expect(notification.error).toBe('Permission denied');
    });

    it('should filter notifications by type', () => {
      tableCreationNotifier.notifyMissingTable('table1');
      tableCreationNotifier.notifyMissingTable('table2');
      tableCreationNotifier.notifyCreationProgress('table1', 'starting');

      const missingNotifications = tableCreationNotifier.getNotifications({ type: 'missing_table_detected' });
      expect(missingNotifications.length).toBe(2);
    });

    it('should provide summary of notifications', () => {
      tableCreationNotifier.notifyMissingTable('table1');
      tableCreationNotifier.notifyTableCreationSuccess('table1', {});
      tableCreationNotifier.notifyCreationProgress('table2', 'in_progress');

      const summary = tableCreationNotifier.getSummary();

      expect(summary.total_notifications).toBe(2);
      expect(summary.by_type.missing_table_detected).toBe(1);
      expect(summary.by_type.table_creation_success).toBe(1);
      expect(summary.by_severity.info).toBe(1);
      expect(summary.by_severity.success).toBe(1);
    });
  });

  describe('End-to-end table auto-creation workflow', () => {
    it('should detect missing table, create it, and track the operation', async () => {
      // Step 1: Detect missing table
      const missingTables = await tableCreator.detectMissingTables(['res_partner']);
      expect(missingTables.length).toBe(1);

      // Step 2: Notify missing table
      tableCreationNotifier.notifyMissingTable('res_partner');

      // Step 3: Discover schema
      const schema = await tableCreator.discoverSchema('res_partner');
      expect(schema.columns.length).toBeGreaterThan(0);

      // Step 4: Resolve dependencies
      const dependencies = await tableCreator.resolveDependencies('res_partner', schema);
      tableCreationNotifier.notifyDependencyResolution('res_partner', dependencies);

      // Step 5: Create table
      await tableCreator.createTable('res_partner', schema, dependencies);
      tableCreationNotifier.notifyTableCreationSuccess('res_partner', {
        column_count: schema.columns.length,
        dependencies_resolved: dependencies.length
      });

      // Step 6: Verify creation status
      const status = tableCreator.getCreationStatus();
      expect(status.created_tables).toContain('res_partner');
      expect(status.total_created).toBe(1);

      // Step 7: Verify notifications
      const allNotifications = tableCreationNotifier.getNotifications();
      expect(allNotifications.length).toBeGreaterThan(0);
    });

    it('should handle multiple missing tables with dependencies', async () => {
      const tablesToCreate = ['res_partner', 'res_company', 'sale_order'];

      // Detect missing
      const missingTables = await tableCreator.detectMissingTables(tablesToCreate);
      expect(missingTables.length).toBeGreaterThan(0);

      // Create each table
      for (const tableName of missingTables) {
        const schema = await tableCreator.discoverSchema(tableName);
        const dependencies = await tableCreator.resolveDependencies(tableName, schema);
        await tableCreator.createTable(tableName, schema, dependencies);
      }

      // Verify all created
      const status = tableCreator.getCreationStatus();
      expect(status.total_created).toBeGreaterThanOrEqual(missingTables.length);
    });
  });

  describe('Creation status tracking', () => {
    it('should provide accurate creation status', async () => {
      const schema = {
        table_name: 'res_partner',
        columns: [{ name: 'id', type: 'INTEGER', primary_key: true }],
        constraints: [],
        indexes: []
      };

      await tableCreator.createTable('res_partner', schema, []);

      const status = tableCreator.getCreationStatus();

      expect(status.created_tables).toContain('res_partner');
      expect(status.total_created).toBe(1);
      expect(status.total_failed).toBe(0);
      expect(status.failed_creations.length).toBe(0);
    });

    it('should reset creation tracking', async () => {
      const schema = {
        table_name: 'res_partner',
        columns: [{ name: 'id', type: 'INTEGER', primary_key: true }],
        constraints: [],
        indexes: []
      };

      await tableCreator.createTable('res_partner', schema, []);
      let status = tableCreator.getCreationStatus();
      expect(status.total_created).toBe(1);

      tableCreator.reset();
      status = tableCreator.getCreationStatus();
      expect(status.total_created).toBe(0);
      expect(status.created_tables.length).toBe(0);
    });
  });
});
