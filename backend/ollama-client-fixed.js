/**
 * Improved Ollama client implementation that correctly handles streaming responses
 */

class OllamaClient {
  constructor(options = {}) {
    this.host = options.host || 'http://localhost:11434';
    this.timeout = options.timeout || 60000;
    console.log(`Initializing fixed Ollama client with host: ${this.host}`);
  }

  /**
   * Makes a request to the Ollama API with improved error handling
   */
  async _request(endpoint, method = 'GET', body = null) {
    const url = `${this.host}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`Making ${method} request to ${url}`);
      if (body) {
        console.log(`Request body: ${JSON.stringify(body).substring(0, 200)}...`);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      // First get the raw text response
      const rawText = await response.text();
      
      // For debugging, log the beginning of the response
      console.log(`Raw response from ${url} (first 200 chars): ${rawText.substring(0, 200)}...`);
      
      // If this is a streaming response with multiple JSON objects
      if (endpoint === '/api/chat' && rawText.includes('{"model":') && rawText.includes('"done":')) {
        return this._handleStreamingResponse(rawText);
      }
      
      // Robust parsing with error recovery
      let responseData;
      try {
        // Try to parse as JSON
        responseData = JSON.parse(rawText);
      } catch (parseError) {
        console.warn(`JSON parse error: ${parseError.message}. Trying to fix the response...`);
        
        // When JSON parsing fails, we need to try some recovery methods:
        // 1. Try stripping out any non-JSON content at the beginning or end
        try {
          // Look for a JSON object pattern
          const jsonMatch = rawText.match(/\{.*\}/s);
          if (jsonMatch) {
            console.log("Found JSON object in response, attempting to parse that portion");
            responseData = JSON.parse(jsonMatch[0]);
          } else {
            // 2. Handle streaming responses (which may have multiple JSON objects)
            const jsonLines = rawText.split('\n').filter(line => line.trim().startsWith('{'));
            if (jsonLines.length > 0) {
              console.log("Found JSON lines in response, parsing the last one");
              responseData = JSON.parse(jsonLines[jsonLines.length - 1]);
            } else {
              // 3. If all else fails, create a simple response object with the raw text
              console.log("Creating fallback response object with raw text");
              responseData = {
                message: {
                  content: rawText
                }
              };
            }
          }
        } catch (recoveryError) {
          console.error("Failed to recover from JSON parsing error:", recoveryError);
          // Create a fallback response with the raw text
          responseData = {
            message: {
              content: rawText
            }
          };
        }
      }
      
      console.log(`Processed response from ${url}`);
      return responseData;
    } catch (error) {
      console.error(`Error in Ollama request to ${url}:`, error);
      throw error;
    }
  }

  /**
   * Handle streaming responses from Ollama chat API
   */
  _handleStreamingResponse(rawText) {
    try {
      console.log("Processing streaming response...");
      
      // The response is a series of JSON objects, one per line
      const lines = rawText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error("Empty response from Ollama");
      }
      
      // Combine all message contents to get the full message
      let fullContent = '';
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.message && obj.message.content) {
            fullContent += obj.message.content;
          }
        } catch (e) {
          console.warn(`Error parsing line: ${line.substring(0, 50)}...`, e);
        }
      }
      
      console.log("Combined full message:", fullContent);
      
      return {
        message: {
          role: 'assistant',
          content: fullContent || "Sorry, I couldn't generate a response."
        }
      };
    } catch (error) {
      console.error("Error handling streaming response:", error);
      return {
        message: {
          role: 'assistant',
          content: `Error processing response: ${error.message}`
        }
      };
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
   * Generate a chat completion with improved error handling
   */
  async chat({ model, messages, options = {} }) {
    const requestBody = { 
      model, 
      messages,
      options: {
        ...options,
        stream: false // Force non-streaming mode
      }
    };

    try {
      // Make the request
      const response = await this._request('/api/chat', 'POST', requestBody);
      
      // Extract content in a robust way, handling various response formats
      let content = '';
      
      // Handle different possible response structures
      if (response.message && typeof response.message.content === 'string') {
        // Standard response format
        content = response.message.content;
      } else if (response.message && response.message.message && typeof response.message.message.content === 'string') {
        // Nested message format
        content = response.message.message.content;
      } else if (typeof response.content === 'string') {
        // Direct content field
        content = response.content;
      } else if (response.response && typeof response.response === 'string') {
        // Some Ollama versions use 'response' field
        content = response.response;
      } else if (typeof response === 'string') {
        // Response is directly a string
        content = response;
      } else {
        // Last resort - create a meaningful error message
        console.warn('Unable to extract content from Ollama response:', response);
        content = "Unable to process response from LLM. The response format was unexpected.";
      }
      
      // Ensure we have a string
      if (typeof content !== 'string') {
        content = String(content);
      }
      
      console.log(`Extracted content from LLM: ${content.substring(0, 100)}...`);
      
      // Return in expected structure
      return {
        message: {
          content: content
        }
      };
    } catch (error) {
      console.error('Error in chat method:', error);
      // Return a fallback error message
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
      stream: false, // Force non-streaming 
      ...options
    };

    try {
      const response = await this._request('/api/generate', 'POST', requestBody);
      
      // Handle various response formats
      if (response.response) {
        return { response: response.response };
      }
      
      return response;
    } catch (error) {
      console.error('Error in generate method:', error);
      return { error: error.message };
    }
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