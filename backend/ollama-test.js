// Simple test script for Ollama connection
const { Ollama } = require('ollama');

async function testOllamaConnection() {
  try {
    console.log('Testing Ollama connection...');
    
    // Create Ollama client
    const ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    });
    
    console.log('Attempting to list models...');
    const result = await ollama.list();
    
    console.log('Connection successful!');
    console.log('Available models:');
    result.models.forEach(model => {
      console.log(`- ${model.name}`);
    });
    
    return true;
  } catch (error) {
    console.error('Error connecting to Ollama:');
    console.error(error);
    
    // More detailed error reporting
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    
    console.log('\nTroubleshooting tips:');
    console.log('1. Ensure Ollama is running: "ollama serve"');
    console.log('2. Check your .env configuration: OLLAMA_HOST should be "http://localhost:11434"');
    console.log('3. Try installing a model if none exist: "ollama pull mistral"');
    console.log('4. Check if port 11434 is blocked by firewall');
    
    return false;
  }
}

// Run the test if executed directly
if (require.main === module) {
  // Ensure dotenv is loaded
  require('dotenv').config();
  
  testOllamaConnection()
    .then(success => {
      if (!success) {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exit(1);
    });
}

module.exports = { testOllamaConnection };
