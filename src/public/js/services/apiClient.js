/**
 * API Client Service
 * Handles all HTTP communication with the backend
 */

class APIClient {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
  }

  /**
   * Make HTTP request
   */
  async request(method, path, data = null) {
    const url = `${this.baseURL}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Parse response
      const contentType = response.headers.get('content-type');
      let responseData = null;

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else if (response.status === 204) {
        responseData = null;
      } else {
        responseData = await response.text();
      }

      // Handle errors
      if (!response.ok) {
        const error = new Error(
          responseData?.message || `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        error.data = responseData;
        throw error;
      }

      return responseData;
    } catch (error) {
      console.error(`API Request Error [${method} ${path}]:`, error);
      throw error;
    }
  }

  buildQuery(params = {}) {
    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
    return new URLSearchParams(entries);
  }

  /**
   * GET request
   */
  async get(path) {
    return this.request('GET', path);
  }

  /**
   * POST request
   */
  async post(path, data) {
    return this.request('POST', path, data);
  }

  /**
   * PUT request
   */
  async put(path, data) {
    return this.request('PUT', path, data);
  }

  /**
   * DELETE request
   */
  async delete(path) {
    return this.request('DELETE', path);
  }

  // Configuration endpoints
  async getConfigs() {
    return this.get('/config');
  }

  async getConfig(id) {
    return this.get(`/config/${id}`);
  }

  async createConfig(data) {
    return this.post('/config', data);
  }

  async updateConfig(id, data) {
    return this.put(`/config/${id}`, data);
  }

  async deleteConfig(id) {
    return this.delete(`/config/${id}`);
  }

  async testConnection(data) {
    return this.post('/config/test', data);
  }

  // Synchronization endpoints
  async previewSync(data) {
    return this.post('/sync/preview', data);
  }

  async executeSync(data) {
    return this.post('/sync/execute', data);
  }

  async getSyncStatus() {
    return this.get('/sync/status');
  }

  async rollbackSync(data) {
    return this.post('/sync/rollback', data);
  }

  async retrySync(data) {
    return this.post('/sync/retry', data);
  }

  async getSyncModels(sourceDbId) {
    const query = new URLSearchParams({ source_db_id: String(sourceDbId) });
    return this.get(`/sync/models?${query.toString()}`);
  }

  async getSyncModules(sourceDbId) {
    const query = new URLSearchParams({ source_db_id: String(sourceDbId) });
    return this.get(`/sync/modules?${query.toString()}`);
  }

  async getSyncModuleModels(sourceDbId, modules = []) {
    const query = new URLSearchParams({
      source_db_id: String(sourceDbId),
      modules: modules.join(',')
    });
    return this.get(`/sync/module-models?${query.toString()}`);
  }

  async getSyncCompanies(sourceDbId) {
    const query = new URLSearchParams({ source_db_id: String(sourceDbId) });
    return this.get(`/sync/companies?${query.toString()}`);
  }

  async getSyncHistory(params = {}) {
    const query = this.buildQuery(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/sync/history${suffix}`);
  }

  // Schedule endpoints
  async getSchedules() {
    return this.get('/schedule');
  }

  async createSchedule(data) {
    return this.post('/schedule', data);
  }

  async updateSchedule(id, data) {
    return this.put(`/schedule/${id}`, data);
  }

  async deleteSchedule(id) {
    return this.delete(`/schedule/${id}`);
  }

  async toggleSchedule(id) {
    return this.post(`/schedule/${id}/toggle`);
  }

  // History endpoints
  async getHistory(params = {}) {
    const query = this.buildQuery(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/history${suffix}`);
  }

  async getHistoryDetail(id) {
    return this.get(`/history/${id}`);
  }

  async exportHistory(params = {}) {
    const query = this.buildQuery(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return `${this.baseURL}/history/export${suffix}`;
  }

  // Conflict endpoints
  async getConflicts(params = {}) {
    const queryParams = { ...params };
    if (Array.isArray(queryParams.models)) {
      queryParams.models = queryParams.models.join(',');
    }
    const query = this.buildQuery(queryParams);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.get(`/conflicts${suffix}`);
  }

  async getConflict(id) {
    return this.get(`/conflicts/${id}`);
  }

  async lockConflict(id, data) {
    return this.post(`/conflicts/${id}/lock`, data);
  }

  async unlockConflict(id) {
    return this.delete(`/conflicts/${id}/lock`);
  }

  async resolveConflict(id, data) {
    return this.post(`/conflicts/${id}/resolve`, data);
  }

  async applyConflict(id) {
    return this.post(`/conflicts/${id}/apply`);
  }

  async retryConflict(id) {
    return this.post(`/conflicts/${id}/retry`);
  }

  async previewBulkResolution(rule) {
    return this.post('/conflicts/bulk-resolve', { rule, dry_run: true });
  }

  async applyBulkResolution(rule) {
    return this.post('/conflicts/bulk-resolve', { rule, dry_run: false });
  }

  // Health check
  async health() {
    return this.get('/health');
  }
}

// Export singleton instance
export default new APIClient();
