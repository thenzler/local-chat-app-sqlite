// Import required dependencies
const express = require('express');
const cors = require('cors');
// Import our FIXED Ollama client implementation 
const { Ollama } = require('./ollama-client-fixed');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import modules
const vectorDB = require('./vector-db');
const modelRoutes = require('./routes/models');
const documentRoutes = require('./routes/documents');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Redirect root to fixed version
app.get('/', (req, res) => {
  res.redirect('/index-fixed.html');
});

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Configure logging level
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function log(level, ...args) {
  if (logLevels[level] >= logLevels[LOG_LEVEL]) {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

// Initialize Ollama client with our FIXED implementation
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  timeout: 60000 // 60 seconds
});

// Initialize VectorDB
vectorDB.initialize().catch(err => {
  log('error', 'Fehler bei der Initialisierung der VectorDB:', err);
});

// Enhanced System prompt for the LLM with improved structure
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `You are a precise research assistant who answers with accuracy and clarity.

PRIORITY 1: For information found in the provided documents:
- Use EXCLUSIVELY this documented information
- For EVERY piece of information from the documents, you MUST immediately cite the exact source in parentheses
- Format for document citations: (Source: Document name, Page X)
- Be comprehensive and detailed when answering from documents

PRIORITY 2: When no relevant information exists in the documents:
- Clearly state: "I could not find specific information on this question in the available documents."
- Then provide a general answer based on your knowledge, clearly marked with: "[General Knowledge]"

Formatting instructions:
1. Structure your answer in clear, logical paragraphs
2. Place the most important information at the beginning
3. For EVERY piece of document information, cite the source as (Source: Document name, Page X)
4. Never merge information from different documents without clear source attribution
5. Clearly separate documented information from general knowledge`;

// API Routes
app.use('/api/models', modelRoutes);
app.use('/api/documents', documentRoutes);

// API endpoint to handle chat requests
app.post('/api/chat', async (req, res) => {
  try {
    // Validate request body
    const { message, conversationId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    log('info', `Neue Benutzeranfrage: "${message}"`);
    
    try {
      await handleChatWithLocalLLM(message, conversationId, res);
    } catch (innerError) {
      log('error', 'Fehler bei der Verarbeitung der Anfrage:', innerError);
      
      // Send a fallback response instead of throwing
      return res.json({
        reply: `Es tut mir leid, aber es gab ein Problem bei der Verarbeitung Ihrer Anfrage: ${innerError.message}. Bitte versuchen Sie es später noch einmal.`,
        sources: []
      });
    }
  } catch (error) {
    log('error', 'Fehler bei der Kommunikation mit dem lokalen LLM:', error.message);
    
    // Send a fallback response in proper format
    return res.json({
      reply: `Es tut mir leid, aber die Kommunikation mit dem lokalen LLM ist fehlgeschlagen: ${error.message}. Bitte stellen Sie sicher, dass Ollama richtig läuft und versuchen Sie es erneut.`,
      sources: []
    });
  }
});

/**
 * Verarbeitet Chat-Anfragen mit einem lokalen LLM via Ollama
 */
async function handleChatWithLocalLLM(message, conversationId, res) {
  try {
    log('debug', 'Starte Chat mit lokalem LLM (Ollama)');
    
    // 1. Relevante Dokumente aus der Vektordatenbank abrufen
    const { contextText, documents } = await retrieveRelevantDocuments(message);
    
    // 2. Prüfen, ob Dokumente gefunden wurden
    let userPrompt;
    
    if (documents.length === 0) {
      log('info', "Keine relevanten Dokumente gefunden");
      userPrompt = `
To following question, no relevant information was found in the documents: "${message}"

Please respond as follows:
1. First mention that no specific information was found in the documents
2. Then provide a general answer based on your knowledge, clearly marked with "[General Knowledge]:"`;
    } else {
      // Normal mit gefundenen Dokumenten fortfahren
      userPrompt = `Answer the following question based on the given document excerpts. Use ONLY information from these excerpts and cite the source with document name and page number for each piece of information.

Question: ${message}

Here are the relevant document excerpts:

${contextText}`;
    }

    // 3. Lokale LLM-Anfrage stellen
    const localModel = process.env.OLLAMA_MODEL || 'mistral';
    
    log('info', `Sende Anfrage an lokales Modell: ${localModel}`);
    
    const result = await ollama.chat({
      model: localModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      options: {
        temperature: parseFloat(process.env.TEMPERATURE || 0.1),
        num_predict: parseInt(process.env.MAX_TOKENS || 4000),
      }
    });

    // 4. Antwort verarbeiten
    const botReply = result.message.content;
    log('info', `Bot-Antwort: "${botReply.substring(0, 100)}..."`);
    
    // 5. Quellen extrahieren
    const sources = extractSourcesFromText(botReply);
    log('info', `${sources.length} eindeutige Quellen extrahiert`);
    
    // 6. Antwort senden
    return res.json({
      reply: botReply,
      sources: sources
    });
    
  } catch (error) {
    log('error', 'Fehler bei der lokalen LLM-Anfrage:', error);
    throw error;
  }
}

/**
 * Extrahiert Quellenangaben aus dem Text im Format (Quelle: Dokumentname, Seite X)
 */
function extractSourcesFromText(text) {
  const sources = [];
  
  if (!text || typeof text !== 'string') {
    log('warn', 'Text für Quellenextraktion ist leer oder kein String');
    return sources;
  }
  
  // Support multiple citation formats
  const sourceRegexes = [
    /\(Source: ([^,]+), Page (\d+)\)/g,  // Standard format
    /\(Quelle: ([^,]+), Seite (\d+)\)/g  // German format
  ];
  
  for (const regex of sourceRegexes) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const document = match[1].trim();
      const page = parseInt(match[2]);
      
      // Nur eindeutige Quellen hinzufügen
      if (!sources.some(s => s.document === document && s.page === page)) {
        sources.push({ document, page });
      }
    }
  }
  
  return sources;
}

/**
 * Relevante Dokumente aus der Vektordatenbank abrufen
 */
async function retrieveRelevantDocuments(query) {
  log('debug', `Suche nach relevanten Dokumenten für: "${query}" in Vektordatenbank`);
  
  try {
    // Prüfen, ob die VectorDB initialisiert ist
    const stats = await vectorDB.getStats();
    
    if (!stats.exists || stats.count === 0) {
      log('warn', 'Vektordatenbank ist leer oder existiert nicht. Bitte zuerst Dokumente indexieren.');
      return { contextText: "", documents: [] };
    }
    
    // Semantische Suche verwenden, wenn aktiviert
    const useSemanticSearch = process.env.USE_SEMANTIC_SEARCH !== 'false';
    
    // Suche mit der verbesserten VectorDB ausführen
    const searchResults = await vectorDB.search(query, {
      limit: 10,
      minScore: parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || 0.2),
      useSemanticSearch: useSemanticSearch
    });
    
    // Ergebnisse verarbeiten
    const results = [];
    let contextText = "";
    let totalTokenCount = 0;
    const MAX_TOKEN_ESTIMATE = 10000;
    
    if (searchResults.count === 0) {
      log('info', 'Keine relevanten Dokumente in der Vektordatenbank gefunden');
      return { contextText: "", documents: [] };
    }
    
    // Jeden gefundenen Treffer verarbeiten
    for (const result of searchResults.results) {
      const content = result.content || "";
      const documentName = result.documentName || "Unknown Document";
      const pageNumber = result.pageNumber || 1;
      
      // Token-Größe schätzen - ungefähr 4 Zeichen pro Token als grobe Schätzung
      const estimatedTokens = Math.ceil(content.length / 4);
      
      // Wenn das Token-Limit überschritten wird, nicht mehr hinzufügen
      if (totalTokenCount + estimatedTokens > MAX_TOKEN_ESTIMATE) {
        log('warn', `Token-Limit erreicht, überspringe restliche Dokumente`);
        break;
      }
      
      // Dokument gegebenenfalls kürzen
      let processedContent = content;
      if (estimatedTokens > 2000) {
        const charLimit = 2000 * 4;
        processedContent = content.substring(0, charLimit) + "... [Document truncated due to size]";
        log('warn', `Großes Dokument gekürzt: ${documentName}`);
      }
      
      const doc = {
        content: processedContent,
        documentName,
        pageNumber,
        score: result.score
      };
      
      contextText += `Document: ${doc.documentName}\n`;
      contextText += `Page: ${doc.pageNumber}\n`;
      contextText += `Relevance: ${Math.round(doc.score * 100)}%\n`;
      contextText += `Content: ${doc.content}\n\n`;
      
      totalTokenCount += estimatedTokens;
      results.push(doc);
    }
    
    log('info', `${results.length} relevante Dokumentenabschnitte mit ${useSemanticSearch ? 'semantischer' : 'keyword-basierter'} Suche gefunden`);
    log('debug', `Geschätzte Token-Anzahl: ${totalTokenCount}`);
    
    return { contextText, documents: results };
    
  } catch (error) {
    log('error', 'Fehler bei der Dokumentensuche:', error);
    return { contextText: "", documents: [] };
  }
}

// Test search functionality
app.get('/api/test-search', async (req, res) => {
  try {
    const query = req.query.q || 'test query';
    const useSemanticSearch = req.query.semantic !== 'false';
    
    log('info', `Test-Suche: "${query}" (Semantisch: ${useSemanticSearch ? 'ja' : 'nein'})`);
    
    // VectorDB für die Suche verwenden
    const searchResults = await vectorDB.search(query, {
      limit: 5,
      useSemanticSearch: useSemanticSearch
    });
    
    return res.json({
      query,
      useSemanticSearch,
      documentCount: searchResults.count,
      documents: searchResults.results.map(doc => ({
        name: doc.documentName,
        page: doc.pageNumber,
        score: doc.score,
        preview: doc.content.substring(0, 200) + '...'
      }))
    });
  } catch (error) {
    console.error('Error testing search:', error);
    return res.status(500).json({ error: 'Error testing search', details: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check if Ollama is running
app.get('/api/check-ollama', async (req, res) => {
  try {
    log('debug', 'Testing Ollama connection...'); 
    const models = await ollama.list();
    return res.json({
      status: 'ok',
      models: models.models.map(m => m.name),
      recommended: process.env.OLLAMA_MODEL || 'mistral'
    });
  } catch (error) {
    log('error', 'Fehler bei der Verbindung zu Ollama:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Ollama ist nicht erreichbar. Bitte stellen Sie sicher, dass Ollama läuft.',
      details: error.message || 'fetch failed'
    });
  }
});

// Check if Vector DB is running and get statistics
app.get('/api/check-vectordb', async (req, res) => {
  try {
    const stats = await vectorDB.getStats();
    
    return res.json({
      status: stats.exists ? 'ok' : 'warning',
      message: stats.exists ? `Vektordatenbank bereit mit ${stats.count} indizierten Dokumenten` : 'Vektordatenbank ist leer oder existiert nicht',
      ...stats
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Vektordatenbank ist nicht erreichbar',
      details: error.message
    });
  }
});

// Debug-Endpunkt zum direkten Testen der Ollama-Kommunikation
app.post('/api/test-ollama', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const model = process.env.OLLAMA_MODEL || 'mistral';
    log('info', `Test-Anfrage an Ollama mit Modell ${model}: "${prompt.substring(0, 50)}..."`);
    
    const result = await ollama.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
      options: { temperature: 0.1 }
    });
    
    return res.json({ 
      success: true, 
      response: result.message.content,
      model
    });
  } catch (error) {
    log('error', 'Fehler beim Test-Aufruf von Ollama:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Verbesserte Version mit robuster Ollama-Integration`);
  console.log(`System-Prompt konfiguriert mit ${SYSTEM_PROMPT.length} Zeichen`);
  console.log(`Verwendetes lokales Modell: ${process.env.OLLAMA_MODEL || 'mistral'}`);
  console.log(`Gesundheitscheck verfügbar unter http://localhost:${PORT}/health`);
  console.log(`Suchtest verfügbar unter http://localhost:${PORT}/api/test-search?q=ihre+suchanfrage`);
  console.log(`Ollama-Test verfügbar unter http://localhost:${PORT}/api/test-ollama (POST)`);
  console.log(`Modellprüfung verfügbar unter http://localhost:${PORT}/api/check-ollama`);
  console.log(`Vektordatenbank-Status verfügbar unter http://localhost:${PORT}/api/check-vectordb`);
  console.log(`Dokumentenverwaltung verfügbar unter http://localhost:${PORT}/api/documents`);
});

// Cleanup-Handler für Programmbeendigung
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    log('info', `Signal ${signal} empfangen, schließe Verbindungen...`);
    
    // Schließe die Datenbankverbindung
    if (vectorDB) {
      vectorDB.close();
    }
    
    log('info', 'Anwendung wird beendet');
    process.exit(0);
  });
});