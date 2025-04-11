// Simple script to test the chat API directly
const fetch = require('node-fetch');

async function testChatAPI() {
  try {
    console.log('Testing chat API...');
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Hello, can you tell me about the documents you have?'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Response received:');
    console.log('Bot reply:', data.reply.substring(0, 200) + '...');
    console.log('Sources:', data.sources);
    console.log('API test successful!');
  } catch (error) {
    console.error('Error testing chat API:', error);
  }
}

testChatAPI();
