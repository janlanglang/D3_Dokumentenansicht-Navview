const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const queryPath = path.join(__dirname, '../erp-dashboard/D3_002/query/D3_004__Navview_D3__7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0.js');
const dashboardPath = path.join(__dirname, '../erp-dashboard/D3_002/dashboard/D3_002__Navview_D3_Artikel__32D1D6EE-0FE7-4423-90D1-A41B721AD5C8.js');
const source = fs.readFileSync(queryPath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const api = require(queryPath);
const guid = '7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0';
const base = 'https://d3.example/';

function doc(id = 'T1', extra = {}) {
  return Object.assign({ D3DocumentId: id, Name: id + '.pdf', Dateityp: 'PDF', Dokumenttyp: 'Schriftverkehr',
    Datum: '02.10.2026 12:00:00', _path: '/dms/r/repo/o2/' + id + '/v/1_1/b/main/c' }, extra);
}

function metadata(id = 'T1') {
  return { D3DocumentId: id, Beschreibung: 'Beschreibung ' + id, Sprache: '', Revision: '', SizeInBytes: 0 };
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Test condition timed out');
    await new Promise(setImmediate);
  }
}

function setup(options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"><table class="viewquery-table"><tbody><tr data-id="42" data-tabelle="artikel"></tr></tbody></table></div></body>', {
    url: 'https://ap.example/applus/Query.aspx', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const window = dom.window;
  const queryCalls = [];
  const calls = [];
  const urls = [];
  const revoked = [];
  window.D3DocumentViewConfig = Object.assign({ d3BaseUrl: base }, options.config);
  window.URL.createObjectURL = () => { const url = 'blob:mock/' + urls.length; urls.push(url); return url; };
  window.URL.revokeObjectURL = (url) => revoked.push(url);
  window.app = { soap: { call: () => ({
    getFileListAsXml: async (table, id) => {
      calls.push({ table, id });
      return options.list ? options.list(table, id) : JSON.stringify([doc()]);
    }
  }) } };
  window.extQueryUtils = { callWithQueryDataAsync: async (name, parameters) => {
    queryCalls.push({ name, parameters });
    if (options.query) return options.query(name, parameters);
    return [{ id: parameters.id, tabelle: parameters.tabelle,
      d3metadata: options.metadata ? await options.metadata(parameters) : JSON.stringify([metadata()]),
      d3types: options.types ? await options.types(parameters) : JSON.stringify([{ DMSDOCUMENTTYPE: 'Schriftverkehr' }, { DMSDOCUMENTTYPE: 'Zeichnung' }]) }];
  } };
  window.fetch = options.fetch || (async () => new Response('OK'));
  window.confirm = () => true;
  if (!options.late) window.eval(source);
  const host = window.document.getElementById('host');
  const mount = () => window.D3DocumentView.mount(guid, host);
  const add = (...names) => {
    const picker = host.querySelector('.d3-picker');
    Object.defineProperty(picker, 'files', { configurable: true, value: names.map((name) => new window.File(['content'], name, { lastModified: 1 })) });
    picker.dispatchEvent(new window.Event('change'));
  };
  return { dom, window, host, mount, add, queryCalls, calls, urls, revoked };
}

test('normalization accepts nested JSON and derives the missing D3 ID from the validated version path', () => {
  const record = doc('T1', { D3DocumentId: undefined, BELEGID: '42', Name: '<img src=x>' });
  const pairs = Object.entries(record).map(([Key, Value]) => ({ Key, Value }));
  const normalized = api.normalizeDocuments(JSON.stringify(JSON.stringify([{ Value: pairs }, { Dateityp: 'FOL' }])), base);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'T1');
  assert.equal(normalized[0].name, '<img src=x>');
  assert.throws(() => api.parseRows({ unknown: [] }), /Datenformat/);
});

test('path ID matches the supplied D3 URL; explicit IDs take precedence and foreign paths are excluded', () => {
  const pathUrl = '/dms/r/99358d70-1ed1-5871-bba8-552a397a5a35/o2/T000178304/v/1_1/b/main/c';
  assert.equal(api.normalizeDocuments([doc('', { _path: pathUrl })], base)[0].id, 'T000178304');
  assert.equal(api.normalizeDocuments([doc('EXPLICIT', { _path: pathUrl })], base)[0].id, 'EXPLICIT');
  assert.equal(api.normalizeDocuments([doc('', { _path: 'https://other.example' + pathUrl })], base)[0].id, '');
  assert.equal(api.normalizeDocuments([doc('', { _path: '/dms/r/repo/o2/T1?next=/v/1_1' })], base)[0].id, '');
});

test('only exact IDs and unique physical rows in same repository are enriched', () => {
  const docs = api.normalizeDocuments([doc('T1', { Name: 'same.pdf' }), doc('T2', { Name: 'same.pdf' })], base);
  assert.equal(api.enrichDocuments(docs, [metadata()], 'repo')[0].size, 0);
  assert.match(api.enrichDocuments(docs, [metadata()], 'repo')[1].metadataError, /Keine passende/);
  assert.match(api.enrichDocuments(docs, [metadata(), metadata()], 'repo')[0].metadataError, /Mehrere/);
  assert.match(api.enrichDocuments(docs, [metadata()], 'other')[0].metadataError, /Archiv/);
  assert.match(api.enrichDocuments(docs, [{ D3DocumentId: 'T1' }], 'repo')[0].metadataError, /Metadatenfelder/);
});

test('unsafe URLs rejected; absolute and relative D3 URLs supported', () => {
  for (const sourceUrl of ['javascript:alert(1)', '//other.example/dms/r/repo/o2/T1', 'https://user:pass@d3.example/dms/r/repo/o2/T1', '/other/file', '']) {
    assert.equal(api.normalizeDocuments([doc('T1', { _path: sourceUrl })], base)[0].url, '');
  }
  assert.equal(api.normalizeDocuments([doc('T1', { _path: base + 'dms/r/repo/o2/T1' })], base)[0].repository, 'repo');
});

test('text preview formats JSON and rejects invalid JSON/XML without interpreting markup', () => {
  global.DOMParser = new JSDOM('').window.DOMParser;
  assert.equal(api.formatTextPreview('{"value":"<script>x</script>"}', 'json'), '{\n  "value": "<script>x</script>"\n}');
  assert.equal(api.formatTextPreview('a,b\n1,2', 'csv'), 'a,b\n1,2');
  assert.equal(api.formatTextPreview('<root><value>1</value></root>', 'xml'), '<root><value>1</value></root>');
  assert.throws(() => api.formatTextPreview('{invalid}', 'json'), /JSON/);
  assert.throws(() => api.formatTextPreview('<root>', 'xml'), /XML/);
  delete global.DOMParser;
});

test('D3 preview URL is derived only from a validated document identity', () => {
  const document = api.normalizeDocuments([doc('T000178304')], base)[0];
  assert.equal(api.d3PreviewUrl(document), 'https://d3.example/dms/r/repo/o2/T000178304/preview');
  assert.equal(api.d3PreviewUrl({ url: '', repository: 'repo', id: 'T1' }), '');
  assert.equal(api.d3PreviewUrl({ url: base + 'dms/r/repo/o2/T1/v/1_1/b/main/c', repository: 'repo', id: '../bad' }), '');
});

test('optional upload fields, native query context, sizes and context validation', () => {
  assert.equal(api.validateDraft({ filename: 'a.pdf', doctype: 'Schriftverkehr', language: '', description: '', revision: '' }, ['Schriftverkehr']), '');
  assert.match(api.validateDraft({ filename: '../a.pdf' }, []), /Dateiname/);
  assert.throws(() => api.validateContext('artikel;drop', '42'));
  assert.throws(() => api.validateContext('artikel', '0'));
  assert.throws(() => api.parseQueryPayload([{ id: 99, tabelle: 'artikel', d3metadata: '[]', d3types: '[]' }], api.validateContext('artikel', '42')), /anderen Datensatz/);
  assert.throws(() => api.parseQueryPayload([{ id: 42, tabelle: 'artikel' }], api.validateContext('artikel', '42')), /SQL-Abfrage aktualisieren/);
  assert.equal(api.formatSize(0), '0 B');
  assert.equal(api.formatSize(1024), '1 KiB');
  assert.equal(api.formatSize(null), '-');
  assert.equal(api.assessUpload(''), false);
  assert.equal(api.assessUpload('<html>Login</html>'), false);
  assert.equal(api.assessUpload('{"success":true}'), true);
});

test('mount is generic, SQL enrichment automatic, reload is idempotent and text is escaped', async () => {
  const fixture = setup({ list: () => [doc('T1', { Name: '<img src=x onerror=alert(1)>.pdf' })] });
  try {
    await fixture.mount();
    assert.equal(fixture.host.querySelectorAll('.d3-view').length, 1);
    assert.equal(fixture.host.querySelector('.d3-list img'), null);
    assert.match(fixture.host.querySelector('.d3-metadata').textContent, /Beschreibung T1/);
    assert.match(fixture.host.querySelector('.d3-metadata').textContent, /0 B/);
    assert.equal(fixture.queryCalls[0].name, 'D3_004');
    assert.equal(fixture.queryCalls[0].parameters.tabelle, 'artikel');
    assert.equal(fixture.queryCalls[0].parameters.id, '42');
    fixture.add('draft.pdf');
    fixture.window.eval(source);
    await fixture.mount();
    assert.equal(fixture.host.querySelectorAll('.d3-view').length, 1);
    assert.equal(fixture.host.querySelectorAll('.d3-upload-row').length, 1);
    fixture.host.querySelector('.d3-search').value = 'not-found';
    fixture.host.querySelector('.d3-search').dispatchEvent(new fixture.window.Event('input'));
    assert.match(fixture.host.querySelector('.d3-list').textContent, /Keine Treffer/);
  } finally { fixture.dom.window.close(); }
});

test('initial metadata and types are read from the hidden native query row without another request', async () => {
  const fixture = setup({ query: () => { throw new Error('Unexpected query request'); } });
  try {
    const row = fixture.host.querySelector('tr');
    row.setAttribute('data-d3metadata', JSON.stringify([{ ...metadata(), Beschreibung: 'Native <& "Beschreibung"' }]));
    row.setAttribute('data-d3types', JSON.stringify([{ DMSDOCUMENTTYPE: 'Schriftverkehr' }]));
    await fixture.mount();
    assert.equal(fixture.queryCalls.length, 0);
    assert.match(fixture.host.querySelector('.d3-metadata').textContent, /Native <& "Beschreibung"/);
    assert.equal(fixture.host.querySelector('.viewquery-table').style.display, 'none');
    fixture.add('native.pdf');
    assert.equal(fixture.host.querySelector('select[name="doctype"]').value, 'Schriftverkehr');
    assert.equal(fixture.host.querySelector('.d3-send').disabled, false);
  } finally { fixture.dom.window.close(); }
});

test('refresh and upload reload the native query instead of reusing the initial hidden metadata', async () => {
  let uploaded = false;
  const fixture = setup({
    list: () => uploaded ? [doc(), doc('T2')] : [doc()],
    metadata: () => uploaded ? [metadata(), metadata('T2')] : [{ ...metadata(), Beschreibung: 'Frisch geladen' }],
    fetch: async () => { uploaded = true; return new Response('OK'); }
  });
  try {
    const row = fixture.host.querySelector('tr');
    row.setAttribute('data-d3metadata', JSON.stringify([{ ...metadata(), Beschreibung: 'Tabellenstand' }]));
    row.setAttribute('data-d3types', '[]');
    await fixture.mount();
    assert.equal(fixture.queryCalls.length, 0);
    assert.match(fixture.host.querySelector('.d3-metadata').textContent, /Tabellenstand/);
    fixture.host.querySelector('.d3-refresh').click();
    await until(() => fixture.host.querySelector('.d3-metadata').textContent.includes('Frisch geladen'));
    assert.equal(fixture.queryCalls.length, 1);
    fixture.add('new.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => fixture.host.querySelector('.d3-list').textContent.includes('Beschreibung T2'));
    assert.equal(fixture.queryCalls.length, 2);
    assert.equal(fixture.queryCalls[1].parameters.id, '42');
    assert.equal(fixture.host.querySelector('.d3-upload').hidden, true);
  } finally { fixture.dom.window.close(); }
});

test('native query with no documents preserves context and offers the Schriftverkehr fallback', async () => {
  const fixture = setup({ list: () => [], query: () => { throw new Error('Unexpected query request'); } });
  try {
    fixture.host.querySelector('tr').setAttribute('data-d3metadata', '[]');
    fixture.host.querySelector('tr').setAttribute('data-d3types', '[]');
    await fixture.mount();
    fixture.add('first.pdf');
    assert.match(fixture.host.querySelector('.d3-list').textContent, /Keine Dokumente/);
    assert.equal(fixture.host.querySelector('.d3-send').disabled, false);
    assert.equal(fixture.queryCalls.length, 0);
  } finally { fixture.dom.window.close(); }
});

test('old query SQL or wrong context produces an integration error without SOAP SQL fallback', async () => {
  for (const response of [[{ id: 42, tabelle: 'artikel' }], [{ id: 99, tabelle: 'artikel', d3metadata: '[]', d3types: '[]' }]]) {
    const fixture = setup({ query: () => response });
    try {
      await fixture.mount();
      assert.match(fixture.host.querySelector('.d3-notice').textContent, /SQL-Abfrage aktualisieren|anderen Datensatz/);
      assert.match(fixture.host.querySelector('.d3-list').textContent, /Quickview-Metadaten/);
      assert.doesNotMatch(fixture.host.querySelector('.d3-metadata').textContent, /Beschreibung T1/);
      fixture.add('blocked.pdf');
      assert.equal(fixture.host.querySelector('.d3-send').disabled, true);
    } finally { fixture.dom.window.close(); }
  }
});

test('dashboard before query resources queues mount, unrelated queries are ignored', async () => {
  const fixture = setup({ late: true });
  try {
    fixture.window.eval(dashboard);
    const unrelated = fixture.window.document.createElement('section');
    unrelated.innerHTML = '<table class="viewquery-table"><tbody><tr><td>Other query</td></tr></tbody></table>';
    fixture.window.document.body.append(unrelated);
    await fixture.window.event_table_loaded('other-query', unrelated);
    await fixture.window.event_table_loaded(guid, fixture.host);
    fixture.window.eval(source);
    await until(() => fixture.host.querySelector('.d3-document'));
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.host.querySelectorAll('.d3-view').length, 1);
  } finally { fixture.dom.window.close(); }
});

test('dashboard runtime identifier initializes a table with the D3 context', async () => {
  const fixture = setup();
  try {
    fixture.window.eval(dashboard);
    await fixture.window.event_table_loaded('runtime-query-instance', fixture.host);
    assert.equal(fixture.host.querySelectorAll('.d3-view').length, 1);
    assert.equal(fixture.host.querySelector('.viewquery-table').style.display, 'none');
    assert.equal(fixture.calls[0].table, 'artikel');
    assert.equal(fixture.calls[0].id, '42');
  } finally { fixture.dom.window.close(); }
});

test('missing backend ID uses path ID for SQL enrichment', async () => {
  const fixture = setup({ list: () => [doc('T1', { D3DocumentId: '' })] });
  try {
    await fixture.mount();
    assert.match(fixture.host.querySelector('.d3-metadata').textContent, /Beschreibung T1/);
    assert.equal(fixture.queryCalls[0].name, 'D3_004');
  } finally { fixture.dom.window.close(); }
});

test('no explicit ID and no version path leaves list usable without guessing an ID', async () => {
  const fixture = setup({ list: () => [doc('T1', { D3DocumentId: '', _path: '/dms/r/repo/o2/T1/b/main/c' })] });
  try {
    await fixture.mount();
    assert.match(fixture.host.querySelector('.d3-list').textContent, /Dokument-ID fehlt/);
    assert.doesNotMatch(fixture.host.querySelector('.d3-metadata').textContent, /Beschreibung T1/);
    assert.equal(fixture.host.querySelector('.d3-document .d3-icon').disabled, false);
  } finally { fixture.dom.window.close(); }
});

test('document type selection accepts case variations and keeps the allowed default', async () => {
  const fixture = setup({ types: () => JSON.stringify([{ dmsdocumenttype: ' Schriftverkehr ' }, { DmsDocumentType: 'Zeichnung' }, { DMSDOCUMENTTYPE: 'Schriftverkehr' }]) });
  try {
    await fixture.mount();
    fixture.add('test.pdf');
    const select = fixture.host.querySelector('select[name="doctype"]');
    assert.deepEqual(Array.from(select.options, (option) => option.value), ['', 'Schriftverkehr', 'Zeichnung']);
    assert.equal(select.value, 'Schriftverkehr');
    assert.equal(fixture.queryCalls[0].parameters.tabelle, 'artikel');
  } finally { fixture.dom.window.close(); }
});

test('document types arriving after dropped files populate the default without overwriting a user choice', async () => {
  const pending = deferred();
  const fixture = setup({ types: () => pending.promise });
  try {
    const mounting = fixture.mount();
    fixture.add('early.pdf');
    assert.equal(fixture.host.querySelector('select[name="doctype"]').value, '');
    pending.resolve([{ DMSDOCUMENTTYPE: 'Schriftverkehr' }]);
    await mounting;
    let select = fixture.host.querySelector('select[name="doctype"]');
    assert.equal(select.value, 'Schriftverkehr');
    select.value = '';
    select.dispatchEvent(new fixture.window.Event('input'));
    await fixture.mount();
    select = fixture.host.querySelector('select[name="doctype"]');
    assert.equal(select.value, '');
  } finally { fixture.dom.window.close(); }
});

test('empty document type results offer only Schriftverkehr and enable upload', async () => {
  const fixture = setup({ types: () => '[]' });
  try {
    await fixture.mount();
    fixture.add('test.pdf');
    const select = fixture.host.querySelector('select[name="doctype"]');
    assert.deepEqual(Array.from(select.options, (option) => option.value), ['Schriftverkehr']);
    assert.equal(select.value, 'Schriftverkehr');
    assert.equal(fixture.host.querySelector('.d3-send').disabled, false);
    assert.doesNotMatch(fixture.host.querySelector('.d3-notice').textContent, /Dokumentarten konnten nicht/);
  } finally { fixture.dom.window.close(); }
});

test('document type query errors do not silently activate the empty-result fallback', async () => {
  const fixture = setup({ types: () => { throw new Error('SQL nicht erreichbar'); } });
  try {
    await fixture.mount();
    fixture.add('test.pdf');
    assert.match(fixture.host.querySelector('.d3-notice').textContent, /SQL nicht erreichbar/);
    assert.deepEqual(Array.from(fixture.host.querySelector('select[name="doctype"]').options, (option) => option.value), ['']);
    assert.equal(fixture.host.querySelector('.d3-send').disabled, true);
  } finally { fixture.dom.window.close(); }
});

test('AP+ query wrapper is hidden and view is mounted outside it in a bootstrap container', async () => {
  const fixture = setup();
  try {
    fixture.host.classList.add('viewquery-table');
    fixture.host.querySelector('table').classList.remove('viewquery-table');
    await fixture.mount();
    const view = fixture.window.document.querySelector('.d3-view');
    assert.ok(view);
    assert.equal(fixture.host.style.display, 'none');
    assert.equal(fixture.host.contains(view), false);
    assert.equal(view.closest('.viewquery-table'), null);
    assert.ok(view.closest('.bootstrapcontainer'));
    assert.equal(fixture.host.nextElementSibling.contains(view), true);
    await fixture.mount();
    assert.equal(fixture.window.document.querySelectorAll('.d3-view').length, 1);
    fixture.host.remove();
    await until(() => !fixture.window.document.querySelector('.d3-view'));
  } finally { fixture.dom.window.close(); }
});

test('ResizeObserver defers height writes, coalesces notifications and cancels pending work on removal', async () => {
  const fixture = setup();
  try {
    const observers = [];
    const frames = new Map();
    let frameId = 0;
    fixture.window.ResizeObserver = class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    };
    fixture.window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
    fixture.window.cancelAnimationFrame = (id) => frames.delete(id);
    const flushFrame = () => {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    };
    await fixture.mount();
    const view = fixture.host.querySelector('.d3-view');
    const before = view.style.getPropertyValue('--d3-height');
    let writes = 0;
    const setProperty = view.style.setProperty.bind(view.style);
    view.style.setProperty = (...args) => { writes += 1; return setProperty(...args); };
    fixture.window.innerHeight = 500;
    observers[0].callback([]);
    observers[0].callback([]);
    assert.equal(view.style.getPropertyValue('--d3-height'), before);
    assert.equal(frames.size, 1);
    flushFrame();
    assert.equal(view.style.getPropertyValue('--d3-height'), '484px');
    assert.equal(writes, 1);
    observers[0].callback([]);
    flushFrame();
    assert.equal(writes, 1);
    observers[0].callback([]);
    fixture.host.remove();
    await until(() => !fixture.window.document.querySelector('.d3-view'));
    assert.equal(frames.size, 0);
    assert.equal(observers[0].disconnected, true);
  } finally { fixture.dom.window.close(); }
});

test('blocked parent frame access does not prevent the document view', async () => {
  const fixture = setup();
  try {
    Object.defineProperty(fixture.window, 'frameElement', { get() { throw new fixture.window.DOMException('Blocked', 'SecurityError'); } });
    await fixture.mount();
    assert.equal(fixture.host.querySelectorAll('.d3-view').length, 1);
  } finally { fixture.dom.window.close(); }
});

test('multiple repositories require explicit SQL repository', async () => {
  const fixture = setup({ list: () => [doc(), doc('T2', { _path: '/dms/r/other/o2/T2/v/1_1/b/main/c' })] });
  try {
    await fixture.mount();
    assert.match(fixture.host.querySelector('.d3-list').textContent, /Archiv nicht eindeutig/);
    assert.doesNotMatch(fixture.host.querySelector('.d3-metadata').textContent, /Beschreibung T1/);
  } finally { fixture.dom.window.close(); }
});

test('upload area is visible only with queued files; toolbar drop target stays available', async () => {
  const fixture = setup();
  try {
    await fixture.mount();
    const area = fixture.host.querySelector('.d3-upload');
    assert.equal(area.hidden, true);
    const toolbar = fixture.host.querySelector('.d3-toolbar');
    assert.equal(toolbar.querySelector('h2').nextElementSibling.className, 'd3-drop');
    assert.equal(toolbar.querySelector('.d3-drop').nextElementSibling.className, 'd3-search-label');
    fixture.add('first.pdf');
    assert.equal(area.hidden, false);
    fixture.host.querySelector('.d3-upload-row .d3-icon').click();
    assert.equal(area.hidden, true);
    fixture.add('second.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => area.hidden);
    assert.ok(toolbar.querySelector('.d3-drop').isConnected);
  } finally { fixture.dom.window.close(); }
});

test('multi upload continues after failure, empty optional fields are submitted, only failed rows remain', async () => {
  const uploads = [];
  const fixture = setup({ fetch: async (url, options) => {
    uploads.push(options.body);
    return uploads.length === 1 ? new Response('Validation error', { status: 400 }) : new Response('OK');
  } });
  try {
    await fixture.mount();
    fixture.add('first.pdf', 'second.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => fixture.host.querySelector('.d3-upload-result').textContent.includes('1 erfolgreich'));
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0].get('NavTable'), 'artikel');
    assert.equal(uploads[0].get('Id'), '42');
    assert.equal(uploads[0].get('sprache'), '');
    assert.equal(uploads[0].get('Revision'), '');
    assert.equal(uploads[0].has('revision'), false);
    assert.equal(fixture.host.querySelectorAll('.d3-upload-row').length, 1);
    assert.match(fixture.host.querySelector('.d3-upload-source').textContent, /first.pdf/);
  } finally { fixture.dom.window.close(); }
});

test('visible language and revision values are synchronized immediately before upload', async () => {
  let submitted;
  const fixture = setup({ fetch: async (url, options) => { submitted = options.body; return new Response('OK'); } });
  try {
    await fixture.mount();
    fixture.add('metadata.pdf');
    const row = fixture.host.querySelector('.d3-upload-row');
    row.querySelector('[name="language"]').value = 'fr';
    row.querySelector('[name="revision"]').value = ' REV-7 ';
    fixture.host.querySelector('.d3-send').click();
    await until(() => submitted);
    assert.equal(submitted.get('sprache'), 'fr');
    assert.equal(submitted.get('Revision'), 'REV-7');
    assert.equal(submitted.has('revision'), false);
    assert.equal(submitted.getAll('sprache').length, 1);
    assert.equal(submitted.getAll('Revision').length, 1);
  } finally { fixture.dom.window.close(); }
});

test('unknown upload acknowledgement locks retry until explicit confirmation', async () => {
  const fixture = setup({ fetch: async () => new Response('') });
  try {
    await fixture.mount();
    fixture.add('unknown.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => fixture.host.querySelector('.d3-retry'));
    assert.equal(fixture.host.querySelector('.d3-upload-row').dataset.state, 'uncertain');
    assert.equal(fixture.host.querySelector('.d3-send').disabled, true);
    fixture.host.querySelector('.d3-retry').click();
    await until(() => !fixture.host.querySelector('.d3-send').disabled);
  } finally { fixture.dom.window.close(); }
});

test('explicit server rejection allows retry without uncertain-state confirmation', async () => {
  const fixture = setup({ fetch: async () => new Response('{"success":false,"message":"Revision abgelehnt"}') });
  try {
    await fixture.mount();
    fixture.add('rejected.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => fixture.host.querySelector('.d3-upload-result').textContent.includes('zu pruefen'));
    assert.equal(fixture.host.querySelector('.d3-upload-row').dataset.state, 'pending');
    assert.equal(fixture.host.querySelector('.d3-retry'), null);
  } finally { fixture.dom.window.close(); }
});

test('record switch preserves in-flight target, cancels waiting rows and ignores stale SOAP response', async () => {
  const flight = deferred();
  const oldList = deferred();
  const uploads = [];
  let deferredList = false;
  const fixture = setup({
    list: (table) => table === 'artikel' && deferredList ? oldList.promise : [doc(table === 'artikel' ? 'T1' : 'T2')],
    metadata: () => [metadata('T1'), metadata('T2')],
    fetch: async (url, options) => { uploads.push(options.body); return flight.promise; }
  });
  try {
    await fixture.mount();
    fixture.add('first.pdf', 'waiting.pdf');
    fixture.host.querySelector('.d3-send').click();
    await until(() => uploads.length === 1);
    deferredList = true;
    const stale = fixture.mount();
    await until(() => fixture.calls.length === 2);
    const row = fixture.host.querySelector('tr');
    row.dataset.tabelle = 'bestellung'; row.dataset.id = '77';
    await fixture.mount();
    oldList.resolve([doc('OLD')]);
    await stale;
    assert.match(fixture.host.querySelector('.d3-list').textContent, /T2.pdf/);
    assert.doesNotMatch(fixture.host.querySelector('.d3-list').textContent, /OLD/);
    flight.resolve(new Response('OK'));
    await new Promise(setImmediate);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].get('Id'), '42');
    assert.equal(fixture.host.querySelectorAll('.d3-upload-row').length, 0);
  } finally { fixture.dom.window.close(); }
});

test('preview selection ignores stale fetch and revokes object URLs on removal', async () => {
  const first = deferred();
  let requests = 0;
  const fixture = setup({ list: () => [doc('T1'), doc('T2', { Name: 'T2.png', Dateityp: 'PNG' })], metadata: () => [metadata('T1'), metadata('T2')],
    fetch: async () => ++requests === 1 ? first.promise : new Response('image', { headers: { 'Content-Type': 'image/png' } }) });
  try {
    await fixture.mount();
    fixture.host.querySelectorAll('.d3-document-select')[0].click();
    fixture.host.querySelectorAll('.d3-document-select')[1].click();
    await until(() => fixture.host.querySelector('.d3-preview-media'));
    assert.equal(fixture.host.querySelector('.d3-preview-media').tagName, 'IMG');
    first.resolve(new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } }));
    await new Promise(setImmediate);
    assert.equal(fixture.urls.length, 1);
    fixture.host.remove();
    await until(() => fixture.revoked.length === 1);
  } finally { fixture.dom.window.close(); }
});

test('TXT CSV JSON XML render as escaped text; DOCX uses the D3 preview UI without downloading the original', async () => {
  const downloads = [];
  const documents = [
    doc('TXT1', { Name: 'notes.txt', Dateityp: 'TXT' }),
    doc('CSV1', { Name: 'values.csv', Dateityp: 'CSV' }),
    doc('JSON1', { Name: 'data.json', Dateityp: 'JSON' }),
    doc('XML1', { Name: 'data.xml', Dateityp: 'XML' }),
    doc('DOCX1', { Name: 'letter.docx', Dateityp: 'DOCX' })
  ];
  const contents = {
    TXT1: ['<script>alert(1)</script>\nText', 'text/plain'],
    CSV1: ['name,value\nA,1', 'text/csv'],
    JSON1: ['{"html":"<b>not markup</b>","value":1}', 'application/json'],
    XML1: ['<root><value>&lt;b&gt;</value></root>', 'application/xml']
  };
  const fixture = setup({
    list: () => documents,
    metadata: () => documents.map((document) => metadata(document.D3DocumentId)),
    fetch: async (url) => {
      const original = decodeURIComponent(new URL(url).searchParams.get('url'));
      const id = original.match(/\/o2\/([^/]+)\//)[1];
      downloads.push(id);
      return new Response(contents[id][0], { headers: { 'Content-Type': contents[id][1] } });
    }
  });
  try {
    await fixture.mount();
    const select = async (name) => {
      fixture.host.querySelector('.d3-document-select[title="' + name + '"]').click();
      await until(() => fixture.host.querySelector('.d3-text-preview'));
      return fixture.host.querySelector('.d3-text-preview');
    };
    let preview = await select('notes.txt');
    assert.match(preview.textContent, /<script>alert/);
    assert.equal(preview.querySelector('script'), null);
    preview = await select('values.csv');
    assert.equal(preview.textContent, 'name,value\nA,1');
    preview = await select('data.json');
    assert.match(preview.textContent, /\n  "html": "<b>not markup<\/b>"/);
    assert.equal(preview.querySelector('b'), null);
    preview = await select('data.xml');
    assert.equal(preview.textContent, '<root><value>&lt;b&gt;</value></root>');
    fixture.host.querySelector('.d3-document-select[title="letter.docx"]').click();
    const frame = fixture.host.querySelector('.d3-dms-preview iframe');
    assert.equal(frame.src, 'https://d3.example/dms/r/repo/o2/DOCX1/preview');
    assert.equal(fixture.host.querySelector('.d3-preview-link').href, frame.src);
    assert.deepEqual(downloads, ['TXT1', 'CSV1', 'JSON1', 'XML1']);
  } finally { fixture.dom.window.close(); }
});

test('Edge desktop/mobile layout, real image preview, drag payload and multiple instances', { skip: process.env.D3_BROWSER_TEST !== '1' }, async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.D3_BROWSER_CHANNEL || 'msedge', headless: true });
  const css = fs.readFileSync(queryPath.replace(/\.js$/, '.css'), 'utf8');
  const bootstrapCss = fs.readFileSync(path.join(path.dirname(queryPath), 'apqv-ext-bootstrap5__Bootstrap5__E514FA42-86BD-4B5D-90C6-9D6E546B68D6.css'), 'utf8');
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://ap.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;padding:24px;background:#eef0f2"><header style="height:56px;font:16px Segoe UI">AP+ / Artikel</header><main id="host" style="height:720px;overflow:hidden"><div class="viewquery-table"><table><tbody><tr data-id="42" data-tabelle="artikel"></tr></tbody></table></div></main></body></html>' }));
    await page.goto('https://ap.example/applus/Query.aspx');
    const queryStyle = await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: bootstrapCss });
    await page.addStyleTag({ content: '.viewquery-table button { display:block !important; width:600px !important; } body button { font-size:28px; border-radius:24px; background:magenta; } body section { display:block; }' });
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 600;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 600);
      context.strokeStyle = '#176b50'; context.lineWidth = 6; context.strokeRect(80, 120, 640, 380);
      context.fillStyle = '#d29b29'; context.fillRect(200, 220, 400, 150);
      context.fillStyle = '#253330'; context.font = '28px sans-serif'; context.fillText('D3 Pruefzeichnung', 80, 70);
      const imageUrl = canvas.toDataURL('image/png');
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (url) => String(url).includes('ProxyDocument') ? nativeFetch(imageUrl) : new Response('OK');
      window.D3DocumentViewConfig = { d3BaseUrl: 'https://d3.example/' };
      window.app = { soap: { call: () => ({
        getFileListAsXml: async (table) => [
          { Name: 'Zeichnung-' + table + '.png', D3DocumentId: 'T1', Dateityp: 'PNG', Dokumenttyp: 'Zeichnung', Datum: '02.10.2026', _path: '/dms/r/repo/o2/T1/v/1_1/b/main/c' },
          { Name: 'Betriebsanleitung_mit_einem_sehr_langen_Dateinamen_und_Sonderzeichen_1234567890.pdf', D3DocumentId: 'T2', Dateityp: 'PDF', Dokumenttyp: 'Betriebsanleitung', Datum: '02.10.2026', _path: '/dms/r/repo/o2/T2/v/1_1/b/main/c' }
        ]
      }) } };
      window.extQueryUtils = { callWithQueryDataAsync: async (name, parameters) => [{
        id: parameters.id, tabelle: parameters.tabelle,
        d3types: [{ DMSDOCUMENTTYPE: 'Schriftverkehr' }, { DMSDOCUMENTTYPE: 'Zeichnung' }],
        d3metadata: [
          { D3DocumentId: 'T1', Beschreibung: 'Aufstellzeichnung', Sprache: 'de', Revision: 'B', SizeInBytes: 64000 },
          { D3DocumentId: 'T2', Beschreibung: 'Betriebsanleitung mit langer Beschreibung', Sprache: '', Revision: '', SizeInBytes: 10000 }
        ]
      }] };
    });
    await page.addScriptTag({ content: source });
    await page.evaluate((queryGuid) => window.D3DocumentView.mount(queryGuid, document.getElementById('host')), guid);
    assert.equal(await page.locator('.viewquery-table .d3-view').count(), 0);
    assert.equal(await page.locator('.viewquery-table').isVisible(), false);
    assert.equal(await page.locator('.bootstrapcontainer .d3-view').count(), 1);
    assert.equal(await page.locator('.d3-style-warning').isVisible(), false);
    assert.equal(await page.locator('.d3-refresh').evaluate((button) => getComputedStyle(button).width), '34px');
    assert.equal(await page.locator('.d3-body').evaluate((body) => getComputedStyle(body).display), 'grid');
    await queryStyle.evaluate((style) => style.remove());
    assert.equal(await page.locator('.d3-style-warning').isVisible(), true);
    await page.addStyleTag({ content: css });
    assert.equal(await page.locator('.d3-style-warning').isVisible(), false);
    await page.getByRole('button', { name: /PNG Zeichnung/ }).click();
    await page.waitForFunction(() => document.querySelector('.d3-preview-media')?.naturalWidth === 800);
    const imagePixel = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(document.querySelector('.d3-preview-media'), 300, 300, 1, 1, 0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
    assert.deepEqual(imagePixel, [210, 155, 41, 255]);
    const payload = await page.evaluate(() => {
      const transfer = new DataTransfer();
      document.querySelector('.d3-document-select[aria-pressed="true"]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      return transfer.getData('DownloadURL');
    });
    assert.match(payload, /^image\/png:Zeichnung-artikel.png:https:\/\/ap.example\//);
    await page.locator('.d3-picker').setInputFiles([
      { name: 'Dokument_mit_einem_sehr_langen_Dateinamen_12345678901234567890.pdf', mimeType: 'application/pdf', buffer: Buffer.from('test') },
      { name: 'zweites.pdf', mimeType: 'application/pdf', buffer: Buffer.from('test2') }
    ]);
    for (const viewport of [{ width: 1440, height: 1000, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'd3-navview-' + viewport.name + '.png'), fullPage: true });
      const layout = await page.evaluate(() => {
        const view = document.querySelector('.d3-view');
        const host = document.getElementById('host');
        return { overflow: document.documentElement.scrollWidth > window.innerWidth,
          heightOverflow: view.getBoundingClientRect().bottom > host.getBoundingClientRect().bottom + 1,
          listHeight: document.querySelector('.d3-list').clientHeight,
          previewHeight: document.querySelector('.d3-preview-content').clientHeight,
          inputOverflow: Array.from(view.querySelectorAll('input:not([hidden]),select')).some((control) => control.getBoundingClientRect().right > view.getBoundingClientRect().right + 1) };
      });
      assert.equal(layout.overflow, false, viewport.name + ' horizontal overflow');
      assert.equal(layout.heightOverflow, false, viewport.name + ' parent height overflow');
      assert.equal(layout.inputOverflow, false, viewport.name + ' input overflow');
      assert.ok(layout.listHeight > 40 && layout.previewHeight > 40, viewport.name + ' usable content');
    }
    await page.evaluate(async (queryGuid) => {
      const second = document.createElement('section');
      second.id = 'second';
      second.innerHTML = '<table class="viewquery-table"><tbody><tr data-id="99" data-tabelle="bestellung"></tr></tbody></table>';
      document.body.append(second);
      await window.D3DocumentView.mount(queryGuid, second);
    }, guid);
    assert.equal(await page.locator('.d3-view').count(), 2);
    assert.equal(await page.locator('#second .d3-upload-row').count(), 0);
    assert.equal(await page.locator('#host .d3-upload-row').count(), 2);
    assert.ok((await page.locator('#second .d3-list').textContent()).includes('Zeichnung-bestellung.png'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('same-origin Quickview expands parent detail area, follows resize and restores heights', { skip: process.env.D3_BROWSER_TEST !== '1' }, async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.D3_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.resizeErrors = [];
      window.addEventListener('error', (event) => {
        if (String(event.message).includes('ResizeObserver')) window.resizeErrors.push(event.message);
      });
    });
    await page.route('https://ap.example/**', (route) => {
      const isChild = route.request().url().endsWith('/quickview');
      return route.fulfill({ contentType: 'text/html', body: isChild
        ? '<!doctype html><html><body style="margin:0"><div id="host"><table class="viewquery-table"><tbody><tr data-id="42" data-tabelle="artikel"></tr></tbody></table></div></body></html>'
        : '<!doctype html><html><body style="margin:0"><header style="height:100px">AP+ Detail</header><aside id="unrelated" style="position:absolute;right:0;top:0;height:80px;overflow:hidden">Other panel</aside><section id="details" style="height:260px;max-height:260px;overflow:hidden;padding:0 0 8px"><header style="height:44px">Dokumente</header><iframe id="quickview" src="/quickview" style="display:block;width:100%;height:200px;border:0"></iframe></section></body></html>' });
    });
    await page.goto('https://ap.example/parent');
    const child = page.frames().find((frame) => frame.url().endsWith('/quickview'));
    await child.addStyleTag({ content: fs.readFileSync(queryPath.replace(/\.js$/, '.css'), 'utf8') });
    await child.addStyleTag({ content: '#host::before { content: ""; display: block; height: clamp(0px, calc(1280px - 100vw), 100px); }' });
    await child.evaluate(() => {
      window.app = { soap: { call: () => ({ getFileListAsXml: async () => [] }) } };
      const row = document.querySelector('#host tr');
      row.setAttribute('data-d3metadata', '[]');
      row.setAttribute('data-d3types', '[{"DMSDOCUMENTTYPE":"Schriftverkehr"}]');
    });
    await child.addScriptTag({ content: source });
    await child.evaluate((queryGuid) => window.D3DocumentView.mount(queryGuid, document.getElementById('host')), guid);
    await page.waitForFunction(() => document.getElementById('quickview').getBoundingClientRect().height > 700);
    for (const viewport of [
      { width: 1280, height: 1000 }, { width: 980, height: 780 }, { width: 780, height: 720 },
      { width: 390, height: 620 }, { width: 960, height: 800 }, { width: 390, height: 620 },
      { width: 1280, height: 1100 }
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => Math.abs(document.getElementById('quickview').getBoundingClientRect().bottom - (window.innerHeight - 24)) < 2);
      await child.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const viewBounds = await child.locator('.d3-view').evaluate((view) => ({ bottom: view.getBoundingClientRect().bottom, windowHeight: innerHeight }));
      assert.ok(viewBounds.bottom <= viewBounds.windowHeight, 'view fits after shrinking');
      assert.equal(await page.locator('#unrelated').evaluate((node) => node.style.height), '80px');
      assert.equal(await child.locator('.d3-upload').isVisible(), false);
      assert.equal(await child.locator('.d3-toolbar .d3-drop').isVisible(), true);
    }
    assert.deepEqual(await page.evaluate(() => window.resizeErrors), []);
    assert.deepEqual(await child.evaluate(() => window.resizeErrors), []);
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'd3-navview-parent.png'), fullPage: true });
    await child.evaluate(() => document.getElementById('host').remove());
    await page.waitForFunction(() => document.getElementById('quickview').style.height === '200px');
    assert.equal(await page.locator('#details').evaluate((node) => node.style.height), '260px');
    assert.equal(await page.locator('#details').evaluate((node) => node.style.maxHeight), '260px');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});