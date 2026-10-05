# D3-Dokumentenunteransicht

Die wiederverwendbare Implementierung liegt in den D3_004-Queryressourcen:

- [Query-JavaScript](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.js)
- [Query-CSS](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.css)
- [Native Kontext- und Metadatenabfrage](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.sql)
- [Artikel-Dashboard-Einstieg](erp-dashboard/D3_002/dashboard/D3_002__Navview_D3_Artikel__32D1D6EE-0FE7-4423-90D1-A41B721AD5C8.js)

## Einbindung in AP+

1. Query-SQL und Query-JavaScript gemeinsam aktualisieren; das Komponenten-CSS ebenfalls einbinden. Die SQL-Version mit `d3metadata` und `d3types` ist erforderlich.
2. Das Dashboard bindet D3_004 ein und uebergibt `tabelle` und `id` ueber die AP+-GUI. Es braucht lediglich den Initialisierungsaufruf aus dem Artikel-Dashboard, keine kopierte Komponentenlogik.
3. `event_table_loaded` reicht den Ereignisbezeichner und `tableContainer` an `D3DocumentView.mount` weiter. Der Einstieg puffert Aufrufe, wenn die Queryressourcen erst danach geladen werden. Er erkennt die bekannte Query-GUID, den Namen `D3_004` oder eine Kontextzeile mit `data-tabelle` und `data-id` im uebergebenen Container. Ein abweichender Laufzeitbezeichner blockiert diese Kontextzeile nicht. Unbekannte Queries ohne Kontextzeile werden ignoriert; es gibt keine globale Suche nach beliebigen Tabellen.
4. Die Kontextabfrage liefert eine Zeile mit `id`, `tabelle`, `d3metadata` und `d3types`. Im HTML werden `data-id`, `data-tabelle`, `data-d3metadata` und `data-d3types` gelesen. Nur gespeicherte Datensaetze mit positiver numerischer ID werden akzeptiert.
5. `apqv-ext-queryutils` muss eingebunden bleiben. Fuer Aktualisierungen wird `extQueryUtils.callWithQueryDataAsync('D3_004', { tabelle, id })` verwendet; dieser vorhandene Helfer ruft `Query.aspx` im Quickview-Kontext auf.

Die Originaltabelle bzw. ihr `.viewquery-table`-Wrapper wird gezielt ausgeblendet. Die neue Ansicht wird daneben in einem eigenen `.bootstrapcontainer.d3-shell` eingesetzt, nicht innerhalb der ausgeblendeten Tabelle. Andere Querytabellen bleiben unveraendert. Es gibt weiterhin nur einen Dashboard-Hook; zwei Definitionen von `event_table_loaded` wuerden sich gegenseitig ueberschreiben.

Das vorhandene gekapselte Bootstrap wird dadurch aktiviert; das Komponentenlayout kommt aus dem D3_004-CSS. Die eigenen Regeln liegen innerhalb `.bootstrapcontainer.d3-shell`, damit normale AP+- und Bootstrap-Regeln nicht das Layout bestimmen. Dies ist CSS-Kapselung, keine vollstaendige Isolation wie bei einem iframe. Query-JavaScript **und** `QVQUERY.CSSSTYLE` muessen gemeinsam uebernommen werden. Fehlt das Query-CSS oder passt dessen Version nicht zum JavaScript, erscheint ein Hinweis `D3_004: Layout-CSS fehlt`. Der Bootstrapcontainer allein ersetzt dieses Stylesheet nicht.

Die allgemeine Dashboardvariante ohne `_Artikel`, gemeinsame Bibliotheken und externe Referenzprojekte wurden nicht geaendert. Dashboardkopien und Zuordnung zu Artikel/Bestellung erfolgen weiterhin in der AP+-GUI.

### Hoehe des Detailbereichs

Bei einer Same-Origin-Einbettung wird das eigene Quickview-iframe bis zum verfuegbaren unteren Rand des Elternfensters erweitert (16 Pixel Abstand). Hoehenbegrenzende Vorfahren auf dem Weg vom iframe zum Seitenrumpf werden bei Bedarf angepasst. Unbeteiligte Container bleiben unveraendert. Fenster-/Groessenaenderungen und Scrollen berechnen die Hoehe neu. Mehrere Komponenten im selben iframe teilen diese Anpassung; nach Entfernen der letzten Ansicht oder beim Verlassen der Seite werden selbst gesetzte Styles wiederhergestellt, sofern AP+ sie zwischenzeitlich nicht geaendert hat.

Bei Cross-Origin-Einbettung ist der Zugriff auf den Elternbereich nicht erlaubt; die Ansicht verwendet dann nur den verfuegbaren Platz innerhalb ihres eigenen Fensters. Die hier vorliegende Anfrage-Vorlage enthielt keinen entsprechenden Elternfensteraufruf; diese Anpassung wurde daher separat implementiert und in einem echten Browser mit einem simulierten AP+-Detailbereich getestet.

## Backendvertrag

`app.soap.call('flexmobility/utils').getFileListAsXml(tabelle, id)` liefert JSON, auch wenn der Methodenname XML nennt. Unterstuetzt sind Arrays, JSON-Strings sowie `rows`/`data`-Wrapper und Key/Value-Eintraege.

Erwartete Dokumentfelder: `Name`, `Dokumenttyp`, `Datum`, `Dateityp` und `_pathWithoutServer` oder `_path`. Ein optionales `D3DocumentId` hat Vorrang. Fehlt es, wird gemaess bestaetigtem Nutzervertrag die ID zwischen `/o2/` und `/v/` aus dem zuvor validierten D3-Pfad gelesen, beispielsweise `T000178304` aus `/dms/r/99358d70-1ed1-5871-bba8-552a397a5a35/o2/T000178304/v/1_1/b/main/c`. Sie entspricht SQL-`doku_id`. Die zusaetzliche Backendausgabe ist damit nicht mehr erforderlich. `BELEGID`, Dateiname, fremde Hosts und URL-Queryparameter sind keine Ersatzschluessel.

Metadaten und erlaubte Uploadarten werden nativ in der D3_004-SQL-Abfrage gelesen. Es gibt dafuer keine `dbFetchJSON`-Aufrufe mehr. Damit wird dieselbe Datenbankverbindung verwendet wie bei normalen Quickviewabfragen, in denen die D3-Views laut Nutzer verfuegbar sind.

Die Abfrage liefert auch ohne Dokumente eine Kontextzeile. Zwei korrelierte `FOR JSON PATH, INCLUDE_NULL_VALUES`-Unterabfragen liefern `d3metadata` und `d3types`, jeweils als JSON-Array. Das vermeidet einen Verlust von Metadaten durch die Paginierung vieler Querytabellenzeilen und erhaelt fachlich leere Felder.

Beim ersten Mount werden die JSON-Felder aus den Attributen der anschliessend ausgeblendeten Tabellenzeile gelesen. Falls AP+ die JSON-Spalten nicht als Attribute rendert, wird D3_004 ueber den Query-Helfer geladen. Aktualisieren, erneute Hooks und der Abschluss eines Uploadlaufs laden die native Abfrage erneut; der anfaengliche versteckte Tabellenstand wird dabei nicht als frische Daten wiederverwendet. Rueckgaben mit falscher Tabelle/ID oder fehlenden JSON-Spalten werden abgelehnt.

Metadatenfelder:

| Anzeige | SQL-Quelle |
| --- | --- |
| Beschreibung | `pd.text` |
| Sprache | `fs.dok_dat_feld_29` |
| Revision | `fs.dok_dat_feld_30` |
| Dateigroesse | `pd.size_in_byte`, Einheit Byte |

Die native Abfrage verknuepft `pd.doku_id = fs.doku_id` und begrenzt auf `fs.dok_dat_feld_11 = tabelle` sowie `fs.dok_dat_feld_80 = id`. Diese Datensatzzuordnung muss in den verwendeten AP+-Tabellen konfiguriert sein. Im Script werden nur Metadaten zu den vom DMS-Dienst gelieferten Dokument-IDs und zum zugeordneten Repository angezeigt. Mehrere physische Zeilen fuer dieselbe Dokument-ID werden nicht willkuerlich auf eine reduziert, sondern als mehrdeutige Zuordnung angezeigt. Die Query liefert alle Metadaten zum zugeordneten Datensatz; erforderliche Zugriffsrechte muessen deshalb bereits serverseitig fuer die Quickview gelten. Der Anzeigefilter im Browser ersetzt keine Berechtigungspruefung.

Der Dienst bestimmt Dokumentstand und Datum. `FOL` wird ausgeschlossen. Die Dokumentart stammt aus SOAP, erlaubte Uploadarten aus `ASDEFINITION`/`DMSDOCUMENTTYPEREF`.

Die Dokumentartenabfrage vergleicht den Tabellennamen getrimmt und in Grossschreibung. Die Verarbeitung akzeptiert unterschiedliche Gross-/Kleinschreibung des Antwortfelds `DMSDOCUMENTTYPE`, entfernt Leerwerte/Duplikate und sortiert die Auswahl. Liefert die Abfrage erfolgreich keine Arten, wird ausschliesslich `Schriftverkehr` ohne leeren Platzhalter angeboten und vorbelegt; der Upload ist moeglich. Technische Abfrage-/Formatfehler aktivieren diesen Ersatz nicht und sperren weiterhin den Upload. Treffen Arten erst nach dem Ablegen von Dateien ein, wird `Schriftverkehr` bei unveraenderter Auswahl nachtraeglich vorbelegt, sofern erlaubt. Im Leerfall werden wartende Eintraege auf die einzige Option `Schriftverkehr` gesetzt.

Fehlt die ID sowohl als Feld als auch im passenden Versionspfad, erscheinen ebenso wie bei nicht passenden SQL-IDs oder mehrdeutigen physischen Dateien Integrationsfehler. Vorhandene Links bleiben nutzbar; fehlende Metadaten werden nicht erfunden. Ein fachlich leeres Feld erscheint dagegen als `-`.

## Gemeinsame Konfiguration

Standard-D3-Server: `https://systec-vs72.systec-lab.local/`. Die Anwendung nutzt den bestehenden AP+-Dateiproxy und den bestehenden Upload-Endpunkt. Sie benoetigt keinen eigenen Webserver und keine Browser-API-Schluessel.

Bei abweichender Umgebung kann vor dem ersten Mount gemeinsam fuer die Query konfiguriert werden:

```javascript
window.D3DocumentViewConfig = {
  d3BaseUrl: 'https://systec-vs72.systec-lab.local/',
  sqlRepositoryId: ''
};
```

Bei genau einem Repository im Ergebnis wird dieses automatisch verwendet. Bei mehreren Repositories muss `sqlRepositoryId` auf das zur SQL-Anbindung gehoerende Repository gesetzt werden. Andere Archive bekommen keine SQL-Metadaten zugeordnet. Fremde Hosts, eingebettete URL-Zugangsdaten und nicht unterstuetzte Archivpfade werden nicht an den Proxy weitergereicht. Unterschiedliche Test-/Produktivarchive duerfen nicht durch Austausch von ID-Praefixen kombiniert werden.

Konfiguration wird beim Anlegen einer Instanz eingelesen; nach Aenderungen die Unteransicht neu laden. Der Zustand bleibt pro Container getrennt. SQL-Zuordnung und Host muessen auch bei anderen Dashboards zur aktiven Umgebung passen.

## Upload und Download

- Drag-and-drop oder Dateiauswahl ueber das Ablagefeld in der Titelzeile zwischen Ueberschrift und Suche; mehrere Dateien und editierbare Metadaten pro Datei.
- Der untere Uploadbereich wird nur bei mindestens einer Datei in der Warteschlange angezeigt. Nach Entfernen oder erfolgreichem Hochladen der letzten Datei verschwindet er wieder. Fehlerhafte oder ungeklaerte Uploads bleiben sichtbar; das Ablagefeld oben bleibt immer verfuegbar.
- Pflichtfelder: Dateiname und zulaessige Dokumentart. Standard `Schriftverkehr`, falls fuer die Tabelle erlaubt. Beschreibung aus Dateiname ohne Endung; Beschreibung, Sprache und Revision duerfen leer bleiben.
- Sprachen: leer, DE, EN, FR, ES. Keine eigene Dateityp-/Groessenbeschraenkung; Serverregeln gelten.
- Sequenzielle POSTs an `../custom/Anp_DMSUploadTarget.aspx` mit `filename`, `Description`, `DocumentType`, `sprache`, `Revision`, `revision`, `FileChooser`, `NavTable`, `Id`.
- Bestaetigte Erfolge verschwinden aus der Warteschlange; Fehler bleiben erhalten. Ein Datensatzwechsel verwirft wartende Uploads, aendert aber niemals das Ziel eines bereits laufenden Requests.

### Uploadbestaetigung

Ohne bekannten Backendantwortvertrag wird nicht allein HTTP 200 als Archivierungserfolg gewertet. Akzeptiert werden `OK`, `success`, `true` oder JSON mit `success: true` bzw. `status`/`result` gleich `OK`/`success`. JSON-Fehler werden angezeigt. Leere/unbekannte Antworten, Weiterleitungen oder unterbrochene Uebertragungen gelten als unklar; Wiederholung erfordert eine ausdrueckliche Freigabe nach Pruefung im Archiv, um Duplikate zu vermeiden.

Wenn der vorhandene Endpunkt ein anderes **nachgewiesenes** Erfolgsformat verwendet, kann `D3DocumentViewConfig.confirmUpload(body, response)` es pruefen und nur bei sicherem Erfolg `true` zurueckgeben. Keine pauschale Funktion `return response.ok` einsetzen. Diese Pruefung ist vor Produktivabnahme am echten Endpunkt erforderlich.

### Vorschau und Drag-out

PDF wird per Blob-URL im iframe dargestellt, browserfaehige Rasterbilder im Bildbereich.

`TXT`, `CSV`, `JSON` und `XML` werden ueber den authentifizierten AP+-Proxy geladen und ausschliesslich als Text in einem `pre`-Element ausgegeben. Markup wird nicht als HTML interpretiert. JSON wird mit zwei Leerzeichen formatiert, XML vor der Anzeige mit `DOMParser` validiert, CSV bleibt als Originaltext erhalten. UTF-8 (mit/ohne BOM), UTF-16 LE/BE mit BOM sowie ein Windows-1252-Fallback werden unterstuetzt. Binaere Inhalte mit Nullzeichen werden abgelehnt. Die Textvorschau ist auf 5 MiB begrenzt; groessere Dateien bleiben herunterladbar.

Fuer andere Formate wie `DOCX`, `XLSX`, `MSG` oder `EML` wird die offizielle D3-UI-Vorschau `GET /dms/r/{repositoryId}/o2/{dmsObjectId}/preview` vom bereits validierten D3-Host in einem iframe geoeffnet. Die URL wird nur aus Repository und Dokument-ID des validierten Downloadpfads aufgebaut. Ein Link zum Oeffnen in einem neuen Fenster bleibt sichtbar. Die D3-Preview kann intern die von D3 erzeugte PDF-/Rendition-Darstellung verwenden; der Client interpretiert deren HTML nicht selbst.

Ob die D3-UI im iframe dargestellt werden darf, haengt von Anmeldung, Cookies sowie `Content-Security-Policy`/`X-Frame-Options` der installierten D3-Version ab und muss live geprueft werden. Bei blockierter Einbettung kann der Link im neuen Fenster funktionieren. Es werden keine Header umgangen und kein Office- oder Mailparser in den Browser eingebaut.

Alte Vorschauanforderungen werden abgebrochen, Blob-URLs beim Wechsel freigegeben. Andere Dateitypen koennen weiterhin heruntergeladen werden.

Downloads laufen ueber den authentifizierten AP+-Proxy. Beim Herausziehen wird Chromiums nichtstandardisiertes `DownloadURL` angeboten. Ob ein Ziel daraus eine echte Datei uebernimmt, muss mit Explorer sowie klassischem/neuem Outlook getestet werden. Ein synthetischer Drag-Test beweist keine native Dateiuebergabe. Der normale Downloadknopf ist der vereinbarte Ersatz.

## Tests

Die [Regressionstests](tests/d3-view.test.cjs) laufen ohne AP+ gegen simulierte Schnittstellen. Testpakete koennen ausserhalb des Projekts installiert werden:

```powershell
npm install --prefix "$env:TEMP\d3-navview-validation" --no-save --no-audit --no-fund jsdom playwright
$env:NODE_PATH = "$env:TEMP\d3-navview-validation\node_modules"
node --test tests/d3-view.test.cjs
```

Browserpruefung mit vorhandenem Edge, einschliesslich Screenshots in `%TEMP%`:

```powershell
node -e "process.env.D3_BROWSER_TEST='1'; require('./tests/d3-view.test.cjs')"
```

Fuer vorhandenes Chrome zusaetzlich `process.env.D3_BROWSER_CHANNEL='chrome'` im selben Node-Aufruf setzen. Es werden keine echten Dateien ins Archiv geschrieben.

Die Tests pruefen Parser, genaue ID-Zuordnung, fehlende/mehrdeutige Metadaten, sichere URLs, native Query-Payloads und Datensatzbindung, Lesen aus der versteckten Zeile, frische Daten nach Refresh/Upload, optionale Uploadfelder, wiederholtes Laden, Query-Ladereihenfolge, Upload-Teilfehler, unklare Antworten, Datensatzwechsel, verspaetete Antworten und Object-URL-Freigabe. Browserpruefungen decken Desktop/Mobil, Containerhoehe, lange Namen, eine echte Bildvorschau mit Pixelpruefung, Drag-Daten und zwei getrennte Instanzen ab.

Noch live in AP+ abzunehmen: Dokumentarten-Zuordnung und Feld-80-Zuordnung fuer Artikel/Bestellung, SQL-Metadaten zur ausgelieferten Version, Proxy-Authentifizierung/PDF-Anzeige, Uploadantwort samt leeren optionalen Feldern und Dateiuebergabe an Windows/Outlook. Lokale Tests ersetzen diese Backendpruefungen nicht.