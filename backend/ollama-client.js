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
      console.log(`Making ${method} request to ${url}`);
      if (body) {
        console.log(`Request body: ${JSON.stringify(body)}`);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      console.log(`Response received from ${url}: `, JSON.stringify(responseData).substring(0, 200) + '...');
      return responseData;
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

    try {
      // Log the request
      console.log(`Chat request with model ${model}`);
      console.log(`Messages: ${JSON.stringify(messages)}`);
      
      // Make the request
      const response = await this._request('/api/chat', 'POST', requestBody);
      console.log('Full Ollama API response:', JSON.stringify(response));
      
      // Extract content no matter what structure we get
      let content = '';
      
      // Handle different response structures we might get
      if (response.message && typeof response.message.content === 'string') {
        // Direct content in message
        content = response.message.content;
      } else if (response.message && response.message.message && typeof response.message.message.content === 'string') {
        // Nested content
        content = response.message.message.content;
      } else if (typeof response.content === 'string') {
        // Top level content
        content = response.content;
      } else if (typeof response === 'string') {
        // Response is directly a string
        content = response;
      } else {
        // Last resort - convert whole response to string
        content = JSON.stringify(response);
        console.warn('Unable to extract content properly from Ollama response');
      }
      
      console.log(`Extracted content: ${content.substring(0, 100)}...`);
      
      // Return in expected structure
      return {
        message: {
          content: content
        }
      };
    } catch (error) {
      console.error('Error in chat method:', error);
      // Return a fallback error message in the expected format
      return {
        message: {
          content: `Error communicating with Ollama: ${error.message}`
        }
      };
    }
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
