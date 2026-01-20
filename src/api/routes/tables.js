import express from 'express';
import {
  ValidationError,
  NotFoundError,
  SystemError,
  asyncHandler
} from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import TableCreator from '../../services/TableCreator.js';
import OdooClient from '../../services/OdooClient.js';
import TableSchema from '../../models/TableSchema.js';

export function createTablesRouter(db, services) {
  const router = express.Router();
  const { configManager } = services;
  const tableSchemaModel = new TableSchema(db.getDB());

  /**
   * GET /api/tables/missing
   * Identify missing target tables and their dependencies
   */
  router.get('/missing', asyncHandler(async (req, res) => {
    const sourceDbId = Number(req.query.source_db_id);
    const targetDbId = Number(req.query.target_db_id);

    if (!Number.isInteger(sourceDbId) || sourceDbId <= 0) {
      throw new ValidationError('source_db_id is required and must be a positive integer');
    }
    if (!Number.isInteger(targetDbId) || targetDbId <= 0) {
      throw new ValidationError('target_db_id is required and must be a positive integer');
    }

    try {
      const sourceConnection = await configManager.getConnectionWithPassword(sourceDbId);
      if (!sourceConnection) {
        throw new NotFoundError(`Source database ${sourceDbId} not found`);
      }

      const targetConnection = await configManager.getConnectionWithPassword(targetDbId);
      if (!targetConnection) {
        throw new NotFoundError(`Target database ${targetDbId} not found`);
      }

      // Create clients
      const sourceClient = new OdooClient(
        sourceConnection.url,
        sourceConnection.database_name,
        sourceConnection.username,
        sourceConnection.password
      );

      let targetClient;
      if (targetConnection.type === 'sqlite') {
        // SQLite target
        targetClient = null; // Will be handled differently
      } else {
        targetClient = new OdooClient(
          targetConnection.url,
          targetConnection.database_name,
          targetConnection.username,
          targetConnection.password
        );
      }

      try {
        await sourceClient.authenticate();
        if (targetClient) {
          await targetClient.authenticate();
        }

        // Get models from source
        const models = await sourceClient.getModels();
        const tableNames = models.map(m => m.model.replace(/\./g, '_'));

        logger.info(`Checking ${tableNames.length} tables for missing status`);

        // Check for missing tables
        const tableCreator = new TableCreator(db, sourceClient, targetClient);
        const missingTables = await tableCreator.detectMissingTables(tableNames);

        // Discover schemas for missing tables
        const missingTablesDetails = [];
        for (const tableName of missingTables) {
          try {
            const schema = await tableCreator.discoverSchema(tableName);
            const dependencies = await tableCreator.resolveDependencies(tableName, schema);

            missingTablesDetails.push({
              table_name: tableName,
              schema: schema,
              dependencies: dependencies,
              status: 'ready_to_create'
            });
          } catch (error) {
            logger.warn(`Could not discover schema for ${tableName}: ${error.message}`);
            missingTablesDetails.push({
              table_name: tableName,
              error: error.message,
              status: 'schema_discovery_failed'
            });
          }
        }

        res.json({
          missing_count: missingTables.length,
          total_tables_checked: tableNames.length,
          missing_tables: missingTablesDetails,
          timestamp: new Date().toISOString()
        });
      } finally {
        await sourceClient.close();
        if (targetClient) {
          await targetClient.close();
        }
      }
    } catch (error) {
      logger.error('Error checking for missing tables:', error);
      throw error;
    }
  }));

  /**
   * POST /api/tables/create
   * Initiate table creation with progress tracking
   */
  router.post('/create', asyncHandler(async (req, res) => {
    const {
      source_db_id,
      target_db_id,
      table_names = [],
      auto_resolve_dependencies = true
    } = req.body;

    if (!Number.isInteger(source_db_id) || source_db_id <= 0) {
      throw new ValidationError('source_db_id is required and must be a positive integer');
    }
    if (!Number.isInteger(target_db_id) || target_db_id <= 0) {
      throw new ValidationError('target_db_id is required and must be a positive integer');
    }
    if (!Array.isArray(table_names) || table_names.length === 0) {
      throw new ValidationError('table_names is required and must be a non-empty array');
    }

    try {
      const sourceConnection = await configManager.getConnectionWithPassword(source_db_id);
      if (!sourceConnection) {
        throw new NotFoundError(`Source database ${source_db_id} not found`);
      }

      const targetConnection = await configManager.getConnectionWithPassword(target_db_id);
      if (!targetConnection) {
        throw new NotFoundError(`Target database ${target_db_id} not found`);
      }

      // Create clients
      const sourceClient = new OdooClient(
        sourceConnection.url,
        sourceConnection.database_name,
        sourceConnection.username,
        sourceConnection.password
      );

      let targetClient;
      if (targetConnection.type === 'sqlite') {
        targetClient = null;
      } else {
        targetClient = new OdooClient(
          targetConnection.url,
          targetConnection.database_name,
          targetConnection.username,
          targetConnection.password
        );
      }

      const creationResults = [];
      const errors = [];

      try {
        await sourceClient.authenticate();
        if (targetClient) {
          await targetClient.authenticate();
        }

        const tableCreator = new TableCreator(db, sourceClient, targetClient);

        for (const tableName of table_names) {
          try {
            logger.info(`Creating table: ${tableName}`);

            // Discover schema
            const schema = await tableCreator.discoverSchema(tableName);
            const dependencies = auto_resolve_dependencies
              ? await tableCreator.resolveDependencies(tableName, schema)
              : [];

            // Create table
            await tableCreator.createTable(tableName, schema, dependencies);

            // Create indexes
            await tableCreator.createIndexes(tableName, schema);

            creationResults.push({
              table_name: tableName,
              status: 'created',
              columns_count: schema.columns ? schema.columns.length : 0,
              dependencies: dependencies
            });
          } catch (error) {
            logger.error(`Error creating table ${tableName}: ${error.message}`);
            errors.push({
              table_name: tableName,
              status: 'failed',
              error_message: error.message
            });
          }
        }

        res.json({
          request_id: `table-creation-${Date.now()}`,
          status: errors.length === 0 ? 'success' : 'partial_failure',
          created_tables: creationResults.filter(r => r.status === 'created'),
          failed_tables: errors,
          summary: {
            total_requested: table_names.length,
            total_created: creationResults.filter(r => r.status === 'created').length,
            total_failed: errors.length
          },
          timestamp: new Date().toISOString()
        });
      } finally {
        await sourceClient.close();
        if (targetClient) {
          await targetClient.close();
        }
      }
    } catch (error) {
      logger.error('Error creating tables:', error);
      throw error;
    }
  }));

  return router;
}

export default createTablesRouter;
