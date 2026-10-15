# TikTok Entliken

Tampermonkey-Script von **flitzkanone**, um Likes bei TikTok-Videos und Foto-Posts zu entfernen.

## Installation

1. Tampermonkey im Browser installieren und aktivieren.
2. [Script installieren](https://github.com/flitzkanone/tiktok/raw/refs/heads/main/tiktok-entliken.user.js) öffnen und die Installation in Tampermonkey bestätigen.
3. Falls keine Installation angeboten wird: [vollständigen Code öffnen](./tiktok-entliken.user.js), kopieren und in Tampermonkey unter **Neues Script** den gesamten Editorinhalt damit ersetzen. Speichern.
4. TikTok neu laden. Nur eine Version dieses Scripts gleichzeitig aktivieren.

## Bedienung

1. Bei TikTok anmelden und einen Beitrag oder das eigene Profil öffnen.
2. Im eingeblendeten Bedienfeld die Pause einstellen: 3 bis 120 Sekunden, standardmäßig 5.
3. **Start** drücken. **Stopp** oder **Esc** beendet den Ablauf.

Das Script entfernt vorhandene Likes und wechselt danach zum nächsten Beitrag. Beiträge ohne Like werden übersprungen. Videos und Foto-Posts werden anhand ihrer sichtbaren Medien und Like-Schaltflächen erkannt.

Wird kein Beitrag oder kein nächster Beitrag erkannt, versucht das Script diese Reihenfolge:

**Für dich → eigenes Profil → Geliked → erster Beitrag**

Der Wechsel soll die Liste neu aufbauen. Es findet kein vollständiges Neuladen der Seite statt. Zeigt TikTok weiterhin einen bereits bearbeiteten Beitrag, stoppt das Script.

## Grenzen und Fehlermeldungen

- TikToks Oberfläche, Sprache und Layout können die Erkennung beeinflussen. Die Navigation berücksichtigt deutsche und englische Beschriftungen.
- Die Like-Erkennung nutzt zugängliche Zustandsangaben oder die Herzfarbe. Ist der Zustand unbekannt, wird gestoppt.
- „Keine gelikten Beiträge gefunden oder Liste nicht erkannt“ kann eine leere Liste oder eine nicht unterstützte Oberfläche bedeuten.
- Wird ein Like zurückgesetzt oder das Entliken nicht bestätigt, stoppt das Script.
- Der Tab muss geöffnet bleiben. Ein vollständiges Neuladen oder Schließen beendet die Ausführung; danach erneut **Start** drücken.
- Hintergrund-Tabs können vom Browser verlangsamt werden.
- Die JavaScript-Syntax wurde geprüft. Ein vollständiger Live-Test auf TikTok wurde nicht durchgeführt; insbesondere die Aktualisierung der Likes-Liste ist nicht bestätigt.

## Datei

[`tiktok-entliken.user.js`](./tiktok-entliken.user.js) enthält den vollständigen Script-Code einschließlich Tampermonkey-Metadaten.
