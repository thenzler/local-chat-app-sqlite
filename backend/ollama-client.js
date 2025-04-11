/**
 * Custom Ollama client implementation that uses native fetch
 * This resolves the "fetch is not a function" error in Node.js environments
 */

class OllamaClient {
  constructor(options = {}) {
    this.host = options.host || 'http://localhost:11434';
    this.timeout = options.timeout || 60000;
    console.log(`Initializing custom Ollama client with host: ${this.host}`);
  }

  /**
   * Makes a request to the Ollama API
   */
  async _request(endpoint, method = 'GET', body = null) {
    const url = `${this.host}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      // Abort controller would be used here for timeout in a more complete implementation
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error in Ollama request to ${url}:`, error);
      throw error;
    }
  }

  /**
   * List available models
   */
  async list() {
    const data = await this._request('/api/tags');
    return { models: data.models || [] };
  }

  /**
   * Generate a chat completion
   */
  async chat({ model, messages, options = {} }) {
    const requestBody = { 
      model, 
      messages,
      options
    };

    // Fix: Return the response in the correct structure expected by the server code
    const response = await this._request('/api/chat', 'POST', requestBody);
    return { 
      message: {
        content: response.message.content 
      }
    };
  }

  /**
   * Generate a completion (non-chat)
   */
  async generate({ model, prompt, options = {} }) {
    const requestBody = { 
      model, 
      prompt,
      ...options
    };

    return this._request('/api/generate', 'POST', requestBody);
  }

  /**
   * Get model information
   */
  async show(model) {
    return this._request(`/api/show?name=${encodeURIComponent(model)}`);
  }

  /**
   * Pull a model
   */
  async pull(model) {
    return this._request('/api/pull', 'POST', { name: model });
  }
}

module.exports = { Ollama: OllamaClient };
