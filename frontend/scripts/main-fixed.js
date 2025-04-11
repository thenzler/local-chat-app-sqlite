// DOM-Elemente
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const sourcesPanel = document.getElementById('sources-panel');
const closeSourcesBtn = document.getElementById('close-sources');
const sourcesContent = document.getElementById('sources-content');
const ollamaStatus = document.getElementById('ollama-status').querySelector('.status-badge');
const vectordbStatus = document.getElementById('vectordb-status').querySelector('.status-badge');

// State
let lastSources = [];
let isWaitingForResponse = false;
let debugMode = false; // Set to true to enable debug logs

// Simple debug logging function
function debug(...args) {
    if (debugMode) {
        console.log('[DEBUG]', ...args);
    }
}

// UI-Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    debug('DOM loaded, initializing UI');
    
    // Auto-resize für Textarea
    userInput.addEventListener('input', autoResizeTextArea);
    
    // Aktiviere/Deaktiviere Sende-Button basierend auf Eingabe
    userInput.addEventListener('input', () => {
        sendButton.disabled = userInput.value.trim() === '';
    });
    
    // Enter-Taste zum Absenden (Shift+Enter für neue Zeile)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !sendButton.disabled) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });
    
    // Chatformular absenden
    chatForm.addEventListener('submit', sendMessage);
    
    // Quellen-Panel schließen
    closeSourcesBtn.addEventListener('click', toggleSourcesPanel);
    
    // Status-Checks
    checkOllamaStatus();
    checkVectorDBStatus();
    
    // Add a debug mode toggle - double click on the app header
    document.querySelector('.app-header').addEventListener('dblclick', (e) => {
        debugMode = !debugMode;
        debug(`Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
        if (debugMode) {
            addMessageToChat('system', '<p>Debug mode enabled. Check console for logs.</p>');
        }
    });
    
    // Enable submit button initially if there's content
    if (userInput.value.trim() !== '') {
        sendButton.disabled = false;
    }
});

/**
 * Passt die Höhe der Textarea automatisch an den Inhalt an
 */
function autoResizeTextArea() {
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight) + 'px';
}

/**
 * Sendet eine Nachricht an den Server und verarbeitet die Antwort
 */
async function sendMessage(e) {
    e.preventDefault();
    
    const message = userInput.value.trim();
    if (message === '' || isWaitingForResponse) return;
    
    debug('Sending message:', message);
    
    // UI aktualisieren
    addMessageToChat('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendButton.disabled = true;
    isWaitingForResponse = true;
    
    // Nachrichten-Container nach unten scrollen
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Lade-Indikator hinzufügen
    const loadingMessageEl = addMessageToChat('bot', '<div class="typing-indicator"><span></span><span></span><span></span></div>');
    
    try {
        debug('Sending API request to /api/chat');
        
        // API-Anfrage
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        debug('Received response:', data);
        
        // Lade-Indikator entfernen
        if (loadingMessageEl && loadingMessageEl.parentNode) {
            chatMessages.removeChild(loadingMessageEl);
        }
        
        // Check if the response contains an actual reply
        if (!data.reply) {
            debug('No reply in response:', data);
            throw new Error('Server response did not contain a reply');
        }
        
        // Bot-Antwort hinzufügen
        const botMessage = addMessageToChat('bot', formatBotResponse(data.reply));
        
        // Nachrichten-Container nach unten scrollen
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Quellen verarbeiten
        lastSources = data.sources || [];
        if (lastSources.length > 0) {
            debug('Found sources:', lastSources);
            
            // Quellen-Button hinzufügen
            const messageActions = document.createElement('div');
            messageActions.className = 'message-actions';
            
            const sourcesButton = document.createElement('button');
            sourcesButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 9h7"></path>
                    <path d="M12 15h7"></path>
                    <path d="M5 9h1"></path>
                    <path d="M5 15h1"></path>
                    <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                </svg>
                ${lastSources.length} Quellen
            `;
            sourcesButton.addEventListener('click', () => {
                showSources(lastSources);
            });
            
            messageActions.appendChild(sourcesButton);
            botMessage.appendChild(messageActions);
            
            // Quellenverweise im Text hervorheben
            highlightSourcesInText(botMessage);
        }
    } catch (error) {
        debug('Error during chat request:', error);
        
        // Lade-Indikator entfernen
        if (loadingMessageEl && loadingMessageEl.parentNode) {
            chatMessages.removeChild(loadingMessageEl);
        }
        
        // Fehlermeldung anzeigen
        addMessageToChat('bot', `
            <p>Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage:</p>
            <p><code>${error.message}</code></p>
            <p>Bitte versuchen Sie es später erneut oder prüfen Sie die Konsole für weitere Details.</p>
        `);
        
        // Try to check connectivity to server
        checkOllamaStatus();
        checkVectorDBStatus();
    } finally {
        isWaitingForResponse = false;
        // Re-enable the button in case the user wants to try again
        sendButton.disabled = false;
    }
}

/**
 * Fügt eine Nachricht zum Chat-Container hinzu
 */
function addMessageToChat(sender, content) {
    debug('Adding message to chat, sender:', sender);
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${sender}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = content;
    
    messageEl.appendChild(messageContent);
    chatMessages.appendChild(messageEl);
    
    return messageEl;
}

/**
 * Formatiert die Bot-Antwort mit einfachem Markdown
 */
function formatBotResponse(text) {
    if (!text) {
        debug('Warning: Trying to format empty bot response');
        return '<p>Keine Antwort erhalten.</p>';
    }
    
    debug('Formatting bot response');
    
    // Links formatieren
    text = text.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g, 
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Zeilenumbrüche zu <p>-Tags
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Zeigt das Quellen-Panel mit den entsprechenden Quellen an
 */
function showSources(sources) {
    debug('Showing sources panel', sources);
    
    // Quelleninhalt leeren
    sourcesContent.innerHTML = '';
    
    if (!sources || sources.length === 0) {
        sourcesContent.innerHTML = '<p>Keine Quellen verfügbar.</p>';
    } else {
        // Quellen sortieren nach Dokumentnamen und Seitennummer
        sources.sort((a, b) => {
            if (a.document !== b.document) {
                return a.document.localeCompare(b.document);
            }
            return a.page - b.page;
        });
        
        // Für jede Quelle einen Eintrag erstellen
        sources.forEach(source => {
            const sourceElement = document.createElement('div');
            sourceElement.className = 'source-item';
            
            sourceElement.innerHTML = `
                <div class="source-title">${escapeHtml(source.document)}</div>
                <div class="source-page">Seite ${source.page}</div>
            `;
            
            sourcesContent.appendChild(sourceElement);
        });
    }
    
    // Panel öffnen
    toggleSourcesPanel(true);
}

/**
 * Schaltet das Quellen-Panel um (ein/aus)
 */
function toggleSourcesPanel(forceOpen) {
    if (forceOpen === true || !sourcesPanel.classList.contains('open')) {
        sourcesPanel.classList.add('open');
    } else {
        sourcesPanel.classList.remove('open');
    }
}

/**
 * Hebt Quellenreferenzen im Text hervor
 */
function highlightSourcesInText(messageElement) {
    const content = messageElement.querySelector('.message-content');
    if (!content) return;
    
    // Support both German and English citation formats
    const formats = [
        { regex: 'Quelle', lang: 'de' },
        { regex: 'Source', lang: 'en' }
    ];
    
    lastSources.forEach(source => {
        formats.forEach(format => {
            const regex = new RegExp(`\\(${format.regex}: ${escapeRegExp(source.document)}, (Seite|Page) ${source.page}\\)`, 'g');
            
            content.innerHTML = content.innerHTML.replace(regex, (match) => {
                return `<span class="source-highlight" data-document="${escapeHtml(source.document)}" data-page="${source.page}">${match}</span>`;
            });
        });
    });
    
    // Event-Listener für hervorgehobene Quellen
    const sourceHighlights = content.querySelectorAll('.source-highlight');
    sourceHighlights.forEach(highlight => {
        highlight.addEventListener('click', () => {
            const document = highlight.getAttribute('data-document');
            const page = parseInt(highlight.getAttribute('data-page'));
            
            // Nach dieser Quelle filtern und anzeigen
            const specificSource = lastSources.find(s => 
                s.document === document && s.page === page
            );
            
            if (specificSource) {
                showSources([specificSource]);
            }
        });
    });
}

/**
 * Überprüft den Status von Ollama
 */
async function checkOllamaStatus() {
    try {
        updateStatus(ollamaStatus, 'loading', 'Prüfe...');
        
        const response = await fetch('/api/check-ollama');
        const data = await response.json();
        
        if (data.status === 'ok') {
            updateStatus(ollamaStatus, 'ok', `Bereit (${data.models.length} Modelle)`);
        } else {
            updateStatus(ollamaStatus, 'error', data.message || 'Nicht erreichbar');
        }
    } catch (error) {
        debug('Ollama status check failed:', error);
        updateStatus(ollamaStatus, 'error', 'Nicht erreichbar');
    }
}

/**
 * Überprüft den Status der Vektordatenbank
 */
async function checkVectorDBStatus() {
    try {
        updateStatus(vectordbStatus, 'loading', 'Prüfe...');
        
        const response = await fetch('/api/check-vectordb');
        const data = await response.json();
        
        if (data.status === 'ok') {
            updateStatus(vectordbStatus, 'ok', `${data.count} Dokumente`);
        } else if (data.status === 'warning') {
            updateStatus(vectordbStatus, 'warning', data.message || 'Keine Dokumente');
        } else {
            updateStatus(vectordbStatus, 'error', data.message || 'Fehler');
        }
    } catch (error) {
        debug('VectorDB status check failed:', error);
        updateStatus(vectordbStatus, 'error', 'Nicht erreichbar');
    }
}

/**
 * Aktualisiert ein Status-Element
 */
function updateStatus(element, status, text) {
    element.setAttribute('data-status', status);
    element.querySelector('.status-text').textContent = text;
}

/**
 * Direkt zum Testen des Ollama-Modells
 */
async function testOllama() {
    try {
        debug('Testing Ollama directly');
        const response = await fetch('/api/test-ollama', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'Say hello in German' })
        });
        
        const data = await response.json();
        debug('Ollama test response:', data);
        
        if (data.success) {
            addMessageToChat('system', `<p>Ollama test successful: "${data.response}"</p>`);
        } else {
            addMessageToChat('system', `<p>Ollama test failed: ${data.error}</p>`);
        }
    } catch (error) {
        debug('Ollama test error:', error);
        addMessageToChat('system', `<p>Ollama test error: ${error.message}</p>`);
    }
}

/**
 * Hilfsfunktion: HTML-Escaping
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Hilfsfunktion: RegExp-Escaping
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Typing-Indikator CSS
document.head.insertAdjacentHTML('beforeend', `
<style>
.typing-indicator {
    display: flex;
    align-items: center;
}

.typing-indicator span {
    height: 8px;
    width: 8px;
    margin: 0 2px;
    background-color: var(--text-light);
    border-radius: 50%;
    display: inline-block;
    animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
    animation-delay: 0s;
}

.typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes typing {
    0%, 100% {
        transform: scale(0.7);
        opacity: 0.5;
    }
    50% {
        transform: scale(1);
        opacity: 1;
    }
}
</style>
`);

// Add a test button in debug mode
document.head.insertAdjacentHTML('beforeend', `
<style>
#debug-panel {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 5px;
    padding: 10px;
    display: none;
    z-index: 1000;
}

#debug-panel button {
    margin: 5px;
    padding: 5px 10px;
    background: #555;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}

#debug-panel button:hover {
    background: #777;
}

.message.system {
    background-color: rgba(255, 255, 200, 0.2);
    border-left: 3px solid #f5c842;
}
</style>
`);

// Create debug panel
const debugPanel = document.createElement('div');
debugPanel.id = 'debug-panel';
debugPanel.innerHTML = `
    <button id="test-ollama">Test Ollama</button>
    <button id="toggle-debug">Toggle Debug Mode</button>
`;
document.body.appendChild(debugPanel);

// Setup debug panel functionality
document.getElementById('toggle-debug').addEventListener('click', () => {
    debugMode = !debugMode;
    debug(`Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
    addMessageToChat('system', `<p>Debug mode ${debugMode ? 'enabled' : 'disabled'}</p>`);
});

document.getElementById('test-ollama').addEventListener('click', testOllama);

// Show debug panel with Alt+D
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'd') {
        debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
    }
});

debug('Frontend script loaded successfully');
