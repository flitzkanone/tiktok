# TikTok Beiträge aufräumen

Tampermonkey-Script von **flitzkanone** zum Entfernen von Likes, gespeicherten Beiträgen und eigenen Reposts. Unterstützt Videos und Foto-Posts, soweit TikToks Web-Oberfläche die benötigten Schaltflächen bereitstellt.

## Installation und Update

1. Tampermonkey im Browser installieren und aktivieren.
2. [Vollständiges Script installieren](https://github.com/flitzkanone/tiktok/raw/refs/heads/main/tiktok-entliken.user.js) öffnen und die Installation beziehungsweise Aktualisierung bestätigen.
3. Falls keine Installation angeboten wird: [vollständigen Code öffnen](./tiktok-entliken.user.js), kopieren und in Tampermonkey unter **Neues Script** den gesamten Editorinhalt ersetzen. Speichern.
4. TikTok neu laden. Nur eine Version dieses Scripts gleichzeitig aktivieren.

## Modi

| Auswahl | Änderung | Profil-Tab beim erneuten Öffnen |
| --- | --- | --- |
| Likes entfernen | Entfernt den eigenen Like | Geliked |
| Gespeicherte entfernen | Entfernt die Speicherung als Favorit | Gespeichert / Favoriten |
| Reposts zurücknehmen | Nimmt den eigenen Repost zurück | Reposts |

Jeder Durchlauf führt ausschließlich die ausgewählte Aktion aus. Der Repost-Modus entfernt keine Likes oder Speicherungen; der Speichern-Modus verändert keine Reposts oder Likes. Beiträge selbst werden nicht gelöscht. Das Entfernen einer Speicherung ist kein Löschen einer Sammlungsstruktur oder einer heruntergeladenen Datei.

## Bedienung

1. Bei TikTok anmelden.
2. Im eingeblendeten Bedienfeld die Aktion auswählen.
3. Pause zwischen 3 und 120 Sekunden einstellen; Standard ist 5 Sekunden.
4. **Start** drücken. **Stopp** oder **Esc** beendet den Ablauf.

Die Modi für Gespeicherte und Reposts öffnen zuerst die passende Liste im eigenen Profil. Der Likes-Modus kann auch beim aktuell geöffneten Beitrag beginnen.

Nach einer bestätigten Entfernung wartet das Script und wechselt zum nächsten Beitrag. Nicht aktive Likes, Speicherungen oder Reposts werden übersprungen. Fehlt der nächste Beitrag, versucht es:

**Für dich → eigenes Profil → ausgewählter Tab → erster Beitrag**

Dieser Wechsel baut die Profilansicht neu auf, ist aber kein vollständiges Neuladen. Bleibt die Liste veraltet und öffnet einen bereits bearbeiteten Beitrag, stoppt das Script.

## Reposts

Das Script sucht nach einer ausdrücklich beschrifteten Entfernung wie **Remove repost**, **Repost entfernen** oder **Repost zurücknehmen**. Falls nötig, öffnet es das Teilen-Menü. Ein als aktiv ausgewiesener Repost-Schalter kann ebenfalls zurückgeschaltet werden.

Ein bloßer **Repost**-Knopf ohne aktiven Zustand wird nicht angeklickt. Nach der Entfernung muss ein inaktiver Zustand erkennbar sein; andernfalls wird der Durchlauf gestoppt. Bietet TikToks Website die Repost-Aktion oder den Profil-Tab nicht an, kann das Script diese Funktion nicht ausführen.

## Grenzen und Fehlermeldungen

- Die Erkennung berücksichtigt deutsche und englische Beschriftungen sowie ausgewählte DOM-Merkmale. Andere Layouts können Anpassungen erfordern.
- Like- und Speicherzustände werden über Zustandsattribute, Beschriftungen oder bekannte Herz-/Lesezeichenfarben erkannt. Bei unbekanntem Zustand wird gestoppt.
- Eine verschwundene Schaltfläche allein gilt nicht als bestätigte Entfernung.
- Eine leere Liste und eine nicht unterstützte Listenansicht können dieselbe Fehlermeldung auslösen.
- Ein vollständiges Neuladen oder Schließen der Seite beendet die Ausführung. Danach erneut **Start** drücken.
- Hintergrund-Tabs können vom Browser verlangsamt werden.

## Prüfung

JavaScript-Syntax und zwölf Verhaltenstests mit einem nachgebauten DOM wurden geprüft. Die Tests decken getrennte Modi, Speicherzustände, Repost-Entfernung, das Vermeiden neuer Reposts, Stopp und die Navigation zu allen drei Profil-Tabs ab.

```sh
node --check tiktok-entliken.user.js
node --test tests/cleanup.test.cjs
```

Die Tests benötigen nur Node.js. Ein vollständiger Live-Test mit einem TikTok-Konto wurde nicht durchgeführt. Die konkrete Web-Oberfläche und die Aktualisierung der Profil-Listen sind deshalb noch nicht bestätigt.

## Datei

[`tiktok-entliken.user.js`](./tiktok-entliken.user.js) enthält den vollständigen Script-Code einschließlich Tampermonkey-Metadaten.
