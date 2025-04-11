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

// Debug flag
const DEBUG = true;

// Debug function
function debug(...args) {
    if (DEBUG) {
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
    chatForm.addEventListener('submit', (e) => {
        debug('Chat form submitted');
        sendMessage(e);
    });
    
    // Quellen-Panel schließen
    closeSourcesBtn.addEventListener('click', toggleSourcesPanel);
    
    // Status-Checks
    checkOllamaStatus();
    checkVectorDBStatus();
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
    if (message === '' || isWaitingForResponse) {
        debug('Empty message or already waiting for response');
        return;
    }
    
    // UI aktualisieren
    debug('Adding user message to chat:', message);
    addMessageToChat('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendButton.disabled = true;
    isWaitingForResponse = true;
    
    // Nachrichten-Container nach unten scrollen
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Lade-Indikator hinzufügen
    debug('Adding loading indicator');
    const loadingMessageEl = addMessageToChat('bot', '<div class="typing-indicator"><span></span><span></span><span></span></div>');
    
    try {
        // API-Anfrage
        debug('Sending request to /api/chat');
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            debug('Server returned error:', response.status, errorText);
            throw new Error(`Server returned ${response.status}: ${response.statusText}. ${errorText}`);
        }
        
        debug('Parsing response');
        const data = await response.json();
        debug('Response received:', data);
        
        // Lade-Indikator entfernen
        debug('Removing loading indicator');
        try {
            chatMessages.removeChild(loadingMessageEl);
        } catch (err) {
            console.error('Error removing loading indicator:', err);
        }
        
        // Bot-Antwort hinzufügen
        if (!data || !data.reply) {
            throw new Error('Invalid response from server: ' + JSON.stringify(data));
        }
        
        debug('Adding bot response to chat');
        const botMessage = addMessageToChat('bot', formatBotResponse(data.reply));
        
        // Nachrichten-Container nach unten scrollen
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Quellen verarbeiten
        lastSources = data.sources || [];
        if (lastSources.length > 0) {
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
        // Lade-Indikator entfernen
        debug('Error occurred:', error);
        try {
            chatMessages.removeChild(loadingMessageEl);
        } catch (err) {
            console.error('Error removing loading indicator:', err);
        }
        
        // Fehlermeldung anzeigen
        addMessageToChat('bot', `
            <p>Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage:</p>
            <p><code>${error.message}</code></p>
            <p>Bitte versuchen Sie es später erneut oder prüfen Sie die Konsole für weitere Details.</p>
        `);
        console.error('Error during chat request:', error);
    } finally {
        isWaitingForResponse = false;
        sendButton.disabled = false;
    }
}

/**
 * Fügt eine Nachricht zum Chat-Container hinzu
 */
function addMessageToChat(sender, content) {
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
        debug('Warning: Empty text in formatBotResponse');
        return '<p>Keine Antwort erhalten</p>';
    }
    
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
    // Quelleninhalt leeren
    sourcesContent.innerHTML = '';
    
    if (sources.length === 0) {
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
    
    lastSources.forEach(source => {
        const regex = new RegExp(`\\(Source: ${escapeRegExp(source.document)}, Page ${source.page}\\)`, 'g');
        
        content.innerHTML = content.innerHTML.replace(regex, (match) => {
            return `<span class="source-highlight" data-document="${escapeHtml(source.document)}" data-page="${source.page}">${match}</span>`;
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
        debug('Checking Ollama status');
        updateStatus(ollamaStatus, 'loading', 'Prüfe...');
        
        const response = await fetch('/api/check-ollama');
        const data = await response.json();
        debug('Ollama status:', data);
        
        if (data.status === 'ok') {
            updateStatus(ollamaStatus, 'ok', `Bereit (${data.models.length} Modelle)`);
        } else {
            updateStatus(ollamaStatus, 'error', data.message || 'Nicht erreichbar');
        }
    } catch (error) {
        debug('Ollama status check failed:', error);
        updateStatus(ollamaStatus, 'error', 'Nicht erreichbar');
        console.error('Ollama status check failed:', error);
    }
}

/**
 * Überprüft den Status der Vektordatenbank
 */
async function checkVectorDBStatus() {
    try {
        debug('Checking Vector DB status');
        updateStatus(vectordbStatus, 'loading', 'Prüfe...');
        
        const response = await fetch('/api/check-vectordb');
        const data = await response.json();
        debug('Vector DB status:', data);
        
        if (data.status === 'ok') {
            updateStatus(vectordbStatus, 'ok', `${data.count} Dokumente`);
        } else if (data.status === 'warning') {
            updateStatus(vectordbStatus, 'warning', data.message || 'Keine Dokumente');
        } else {
            updateStatus(vectordbStatus, 'error', data.message || 'Fehler');
        }
    } catch (error) {
        debug('Vector DB status check failed:', error);
        updateStatus(vectordbStatus, 'error', 'Nicht erreichbar');
        console.error('VectorDB status check failed:', error);
    }
}

/**
 * Aktualisiert ein Status-Element
 */
function updateStatus(element, status, text) {
    debug(`Updating status: ${status} - ${text}`);
    element.setAttribute('data-status', status);
    element.querySelector('.status-text').textContent = text;
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

// Add a simple test button to the UI
document.addEventListener('DOMContentLoaded', () => {
    // Check if we should add the debug panel
    if (DEBUG) {
        const debugPanel = document.createElement('div');
        debugPanel.style.position = 'fixed';
        debugPanel.style.bottom = '10px';
        debugPanel.style.right = '10px';
        debugPanel.style.background = '#f0f0f0';
        debugPanel.style.padding = '10px';
        debugPanel.style.borderRadius = '5px';
        debugPanel.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
        debugPanel.style.zIndex = '1000';
        
        const testButton = document.createElement('button');
        testButton.textContent = 'Test API Directly';
        testButton.onclick = async () => {
            try {
                debug('Testing API directly');
                const testMessage = 'This is a test message from the debug panel';
                
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message: testMessage })
                });
                
                const data = await response.json();
                debug('Direct API test response:', data);
                
                if (data && data.reply) {
                    alert('API Test Successful! Check console for details.');
                } else {
                    alert('API Response received but missing reply field. Check console.');
                }
            } catch (error) {
                debug('API test error:', error);
                alert(`API Test Error: ${error.message}`);
            }
        };
        
        debugPanel.appendChild(testButton);
        document.body.appendChild(debugPanel);
    }
});
