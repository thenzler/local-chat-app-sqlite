# Local Chat App with SQLite Vector Search

This application provides an interface for chatting with local language models via Ollama while using a SQLite-based vector database for document search and retrieval.

## Features

- Chat with local LLMs via Ollama
- Document management (upload, view, delete)
- SQLite-based vector database for semantic search
- Responsive interface for both desktop and mobile
- Document indexing with embeddings support

## Installation

1. Clone the repository:
```
git clone https://github.com/thenzler/local-chat-app-sqlite.git
cd local-chat-app-sqlite
```

2. Install dependencies:
```
npm install
```

3. Make sure you have Ollama installed and running: 
   [Ollama Installation Guide](https://github.com/ollama/ollama)

4. Create a `.env` file in the root directory with the following content:
```
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=mistral
PORT=3000
```

## Quick Start

1. Start the server:
```
npm start
```

2. Open your browser and go to `http://localhost:3000`
   - The application automatically uses the enhanced fixed frontend

3. Upload documents and start chatting!

## Troubleshooting

If you encounter issues with messages not displaying:

1. Check the browser console (F12) for errors
2. Use Alt+D to bring up the debug panel
3. Click "Test Ollama" to check direct communication

## Document Management

- Upload PDF, DOCX, and TXT files
- View uploaded documents and their status
- Delete documents when no longer needed

## Vector Search

The application uses SQLite with a vector extension to store document embeddings and perform semantic search. This allows finding relevant documents based on meaning rather than just keywords.

## Configuration

You can configure the application further by setting these environment variables:

```
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=mistral

# Server Configuration
PORT=3000
LOG_LEVEL=info  # debug, info, warn, error

# LLM Configuration
TEMPERATURE=0.1
MAX_TOKENS=4000
SYSTEM_PROMPT=Your custom system prompt here

# Vector Search Configuration
USE_SEMANTIC_SEARCH=true
VECTOR_SIMILARITY_THRESHOLD=0.2
```

## License

MIT
