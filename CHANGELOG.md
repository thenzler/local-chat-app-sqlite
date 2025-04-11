# Changelog

## Version 1.1.0 - April 11, 2025

### Added
- Online document management system with web-based interface
- Document upload, categorization, and tagging functionality
- Document metadata management (descriptions, tags, categories)
- Document re-indexing capability
- Enhanced system prompts for better LLM responses
- UI navigation between chat and document management
- New API endpoints for document management
- Support for viewing document status and metadata

### Changed
- Improved LLM prompting for better source attributions
- Updated package.json with multer for file upload capabilities
- Changed styling to accommodate document management UI
- Enhanced database schema to store document metadata
- Updated vector-db.js with better initialization tracking
- Modified document-indexer.js to support single document indexing

### Technical Improvements
- Added initialization tracking for database connections
- Improved error handling in API endpoints
- Enhanced file processing pipeline for document uploads
- Added document categorization and filtering capabilities
- Implemented modal dialogs for document management actions

## Version 1.0.0 - Initial Release

- Initial application setup
- Local LLM integration with Ollama
- SQLite-based vector database for document embeddings
- Basic chat interface with message history
- Source attribution for information from documents
- Local file system document indexing