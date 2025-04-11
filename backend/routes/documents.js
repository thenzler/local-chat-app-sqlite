// Import required dependencies
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const router = express.Router();

// Import document indexer and vector database
const documentIndexer = require('../document-indexer');
const vectorDB = require('../vector-db');

// SQLite for document metadata management
const sqlite3 = require('sqlite3').verbose();
let docDB = null;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async function(req, file, cb) {
    const uploadsDir = process.env.UPLOADS_DIR || './uploads';
    const documentsDir = process.env.DOCUMENTS_DIR || './documents';
    
    // Ensure directories exist
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(documentsDir, { recursive: true });
      cb(null, uploadsDir);
    } catch (error) {
      console.error('Error creating upload directories:', error);
      cb(error);
    }
  },
  filename: function(req, file, cb) {
    // Create unique filename with original extension
    const fileExt = path.extname(file.originalname);
    const fileName = file.originalname.replace(fileExt, '').replace(/\s+/g, '_');
    const uniqueName = `${fileName}_${Date.now()}${fileExt}`;
    cb(null, uniqueName);
  }
});

// File filter to only allow supported document types
const fileFilter = (req, file, cb) => {
  // Supported file types
  const allowedTypes = ['.pdf', '.docx', '.txt', '.md', '.html'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed types: PDF, DOCX, TXT, MD, HTML'));
  }
};

// Set up multer middleware with limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE) || 50) * 1024 * 1024, // Default 50MB
  }
});

// Initialize document database
async function initDocumentDB() {
  const dbPath = process.env.DOCUMENT_DB_PATH || './data/documents.db';
  
  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  try {
    await fs.mkdir(dbDir, { recursive: true });
  } catch (error) {
    console.error('Error creating database directory:', error);
  }
  
  return new Promise((resolve, reject) => {
    docDB = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('Error opening document database:', err);
        reject(err);
        return;
      }
      
      // Create tables if they don't exist
      docDB.serialize(() => {
        // Documents table
        docDB.run(`
          CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_type TEXT NOT NULL,
            upload_date TEXT NOT NULL,
            last_indexed TEXT,
            indexing_status TEXT DEFAULT 'pending',
            tags TEXT,
            category TEXT,
            description TEXT
          )
        `);
        
        // Document versions table for version control
        docDB.run(`
          CREATE TABLE IF NOT EXISTS document_versions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            version INTEGER NOT NULL,
            upload_date TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id)
          )
        `);
        
        resolve(true);
      });
    });
  });
}

// Initialize the database when the module is loaded
initDocumentDB().catch(err => {
  console.error('Failed to initialize document database:', err);
});

// Route to upload a document
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const { category, tags, description } = req.body;
    
    // Move file from uploads to documents directory
    const documentsDir = process.env.DOCUMENTS_DIR || './documents';
    const destinationPath = path.join(documentsDir, file.filename);
    
    await fs.rename(file.path, destinationPath);
    
    // Generate a unique ID for the document
    const documentId = `doc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    // Store document metadata in database
    await new Promise((resolve, reject) => {
      docDB.run(
        `INSERT INTO documents 
         (id, filename, original_filename, file_path, file_size, file_type, upload_date, tags, category, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          file.filename,
          file.originalname,
          destinationPath,
          file.size,
          path.extname(file.originalname).toLowerCase(),
          new Date().toISOString(),
          tags || '',
          category || 'Uncategorized',
          description || ''
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Trigger document indexing
    const indexingResult = await documentIndexer.indexSingleDocument({
      filename: file.filename,
      path: destinationPath,
      extension: path.extname(file.originalname).toLowerCase()
    });
    
    // Update indexing status
    await new Promise((resolve, reject) => {
      docDB.run(
        `UPDATE documents SET indexing_status = ?, last_indexed = ? WHERE id = ?`,
        [
          indexingResult.success ? 'indexed' : 'failed',
          new Date().toISOString(),
          documentId
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
    
    res.status(200).json({
      success: true,
      message: 'Document uploaded and indexed successfully',
      document: {
        id: documentId,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        type: path.extname(file.originalname).toLowerCase(),
        indexingStatus: indexingResult.success ? 'indexed' : 'failed'
      }
    });
    
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ 
      error: 'Error uploading document', 
      details: error.message 
    });
  }
});

// Route to get all documents
router.get('/', async (req, res) => {
  try {
    const documents = await new Promise((resolve, reject) => {
      docDB.all(`SELECT * FROM documents ORDER BY upload_date DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.status(200).json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ 
      error: 'Error fetching documents', 
      details: error.message 
    });
  }
});

// Route to get a single document by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await new Promise((resolve, reject) => {
      docDB.get(`SELECT * FROM documents WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get document versions
    const versions = await new Promise((resolve, reject) => {
      docDB.all(
        `SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    res.status(200).json({ document, versions });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ 
      error: 'Error fetching document', 
      details: error.message 
    });
  }
});

// Route to update document metadata
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, tags, description } = req.body;
    
    // Check if document exists
    const document = await new Promise((resolve, reject) => {
      docDB.get(`SELECT * FROM documents WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document metadata
    await new Promise((resolve, reject) => {
      docDB.run(
        `UPDATE documents SET category = ?, tags = ?, description = ? WHERE id = ?`,
        [
          category || document.category,
          tags || document.tags,
          description || document.description,
          id
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
    
    res.status(200).json({
      success: true,
      message: 'Document updated successfully'
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ 
      error: 'Error updating document', 
      details: error.message 
    });
  }
});

// Route to delete a document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get document details
    const document = await new Promise((resolve, reject) => {
      docDB.get(`SELECT * FROM documents WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Delete document file
    try {
      await fs.unlink(document.file_path);
    } catch (fileError) {
      console.warn(`Could not delete file at ${document.file_path}:`, fileError);
    }
    
    // Get versions and delete their files too
    const versions = await new Promise((resolve, reject) => {
      docDB.all(
        `SELECT * FROM document_versions WHERE document_id = ?`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    // Delete version files
    for (const version of versions) {
      try {
        await fs.unlink(version.file_path);
      } catch (fileError) {
        console.warn(`Could not delete version file at ${version.file_path}:`, fileError);
      }
    }
    
    // Delete document and its versions from the database in a transaction
    await new Promise((resolve, reject) => {
      docDB.serialize(() => {
        docDB.run('BEGIN TRANSACTION');
        
        docDB.run(`DELETE FROM document_versions WHERE document_id = ?`, [id]);
        docDB.run(`DELETE FROM documents WHERE id = ?`, [id]);
        
        docDB.run('COMMIT', function(err) {
          if (err) {
            docDB.run('ROLLBACK');
            reject(err);
          } else {
            resolve(true);
          }
        });
      });
    });
    
    // Update vector database to remove document entries
    // This is implementation-specific and would need to be added
    
    res.status(200).json({
      success: true,
      message: 'Document and all its versions deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ 
      error: 'Error deleting document', 
      details: error.message 
    });
  }
});

// Route to get document categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await new Promise((resolve, reject) => {
      docDB.all(
        `SELECT DISTINCT category FROM documents ORDER BY category`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.category));
        }
      );
    });
    
    res.status(200).json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      error: 'Error fetching categories', 
      details: error.message 
    });
  }
});

// Route to reindex a document
router.post('/:id/reindex', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get document details
    const document = await new Promise((resolve, reject) => {
      docDB.get(`SELECT * FROM documents WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Trigger document indexing
    const indexingResult = await documentIndexer.indexSingleDocument({
      filename: document.filename,
      path: document.file_path,
      extension: document.file_type
    });
    
    // Update indexing status
    await new Promise((resolve, reject) => {
      docDB.run(
        `UPDATE documents SET indexing_status = ?, last_indexed = ? WHERE id = ?`,
        [
          indexingResult.success ? 'indexed' : 'failed',
          new Date().toISOString(),
          id
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
    
    res.status(200).json({
      success: indexingResult.success,
      message: indexingResult.success 
        ? 'Document reindexed successfully' 
        : 'Failed to reindex document',
      details: indexingResult.message
    });
  } catch (error) {
    console.error('Error reindexing document:', error);
    res.status(500).json({ 
      error: 'Error reindexing document', 
      details: error.message 
    });
  }
});

module.exports = router;