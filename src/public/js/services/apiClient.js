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

  // Health check
  async health() {
    return this.get('/health');
  }
}

// Export singleton instance
export default new APIClient();
