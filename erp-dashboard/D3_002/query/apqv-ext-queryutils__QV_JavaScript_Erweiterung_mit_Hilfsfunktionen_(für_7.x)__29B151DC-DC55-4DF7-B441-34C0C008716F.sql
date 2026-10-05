SELECT
  [extQueryUtils] = '<h3>.callWithQueryData</h3>'
  , [Parameter] = '<ul><li><b>queryName</b> Name der Abfrage aus der die Daten kommen</li><li><b>paramObject</b> Parameter als Object (leeres Objekt oder "null" für keine Parameter)</li><li><b>callback</b> Funktion, die nach dem asynchronen ausführen der Abfrage mit den Daten aufgerufen wird</li></ul>'
  , [Beschreibung] = 'Eine Abfrage liefert für eine angegebene Funktion die Daten zur weiteren Vearbeitung (asynchrone Verarbeitung). Die Funktion die als Callback angegeben wird erhält zwei Parameter: <b>dataObject</b> und <b>resultObject</b>.<br>Bei erfolgreicher Ausführung enthält <b>dataObject</b> das DataTable-Objekt als JSON-Objekt der Abfrage. Bei Fehler in der Abfrage wird NULL zurück gegeben. Das <b>resultObject</b> ist wie folgt aufgebaut:<br>
{
  <b>success</b>: boolean (true/false),
  <b>errorText</b>: string (on error) or null,
  <b>responseText</b>: string (on error) or null
}'
  , [Beispiel] = '<textarea class="programming" style="width: 98%; height: 230px;" readonly>function event_page_loaded(isSingleTableView) {
  extQueryUtils.callWithQueryData("test-abfrage", {firma: "108824", personal: "ASOL.Projects"}, myFunc);
}

function myFunc(a, b) {
  alert(JSON.stringify(a));
  alert(JSON.stringify(b));
}
</textarea>'

UNION ALL

SELECT
  '<h3>.getQueryJsonUrl</h3>'
  , '<ul><li><b>queryName</b> Name der Abfrage aus der die Daten kommen</li><li><b>paramObject</b> Parameter als Object (leeres Objekt oder "null" für keine Parameter)</li></ul>'
  , [Beschreibung] = 'Liefert die zusammengebaute URL für einen XMLHttpRequest-Aufruf (Ajax) der angegebenen Abfrage mit Parametern.'
  , [Beispiel] = '<textarea class="programming" style="width: 98%; height: 230px;" readonly>function event_page_loaded(isSingleTableView) {
  alert(extQueryUtils.getQueryJsonUrl("test-abfrage", {firma: "108824", personal: "ASOL.Projects", parameterx: "xyz"}));
}
</textarea>'

UNION ALL

SELECT
  [extQueryUtils] = '<h3>.callWithQueryDataAsync</h3>'
  , [Parameter] = '<ul><li><b>queryName</b> Name der Abfrage aus der die Daten kommen</li><li><b>paramObject</b> Parameter als Object (leeres Objekt oder "null" für keine Parameter)</li><li><b>callback</b> Funktion, die nach dem asynchronen ausführen der Abfrage mit den Daten aufgerufen wird</li></ul>'
  , [Beschreibung] = 'Eine Abfrage liefert für eine angegebene Funktion die Daten zur weiteren Vearbeitung (asynchrone Verarbeitung). Die Funktion die als Callback angegeben wird erhält zwei Parameter: <b>dataObject</b> und <b>resultObject</b>.<br>Bei erfolgreicher Ausführung enthält <b>dataObject</b> das DataTable-Objekt als JSON-Objekt der Abfrage. Bei Fehler in der Abfrage wird NULL zurück gegeben. Das <b>resultObject</b> ist wie folgt aufgebaut:<br>
{
  <b>success</b>: boolean (true/false),
  <b>errorText</b>: string (on error) or null,
  <b>responseText</b>: string (on error) or null
}'
  , [Beispiel] = '<textarea class="programming" style="width: 98%; height: 230px;" readonly>function event_page_loaded(isSingleTableView) {
  try {
        data = await extQueryUtils.callWithQueryDataAsync("WSS_002", {
        aufstueli: row.getAttribute("data-aufstueli"),
        struktur: row.getAttribute("data-aufstuelipos")
      });
    
      if (data.length === 0) return;
    
      // Weiterverarbeitung...
    } catch (error) {
      console.error("Fehler beim Laden der Daten:", error);
    }
}

</textarea>'