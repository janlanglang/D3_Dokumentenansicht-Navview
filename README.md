# D3-Dokumentenunteransicht

Die wiederverwendbare Implementierung liegt in den D3_004-Queryressourcen:

- [Query-JavaScript](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.js)
- [Query-CSS](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.css)
- [Native Kontext- und Metadatenabfrage](erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.sql)
- [Artikel-Dashboard-Einstieg](erp-dashboard/D3_002/dashboard/D3_002__Navview_D3_Artikel__32D1D6EE-0FE7-4423-90D1-A41B721AD5C8.js)

## Einbindung in AP+

1. Query-SQL und Query-JavaScript gemeinsam aktualisieren; das Komponenten-CSS ebenfalls einbinden. Die SQL-Version mit `d3metadata`, `d3types` und `d3versionhistory` ist erforderlich.
2. Das Dashboard bindet D3_004 ein und uebergibt `tabelle` und `id` ueber die AP+-GUI. Es braucht lediglich den Initialisierungsaufruf aus dem Artikel-Dashboard, keine kopierte Komponentenlogik.
3. `event_table_loaded` reicht den Ereignisbezeichner und `tableContainer` an `D3DocumentView.mount` weiter. Der Einstieg puffert Aufrufe, wenn die Queryressourcen erst danach geladen werden. Er erkennt die bekannte Query-GUID, den Namen `D3_004` oder eine Kontextzeile mit `data-tabelle` und `data-id` im uebergebenen Container. Ein abweichender Laufzeitbezeichner blockiert diese Kontextzeile nicht. Unbekannte Queries ohne Kontextzeile werden ignoriert; es gibt keine globale Suche nach beliebigen Tabellen.
4. Die Kontextabfrage liefert eine Zeile mit `id`, `tabelle`, `d3metadata`, `d3types` und `d3versionhistory`. Im HTML werden `data-id`, `data-tabelle`, `data-d3metadata`, `data-d3types` und `data-d3versionhistory` gelesen. Nur gespeicherte Datensaetze mit positiver numerischer ID werden akzeptiert.
5. `apqv-ext-queryutils` muss eingebunden bleiben. Fuer Aktualisierungen wird `extQueryUtils.callWithQueryDataAsync('D3_004', { tabelle, id })` verwendet; dieser vorhandene Helfer ruft `Query.aspx` im Quickview-Kontext auf.

Die Originaltabelle bzw. ihr `.viewquery-table`-Wrapper wird gezielt ausgeblendet. Die neue Ansicht wird daneben in einem eigenen `.bootstrapcontainer.d3-shell` eingesetzt, nicht innerhalb der ausgeblendeten Tabelle. Andere Querytabellen bleiben unveraendert. Es gibt weiterhin nur einen Dashboard-Hook; zwei Definitionen von `event_table_loaded` wuerden sich gegenseitig ueberschreiben.

Das vorhandene gekapselte Bootstrap wird dadurch aktiviert; das Komponentenlayout kommt aus dem D3_004-CSS. Die eigenen Regeln liegen innerhalb `.bootstrapcontainer.d3-shell`, damit normale AP+- und Bootstrap-Regeln nicht das Layout bestimmen. Dies ist CSS-Kapselung, keine vollstaendige Isolation wie bei einem iframe. Query-JavaScript **und** `QVQUERY.CSSSTYLE` muessen gemeinsam uebernommen werden. Fehlt das Query-CSS oder passt dessen Version nicht zum JavaScript, erscheint ein Hinweis `D3_004: Layout-CSS fehlt`. Der Bootstrapcontainer allein ersetzt dieses Stylesheet nicht.

Die allgemeine Dashboardvariante ohne `_Artikel`, gemeinsame Bibliotheken und externe Referenzprojekte wurden nicht geaendert. Dashboardkopien und Zuordnung zu Artikel/Bestellung erfolgen weiterhin in der AP+-GUI.

### Hoehe des Detailbereichs

Bei einer Same-Origin-Einbettung wird das eigene Quickview-iframe bis 97 Prozent der Elternfensterhoehe erweitert. Die Containerkette zwischen iframe und dem naechsten scrollenden Vorfahren wird einschliesslich `min-height` angepasst, damit ein inneres Element nicht weiterhin ueber die sichtbare Flaeche hinausragt. Unbeteiligte Container bleiben unveraendert. Fenster-/Groessenaenderungen und Scrollen berechnen die Hoehe neu. Mehrere Komponenten im selben iframe teilen diese Anpassung; nach Entfernen der letzten Ansicht oder beim Verlassen der Seite werden selbst gesetzte Styles wiederhergestellt, sofern AP+ sie zwischenzeitlich nicht geaendert hat.

Bei Cross-Origin-Einbettung ist der Zugriff auf den Elternbereich nicht erlaubt; die Ansicht verwendet dann nur den verfuegbaren Platz innerhalb ihres eigenen Fensters. Die hier vorliegende Anfrage-Vorlage enthielt keinen entsprechenden Elternfensteraufruf; diese Anpassung wurde daher separat implementiert und in einem echten Browser mit einem simulierten AP+-Detailbereich getestet.

## Backendvertrag

`app.soap.call('flexmobility/utils').getFileListAsXml(tabelle, id)` liefert JSON, auch wenn der Methodenname XML nennt. Unterstuetzt sind Arrays, JSON-Strings sowie `rows`/`data`-Wrapper und Key/Value-Eintraege.

Erwartete Dokumentfelder: `Name`, `Dokumenttyp`, `Datum`, `Dateityp` und `_pathWithoutServer` oder `_path`. Ein optionales `D3DocumentId` hat Vorrang. Fehlt es, wird gemaess bestaetigtem Nutzervertrag die ID zwischen `/o2/` und `/v/` aus dem zuvor validierten D3-Pfad gelesen, beispielsweise `T000178304` aus `/dms/r/99358d70-1ed1-5871-bba8-552a397a5a35/o2/T000178304/v/1_1/b/main/c`. Sie entspricht SQL-`doku_id`. Die zusaetzliche Backendausgabe ist damit nicht mehr erforderlich. `BELEGID`, Dateiname, fremde Hosts und URL-Queryparameter sind keine Ersatzschluessel.

Metadaten und erlaubte Uploadarten werden nativ in der D3_004-SQL-Abfrage gelesen. Es gibt dafuer keine `dbFetchJSON`-Aufrufe mehr. Damit wird dieselbe Datenbankverbindung verwendet wie bei normalen Quickviewabfragen, in denen die D3-Views laut Nutzer verfuegbar sind.

Wenn die D3-Datenbank als Verbindungsserver eingerichtet ist, koennen AP+-Tabellennamen gut ueber SQL-Synonyme auf die D3-Tabellen gemappt werden. Beispiel:

```sql
USE [APplusDeploy]
GO

/****** Objekt:  Synonym [dbo].[arten_dokumente_d3]    Skriptdatum: 03.11.2026 08:43:04 ******/
CREATE SYNONYM [dbo].[arten_dokumente_d3] FOR [SYSTEC-VS73.SYSTEC-LAB.LOCAL].[D3T].[dbo].[arten_dokumente]
GO
```

Danach muss in AP-Plus in der Tabelle `Tabellen` nur noch das Synonym eingetragen werden.

Die Abfrage liefert auch ohne Dokumente eine Kontextzeile. Drei korrelierte `FOR JSON PATH, INCLUDE_NULL_VALUES`-Unterabfragen liefern `d3metadata`, `d3types` und `d3versionhistory`, jeweils als JSON-Array. Das vermeidet einen Verlust von Metadaten durch die Paginierung vieler Querytabellenzeilen und erhaelt fachlich leere Felder. Beim aktuellen Versions-Badge wird `change_reason` angezeigt, sofern gesetzt; andernfalls bleibt es bei `version_id`. Das Hover-Popup zeigt Version, Datum und Benutzer als `(Vx) | DD.MM.YYYY, HH:MM | user`; bei einem nicht-leeren, nicht-standardisierten `change_reason` steht dieser zusaetzlich als `Rev: ...` nach der Versionsnummer.

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
- Sequenzielle POSTs an `../custom/Anp_DMSUploadTarget.aspx` mit `filename`, `Description`, `DocumentType`, `sprache`, `Revision`, `revision`, `AlterationText`, `FileChooser`, `NavTable`, `Id`.
- Bestaetigte Erfolge verschwinden aus der Warteschlange; Fehler bleiben erhalten. Ein Datensatzwechsel verwirft wartende Uploads, aendert aber niemals das Ziel eines bereits laufenden Requests.

Backend-Anpassung in `D3RestConnection.cs`, Funktion `UploadDocumentVersion`: Beim D3-Abschlussrequest wird der Versionshinweis aus `document.Properties["alterationtext"]` uebergeben. Fehlt der Wert oder besteht er nur aus Leerzeichen, wird `New version` verwendet.

```csharp
updateDocumentRequest.AddJsonBody(new FinishUploadRequest {
  //CUSTOM BEGIN: JLA: 20261030: Versionshinweis an D3 uebergeben
  AlterationText = document.Properties.ContainsKey("alterationtext")
    && !string.IsNullOrWhiteSpace(document.Properties["alterationtext"])
      ? document.Properties["alterationtext"]
      : "New version",
  //CUSTOM END: JLA: 20261030: Versionshinweis an D3 uebergeben
  SourceId = SourceId,
  SourceCategory = Mapper.MapDocumentType(document),
  Filename = System.IO.Path.GetFileName(docFileName),
  ContentLocationUri = uploadLocation,
  SourceProperties = new SourceProperties { Properties = properties }
});
```

### Uploadbestaetigung

HTTP-Fehler werden als Uploadfehler behandelt. Bei Weiterleitungen wird der Status als unklar markiert; vor einer Wiederholung soll im Archiv geprueft werden, ob die Datei bereits abgelegt wurde.

### Vorschau und Drag-out

PDF wird per Blob-URL im iframe dargestellt, browserfaehige Rasterbilder im Bildbereich.

`TXT`, `CSV`, `JSON` und `XML` werden ueber den authentifizierten AP+-Proxy geladen und ausschliesslich als Text in einem `pre`-Element ausgegeben. Markup wird nicht als HTML interpretiert. JSON wird mit zwei Leerzeichen formatiert, XML vor der Anzeige mit `DOMParser` validiert, CSV bleibt als Originaltext erhalten. UTF-8 (mit/ohne BOM), UTF-16 LE/BE mit BOM sowie ein Windows-1252-Fallback werden unterstuetzt. Binaere Inhalte mit Nullzeichen werden abgelehnt. Die Textvorschau ist auf 5 MiB begrenzt; groessere Dateien bleiben herunterladbar.

Fuer andere Formate wie `DOCX`, `XLSX`, `MSG`, `EML` oder `EMAIL` wird aus dem validierten Downloadpfad direkt `GET /dms/r/{repositoryId}/o2/{dmsObjectId}/v/current/b/p1/c` ueber den AP+-Proxy als PDF versucht. Wenn dieser Abruf keine PDF liefert, zeigt die Komponente nur noch den Link auf die offizielle D3-UI-Vorschau `GET /dms/r/{repositoryId}/o2/{dmsObjectId}/preview` im neuen Fenster. Die URL wird nur aus Repository und Dokument-ID des validierten Downloadpfads aufgebaut.

Die Livepruefung am 05.10.2026 ergab `Content-Security-Policy: frame-ancestors 'self'` und `X-Frame-Options: SAMEORIGIN`. AP+ (`applustest`) darf D3 (`systec-vs72`) deshalb nicht in einem iframe einbetten. Es werden keine Header umgangen und kein Office- oder Mailparser in den Browser eingebaut.

Alte Vorschauanforderungen werden abgebrochen, Blob-URLs beim Wechsel freigegeben. Andere Dateitypen koennen weiterhin heruntergeladen werden.

Downloads laufen ueber den authentifizierten AP+-Proxy. Beim Herausziehen wird Chromiums nichtstandardisiertes `DownloadURL` angeboten. Ob ein Ziel daraus eine echte Datei uebernimmt, muss mit Explorer sowie klassischem/neuem Outlook getestet werden. Ein synthetischer Drag-Test beweist keine native Dateiuebergabe. Der normale Downloadknopf ist der vereinbarte Ersatz.

## Document Proxy

Der Document Proxy ist ein serverseitiger Durchreicher zwischen AP+ und D3. Er ruft die Datei nicht direkt im Browser vom D3-Host ab, sondern ueber einen kontrollierten AP+-Endpunkt.

Kurz gesagt macht der Proxy drei Dinge:
- Er prueft die Ziel-URL (nur erlaubter D3-Host).
- Er fuehrt den authentifizierten Request an D3 aus und holt den Inhalt.
- Er liefert Content-Type und Dateiname an den Browser weiter, damit Vorschau/Download wie eine normale Datei funktionieren.

Damit bleiben Authentifizierung und Sicherheitspruefung zentral im Backend; der Browser bekommt nur den freigegebenen Antwortstream.

```aspx
<%@ Page language="c#" AutoEventWireup="false" %>
<%@ OutputCache Location="None" %>
<%@ Register TagPrefix="p2plus" Namespace="p2plus.WebControls" Assembly="P2plusWeb" %>
<%@ Import Namespace="System.Data" %>
<%@ Import Namespace="System.Net" %>
<%@ Import Namespace="p2plus.DMS" %>
<%@ Import Namespace="System.IO" %>
<%@ Import Namespace="System.Data.SqlClient" %>

<script runat="server" type="text/C#">
  // Dokument-ID direkt über die SQL-Synonyme ermitteln. Mehrere physische
  // Versionen desselben Dokuments zählen nicht als unterschiedliche Treffer.
  private string FindRevisionDocumentId(string tableName, string recordId, string uploadFilename) {
    string basename = Path.GetFileNameWithoutExtension(uploadFilename);
    string extension = Path.GetExtension(uploadFilename).TrimStart('.');
    const string sql = @"
      SELECT DISTINCT TOP (2) fs.doku_id
        FROM dbo.firmen_spezifisch_d3 AS fs
       WHERE fs.dok_dat_feld_11 = @tableName
         AND fs.dok_dat_feld_80 = @recordId
         AND EXISTS (
           SELECT 1 FROM dbo.phys_datei_d3 AS pd
            WHERE pd.doku_id = fs.doku_id
              AND (pd.dateiname = @basename OR pd.dateiname = @filename)
              AND pd.datei_erw = @extension
         );";

    using (var connection = new SqlConnection(p2plus.p2core.Table.connectStringTable(tableName))) {
      using (var command = new SqlCommand(sql, connection)) {
        command.Parameters.Add("@tableName", SqlDbType.NVarChar, -1).Value = tableName;
        command.Parameters.Add("@recordId", SqlDbType.NVarChar, -1).Value = recordId;
        command.Parameters.Add("@basename", SqlDbType.NVarChar, -1).Value = basename;
        command.Parameters.Add("@filename", SqlDbType.NVarChar, -1).Value = Path.GetFileName(uploadFilename);
        command.Parameters.Add("@extension", SqlDbType.NVarChar, -1).Value = extension;
        connection.Open();
        using (var reader = command.ExecuteReader()) {
          if (!reader.Read()) return null;
          string documentId = Convert.ToString(reader.GetValue(0));
          if (string.IsNullOrWhiteSpace(documentId) || reader.Read()) {
            throw new Exception("Die SQL-Suche nach dem d.3-Dokument ist nicht eindeutig; kein SQL-Update ausgeführt.");
          }
          return documentId;
        }
      }
    }
  }

  private void SetInitialRevisionReason(string tableName, string documentId, string reason) {
    // Direkter Zugriff auf die d.3-Datenbank über das vorhandene SQL-Synonym.
    // Kein Überschreiben vorhandener Texte oder anderer Dokumentversionen.
    const string sql = @"
      DECLARE @HasNewerVersion bit = 0;
      DECLARE @UpdatedRows int = 0;

      SELECT TOP (1) @HasNewerVersion = 1
        FROM dbo.doc_versions_d3 AS newer
       WHERE newer.doc_id = @documentId
         AND newer.version_id > 0;

      IF @HasNewerVersion = 0
      BEGIN
          UPDATE dbo.doc_versions_d3
             SET change_reason = @reason
           WHERE doc_id = @documentId
             AND version_id = 0
             AND change_reason IS NULL;

          SET @UpdatedRows = @@ROWCOUNT;
      END;
      SELECT @UpdatedRows;";

    using (var connection = new SqlConnection(p2plus.p2core.Table.connectStringTable(tableName))) {
      connection.Open();
      // Keine explizite Transaktion: Das Synonym verweist auf einen Linked Server.
      // BeginTransaction würde hierfür eine verteilte Transaktion (MSDTC) benötigen.
      using (var command = new SqlCommand(sql, connection)) {
        command.Parameters.Add("@documentId", SqlDbType.VarChar, -1).Value = documentId;
        command.Parameters.Add("@reason", SqlDbType.NVarChar, -1).Value = reason;
        command.ExecuteScalar();
      }
    }
  }
</script>

<%
  /// ---------------------------------------------------------------------------------------------------------------------------
  /// 01.04.2020 CAL #290502 V7: new targetpage for http-post to upload a single file (inspired from older DMSFileUpload.aspx)
  /// ---------------------------------------------------------------------------------------------------------------------------
  ///
  /*
   Info: Falls Fehlermeldung erscheinen, die darauf hindeuten, dass die Datenmenge des Uploads zu groß ist
   (z.B. HTTP-Fehler "413 Request Entity Too Large")
   dann müssen in der Einstellung des Webs zwei Einstellungen geprüft bzw. geändert werden:
   in /web.config:
   1.) <httpRuntime executionTimeout="30" maxRequestLength="10240" requestValidationMode="2.0" />
     der Wert von maxRequestLength limitiert die Uploadgröße, der Wert in KB
   2.)  <requestFiltering>
          <requestLimits maxAllowedContentLength="10485760" maxUrl="4096" maxQueryString="2048" />
        </requestFiltering>
     der Wert von maxAllowedContentLength limitiert ebenfalls, dieser Wert ist in Byte
   */

  string environment = Request.Form["Environment"];     //can be empty
  string NavTable = Request.Form["NavTable"];
  string Id = Request.Form["id"];

  string filename = Request.Form["filename"];           //filename with extension, but without complete path
  string documentType = Request.Form["DocumentType"];   //documenttype from upload-dialog
  string description = Request.Form["Description"];     //description from upload-dialog
  string exceptionText = null;
  string stackTrace = null;
  bool uploadCompleted = false;
  string uploadWarning = null;
  string serverTiming = "";

  if (!string.IsNullOrEmpty(NavTable))
    NavTable = NavTable.ToLower();

  if (Request.Files.Count != 1)
    exceptionText = WebUtils.translate("Es darf nur eine Datei hochgeladen werden");
  else if (Request.Files[0].ContentLength < 1)
    exceptionText = WebUtils.translate("Die hochgeladene Datei existiert nicht oder hat keinen Inhalt.");
  else if (string.IsNullOrEmpty(filename))
    exceptionText = WebUtils.translate("Der Name der hochgeladenen Datei ist unbestimmt.");
  else if (string.IsNullOrEmpty(NavTable))
    exceptionText = WebUtils.translate("Keine Tabelle definiert.");
  else if (string.IsNullOrEmpty(Id))
    exceptionText = WebUtils.translate("Kein Datensatz definiert.");

  if (exceptionText == null) {
    if (!string.IsNullOrEmpty(environment)) {
      HttpContext.Current.Items["P2plusEnv"] = environment;
    }

    try  {
      byte[] datas = new byte[Request.Files[0].ContentLength];
      Request.Files[0].InputStream.Read(datas, 0, Request.Files[0].ContentLength);

      string docNrCol = DocumentTypes.getJobTableCol(NavTable);
      string docNr = WebUtils.getScalarValue (NavTable , "SELECT " + docNrCol + " FROM " + NavTable + " WHERE id=" + Id );

      Document doc = StoreBase.CreateDocumentUploadFromByteArray(
        datas,
        NavTable,
        filename,
        description,
        docNr,
        documentType,
        Id);

      // Zusätzliche Form-Parameter in doc.Properties übernehmen (lowercase keys)
      string[] skipKeys = new string[] { "filename", "documenttype", "description", "navtable", "id", "environment" };
      foreach (string key in Request.Form.AllKeys) {
        if (string.IsNullOrEmpty(key)) continue;
        string keyLower = key.ToLower();
        if (Array.Exists(skipKeys, k => k == keyLower)) continue;

        string[] values = Request.Form.GetValues(key);
        if (values == null || values.Length == 0) continue;

        // Mehrfachwerte zusammenfassen (z.B. mit '|' — wählen Sie Trennzeichen nach Bedarf)
        string val = string.Join("|", values);

        if (!string.IsNullOrEmpty(val)) {
          try {
            // StringDictionary: durch Indexer setzen (überschreibt ggf. vorhandene Werte)
            doc.Properties[keyLower] = val;
          } catch (Exception) {
            // optional: Logging
          }
        }
      }

      // Übergebene Revision als Versionshinweis verwenden; expliziter alterationText hat Vorrang.
      string revision = Request.Form["revision"];
      if (!string.IsNullOrWhiteSpace(revision)
          && string.IsNullOrWhiteSpace(doc.Properties["alterationtext"])) {
        doc.Properties["alterationtext"] = revision;
      }

      var d3Store = doc.Store as D3Store;
      bool checkInitialRevision = d3Store != null
        && string.Equals(p2plus.p2core.Sysconf.getString("DMS", "D3_INTERFACE"), "REST", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrWhiteSpace(revision);
      // Vorherige Suche verhindert eine nachträgliche Zuordnung einer späteren
      // Revision zu einem bereits vorhandenen Dokument mit leerer Version 0.
      var stepTimer = System.Diagnostics.Stopwatch.StartNew();
      string existingDocumentId = null;
      if (checkInitialRevision) {
        try {
          existingDocumentId = FindRevisionDocumentId(NavTable, Id, filename);
        } catch (Exception) {
          // Ohne erfolgreiche Vorprüfung keine nachträgliche SQL-Änderung vornehmen.
          checkInitialRevision = false;
          uploadWarning = "Die SQL-Vorprüfung ist fehlgeschlagen. Der d.3-Versionshinweis wurde nicht per SQL gesetzt. Datei nicht erneut hochladen.";
        }
        serverTiming += "d3_lookup_before;dur=" + stepTimer.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture) + ", ";
      }

      stepTimer.Restart();
      doc.Save();
      uploadCompleted = true;
      serverTiming += "d3_save;dur=" + stepTimer.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);

      if (checkInitialRevision && existingDocumentId == null) {
        stepTimer.Restart();
        string documentId = FindRevisionDocumentId(NavTable, Id, filename);
        serverTiming += ", d3_lookup_after;dur=" + stepTimer.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (documentId == null) {
          throw new Exception("Das hochgeladene Dokument wurde in d.3 nicht eindeutig gefunden; kein SQL-Update ausgeführt.");
        }
        stepTimer.Restart();
        SetInitialRevisionReason(NavTable, documentId, doc.Properties["alterationtext"]);
        serverTiming += ", d3_revision_update;dur=" + stepTimer.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
      }
    }//try
    catch ( Exception e ) {
      if (uploadCompleted) {
        // Erfolgreichen Upload nicht wegen einer fehlgeschlagenen Nachbearbeitung als Fehler melden.
        uploadWarning = "Der Datei-Upload war erfolgreich, aber die Nachbearbeitung des d.3-Versionshinweises ist fehlgeschlagen. Datei nicht erneut hochladen.";
      } else {
        //#189512
        string txt = nlsMsg.getEntry(e.Message);
        if (txt == null)
          exceptionText = e.Message;
        else
          exceptionText = txt;
      }
      stackTrace = e.StackTrace;

    }//catch

  }//if

  if (string.IsNullOrEmpty(exceptionText)) {
    Response.ClearHeaders();
    Response.ClearContent();
    if (!string.IsNullOrEmpty(serverTiming)) {
      Response.AppendHeader("Server-Timing", serverTiming);
    }
    if (!string.IsNullOrEmpty(uploadWarning)) {
      // URL-Kodierung erlaubt Umlaute im Header; der Antworttext bleibt unverändert.
      Response.AppendHeader("X-APplus-Upload-Warning", Uri.EscapeDataString(uploadWarning));
    }
    Response.Write("OK");
    Response.StatusCode = 200;
  } else {
    throw new Exception(exceptionText);
  }
%>
```

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