# Local Chat App mit SQLite

Eine vollständig lokale Chat-Anwendung mit LLM und Vektorsuche, ohne Cloud-Abhängigkeiten oder API-Kosten, die SQLite anstelle von Qdrant verwendet.

## 🎯 Beschreibung

Diese Anwendung ist eine leistungsstarke, kostengünstige Alternative zu Cloud-basierten Chatbot-Lösungen wie Azure OpenAI. Sie bietet eine moderne, benutzerfreundliche Oberfläche für die Interaktion mit Ihren eigenen Dokumenten durch lokale Sprachmodelle (LLMs) und ermöglicht semantische Suche ohne Abhängigkeit von externen Diensten oder API-Kosten.

Im Vergleich zur ursprünglichen Local-Chat-App verwendet diese Version SQLite anstelle von Qdrant, was die Installation vereinfacht, da keine Docker-Installation erforderlich ist.

## 📋 Features

- **Lokale Sprachmodelle**: Integration mit Ollama für vollständig lokale LLM-Ausführung
- **Intelligente Modellverwaltung**: Automatische Hardwareerkennung und Modellempfehlungen
- **Semantische Vektorsuche**: Leistungsstarke SQLite-Integration mit Vektoreinbettungen
- **Online Dokumentenverwaltung**: Hochladen und Organisieren von Dokumenten direkt über die Benutzeroberfläche
- **Dokumentenreferenzierung**: Indizierung von PDF-, Word- und Textdateien mit Quellenangaben
- **Moderne Chat-UI**: Responsive Benutzeroberfläche mit Echtzeit-Interaktionen
- **Automatische Quellenangaben**: Alle aus Dokumenten stammenden Informationen werden mit Quellen zitiert
- **Fallback zu allgemeinem Wissen**: Kennzeichnung von Antworten aus dem Modellwissen vs. Dokumentenwissen
- **Token-Limitierung**: Intelligente Verwaltung von Kontextgröße für optimale Leistung
- **Keine Docker-Abhängigkeit**: Verwendet SQLite anstelle von Qdrant für die Vektordatenbank
- **Verbesserter System-Prompt**: Optimierte Anweisungen für präzisere und informativere Antworten

## 🤔 Warum Local Chat App mit SQLite?

### 💻 Einfachere Installation
- **Keine Docker-Abhängigkeit**: Keine Notwendigkeit, Docker zu installieren und zu konfigurieren
- **Alles in einem Paket**: SQLite ist in die Anwendung integriert, keine separaten Services

### 💰 Kosteneinsparung
- **Keine API-Kosten**: Azure OpenAI berechnet pro Token (Eingabe und Ausgabe)
- **Keine Überraschungen**: Keine unerwarteten Rechnungen durch intensive Nutzung

### 🛡️ Datenschutz und Kontrolle
- **Daten bleiben lokal**: Alle Dokumente und Anfragen bleiben in Ihrer Kontrolle
- **Keine Datenbereitstellung**: Ihre Unternehmensdaten werden nicht für AI-Training verwendet

### 🚀 Leistung und Anpassbarkeit
- **Modellauswahl**: Flexibilität beim Wechsel zwischen verschiedenen Modellen
- **Angepasste Systemanforderungen**: Auswahl von Modellen basierend auf Ihrer Hardware
- **Vollständige Anpassungskontrolle**: Ändern Sie den Code nach Ihren Bedürfnissen

### 🔌 Offlinefähigkeit
- **Keine Internetabhängigkeit**: Funktioniert vollständig ohne Internetverbindung
- **Keine Ausfallzeiten**: Nicht betroffen von Cloud-Dienst-Unterbrechungen

## 📌 Neue Features in dieser Version

### 📁 Online Dokumentenverwaltung
- **Web-Interface zum Hochladen**: Einfaches Hochladen von Dokumenten über die Weboberfläche
- **Kategorisierung und Tagging**: Organisieren Sie Dokumente mit Kategorien und Tags
- **Metadaten-Management**: Beschreibungen und Details zu Dokumenten hinzufügen
- **Indexierungsstatus**: Überwachen Sie den Status der Dokumentindexierung
- **Re-Indexierung**: Aktualisieren Sie Dokumente bei Bedarf

### 🧠 Verbesserter System-Prompt
- **Präzisere Anweisungen**: Optimierte Anweisungen für genauere Quellenangaben
- **Informative Antworten**: Fokus auf klare und strukturierte Informationen
- **Deutliche Kennzeichnung**: Klar erkennbare Unterscheidung zwischen Dokumentenwissen und allgemeinem Wissen

## 🛠️ Technologie-Stack

### Frontend
- HTML5, CSS3 mit Custom Properties und responsivem Design
- Vanilla JavaScript ohne externe Frameworks

### Backend
- Node.js mit Express
- Ollama für lokale LLM-Integration
- SQLite für Vektordatenbank und Dokumentenverwaltung
- Multer für Datei-Upload-Handling
- Transformers.js für Einbettungen

## 🚀 Erste Schritte

Eine detaillierte Installations- und Benutzungsanleitung finden Sie in der [INSTALLATION.md](INSTALLATION.md).

## 🧠 Wie funktioniert die SQLite Vektordatenbank?

Diese Version der Local Chat App verwendet SQLite anstelle von Qdrant für die Speicherung und Suche von Vektoreinbettungen. Dies bietet mehrere Vorteile:

1. **Einfachere Installation**: Keine Docker-Installation erforderlich
2. **Verringerte Systemanforderungen**: SQLite ist leichtgewichtiger als Qdrant
3. **Integrierte Datenbank**: Die Datenbank ist direkt in die Anwendung eingebettet

Die Vektorsuche wird durch eine Kombination aus effizienter Datenbankabfragen und Vektor-Ähnlichkeitsberechnungen in JavaScript implementiert. Obwohl diese Lösung möglicherweise nicht so performant wie Qdrant ist, bietet sie für die meisten Anwendungsfälle ausreichende Leistung und vereinfacht die Installation und Wartung erheblich.

## 📊 Leistungsvergleich

| Funktion | SQLite-Version | Qdrant-Version | Azure OpenAI |
|---|---|---|---|
| Installation | Einfach, keine Docker-Abhängigkeit | Erfordert Docker | Cloud-Dienst |
| Vektorsuche | Gut | Sehr gut | Sehr gut |
| Dokumentenverwaltung | Web-Interface | Nur lokal | Web-Interface |
| Kosten | Einmalige Hardware-Kosten | Einmalige Hardware-Kosten | Fortlaufende API-Kosten |
| Latenz | Abhängig von lokaler Hardware | Abhängig von lokaler Hardware | Abhängig von Internetverbindung |
| Datenschutz | 100% lokal | 100% lokal | Daten werden an Azure gesendet |
| Anpassbarkeit | Vollständiger Code-Zugriff | Vollständiger Code-Zugriff | Begrenzt auf API-Parameter |
| Offlinebetrieb | Vollständig offlinefähig | Vollständig offlinefähig | Erfordert Internetverbindung |

## 🔧 Konfiguration

Die Anwendung ist hochgradig konfigurierbar durch Umgebungsvariablen. Detaillierte Informationen finden Sie in der `.env.example`-Datei.

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.