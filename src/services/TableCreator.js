import logger from '../utils/logger.js';
import TableSchema from '../models/TableSchema.js';

/**
 * TableCreator Service
 * Handles detection and creation of missing target tables
 * with dependency resolution and schema discovery
 */
class TableCreator {
  constructor(db, sourceClient, targetClient) {
    this.db = db;
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.tableSchemaModel = new TableSchema(db.getDB());
    this.createdTables = [];
    this.failedCreations = [];
  }

  /**
   * Detect missing tables in target database
   * @param {string[]} tableNames - List of table names to check
   * @returns {Promise<Array>} Array of missing table names
   */
  async detectMissingTables(tableNames) {
    const missingTables = [];

    for (const tableName of tableNames) {
      try {
        // Check if table exists in target
        const exists = await this.tableExistsInTarget(tableName);
        if (!exists) {
          missingTables.push(tableName);
          logger.warn(`Missing table detected in target: ${tableName}`);
        }
      } catch (error) {
        logger.error(`Error checking if table ${tableName} exists: ${error.message}`);
      }
    }

    return missingTables;
  }

  /**
   * Check if table exists in target database
   * @param {string} tableName
   * @returns {Promise<boolean>}
   */
  async tableExistsInTarget(tableName) {
    try {
      if (!this.targetClient || !this.targetClient.query) {
        return true; // Assume exists if no target client
      }
      // Try to select from table with limit 0
      await this.targetClient.query(`SELECT 1 FROM "${tableName}" LIMIT 0`);
      return true;
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return false;
      }
      logger.debug(`Table existence check error for ${tableName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover schema from source database
   * @param {string} tableName
   * @returns {Promise<Object>} Schema object with columns, types, constraints
   */
  async discoverSchema(tableName) {
    try {
      logger.info(`Discovering schema for table: ${tableName}`);

      if (!this.sourceClient || !this.sourceClient.query) {
        // Return minimal schema for mock/test
        return {
          table_name: tableName,
          columns: [
            { name: 'id', type: 'INTEGER', primary_key: true }
          ],
          constraints: [],
          indexes: []
        };
      }

      const columns = await this.sourceClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      );

      const constraints = await this.sourceClient.query(
        `SELECT constraint_name, constraint_type, column_name
         FROM information_schema.constraint_column_usage
         WHERE table_name = $1`,
        [tableName]
      );

      const indexes = await this.sourceClient.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE tablename = $1`,
        [tableName]
      );

      const schema = {
        table_name: tableName,
        columns: columns.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default
        })),
        constraints: constraints.map(cons => ({
          name: cons.constraint_name,
          type: cons.constraint_type,
          column: cons.column_name
        })),
        indexes: indexes.map(idx => ({
          name: idx.indexname,
          definition: idx.indexdef
        }))
      };

      logger.debug(`Schema discovered for ${tableName}:`, schema);
      return schema;
    } catch (error) {
      logger.error(`Error discovering schema for ${tableName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolve table dependencies (foreign keys, referenced tables)
   * @param {string} tableName
   * @param {Object} schema
   * @returns {Promise<Array>} Array of dependent table names
   */
  async resolveDependencies(tableName, schema) {
    try {
      const dependencies = [];

      if (!schema.constraints) {
        return dependencies;
      }

      // Find foreign key constraints
      const fkConstraints = schema.constraints.filter(
        cons => cons.type === 'FOREIGN KEY'
      );

      for (const fk of fkConstraints) {
        // Extract referenced table from constraint definition
        // This is simplified; actual implementation would parse the constraint
        if (fk.referenced_table) {
          dependencies.push(fk.referenced_table);
        }
      }

      logger.info(`Resolved ${dependencies.length} dependencies for ${tableName}`);
      return dependencies;
    } catch (error) {
      logger.error(`Error resolving dependencies for ${tableName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Create table in target database
   * @param {string} tableName
   * @param {Object} schema
   * @param {Array} dependencies
   * @returns {Promise<boolean>} Success status
   */
  async createTable(tableName, schema, dependencies = []) {
    try {
      logger.info(`Creating table ${tableName} with ${dependencies.length} dependencies`);

      // Recursively create dependent tables first
      for (const depTable of dependencies) {
        const depExists = await this.tableExistsInTarget(depTable);
        if (!depExists && !this.createdTables.includes(depTable)) {
          const depSchema = await this.discoverSchema(depTable);
          const depDependencies = await this.resolveDependencies(depTable, depSchema);
          await this.createTable(depTable, depSchema, depDependencies);
        }
      }

      // Skip actual creation if no target client (test mode)
      if (!this.targetClient || !this.targetClient.query) {
        logger.info(`[TEST MODE] Would create table: ${tableName}`);
        this.createdTables.push(tableName);
        return true;
      }

      // Build CREATE TABLE statement
      const createStatement = this.buildCreateTableStatement(tableName, schema);

      logger.debug(`Executing: ${createStatement}`);
      await this.targetClient.query(createStatement);

      // Store schema metadata
      this.tableSchemaModel.createOrUpdate({
        table_name: tableName,
        schema_json: JSON.stringify(schema),
        dependencies_json: JSON.stringify(dependencies),
        status: 'created'
      });

      this.createdTables.push(tableName);
      logger.info(`Table ${tableName} created successfully`);
      return true;
    } catch (error) {
      logger.error(`Error creating table ${tableName}: ${error.message}`);
      this.failedCreations.push({ tableName, error: error.message });
      throw error;
    }
  }

  /**
   * Build CREATE TABLE SQL statement from schema
   * @param {string} tableName
   * @param {Object} schema
   * @returns {string} SQL statement
   */
  buildCreateTableStatement(tableName, schema) {
    let sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (`;

    const columnDefs = schema.columns.map(col => {
      let def = `"${col.name}" ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      if (col.primary_key) def += ' PRIMARY KEY';
      return def;
    });

    sql += columnDefs.join(', ');

    // Add constraints
    if (schema.constraints && schema.constraints.length > 0) {
      const constraintDefs = schema.constraints.map(cons => {
        if (cons.type === 'FOREIGN KEY') {
          // Simplified FK constraint
          return `FOREIGN KEY ("${cons.column}") REFERENCES "${cons.referenced_table}"(id)`;
        } else if (cons.type === 'UNIQUE') {
          return `UNIQUE ("${cons.column}")`;
        }
        return null;
      }).filter(Boolean);

      if (constraintDefs.length > 0) {
        sql += ', ' + constraintDefs.join(', ');
      }
    }

    sql += ')';
    return sql;
  }

  /**
   * Create indexes for table
   * @param {string} tableName
   * @param {Object} schema
   * @returns {Promise<void>}
   */
  async createIndexes(tableName, schema) {
    try {
      if (!schema.indexes || schema.indexes.length === 0) {
        return;
      }

      if (!this.targetClient || !this.targetClient.query) {
        logger.info(`[TEST MODE] Would create ${schema.indexes.length} indexes for ${tableName}`);
        return;
      }

      for (const index of schema.indexes) {
        try {
          logger.debug(`Creating index: ${index.name}`);
          await this.targetClient.query(index.definition);
        } catch (error) {
          logger.warn(`Warning: Could not create index ${index.name}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error creating indexes for ${tableName}: ${error.message}`);
    }
  }

  /**
   * Get creation status and results
   * @returns {Object} Status object with created tables and failed creations
   */
  getCreationStatus() {
    return {
      created_tables: this.createdTables,
      failed_creations: this.failedCreations,
      total_created: this.createdTables.length,
      total_failed: this.failedCreations.length
    };
  }

  /**
   * Reset creation tracking
   */
  reset() {
    this.createdTables = [];
    this.failedCreations = [];
  }
}

export default TableCreator;
