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
    this.sessionCookie = null;
  }

  /**
   * Make JSON-RPC call to Odoo (Odoo 19 external API)
   */
  async call(method, params = {}) {
    const timeoutMs = Number(process.env.ODOO_RPC_TIMEOUT_MS) || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (method === 'common.authenticate' || method === 'web.session.authenticate') {
        return await this.callWebSessionAuthenticate(params, controller.signal);
      }

      if (method === 'object.execute_kw') {
        return await this.callWebDataset(params, controller.signal);
      }

      const error = new Error(`Unsupported Odoo method: ${method}`);
      error.name = 'OdooClientError';
      error.code = 'ODOO_METHOD_UNSUPPORTED';
      throw error;
    } catch (error) {
      logger.error('Odoo RPC call error:', { method, url: this.url, error: error.message });
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async callWebSessionAuthenticate(params = {}, signal) {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {},
      id: Math.floor(Math.random() * 1000000)
    };

    if (Array.isArray(params?.args) && params.args.length >= 3) {
      payload.params.db = params.args[0];
      payload.params.login = params.args[1];
      payload.params.password = params.args[2];
    } else {
      payload.params.db = params.db ?? this.database;
      payload.params.login = params.login ?? this.username;
      payload.params.password = params.password ?? this.password;
    }

    const response = await fetch(`${this.url}/web/session/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });

    await this.throwOnHttpError(response);
    const data = await response.json();
    this.throwOnRpcError(data);
    const sessionCookie = response.headers.get('set-cookie');
    if (sessionCookie) {
      this.sessionCookie = sessionCookie.split(';')[0];
    }
    return data.result;
  }

  async callWebDataset(params = {}, signal) {
    const args = Array.isArray(params?.args) ? params.args : [];
    const kwargs = params?.kwargs && typeof params.kwargs === 'object' ? params.kwargs : {};
    const model = args[3];
    const method = args[4];
    const methodArgs = Array.isArray(args[5]) ? args[5] : [];
    const methodKwargs = (args[6] && typeof args[6] === 'object') ? args[6] : kwargs;

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method,
        args: methodArgs,
        kwargs: methodKwargs
      },
      id: Math.floor(Math.random() * 1000000)
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    const response = await fetch(`${this.url}/web/dataset/call_kw`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    await this.throwOnHttpError(response);
    const data = await response.json();
    this.throwOnRpcError(data);
    return data.result;
  }

  async throwOnHttpError(response) {
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
  }

  throwOnRpcError(data) {
    if (data?.error) {
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
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate() {
    try {
      logger.info(`Authenticating with Odoo: ${this.url} (database: ${this.database})`);

      const maxRetries = Math.max(0, Number(process.env.ODOO_AUTH_RETRY) || 3);
      const baseDelayMs = Math.max(0, Number(process.env.ODOO_AUTH_RETRY_DELAY_MS) || 500);

      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const authResult = await this.call('web.session.authenticate', {
            db: this.database,
            login: this.username,
            password: this.password
          });

          const uid = authResult?.uid ?? authResult;
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
          lastError = error;
          if (!this.isSerializationFailure(error)) {
            throw error;
          }
          if (attempt >= maxRetries) {
            throw error;
          }
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(`Auth serialization failure, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await this.delay(delayMs);
        }
      }

      if (lastError) {
        throw lastError;
      }

      return false;
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

  isSerializationFailure(error) {
    const message = error?.details?.data?.message
      || error?.details?.data?.arguments?.[0]
      || error?.message
      || '';
    return /could not serialize access due to concurrent update/i.test(String(message));
  }

  /**
   * Search for records in a model
   */
  async search(model, domain = [], offset = 0, limit = 0, modelFilter = null) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      if (Array.isArray(modelFilter) && modelFilter.length > 0 && !modelFilter.includes(model)) {
        return [];
      }

      logger.debug(`Searching ${model} with domain: ${JSON.stringify(domain)}`);

      const result = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'search',
          [domain],
          {
            offset: offset,
            limit: limit || 0,
            order: 'id desc'
          }
        ],
        kwargs: {}
      });

      return result || [];
    } catch (error) {
      logger.error(`Error searching ${model}:`, error);
      throw error;
    }
  }

  /**
   * Count records in a model
   */
  async searchCount(model, domain = []) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      const result = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'search_count',
          [domain]
        ],
        kwargs: {}
      });

      return Number(result) || 0;
    } catch (error) {
      logger.error(`Error counting ${model}:`, error);
      throw error;
    }
  }

  /**
   * Search and read records in pages
   */
  async searchReadAll(model, domain = [], fields = [], modelFilter = null) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      if (Array.isArray(modelFilter) && modelFilter.length > 0 && !modelFilter.includes(model)) {
        return [];
      }

      const batchSize = Math.max(1, Number(process.env.ODOO_SEARCH_READ_BATCH_SIZE)
        || Number(process.env.ODOO_READ_BATCH_SIZE)
        || 1000);
      const concurrency = Math.max(1, Number(process.env.ODOO_READ_CONCURRENCY) || 2);
      const normalizedFields = Array.isArray(fields) ? fields : [];
      const fieldSet = new Set(normalizedFields);
      fieldSet.add('id');
      const fieldList = Array.from(fieldSet);

      const fetchPage = async (offset) => {
        return this.call('object.execute_kw', {
          args: [
            this.database,
            this.uid,
            this.password,
            model,
            'search_read',
            [domain],
            {
              fields: fieldList,
              offset,
              limit: batchSize,
              order: 'id'
            }
          ],
          kwargs: {}
        });
      };

      const total = await this.searchCount(model, domain);
      if (total === 0) {
        return [];
      }

      const totalPages = Math.ceil(total / batchSize);
      if (totalPages === 1 || concurrency <= 1) {
        const results = [];
        let offset = 0;
        while (true) {
          const batch = await fetchPage(offset);
          if (Array.isArray(batch) && batch.length > 0) {
            results.push(...batch);
          }
          if (!batch || batch.length < batchSize) {
            break;
          }
          offset += batchSize;
        }
        return results;
      }

      const offsets = Array.from({ length: totalPages }, (_, idx) => idx * batchSize);
      const results = [];
      let cursor = 0;

      const worker = async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          if (index >= offsets.length) {
            break;
          }
          const offset = offsets[index];
          const batch = await fetchPage(offset);
          if (Array.isArray(batch) && batch.length > 0) {
            results.push(...batch);
          }
        }
      };

      const workerCount = Math.min(concurrency, offsets.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      return results;
    } catch (error) {
      logger.error(`Error search_read ${model}:`, error);
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

      if (!ids || (Array.isArray(ids) && ids.length === 0)) {
        return [];
      }

      if (!Array.isArray(ids)) {
        ids = [ids];
      }

      const batchSize = Math.max(1, Number(process.env.ODOO_READ_BATCH_SIZE) || 1000);
      logger.debug(`Reading ${model} records: ${ids.length} records, ${fields.length} fields`);

      if (ids.length <= batchSize) {
        const result = await this.call('object.execute_kw', {
          args: [
            this.database,
            this.uid,
            this.password,
            model,
            'read',
            [ids, fields || []],
            {}
          ],
          kwargs: {}
        });

        return result || [];
      }

      const results = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);
        const batch = await this.call('object.execute_kw', {
          args: [
            this.database,
            this.uid,
            this.password,
            model,
            'read',
            [batchIds, fields || []],
            {}
          ],
          kwargs: {}
        });
        if (Array.isArray(batch) && batch.length > 0) {
          results.push(...batch);
        }
      }

      return results;
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
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'write',
          [ids, values],
          {}
        ],
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
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'create',
          [values],
          {}
        ],
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
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'unlink',
          [ids],
          {}
        ],
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
        args: [
          this.database,
          this.uid,
          this.password,
          'ir.model',
          'search_read',
          [[]],
          {
            fields: ['id', 'name', 'model', 'modules'],
            limit: 1000
          }
        ],
        kwargs: {}
      });

      return result || [];
    } catch (error) {
      logger.error('Error fetching models:', error);
      throw error;
    }
  }

  /**
   * Get list of installed modules
   */
  async getModules() {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.info('Fetching list of installed modules');

      const result = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          'ir.module.module',
          'search_read',
          [[['state', '=', 'installed']]],
          {
            fields: ['name', 'shortdesc'],
            limit: 0
          }
        ],
        kwargs: {}
      });

      return result || [];
    } catch (error) {
      logger.error('Error fetching modules:', error);
      throw error;
    }
  }

  /**
   * Get list of companies
   */
  async getCompanies() {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      logger.info('Fetching list of companies');

      const result = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          'res.company',
          'search_read',
          [[]],
          {
            fields: ['id', 'name'],
            limit: 0
          }
        ],
        kwargs: {}
      });

      return result || [];
    } catch (error) {
      logger.error('Error fetching companies:', error);
      throw error;
    }
  }

  /**
   * Get list of installed models for a module name
   */
  async getModelsByModule(moduleName) {
    try {
      if (!this.authenticated) {
        await this.authenticate();
      }

      const normalized = typeof moduleName === 'string' ? moduleName.trim() : '';
      if (!normalized) {
        return [];
      }
      const normalizedLower = normalized.toLowerCase();

      logger.info(`Fetching models for module: ${normalized}`);

      const dataResult = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          'ir.model.data',
          'search_read',
          [[['module', '=', normalizedLower], ['model', '=', 'ir.model']]],
          {
            fields: ['res_id'],
            limit: 0
          }
        ],
        kwargs: {}
      });

      const ids = Array.from(new Set((dataResult || [])
        .map(entry => entry?.res_id)
        .filter(id => Number.isInteger(id) && id > 0)));

      if (ids.length === 0) {
        return [];
      }

      const modelResult = await this.call('object.execute_kw', {
        args: [
          this.database,
          this.uid,
          this.password,
          'ir.model',
          'search_read',
          [[['id', 'in', ids]]],
          {
            fields: ['id', 'name', 'model'],
            limit: 0
          }
        ],
        kwargs: {}
      });

      return modelResult || [];
    } catch (error) {
      logger.error(`Error fetching models for module ${moduleName}:`, error);
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
        args: [
          this.database,
          this.uid,
          this.password,
          model,
          'fields_get',
          [[]],
          {}
        ],
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
    this.sessionCookie = null;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  
}

export default OdooClient;
