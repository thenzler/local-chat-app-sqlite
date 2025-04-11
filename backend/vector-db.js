// Import required dependencies
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
require('dotenv').config();

/**
 * Eine Wrapper-Klasse für SQLite mit Vektorsuche und Embedding-Unterstützung
 */
class VectorDatabase {
  constructor() {
    // Konfiguration
    this.config = {
      dbPath: process.env.SQLITE_DB_PATH || './data/vectors.db',
      embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,  // Standard für all-MiniLM-L6-v2
      tableName: 'document_vectors',
      similarityThreshold: parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || 0.2),
      cacheSize: parseInt(process.env.SQLITE_CACHE_SIZE || 2000)  // in KB
    };

    // SQLite-Verbindung (wird lazy initialisiert)
    this.db = null;

    // Embedding-Pipeline (wird lazy initialisiert)
    this.embedder = null;
    
    // Track initialization status
    this._initialized = false;

    // Logging-Funktion
    this.log = function(level, ...args) {
      const timestamp = new Date().toISOString();
      console[level](`[${timestamp}] [${level.toUpperCase()}] [VectorDB]`, ...args);
    };
  }

  /**
   * Check if the database is initialized
   */
  isInitialized() {
    return this._initialized && this.db !== null;
  }

  /**
   * Initialisiert die VectorDB und stellt sicher, dass die Tabelle existiert
   */
  async initialize() {
    try {
      this.log('info', 'Initialisiere VectorDB...');
      
      // Stelle sicher, dass das Verzeichnis existiert
      const dbDir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        this.log('info', `Verzeichnis "${dbDir}" erstellt`);
      }
      
      // Öffne die Datenbankverbindung
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.config.dbPath, async (err) => {
          if (err) {
            this.log('error', 'Fehler beim Öffnen der Datenbank:', err);
            reject(err);
            return;
          }
          
          // Optimiere die SQLite-Einstellungen für bessere Leistung
          this.db.serialize(() => {
            this.db.run(`PRAGMA cache_size = ${this.config.cacheSize};`);
            this.db.run('PRAGMA journal_mode = WAL;');
            this.db.run('PRAGMA synchronous = NORMAL;');
            
            // Erstelle die Tabelle, falls sie nicht existiert
            this.ensureTableExists()
              .then(async () => {
                // Embedding-Pipeline initialisieren
                await this.getEmbedder();
                this._initialized = true;
                this.log('info', 'VectorDB erfolgreich initialisiert');
                resolve(true);
              })
              .catch(error => {
                this.log('error', 'Fehler beim Erstellen der Tabelle:', error);
                reject(error);
              });
          });
        });
      });
    } catch (error) {
      this.log('error', 'Fehler bei der Initialisierung der VectorDB:', error);
      return false;
    }
  }

  /**
   * Stellt sicher, dass die SQLite-Tabelle existiert
   */
  async ensureTableExists() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Erstelle die Haupttabelle für Dokumente und Vektoren
        this.db.run(`
          CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            document_name TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            path TEXT,
            vector BLOB NOT NULL,
            timestamp TEXT NOT NULL
          );
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Erstelle Index für Dokumentnamen für schnellere Suchvorgänge
          this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_document_name 
            ON ${this.config.tableName} (document_name);
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Erstelle Volltext-Index für Inhaltssuche
            this.db.run(`
              CREATE VIRTUAL TABLE IF NOT EXISTS document_fts 
              USING fts5(content, document_name);
            `, (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              this.log('info', `Tabelle ${this.config.tableName} und Indizes erfolgreich erstellt/überprüft`);
              resolve(true);
            });
          });
        });
      });
    });
  }

  /**
   * Gibt die Embedding-Pipeline zurück oder initialisiert sie, falls noch nicht geschehen
   */
  async getEmbedder() {
    if (!this.embedder) {
      this.log('info', `Lade Embedding-Modell: ${this.config.embeddingModel}`);
      this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
    }
    
    return this.embedder;
  }

  /**
   * Erzeugt einen Embedding-Vektor für einen Text
   */
  async createEmbedding(text) {
    try {
      const embedder = await this.getEmbedder();
      const output = await embedder(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      this.log('error', 'Fehler beim Erstellen des Embeddings:', error);
      throw error;
    }
  }

  /**
   * Serialisiert einen Vektor in ein Buffer-Objekt für SQLite-Speicherung
   */
  serializeVector(vector) {
    const buffer = Buffer.alloc(vector.length * 4); // Float32 = 4 Bytes
    for (let i = 0; i < vector.length; i++) {
      buffer.writeFloatLE(vector[i], i * 4);
    }
    return buffer;
  }

  /**
   * Deserialisiert einen Buffer in einen Vektor
   */
  deserializeVector(buffer) {
    const vector = [];
    for (let i = 0; i < buffer.length; i += 4) {
      vector.push(buffer.readFloatLE(i));
    }
    return vector;
  }

  /**
   * Berechnet die Kosinus-Ähnlichkeit zwischen zwei Vektoren
   */
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Speichert Dokumente in der Vektordatenbank
   * @param {Array} documents - Array von Dokumentobjekten mit { content, metadata }
   */
  async storeDocuments(documents) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!documents || documents.length === 0) {
          this.log('warn', 'Keine Dokumente zum Speichern angegeben');
          resolve({ success: false, message: 'Keine Dokumente zum Speichern angegeben' });
          return;
        }
        
        this.log('info', `Speichere ${documents.length} Dokumente in Vektordatenbank...`);
        
        // Batch-Größe festlegen für effizientere Transaktionen
        const batchSize = 50;
        const batches = [];
        
        // Dokumente in Batches aufteilen
        for (let i = 0; i < documents.length; i += batchSize) {
          batches.push(documents.slice(i, i + batchSize));
        }
        
        let totalStored = 0;
        
        // Jeden Batch verarbeiten
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          this.log('info', `Verarbeite Batch ${i+1}/${batches.length} (${batch.length} Dokumente)`);
          
          // Verarbeite Dokumente
          const docsWithVectors = [];
          for (const doc of batch) {
            // Erstelle Embedding für den Inhalt
            const embedding = await this.createEmbedding(doc.content);
            docsWithVectors.push({...doc, vector: embedding});
          }
          
          // Transaktion starten
          this.db.serialize(() => {
            this.db.run('BEGIN TRANSACTION;');
            
            // Bereite Statements vor
            const insertStmt = this.db.prepare(`
              INSERT INTO ${this.config.tableName} 
              (id, content, document_name, page_number, path, vector, timestamp) 
              VALUES (?, ?, ?, ?, ?, ?, ?);
            `);
            
            const insertFtsStmt = this.db.prepare(`
              INSERT INTO document_fts 
              (content, document_name) 
              VALUES (?, ?);
            `);
            
            // Füge jedes Dokument ein
            for (const doc of docsWithVectors) {
              // Erstelle eindeutige ID
              const id = `doc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
              const vector = this.serializeVector(doc.vector);
              
              insertStmt.run(
                id,
                doc.content,
                doc.metadata.documentName || 'Unbekanntes Dokument',
                doc.metadata.pageNumber || 1,
                doc.metadata.path || null,
                vector,
                new Date().toISOString()
              );
              
              insertFtsStmt.run(
                doc.content,
                doc.metadata.documentName || 'Unbekanntes Dokument'
              );
            }
            
            // Statements finalisieren
            insertStmt.finalize();
            insertFtsStmt.finalize();
            
            // Transaktion abschließen
            this.db.run('COMMIT;', (err) => {
              if (err) {
                this.log('error', 'Fehler beim Speichern der Dokumente:', err);
                reject({ 
                  success: false, 
                  message: `Fehler beim Speichern der Dokumente: ${err.message}`,
                  error: err.message
                });
                return;
              }
              
              totalStored += batch.length;
              this.log('info', `${totalStored}/${documents.length} Dokumente gespeichert`);
              
              // Nach dem letzten Batch das Gesamtergebnis zurückgeben
              if (i === batches.length - 1) {
                resolve({ 
                  success: true, 
                  message: `${totalStored} Dokumente erfolgreich gespeichert`,
                  stored: totalStored
                });
              }
            });
          });
        }
      } catch (error) {
        this.log('error', 'Fehler beim Speichern der Dokumente:', error);
        resolve({ 
          success: false, 
          message: `Fehler beim Speichern der Dokumente: ${error.message}`,
          error: error.message
        });
      }
    });
  }

  /**
   * Sucht nach ähnlichen Dokumenten basierend auf einer Suchanfrage
   * @param {string} query - Suchanfrage
   * @param {Object} options - Suchoptionen (limit, minScore, useSemanticSearch)
   */
  async search(query, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const limit = options.limit || 10;
        const minScore = options.minScore || this.config.similarityThreshold;
        const useSemanticSearch = options.useSemanticSearch !== false;
        
        this.log('info', `Suche nach: "${query}" (Semantische Suche: ${useSemanticSearch ? 'ja' : 'nein'})`);
        
        if (useSemanticSearch) {
          // Semantische Suche: Embedding der Anfrage erstellen und nach Vektorähnlichkeit suchen
          const queryEmbedding = await this.createEmbedding(query);
          
          // Hole alle Dokumente aus der Datenbank
          this.db.all(`
            SELECT id, content, document_name, page_number, vector 
            FROM ${this.config.tableName};
          `, async (err, rows) => {
            if (err) {
              this.log('error', 'Fehler bei der Suche:', err);
              reject(err);
              return;
            }
            
            // Berechne Ähnlichkeiten
            const scoredRows = rows.map(row => {
              const vector = this.deserializeVector(row.vector);
              const score = this.cosineSimilarity(queryEmbedding, vector);
              return {...row, score};
            });
            
            // Filtere basierend auf Schwellenwert und sortiere nach Ähnlichkeit
            const results = scoredRows
              .filter(row => row.score >= minScore)
              .sort((a, b) => b.score - a.score)
              .slice(0, limit);
            
            // Formatiere Ergebnisse
            const formattedResults = results.map(result => ({
              content: result.content,
              documentName: result.document_name,
              pageNumber: result.page_number,
              score: result.score
            }));
            
            this.log('info', `${formattedResults.length} Suchergebnisse gefunden`);
            
            resolve({
              results: formattedResults,
              count: formattedResults.length
            });
          });
        } else {
          // Keyword-basierte Suche mit FTS
          // Bereite Suchbegriffe vor
          const searchTerms = query.split(/\s+/)
            .filter(term => term.length > 2)
            .map(term => term + '*')  // Wildcard-Suche aktivieren
            .join(' ');
          
          if (!searchTerms) {
            this.log('warn', 'Keine gültigen Schlüsselwörter in der Anfrage');
            resolve({ results: [], count: 0 });
            return;
          }
          
          // Führe FTS-Suche durch
          this.db.all(`
            SELECT document_name, content, rank
            FROM document_fts
            WHERE document_fts MATCH ?
            ORDER BY rank
            LIMIT ?;
          `, [searchTerms, limit], (err, ftsRows) => {
            if (err) {
              this.log('error', 'Fehler bei der Suche:', err);
              reject(err);
              return;
            }
            
            // Hole vollständige Dokumente basierend auf FTS-Ergebnissen
            let results = [];
            let processed = 0;
            
            if (ftsRows.length === 0) {
              resolve({ results: [], count: 0 });
              return;
            }
            
            for (const ftsRow of ftsRows) {
              this.db.all(`
                SELECT id, content, document_name, page_number
                FROM ${this.config.tableName}
                WHERE document_name = ? AND content = ?
                LIMIT 1;
              `, [ftsRow.document_name, ftsRow.content], (err, rows) => {
                processed++;
                
                if (err) {
                  this.log('error', 'Fehler bei der Dokumentenabfrage:', err);
                } else if (rows.length > 0) {
                  results.push({
                    ...rows[0],
                    score: 1.0 - (ftsRow.rank / 1000)  // Umwandlung des FTS-Ranks in einen normalisierteren Score
                  });
                }
                
                if (processed === ftsRows.length) {
                  // Formatiere Ergebnisse
                  const formattedResults = results.map(result => ({
                    content: result.content,
                    documentName: result.document_name,
                    pageNumber: result.page_number,
                    score: result.score
                  }));
                  
                  this.log('info', `${formattedResults.length} Keyword-Suchergebnisse gefunden`);
                  
                  resolve({
                    results: formattedResults,
                    count: formattedResults.length
                  });
                }
              });
            }
          });
        }
      } catch (error) {
        this.log('error', 'Fehler bei der Suche:', error);
        reject(error);
      }
    });
  }

  /**
   * Löscht alle Dokumente und setzt die Datenbank zurück
   */
  async resetCollection() {
    return new Promise((resolve, reject) => {
      try {
        this.log('info', `Setze Datenbank zurück...`);
        
        this.db.serialize(() => {
          // Lösche alle Einträge aus den Tabellen
          this.db.run(`DELETE FROM ${this.config.tableName};`);
          this.db.run(`DELETE FROM document_fts;`);
          
          // SQLite-Optimierungen
          this.db.run('VACUUM;', (err) => {
            if (err) {
              this.log('error', 'Fehler beim Zurücksetzen der Datenbank:', err);
              resolve({
                success: false,
                message: `Fehler beim Zurücksetzen der Datenbank: ${err.message}`,
                error: err.message
              });
            } else {
              resolve({
                success: true,
                message: `Datenbank erfolgreich zurückgesetzt`
              });
            }
          });
        });
      } catch (error) {
        this.log('error', 'Fehler beim Zurücksetzen der Datenbank:', error);
        resolve({
          success: false,
          message: `Fehler beim Zurücksetzen der Datenbank: ${error.message}`,
          error: error.message
        });
      }
    });
  }

  /**
   * Gibt Statistiken zur Datenbank zurück
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      try {
        this.log('info', `Rufe Datenbankstatistiken ab...`);
        
        // Prüfe, ob Tabelle existiert
        this.db.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?;
        `, [this.config.tableName], (err, tableExists) => {
          if (err) {
            this.log('error', 'Fehler beim Abrufen der Statistiken:', err);
            resolve({
              exists: false,
              count: 0,
              error: err.message
            });
            return;
          }
          
          if (!tableExists) {
            resolve({
              exists: false,
              count: 0,
              message: `Tabelle ${this.config.tableName} existiert nicht`
            });
            return;
          }
          
          // Zähle Einträge
          this.db.get(`
            SELECT COUNT(*) as count FROM ${this.config.tableName};
          `, (err, countResult) => {
            if (err) {
              this.log('error', 'Fehler beim Zählen der Einträge:', err);
              resolve({
                exists: true,
                count: 0,
                error: err.message
              });
              return;
            }
            
            // Datenbankgröße ermitteln
            try {
              const dbSizeInBytes = fs.statSync(this.config.dbPath).size;
              const dbSizeInMB = Math.round(dbSizeInBytes / (1024 * 1024) * 100) / 100;
              
              resolve({
                exists: true,
                count: countResult.count,
                dimensions: this.config.dimensions,
                model: this.config.embeddingModel,
                dbSize: dbSizeInMB,
                dbPath: this.config.dbPath,
                createdAt: fs.statSync(this.config.dbPath).birthtime.toISOString()
              });
            } catch (fsError) {
              this.log('error', 'Fehler beim Ermitteln der Dateigröße:', fsError);
              resolve({
                exists: true,
                count: countResult.count,
                dimensions: this.config.dimensions,
                model: this.config.embeddingModel,
                error: fsError.message
              });
            }
          });
        });
      } catch (error) {
        this.log('error', 'Fehler beim Abrufen der Statistiken:', error);
        resolve({
          exists: false,
          count: 0,
          error: error.message
        });
      }
    });
  }
  
  /**
   * Schließt die Datenbankverbindung
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          this.log('error', 'Fehler beim Schließen der Datenbankverbindung:', err);
        } else {
          this.log('info', 'Datenbankverbindung geschlossen');
        }
      });
    }
  }
}

// Exportiere eine singleton-Instanz
const vectorDB = new VectorDatabase();
module.exports = vectorDB;