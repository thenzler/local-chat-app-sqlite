// models.js - Route für Modellverwaltung und -informationen
const express = require('express');
const { Ollama } = require('ollama');
const router = express.Router();

// Ollama-Client initialisieren mit verbesserten Optionen
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  fetch: {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 60000,
    keepalive: true,
    credentials: 'omit'
  }
});

// Logging-Funktion
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] [${level.toUpperCase()}] [Models]`, ...args);
}

// Alle verfügbaren Modelle abrufen
router.get('/', async (req, res) => {
  try {
    log('info', 'Rufe verfügbare Modelle ab');
    const models = await ollama.list();
    
    return res.json({
      models: models.models.map(model => ({
        name: model.name,
        size: model.size,
        modified: model.modified,
        quantization: model.details?.quantization || null,
        family: model.details?.family || 'Unbekannt',
        parameters: model.details?.parameter_size || 'Unbekannt'
      })),
      recommended: process.env.OLLAMA_MODEL || 'mistral'
    });
  } catch (error) {
    log('error', 'Fehler beim Abrufen der Modelle:', error);
    return res.status(500).json({
      error: 'Fehler beim Abrufen der Modelle',
      message: error.message
    });
  }
});

// Details zu einem spezifischen Modell abrufen
router.get('/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    log('info', `Rufe Details für Modell "${modelName}" ab`);
    
    const models = await ollama.list();
    const model = models.models.find(m => m.name === modelName);
    
    if (!model) {
      return res.status(404).json({
        error: 'Modell nicht gefunden',
        message: `Das Modell "${modelName}" ist nicht installiert`
      });
    }
    
    return res.json({
      name: model.name,
      size: model.size,
      modified: model.modified,
      details: model.details || {}
    });
  } catch (error) {
    log('error', `Fehler beim Abrufen der Modelldetails für "${req.params.name}":`, error);
    return res.status(500).json({
      error: 'Fehler beim Abrufen der Modelldetails',
      message: error.message
    });
  }
});

// Empfohlenes Modell basierend auf Systemspezifikationen abrufen
router.get('/recommend/best', async (req, res) => {
  try {
    log('info', 'Ermittle das bestmögliche Modell für das System');
    
    // Prüfen, ob GPU vorhanden ist
    const hasGPU = req.query.gpu === 'true';
    // RAM-Größe (in GB) - Fallback zu 8 GB
    const ramGB = parseInt(req.query.ram) || 8;
    
    // Verfügbare Modelle abrufen
    const modelList = await ollama.list();
    
    // Modellempfehlungen basierend auf Hardware
    let recommendedModel;
    
    if (hasGPU && ramGB >= 16) {
      // High-End-System mit GPU und viel RAM
      recommendedModel = modelList.models.find(m => m.name === 'llama3') || 
                         modelList.models.find(m => m.name === 'mistral') ||
                         modelList.models.find(m => m.name.includes('7b')) ||
                         modelList.models[0];
    } else if (ramGB >= 12) {
      // Mid-Range-System
      recommendedModel = modelList.models.find(m => m.name === 'mistral') || 
                         modelList.models.find(m => m.name.includes('7b')) ||
                         modelList.models.find(m => m.name === 'tinyllama') ||
                         modelList.models[0];
    } else {
      // Low-End-System
      recommendedModel = modelList.models.find(m => m.name === 'tinyllama') ||
                         modelList.models.find(m => m.name.includes('3b')) ||
                         modelList.models[0];
    }
    
    return res.json({
      systemSpecs: {
        hasGPU,
        ramGB
      },
      recommendation: recommendedModel ? recommendedModel.name : null,
      fallback: process.env.OLLAMA_MODEL || 'mistral'
    });
  } catch (error) {
    log('error', 'Fehler bei der Modellempfehlung:', error);
    return res.status(500).json({
      error: 'Fehler bei der Modellempfehlung',
      message: error.message,
      fallback: process.env.OLLAMA_MODEL || 'mistral'
    });
  }
});

// Neues Modell herunterladen
router.post('/pull/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    log('info', `Beginne Download von Modell "${modelName}"`);
    
    // SSE-Header für Live-Updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Progress-Updates senden
    const sendUpdate = (status, progress, message) => {
      res.write(`data: ${JSON.stringify({ status, progress, message })}\n\n`);
    };
    
    // Start-Update senden
    sendUpdate('downloading', 0, `Download von ${modelName} gestartet...`);
    
    // Modell herunterladen mit Progress-Handling
    await ollama.pull({
      model: modelName,
      handler: {
        onProgress: (progress) => {
          const percent = Math.round((progress.completed / progress.total) * 100);
          sendUpdate('downloading', percent, `${percent}% abgeschlossen (${progress.completed}/${progress.total})`);
        }
      }
    });
    
    // Abschluss-Update senden
    sendUpdate('completed', 100, `Modell ${modelName} erfolgreich heruntergeladen!`);
    res.end();
  } catch (error) {
    log('error', `Fehler beim Herunterladen des Modells "${req.params.name}":`, error);
    
    // Fehlermeldung als SSE-Event senden
    res.write(`data: ${JSON.stringify({ 
      status: 'error', 
      progress: 0, 
      message: `Fehler beim Herunterladen: ${error.message}` 
    })}\n\n`);
    
    res.end();
  }
});

module.exports = router;