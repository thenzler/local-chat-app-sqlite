// Document Management Script
document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const documentsListEl = document.getElementById('documents-list');
  const documentDetailEl = document.getElementById('document-detail-panel');
  const documentSearchEl = document.getElementById('document-search');
  const searchClearBtn = document.getElementById('search-clear');
  const categoryFilterEl = document.getElementById('category-filter');
  const uploadBtn = document.getElementById('upload-button');
  const uploadModal = document.getElementById('upload-modal');
  const closeUploadModalBtn = document.getElementById('close-upload-modal');
  const cancelUploadBtn = document.getElementById('cancel-upload');
  const uploadForm = document.getElementById('upload-form');
  const documentFileEl = document.getElementById('document-file');
  const filePreviewEl = document.getElementById('file-preview');
  const documentCategoryEl = document.getElementById('document-category');
  const addCategoryBtn = document.getElementById('add-category-button');
  const categoryModal = document.getElementById('category-modal');
  const closeCategoryModalBtn = document.getElementById('close-category-modal');
  const cancelCategoryBtn = document.getElementById('cancel-category');
  const categoryForm = document.getElementById('category-form');
  const categoryNameEl = document.getElementById('category-name');
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitleEl = document.getElementById('confirm-title');
  const confirmMessageEl = document.getElementById('confirm-message');
  const closeConfirmModalBtn = document.getElementById('close-confirm-modal');
  const cancelConfirmBtn = document.getElementById('cancel-confirm');
  const submitConfirmBtn = document.getElementById('submit-confirm');
  const loadingOverlay = document.getElementById('loading-overlay');

  // State variables
  let documents = [];
  let categories = [];
  let selectedDocumentId = null;
  let confirmCallback = null;

  // Initialize the app
  init();

  // Functions
  async function init() {
    await Promise.all([
      fetchDocuments(),
      fetchCategories()
    ]);

    setupEventListeners();
  }

  function setupEventListeners() {
    // Search functionality
    documentSearchEl.addEventListener('input', filterDocuments);
    searchClearBtn.addEventListener('click', clearSearch);

    // Category filter
    categoryFilterEl.addEventListener('change', filterDocuments);

    // Upload modal
    uploadBtn.addEventListener('click', openUploadModal);
    closeUploadModalBtn.addEventListener('click', closeUploadModal);
    cancelUploadBtn.addEventListener('click', closeUploadModal);
    uploadForm.addEventListener('submit', handleDocumentUpload);
    documentFileEl.addEventListener('change', updateFilePreview);

    // Category modal
    addCategoryBtn.addEventListener('click', openCategoryModal);
    closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    categoryForm.addEventListener('submit', handleCategoryAdd);

    // Confirm modal
    closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
    cancelConfirmBtn.addEventListener('click', closeConfirmModal);
    submitConfirmBtn.addEventListener('click', handleConfirm);
  }

  async function fetchDocuments() {
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      documents = data.documents || [];
      renderDocumentsList();
    } catch (error) {
      console.error('Error fetching documents:', error);
      showError('Fehler beim Laden der Dokumente');
    }
  }

  async function fetchCategories() {
    try {
      const response = await fetch('/api/documents/categories/list');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      categories = data.categories || [];
      populateCategoryDropdowns();
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }

  function populateCategoryDropdowns() {
    // Clear previous options but keep the default one
    categoryFilterEl.innerHTML = '<option value="">Alle Kategorien</option>';
    documentCategoryEl.innerHTML = '<option value="Uncategorized">Unkategorisiert</option>';

    // Add categories to filter dropdown
    categories.forEach(category => {
      if (category === 'Uncategorized') return; // Skip default category

      const filterOption = document.createElement('option');
      filterOption.value = category;
      filterOption.textContent = category;
      categoryFilterEl.appendChild(filterOption);

      const uploadOption = document.createElement('option');
      uploadOption.value = category;
      uploadOption.textContent = category;
      documentCategoryEl.appendChild(uploadOption);
    });
  }

  function renderDocumentsList(filteredDocs = null) {
    const docs = filteredDocs || documents;
    documentsListEl.innerHTML = '';

    if (docs.length === 0) {
      documentsListEl.innerHTML = `
        <div class="empty-state">
          <p>Keine Dokumente gefunden</p>
        </div>
      `;
      return;
    }

    // Sort documents by upload date (newest first)
    const sortedDocs = [...docs].sort((a, b) => {
      return new Date(b.upload_date) - new Date(a.upload_date);
    });

    sortedDocs.forEach(doc => {
      const documentEl = document.createElement('div');
      documentEl.className = 'document-item';
      documentEl.dataset.id = doc.id;
      if (doc.id === selectedDocumentId) {
        documentEl.classList.add('selected');
      }

      const fileExtension = doc.file_type.replace('.', '');
      const tags = doc.tags ? doc.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];

      documentEl.innerHTML = `
        <div style="display: flex; align-items: flex-start;">
          <div class="file-icon ${fileExtension}">${fileExtension.toUpperCase()}</div>
          <div style="flex: 1;">
            <div class="document-name">${doc.original_filename}</div>
            <div class="document-meta">
              <div>Hochgeladen: ${formatDate(doc.upload_date)}</div>
              <div>${formatFileSize(doc.file_size)}</div>
            </div>
            ${doc.category ? `<div class="document-category">${doc.category}</div>` : ''}
            ${tags.length > 0 ? `
              <div class="document-tags">
                ${tags.map(tag => `<span class="document-tag">${tag}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
        <div style="margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
          <div class="status-indicator ${doc.indexing_status}">
            ${getStatusLabel(doc.indexing_status)}
          </div>
        </div>
      `;

      documentEl.addEventListener('click', () => {
        selectDocument(doc.id);
      });

      documentsListEl.appendChild(documentEl);
    });
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'indexed': return 'Indexiert';
      case 'pending': return 'Ausstehend';
      case 'failed': return 'Fehlgeschlagen';
      default: return 'Unbekannt';
    }
  }

  function filterDocuments() {
    const searchTerm = documentSearchEl.value.toLowerCase();
    const categoryFilter = categoryFilterEl.value;

    // Show/hide clear button
    searchClearBtn.style.display = searchTerm ? 'block' : 'none';

    // Filter documents
    const filteredDocs = documents.filter(doc => {
      const matchesSearch = 
        doc.original_filename.toLowerCase().includes(searchTerm) ||
        (doc.description && doc.description.toLowerCase().includes(searchTerm)) ||
        (doc.tags && doc.tags.toLowerCase().includes(searchTerm));
      
      const matchesCategory = !categoryFilter || doc.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });

    renderDocumentsList(filteredDocs);
  }

  function clearSearch() {
    documentSearchEl.value = '';
    searchClearBtn.style.display = 'none';
    filterDocuments();
  }

  function selectDocument(id) {
    selectedDocumentId = id;
    
    // Update selected class in list
    document.querySelectorAll('.document-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === id);
    });

    // Find the document
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    // Render document details
    renderDocumentDetail(doc);
  }

  function renderDocumentDetail(doc) {
    const fileExtension = doc.file_type.replace('.', '');
    const tags = doc.tags ? doc.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];

    documentDetailEl.innerHTML = `
      <div class="document-detail">
        <div class="document-detail-header">
          <div class="document-title">
            <h2>${doc.original_filename}</h2>
            <div class="document-actions">
              <button class="secondary-button" id="edit-document-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
                Bearbeiten
              </button>
              <button class="secondary-button" id="reindex-document-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M23 4v6h-6"></path>
                  <path d="M1 20v-6h6"></path>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                  <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
                </svg>
                Neu indexieren
              </button>
              <button class="danger-button" id="delete-document-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Löschen
              </button>
            </div>
          </div>

          <div class="document-info">
            <div class="info-row">
              <div class="info-label">Dateiname:</div>
              <div>${doc.filename}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Dateityp:</div>
              <div>${fileExtension.toUpperCase()}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Größe:</div>
              <div>${formatFileSize(doc.file_size)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Hochgeladen am:</div>
              <div>${formatDate(doc.upload_date)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Zuletzt indexiert:</div>
              <div>${doc.last_indexed ? formatDate(doc.last_indexed) : 'Noch nicht indexiert'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Status:</div>
              <div class="status-indicator ${doc.indexing_status}">
                ${getStatusLabel(doc.indexing_status)}
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">Kategorie:</div>
              <div>${doc.category || 'Unkategorisiert'}</div>
            </div>
            ${tags.length > 0 ? `
              <div class="info-row">
                <div class="info-label">Tags:</div>
                <div class="document-tags">
                  ${tags.map(tag => `<span class="document-tag">${tag}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="document-content">
          ${doc.description ? `
            <h3>Beschreibung</h3>
            <div class="document-description">${doc.description}</div>
          ` : ''}
        </div>
      </div>
    `;

    // Add event listeners for action buttons
    document.getElementById('edit-document-btn').addEventListener('click', () => {
      // TODO: Implement edit functionality
      alert('Bearbeiten-Funktion wird noch implementiert.');
    });

    document.getElementById('reindex-document-btn').addEventListener('click', () => {
      reindexDocument(doc.id);
    });

    document.getElementById('delete-document-btn').addEventListener('click', () => {
      showConfirmModal(
        'Dokument löschen',
        `Sind Sie sicher, dass Sie das Dokument "${doc.original_filename}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.`,
        () => deleteDocument(doc.id)
      );
    });
  }

  async function handleDocumentUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('document-file');
    const categoryInput = document.getElementById('document-category');
    const tagsInput = document.getElementById('document-tags');
    const descriptionInput = document.getElementById('document-description');

    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Bitte wählen Sie eine Datei aus.');
      return;
    }

    const formData = new FormData();
    formData.append('document', fileInput.files[0]);
    formData.append('category', categoryInput.value);
    formData.append('tags', tagsInput.value);
    formData.append('description', descriptionInput.value);

    showLoading('Dokument wird hochgeladen und indexiert...');

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      closeUploadModal();
      await fetchDocuments();
      selectDocument(data.document.id);
      
      showSuccess('Dokument erfolgreich hochgeladen und indexiert.');
    } catch (error) {
      console.error('Error uploading document:', error);
      showError(`Fehler beim Hochladen: ${error.message}`);
    } finally {
      hideLoading();
    }
  }

  function updateFilePreview() {
    const fileInput = document.getElementById('document-file');
    const filePreview = document.getElementById('file-preview');

    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      filePreview.innerHTML = `
        <span>${file.name}</span>
        <span style="margin-left: auto; color: var(--text-light);">${formatFileSize(file.size)}</span>
      `;
    } else {
      filePreview.innerHTML = '<span>Keine Datei ausgewählt</span>';
    }
  }

  async function handleCategoryAdd(e) {
    e.preventDefault();

    const categoryName = categoryNameEl.value.trim();
    if (!categoryName) {
      alert('Bitte geben Sie einen Kategorienamen ein.');
      return;
    }

    // In a real implementation, you would send this to the server
    // For now, we'll just add it to the local array
    if (!categories.includes(categoryName)) {
      categories.push(categoryName);
      populateCategoryDropdowns();
      
      // Select the newly created category
      documentCategoryEl.value = categoryName;
    }

    closeCategoryModal();
  }

  async function reindexDocument(id) {
    showLoading('Dokument wird neu indexiert...');

    try {
      const response = await fetch(`/api/documents/${id}/reindex`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      await fetchDocuments();
      selectDocument(id);
      
      showSuccess('Dokument erfolgreich neu indexiert.');
    } catch (error) {
      console.error('Error reindexing document:', error);
      showError(`Fehler beim Neuindexieren: ${error.message}`);
    } finally {
      hideLoading();
    }
  }

  async function deleteDocument(id) {
    showLoading('Dokument wird gelöscht...');

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      selectedDocumentId = null;
      documentDetailEl.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <h3>Kein Dokument ausgewählt</h3>
          <p>Wählen Sie ein Dokument aus der Liste aus, um Details anzuzeigen.</p>
        </div>
      `;
      
      await fetchDocuments();
      showSuccess('Dokument erfolgreich gelöscht.');
    } catch (error) {
      console.error('Error deleting document:', error);
      showError(`Fehler beim Löschen: ${error.message}`);
    } finally {
      hideLoading();
    }
  }

  // Modal functions
  function openUploadModal() {
    // Reset form
    uploadForm.reset();
    filePreviewEl.innerHTML = '<span>Keine Datei ausgewählt</span>';
    
    uploadModal.style.display = 'flex';
  }

  function closeUploadModal() {
    uploadModal.style.display = 'none';
  }

  function openCategoryModal() {
    // Reset form
    categoryForm.reset();
    
    categoryModal.style.display = 'flex';
  }

  function closeCategoryModal() {
    categoryModal.style.display = 'none';
  }

  function showConfirmModal(title, message, callback) {
    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    confirmCallback = callback;
    
    confirmModal.style.display = 'flex';
  }

  function closeConfirmModal() {
    confirmModal.style.display = 'none';
    confirmCallback = null;
  }

  function handleConfirm() {
    if (typeof confirmCallback === 'function') {
      confirmCallback();
    }
    closeConfirmModal();
  }

  // Loading overlay
  function showLoading(message = 'Wird geladen...') {
    const loadingMessageEl = document.querySelector('.loading-message');
    if (loadingMessageEl) {
      loadingMessageEl.textContent = message;
    }
    loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  // Helper functions
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Notification functions
  function showSuccess(message) {
    alert(message); // In a real app, use a better notification system
  }

  function showError(message) {
    alert('Fehler: ' + message); // In a real app, use a better notification system
  }
});
