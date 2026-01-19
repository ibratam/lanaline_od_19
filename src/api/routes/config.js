import express from 'express';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  asyncHandler
} from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { validateOdooUrl, validateDatabaseName, validateRequiredFields } from '../../utils/validators.js';

export function createConfigRouter(db, services) {
  const router = express.Router();
  const { configManager, odooClient } = services;
  const parseConnectionId = (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Invalid configuration ID');
    }
    return id;
  };

  /**
   * GET /api/config
   * List all database connections
   */
  router.get('/', asyncHandler(async (req, res) => {
    logger.info('Fetching all database connections');
    const connections = await configManager.getAllConnections();
    res.json(connections);
  }));

  /**
   * POST /api/config
   * Create a new database connection
   */
  router.post('/', asyncHandler(async (req, res) => {
    const { name, url, database_name, username, password } = req.body;

    // Validate required fields
    const validation = validateRequiredFields(req.body, [
      'name', 'url', 'database_name', 'username', 'password'
    ]);
    if (validation) {
      throw new ValidationError(validation);
    }

    // Validate URL format
    if (!validateOdooUrl(url)) {
      throw new ValidationError('Invalid Odoo URL format');
    }

    // Validate database name format
    if (!validateDatabaseName(database_name)) {
      throw new ValidationError('Invalid database name format');
    }

    // Check if name already exists
    if (configManager.model.nameExists(name)) {
      throw new ConflictError(`Connection name "${name}" already exists`);
    }

    // Save connection with encrypted password
    const connection = await configManager.saveConnection({
      name,
      url,
      database_name,
      username,
      password
    });

    logger.info(`Created database connection: ${name}`);
    res.status(201).json(connection);
  }));

  /**
   * GET /api/config/:id
   * Retrieve a specific database connection (password masked)
   */
  router.get('/:id', asyncHandler(async (req, res) => {
    const id = parseConnectionId(req.params.id);

    const connection = await configManager.getConnection(id);
    if (!connection) {
      throw new NotFoundError(`Connection ${id} not found`);
    }

    res.json(connection);
  }));

  /**
   * PUT /api/config/:id
   * Update a database connection
   */
  router.put('/:id', asyncHandler(async (req, res) => {
    const id = parseConnectionId(req.params.id);
    const { name, url, database_name, username, password } = req.body;

    // Verify connection exists
    const existing = await configManager.getConnection(id);
    if (!existing) {
      throw new NotFoundError(`Connection ${id} not found`);
    }

    // Validate fields if provided
    if (url && !validateOdooUrl(url)) {
      throw new ValidationError('Invalid Odoo URL format');
    }

    if (database_name && !validateDatabaseName(database_name)) {
      throw new ValidationError('Invalid database name format');
    }

    // Check name uniqueness if changing
    if (name && name !== existing.name && configManager.model.nameExists(name, id)) {
      throw new ConflictError(`Connection name "${name}" already exists`);
    }

    // Update with encrypted password if provided
    const updateData = {
      id,
      name: name || existing.name,
      url: url || existing.url,
      database_name: database_name || existing.database_name,
      username: username || existing.username
    };

    if (password) {
      updateData.password = password;
    } else {
      // If no password provided, we need to get existing password to pass through
      const connWithPassword = await configManager.getConnectionWithPassword(id);
      updateData.password = connWithPassword.password;
    }

    const updated = await configManager.saveConnection(updateData);

    logger.info(`Updated database connection: ${id}`);
    res.json(updated);
  }));

  /**
   * DELETE /api/config/:id
   * Delete a database connection
   */
  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = parseConnectionId(req.params.id);

    // Verify connection exists
    const connection = await configManager.getConnection(id);
    if (!connection) {
      throw new NotFoundError(`Connection ${id} not found`);
    }

    await configManager.deleteConnection(id);

    logger.info(`Deleted database connection: ${id}`);
    res.status(204).send();
  }));

  /**
   * POST /api/config/:id/test
   * Test a saved Odoo database connection
   */
  router.post('/:id/test', asyncHandler(async (req, res) => {
    const id = parseConnectionId(req.params.id);
    const result = await configManager.testConnection(id);
    res.json(result);
  }));

  /**
   * POST /api/config/test
   * Test Odoo database connection without saving
   */
  router.post('/test', asyncHandler(async (req, res) => {
    const { url, database_name, username, password } = req.body;

    // Validate required fields
    const validation = validateRequiredFields(req.body, [
      'url', 'database_name', 'username', 'password'
    ]);
    if (validation) {
      throw new ValidationError(validation);
    }

    // Validate URL format
    if (!validateOdooUrl(url)) {
      throw new ValidationError('Invalid Odoo URL format');
    }

    logger.info(`Testing connection to Odoo at ${url}`);

    // Create temporary OdooClient instance for testing
    const testClient = new (await import('../../services/OdooClient.js')).default(
      url,
      database_name,
      username,
      password
    );

    try {
      const result = await testClient.testConnection();

      if (!result.success && result.status === 401) {
        res.status(401).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      logger.warn(`Connection test failed: ${error.message}`);
      res.json({
        success: false,
        message: error.message
      });
    } finally {
      await testClient.close();
    }
  }));

  return router;
}

export default createConfigRouter;
