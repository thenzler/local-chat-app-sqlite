# Dokumente für die Local Chat App

In diesem Verzeichnis können Sie Ihre Dokumente ablegen, die von der Chat-App durchsucht werden sollen.

## Unterstützte Dateiformate

- PDF-Dateien (*.pdf)
- Word-Dokumente (*.docx)
- Textdateien (*.txt)
- Markdown-Dateien (*.md)
- HTML-Dateien (*.html)

## Indexierung

Um die Dokumente nach dem Ablegen zu indexieren, führen Sie folgenden Befehl im Hauptverzeichnis aus:

```bash
npm run index-docs
```

Die Indexierung extrahiert den Text aus Ihren Dokumenten, teilt ihn in Abschnitte auf und speichert diese mit Vektoreinbettungen in der SQLite-Datenbank.

## Hinweise

- Stellen Sie sicher, dass Ihre PDF-Dokumente nicht passwortgeschützt sind
- Die Indexierung kann je nach Anzahl und Größe der Dokumente einige Zeit in Anspruch nehmen
- Größere Dokumente werden automatisch in kleinere Abschnitte aufgeteilt
- Nach der Indexierung sind Ihre Dokumente in der Chat-App durchsuchbar

## Beispiel

Legen Sie eine Datei wie "anleitung.pdf" in diesem Verzeichnis ab, führen Sie `npm run index-docs` aus und fragen Sie dann in der Chat-App z.B. "Was steht in der Anleitung über Installation?"