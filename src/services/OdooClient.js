import logger from '../utils/logger.js';

/**
 * Odoo RPC Client wrapper
 * Handles communication with Odoo 19 databases via JSON-RPC
 */
export class OdooClient {
  constructor(url, database, username, password) {
    this.url = url.replace(/\/$/, ''); // Remove trailing slash
    this.database = database;
    this.username = username;
    this.password = password;
    this.uid = null;
    this.authenticated = false;
  }

  /**
   * Make JSON-RPC call to Odoo
   */
  async call(method, params = {}) {
    try {
      const rpcPath = `${this.url}/jsonrpc`;

      const payload = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: method.split('.')[0],
          method: method.split('.')[1] || method,
          args: [],
          kwargs: params
        },
        id: Math.floor(Math.random() * 1000000)
      };

      const response = await fetch(rpcPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        timeout: 30000
      });

      if (!response.ok) {
        const httpError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        httpError.name = 'OdooHttpError';
        httpError.code = 'ODOO_HTTP_ERROR';
        httpError.statusCode = response.status;
        httpError.details = {
          status: response.status,
          statusText: response.statusText,
          url: this.url
        };
        throw httpError;
      }

      const data = await response.json();

      if (data.error) {
        const details = {
          code: data.error.code,
          message: data.error.message,
          data: data.error.data
        };
        const rpcError = new Error(`Odoo RPC Error: ${details.message || 'Unknown error'}`);
        rpcError.name = 'OdooRpcError';
        rpcError.code = 'ODOO_RPC_ERROR';
        rpcError.details = details;
        throw rpcError;
      }

      return data.result;
    } catch (error) {
      logger.error('Odoo RPC call error:', { method, url: this.url, error: error.message });
      throw error;
    }
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate() {
    try {
      logger.info(`Authenticating with Odoo: ${this.url} (database: ${this.database})`);

      const uid = await this.call('web.session.authenticate', {
        db: this.database,
        login: this.username,
        password: this.password
      });

      if (!uid || uid === false) {
        const authError = new Error('Authentication failed: Invalid credentials');
        authError.name = 'OdooAuthError';
        authError.code = 'ODOO_AUTH_FAILED';
        authError.statusCode = 401;
        throw authError;
      }

      this.uid = uid;
      this.authenticated = true;
      logger.info(`Authenticated successfully with UID: ${uid}`);
      return true;
    } catch (error) {
      if (error?.name === 'OdooRpcError') {
        const errorName = String(error.details?.data?.name || '').toLowerCase();
        if (errorName.includes('access') || errorName.includes('login')) {
          const authError = new Error('Authentication failed');
          authError.name = 'OdooAuthError';
          authError.code = 'ODOO_AUTH_FAILED';
          authError.statusCode = 401;
          authError.details = error.details;
          logger.error('Authentication failed:', authError);
          this.authenticated = false;
          throw authError;
        }
      }

      logger.error('Authentication failed:', error);
      this.authenticated = false;
      throw error;
    }
  }

  /**
   * Search for records in a model
   */
  async search(model, domain = [], offset = 0, limit = 0) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.debug(`Searching ${model} with domain: ${JSON.stringify(domain)}`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'search',
        args: [domain],
        kwargs: {
          offset: offset,
          limit: limit || 0,
          order: 'id desc'
        }
      });

      return result || [];
    } catch (error) {
      logger.error(`Error searching ${model}:`, error);
      throw error;
    }
  }

  /**
   * Read records from a model
   */
  async read(model, ids, fields = []) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      if (!Array.isArray(ids)) {
        ids = [ids];
      }

      logger.debug(`Reading ${model} records: ${ids.length} records, ${fields.length} fields`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'read',
        args: [ids, fields || []],
        kwargs: {}
      });

      return result || [];
    } catch (error) {
      logger.error(`Error reading ${model} records:`, error);
      throw error;
    }
  }

  /**
   * Write to records in a model
   */
  async write(model, ids, values = {}) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      if (!Array.isArray(ids)) {
        ids = [ids];
      }

      logger.info(`Writing to ${model} records: ${ids.length} records`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'write',
        args: [ids, values],
        kwargs: {}
      });

      return result;
    } catch (error) {
      logger.error(`Error writing to ${model} records:`, error);
      throw error;
    }
  }

  /**
   * Create a new record in a model
   */
  async create(model, values = {}) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.info(`Creating new ${model} record`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'create',
        args: [values],
        kwargs: {}
      });

      return result;
    } catch (error) {
      logger.error(`Error creating ${model} record:`, error);
      throw error;
    }
  }

  /**
   * Delete records from a model
   */
  async delete(model, ids) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      if (!Array.isArray(ids)) {
        ids = [ids];
      }

      logger.info(`Deleting ${model} records: ${ids.length} records`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'unlink',
        args: [ids],
        kwargs: {}
      });

      return result;
    } catch (error) {
      logger.error(`Error deleting ${model} records:`, error);
      throw error;
    }
  }

  /**
   * Get list of installed models
   */
  async getModels() {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.info('Fetching list of available models');

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model: 'ir.model',
        method: 'search_read',
        args: [[]],
        kwargs: {
          fields: ['id', 'name', 'model'],
          limit: 1000
        }
      });

      return result || [];
    } catch (error) {
      logger.error('Error fetching models:', error);
      throw error;
    }
  }

  /**
   * Get model fields
   */
  async getModelFields(model) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.info(`Fetching fields for model: ${model}`);

      const result = await this.call('object.execute_kw', {
        database: this.database,
        uid: this.uid,
        password: this.password,
        model,
        method: 'fields_get',
        args: [[]],
        kwargs: {}
      });

      return result || {};
    } catch (error) {
      logger.error(`Error fetching fields for ${model}:`, error);
      throw error;
    }
  }

  /**
   * Test connection to Odoo
   */
  async testConnection() {
    try {
      await this.authenticate();
      logger.info('Odoo connection test successful');
      return {
        success: true,
        message: 'Connection successful',
        uid: this.uid
      };
    } catch (error) {
      logger.error('Odoo connection test failed:', error);
      return {
        success: false,
        message: error.message,
        code: error.code,
        status: error.statusCode,
        details: error.details
      };
    }
  }

  /**
   * Close connection (cleanup)
   */
  async close() {
    logger.info('Closing Odoo connection');
    this.authenticated = false;
    this.uid = null;
  }
}

export default OdooClient;
