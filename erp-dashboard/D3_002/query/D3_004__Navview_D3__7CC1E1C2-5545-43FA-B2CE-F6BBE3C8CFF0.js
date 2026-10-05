(function (root) {
	'use strict';

	const QUERY_GUID = '7CC1E1C2-5545-43FA-B2CE-F6BBE3C8CFF0';
	const DEFAULT_D3_BASE = 'https://systec-vs72.systec-lab.local/';
	const instances = new WeakMap();
	const parentLayouts = new WeakMap();
	const textExtensions = new Set(['txt', 'csv', 'json', 'xml']);
	const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024;
	const languages = [['', 'Keine Angabe'], ['de', 'Deutsch'], ['en', 'English'], ['fr', 'Francais'], ['es', 'Espanol']];

	function text(value) {
		return value === null || value === undefined ? '' : String(value).trim();
	}

	function parseRows(value) {
		let parsed = value;
		for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) {
			parsed = JSON.parse(parsed);
		}
		if (parsed === null || parsed === undefined) return [];
		if (Array.isArray(parsed)) return parsed;
		if (Array.isArray(parsed.rows)) return parsed.rows;
		if (Array.isArray(parsed.data)) return parsed.data;
		throw new Error('Unerwartetes Datenformat der Schnittstelle.');
	}

	function toRecord(entry) {
		const value = entry && entry.Value !== undefined ? entry.Value : entry;
		if (!value || typeof value !== 'object') throw new Error('Ungueltiger Dokumenteintrag.');
		if (!Array.isArray(value)) return value;
		const record = Object.create(null);
		value.forEach(function (field) {
			if (field && typeof field.Key === 'string') record[field.Key] = field.Value;
		});
		return record;
	}

	function parseDocumentTypes(response) {
		const values = parseRows(response).map(toRecord).map(function (record) {
			const key = Object.keys(record).find((name) => name.toUpperCase() === 'DMSDOCUMENTTYPE');
			if (!key) throw new Error('Feld DMSDOCUMENTTYPE fehlt in der SQL-Antwort.');
			return text(record[key]);
		}).filter(Boolean);
		return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'de'));
	}

	function normalizeDocuments(response, baseUrl) {
		const base = new URL(baseUrl);
		if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('Ungueltige D3-Adresse.');
		return parseRows(response).map(toRecord).filter(function (record) {
			return text(record.Dateityp || record.dateityp).toUpperCase() !== 'FOL';
		}).map(function (record, index) {
			const source = text(record._pathWithoutServer || record._path || record.Url || record.URL || record.url);
			let url = '';
			let linkError = '';
			try {
				if (!source) throw new Error('Dokumentpfad fehlt.');
				const resolved = new URL(source, base);
				if (resolved.origin !== base.origin || resolved.username || resolved.password) {
					throw new Error('Dokument gehoert nicht zum konfigurierten D3-Server.');
				}
				if (!/^\/dms\/r\/[^/]+\/o2\//i.test(resolved.pathname)) {
					throw new Error('Kein unterstuetzter D3-Dateipfad. Archivzuordnung pruefen.');
				}
				url = resolved.href;
			} catch (error) {
				linkError = error.message;
			}
			const pathname = url ? new URL(url).pathname : '';
			const repository = pathname ? pathname.split('/')[3] : '';
			const pathId = pathname.match(/^\/dms\/r\/[^/]+\/o2\/([A-Za-z0-9_-]+)\/v\//i);
			const id = text(record.D3DocumentId) || (pathId ? pathId[1] : '');
			const name = text(record.Name || record.Dateiname || record.FileName) || 'Dokument';
			const extension = text(record.Dateityp || record.dateityp || name.split('.').pop()).toLowerCase();
			return {
				key: String(index), id: id, repository: repository, name: name,
				type: text(record.Dokumenttyp) || 'Ohne Dokumentart', date: text(record.Datum),
				extension: extension, url: url, linkError: linkError,
				description: null, language: null, revision: null, size: null,
				metadataError: id ? 'Metadaten noch nicht geladen.' : 'D3-Dokument-ID fehlt in SOAP-Ausgabe und Dateipfad.'
			};
		});
	}

	function enrichDocuments(documents, rows, repositoryId) {
		const records = parseRows(rows).map(toRecord);
		const byId = new Map();
		records.forEach(function (record) {
			const id = text(record.D3DocumentId || record.doku_id);
			if (!byId.has(id)) byId.set(id, []);
			byId.get(id).push(record);
		});
		return documents.map(function (document) {
			const result = Object.assign({}, document);
			if (!document.id) return result;
			if (!repositoryId || document.repository !== repositoryId || document.linkError) {
				result.metadataError = 'SQL-Archivzuordnung nicht bestaetigt.';
				return result;
			}
			const matches = byId.get(document.id) || [];
			if (matches.length !== 1) {
				result.metadataError = matches.length ? 'Mehrere SQL-Dateizeilen: Dateistand nicht eindeutig.' : 'Keine passende SQL-doku_id gefunden.';
				return result;
			}
			const record = matches[0];
			const required = ['Beschreibung', 'Sprache', 'Revision', 'SizeInBytes'];
			if (required.some(function (field) { return !Object.prototype.hasOwnProperty.call(record, field); })) {
				result.metadataError = 'Die SQL-Antwort enthaelt nicht alle Metadatenfelder.';
				return result;
			}
			result.description = text(record.Beschreibung);
			result.language = text(record.Sprache);
			result.revision = text(record.Revision);
			const size = record.SizeInBytes;
			result.size = size === null || text(size) === '' ? null : Number(size);
			if (result.size !== null && (!Number.isFinite(result.size) || result.size < 0)) result.size = null;
			result.metadataError = result.size === null ? 'Dateigroesse fehlt oder ist ungueltig.' : '';
			return result;
		});
	}

	function formatSize(bytes) {
		if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '-';
		let size = Number(bytes);
		const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
		let unit = 0;
		while (size >= 1024 && unit < units.length - 1) {
			size /= 1024;
			unit += 1;
		}
		return size.toLocaleString('de-DE', { maximumFractionDigits: unit ? 1 : 0 }) + ' ' + units[unit];
	}

	function validateDraft(draft, types) {
		if (!text(draft.filename)) return 'Dateiname fehlt.';
		if (/[\\/:*?"<>|\u0000-\u001f]/.test(draft.filename) || /[. ]$/.test(draft.filename)) return 'Ungueltiger Dateiname.';
		if (!text(draft.doctype)) return 'Dokumentart fehlt.';
		if (!types.includes(draft.doctype)) return 'Dokumentart ist fuer diese Tabelle nicht zulaessig.';
		if (!languages.some(function (language) { return language[0] === draft.language; })) return 'Ungueltige Sprache.';
		return '';
	}

	function validateContext(table, id) {
		table = text(table);
		id = text(id);
		if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table) || !/^[1-9][0-9]*$/.test(id)) {
			throw new Error('Tabelle oder Datensatz-ID fehlt bzw. ist ungueltig.');
		}
		return { table: table, id: id, key: table.toLowerCase() + ':' + id };
	}

	function parseQueryPayload(response, context) {
		const rows = parseRows(response);
		if (rows.length !== 1) throw new Error('D3_004 muss genau eine Datensatzzeile liefern.');
		const record = toRecord(rows[0]);
		const field = (name) => record[Object.keys(record).find((key) => key.toLowerCase() === name)];
		const received = validateContext(field('tabelle'), field('id'));
		if (received.key !== context.key) throw new Error('D3_004 lieferte Daten fuer einen anderen Datensatz.');
		const metadata = field('d3metadata');
		const types = field('d3types');
		if (metadata === undefined || metadata === null || types === undefined || types === null) {
			throw new Error('D3_004: d3metadata oder d3types fehlt. Bitte die SQL-Abfrage aktualisieren.');
		}
		return { metadata: metadata, types: types };
	}

	async function loadQueryPayload(context) {
		if (!root.extQueryUtils || typeof root.extQueryUtils.callWithQueryDataAsync !== 'function') {
			throw new Error('Quickview-Helfer extQueryUtils fehlt. apqv-ext-queryutils einbinden.');
		}
		let response;
		try {
			response = await root.extQueryUtils.callWithQueryDataAsync('D3_004', { tabelle: context.table, id: context.id });
		} catch (error) {
			throw new Error('D3_004 konnte nicht geladen werden: ' + text(error && (error.message || error.errorText) || error));
		}
		return parseQueryPayload(response, context);
	}

	function assessUpload(body) {
		const value = text(body);
		if (/^(ok|success|true)$/i.test(value)) return true;
		let parsed;
		try { parsed = JSON.parse(value); } catch (error) { return false; }
		if (!parsed || typeof parsed !== 'object') return false;
		if (parsed.error || parsed.success === false || Number(parsed.severity) >= 3) {
			const error = new Error(text(parsed.message || parsed.reason || parsed.error) || 'Upload vom Server abgelehnt.');
			error.uploadRejected = true;
			throw error;
		}
		return parsed.success === true || /^(ok|success)$/i.test(text(parsed.status || parsed.result));
	}

	function mimeType(extension) {
		return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
			gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
			txt: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'application/xml' }[extension] || 'application/octet-stream';
	}

	function formatTextPreview(value, extension) {
		const content = String(value);
		if (extension === 'json') {
			try { return JSON.stringify(JSON.parse(content), null, 2); }
			catch (error) { throw new Error('Ungueltige JSON-Datei: ' + error.message); }
		}
		if (extension === 'xml') {
			if (typeof root.DOMParser !== 'function') throw new Error('XML-Parser ist nicht verfuegbar.');
			const xml = new root.DOMParser().parseFromString(content, 'application/xml');
			if (xml.querySelector('parsererror')) throw new Error('Ungueltige XML-Datei.');
		}
		return content;
	}

	async function readTextPreview(blob, extension) {
		if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
			throw new Error('Textvorschau ist auf ' + formatSize(MAX_TEXT_PREVIEW_BYTES) + ' begrenzt. Datei bitte herunterladen.');
		}
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let encoding = 'utf-8';
		let offset = 0;
		if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
		else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
		else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
		let content;
		try { content = new root.TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(bytes.subarray(offset)); }
		catch (error) { content = new root.TextDecoder('windows-1252').decode(bytes); }
		if (content.includes('\u0000')) throw new Error('Datei enthaelt binaere Daten und kann nicht als Text angezeigt werden.');
		return formatTextPreview(content, extension);
	}

	function d3PreviewUrl(document) {
		if (!document || !document.url || !/^[A-Za-z0-9_-]+$/.test(document.repository || '') || !/^[A-Za-z0-9_-]+$/.test(document.id || '')) return '';
		try {
			const source = new URL(document.url);
			const match = source.pathname.match(/^\/dms\/r\/([^/]+)\/o2\/([^/]+)\//i);
			if (!match || match[1] !== document.repository || match[2] !== document.id) return '';
			source.pathname = '/dms/r/' + document.repository + '/o2/' + document.id + '/preview';
			source.search = '';
			source.hash = '';
			return source.href;
		} catch (error) { return ''; }
	}

	function element(tag, className, content) {
		const created = root.document.createElement(tag);
		if (className) created.className = className;
		if (content !== undefined) created.textContent = content;
		return created;
	}

	function iconButton(symbol, title) {
		const button = element('button', 'd3-icon', symbol);
		button.type = 'button';
		button.title = title;
		button.setAttribute('aria-label', title);
		return button;
	}

	function soap(service) {
		if (!root.app || !root.app.soap) throw new Error('AP+-SOAP-Schnittstelle ist nicht verfuegbar.');
		return root.app.soap.call(service);
	}

	function proxyUrl(document) {
		return new URL('../flexmobility/customutils.asmx/ProxyDocument?url=' + encodeURIComponent(document.url), root.location.href).href;
	}

	function readContext(container) {
		const row = container.matches('tr[data-id][data-tabelle]') ? container : container.querySelector('tr[data-id][data-tabelle]');
		if (!row) throw new Error('D3_004 liefert keinen gespeicherten Datensatz mit id und tabelle.');
		return validateContext(row.getAttribute('data-tabelle'), row.getAttribute('data-id'));
	}

	function readTablePayload(container, context) {
		const row = container.matches('tr[data-id][data-tabelle]') ? container : container.querySelector('tr[data-id][data-tabelle]');
		if (!row || !row.hasAttribute('data-d3metadata') || !row.hasAttribute('data-d3types')) return null;
		return parseQueryPayload([{
			id: row.getAttribute('data-id'), tabelle: row.getAttribute('data-tabelle'),
			d3metadata: row.getAttribute('data-d3metadata'), d3types: row.getAttribute('data-d3types')
		}], context);
	}

	function acquireParentLayout() {
		let frame;
		let parentWindow;
		try {
			frame = root.frameElement;
			if (!frame) return function () {};
			parentWindow = frame.ownerDocument.defaultView;
			if (!parentWindow || parentWindow === root) return function () {};
		} catch (error) {
			return function () {};
		}
		let layout = parentLayouts.get(frame);
		if (!layout) {
			const changes = new Map();
			let scheduled = 0;
			let disposed = false;
			const setStyle = (target, property, value) => {
				if (!changes.has(target)) changes.set(target, new Map());
				const properties = changes.get(target);
				if (!properties.has(property)) {
					properties.set(property, { value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property), applied: '' });
				}
				properties.get(property).applied = value;
				if (target.style.getPropertyValue(property) !== value || target.style.getPropertyPriority(property) !== 'important') {
					target.style.setProperty(property, value, 'important');
				}
			};
			const update = () => {
				scheduled = 0;
				if (disposed || !frame.isConnected || !frame.getClientRects().length) return;
				const bottom = parentWindow.innerHeight - 16;
				const ancestors = [];
				let ancestor = frame.parentElement;
				while (ancestor && ancestor !== frame.ownerDocument.body && ancestor !== frame.ownerDocument.documentElement) {
					const style = parentWindow.getComputedStyle(ancestor);
					const rect = ancestor.getBoundingClientRect();
					if (changes.has(ancestor) || (rect.bottom < bottom &&
						(/(auto|scroll|hidden|clip)/.test(style.overflowY) || style.maxHeight !== 'none'))) ancestors.push(ancestor);
					ancestor = ancestor.parentElement;
				}
				ancestors.reverse().forEach((target) => {
					setStyle(target, 'box-sizing', 'border-box');
					setStyle(target, 'max-height', 'none');
					setStyle(target, 'height', Math.max(0, bottom - Math.max(0, target.getBoundingClientRect().top)) + 'px');
				});
				let frameBottom = bottom;
				ancestor = frame.parentElement;
				while (ancestor && ancestor !== frame.ownerDocument.body && ancestor !== frame.ownerDocument.documentElement) {
					const style = parentWindow.getComputedStyle(ancestor);
					if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
						frameBottom = Math.min(frameBottom, ancestor.getBoundingClientRect().bottom -
							(parseFloat(style.paddingBottom) || 0) - (parseFloat(style.borderBottomWidth) || 0));
					}
					ancestor = ancestor.parentElement;
				}
				setStyle(frame, 'box-sizing', 'border-box');
				setStyle(frame, 'max-height', 'none');
				setStyle(frame, 'height', Math.max(0, frameBottom - Math.max(0, frame.getBoundingClientRect().top)) + 'px');
			};
			const schedule = () => {
				if (!disposed && !scheduled) scheduled = parentWindow.requestAnimationFrame(update);
			};
			const observer = parentWindow.ResizeObserver ? new parentWindow.ResizeObserver(schedule) : null;
			if (observer) {
				observer.observe(frame);
				if (frame.parentElement) observer.observe(frame.parentElement);
			}
			const cleanup = () => {
				if (disposed) return;
				disposed = true;
				if (scheduled) parentWindow.cancelAnimationFrame(scheduled);
				parentWindow.removeEventListener('resize', schedule);
				frame.ownerDocument.removeEventListener('scroll', schedule, true);
				root.removeEventListener('pagehide', cleanup);
				if (observer) observer.disconnect();
				changes.forEach((properties, target) => properties.forEach((previous, property) => {
					if (target.style.getPropertyValue(property) === previous.applied && target.style.getPropertyPriority(property) === 'important') {
						target.style.setProperty(property, previous.value, previous.priority);
					}
				}));
				parentLayouts.delete(frame);
			};
			layout = { users: 0, cleanup: cleanup };
			parentLayouts.set(frame, layout);
			parentWindow.addEventListener('resize', schedule);
			frame.ownerDocument.addEventListener('scroll', schedule, true);
			root.addEventListener('pagehide', cleanup);
			update();
		}
		layout.users += 1;
		return function () {
			layout.users -= 1;
			if (layout.users === 0) layout.cleanup();
		};
	}

	class DocumentView {
		constructor(container, config) {
			this.container = container;
			this.config = config;
			this.generation = 0;
			this.loadNumber = 0;
			this.previewNumber = 0;
			this.documents = [];
			this.queue = [];
			this.types = [];
			this.closedGroups = new Set();
			this.selected = null;
			this.busy = false;
			this.sequence = 0;
			this.root = element('section', 'd3-view');
			this.shell = element('div', 'bootstrapcontainer d3-shell');
			const styleWarning = element('p', 'd3-style-warning', 'D3_004: Layout-CSS fehlt. Bitte auch CSSSTYLE der Abfrage aktualisieren und die Seite neu laden.');
			styleWarning.setAttribute('role', 'alert');
			this.shell.append(styleWarning);
			this.shell.append(this.root);
			this.root.setAttribute('aria-label', 'Dokumente');
			this.root.innerHTML = `
				<header class="d3-toolbar">
					<h2>Dokumente <span class="d3-count"></span></h2>
					<button type="button" class="d3-drop">Dateien ablegen oder auswaehlen</button>
					<label class="d3-search-label"><span class="d3-sr">Dokumente suchen</span><input class="d3-search" type="search" placeholder="Suchen" /></label>
					<button type="button" class="d3-icon d3-refresh" title="Aktualisieren" aria-label="Aktualisieren">&#8635;</button>
					<button type="button" class="d3-action d3-add">&#43; Dateien</button>
					<input class="d3-picker" type="file" multiple hidden />
				</header>
				<div class="d3-notice" role="status" aria-live="polite"></div>
				<div class="d3-body">
					<div class="d3-list" aria-label="Dokumentliste"></div>
					<section class="d3-preview" aria-label="Dokumentvorschau">
						<header class="d3-preview-head"><strong>Vorschau</strong><button class="d3-icon d3-download" type="button" title="Herunterladen" aria-label="Herunterladen" disabled>&#8595;</button></header>
						<div class="d3-preview-content"><p class="d3-empty">Kein Dokument ausgewaehlt.</p></div>
					</section>
				</div>
				<section class="d3-upload" hidden>
					<div class="d3-upload-head"><strong>Upload <span class="d3-queue-count"></span></strong><span class="d3-upload-result" role="status"></span><button type="button" class="d3-action d3-send" disabled>&#8593; Hochladen</button></div>
					<div class="d3-queue"></div>
				</section>`;
			this.ui = {};
			['search', 'refresh', 'add', 'picker', 'notice', 'list', 'count', 'download', 'preview-content',
				'preview-head', 'send', 'drop', 'queue', 'queue-count', 'upload-result', 'upload'].forEach((name) => {
				this.ui[name] = this.root.querySelector('.d3-' + name);
			});
			const table = container.closest('.viewquery-table') || container.querySelector('.viewquery-table') ||
				container.closest('table') || container.querySelector('table');
			if (table) {
				this.hiddenTable = table;
				this.previousDisplay = table.style.display;
				this.previousDisplayPriority = table.style.getPropertyPriority('display');
				table.style.setProperty('display', 'none', 'important');
				table.after(this.shell);
			} else {
				container.append(this.shell);
			}
			this.ui.search.addEventListener('input', () => this.renderList());
			this.ui.refresh.addEventListener('click', () => this.refresh());
			this.ui.add.addEventListener('click', () => this.ui.picker.click());
			this.ui.drop.addEventListener('click', () => this.ui.picker.click());
			this.ui.picker.addEventListener('change', () => {
				this.addFiles(this.ui.picker.files);
				this.ui.picker.value = '';
			});
			this.ui.send.addEventListener('click', () => this.upload());
			this.ui.download.addEventListener('click', () => this.download(this.selected));
			this.root.addEventListener('dragover', (event) => {
				event.preventDefault();
				if (Array.from(event.dataTransfer.types).includes('Files')) this.root.classList.add('d3-dragover');
			});
			this.root.addEventListener('dragleave', (event) => {
				if (!this.root.contains(event.relatedTarget)) this.root.classList.remove('d3-dragover');
			});
			this.root.addEventListener('drop', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.root.classList.remove('d3-dragover');
				this.addFiles(event.dataTransfer.files);
			});
			this.resizeFrame = 0;
			const updateSize = () => {
				this.resizeFrame = 0;
				if (this.destroyed || !this.root.isConnected) return;
				const top = this.root.getBoundingClientRect().top;
				let bottom = root.innerHeight - 16;
				let ancestor = this.root.parentElement;
				while (ancestor && ancestor !== root.document.body) {
					const style = root.getComputedStyle(ancestor);
					if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
						bottom = Math.min(bottom, ancestor.getBoundingClientRect().bottom -
							(parseFloat(style.borderBottomWidth) || 0) - (parseFloat(style.paddingBottom) || 0));
					}
					ancestor = ancestor.parentElement;
				}
				const height = Math.max(0, Math.floor(bottom - Math.max(0, top))) + 'px';
				if (this.root.style.getPropertyValue('--d3-height') !== height) {
					this.root.style.setProperty('--d3-height', height);
				}
			};
			this.resize = () => {
				if (!this.destroyed && !this.resizeFrame) this.resizeFrame = root.requestAnimationFrame(updateSize);
			};
			root.addEventListener('resize', this.resize);
			this.releaseParentLayout = acquireParentLayout();
			updateSize();
			if (root.ResizeObserver) {
				this.resizeObserver = new root.ResizeObserver(this.resize);
				this.resizeObserver.observe(this.root.parentElement);
			}
			this.observer = new root.MutationObserver(() => {
				if (!this.root.isConnected || !this.container.isConnected) this.destroy();
			});
			this.observer.observe(root.document.body, { childList: true, subtree: true });
		}

		destroy() {
			if (this.destroyed) return;
			this.destroyed = true;
			this.generation += 1;
			this.queue = [];
			this.clearPreview();
			root.removeEventListener('resize', this.resize);
			if (this.resizeFrame) root.cancelAnimationFrame(this.resizeFrame);
			this.observer.disconnect();
			if (this.resizeObserver) this.resizeObserver.disconnect();
			this.releaseParentLayout();
			if (this.hiddenTable) this.hiddenTable.style.setProperty('display', this.previousDisplay, this.previousDisplayPriority);
			this.shell.remove();
			instances.delete(this.container);
		}

		setContext(context, initialPayload) {
			if (this.context && this.context.key === context.key) return this.refresh();
			this.generation += 1;
			this.context = context;
			this.queue = [];
			this.documents = [];
			this.types = [];
			this.selected = null;
			this.closedGroups.clear();
			this.ui.search.value = '';
			this.ui['upload-result'].textContent = '';
			this.clearPreview();
			this.ui['preview-head'].querySelector('strong').textContent = 'Vorschau';
			this.ui.download.disabled = true;
			this.previewMessage('Kein Dokument ausgewaehlt.');
			this.renderQueue();
			return this.refresh(initialPayload);
		}

		notice(message, error) {
			this.ui.notice.textContent = message;
			this.ui.notice.classList.toggle('d3-error', !!error);
		}

		async refresh(initialPayload) {
			const generation = this.generation;
			const loadNumber = ++this.loadNumber;
			const context = this.context;
			const active = () => !this.destroyed && generation === this.generation && loadNumber === this.loadNumber;
			this.ui.refresh.disabled = true;
			this.notice('Dokumente werden geladen ...');
			try {
				const queryPromise = Promise.resolve().then(() => initialPayload || loadQueryPayload(context));
				const results = await Promise.allSettled([
					Promise.resolve().then(() => soap('flexmobility/utils').getFileListAsXml(context.table, context.id)), queryPromise
				]);
				if (!active()) return;
				let typeError = '';
				this.typesFallback = false;
				if (results[1].status === 'fulfilled') {
					try {
						this.types = parseDocumentTypes(results[1].value.types);
						if (!this.types.length) {
							this.types = ['Schriftverkehr'];
							this.typesFallback = true;
						}
					} catch (error) { this.types = []; typeError = error.message; }
				} else { this.types = []; typeError = results[1].reason.message; }
				if (this.types.includes('Schriftverkehr')) {
					this.queue.forEach((item) => {
						if (item.status === 'pending' && (this.typesFallback || (!item.doctype && !item.doctypeTouched))) item.doctype = 'Schriftverkehr';
					});
				}
				this.renderQueue();
				if (results[0].status === 'rejected') throw results[0].reason;
				let documents = normalizeDocuments(results[0].value, this.config.d3BaseUrl);
				const repositories = [...new Set(documents.filter((document) => !document.linkError).map((document) => document.repository))];
				const repositoryId = this.config.sqlRepositoryId || (repositories.length === 1 ? repositories[0] : '');
				if (repositoryId) {
					try {
						if (results[1].status === 'rejected') throw results[1].reason;
						documents = enrichDocuments(documents, results[1].value.metadata, repositoryId);
					} catch (error) {
						documents.forEach((document) => { document.metadataError = 'Quickview-Metadaten: ' + error.message; });
					}
				} else {
					documents.forEach((document) => {
						if (document.id) document.metadataError = 'Archiv nicht eindeutig. sqlRepositoryId konfigurieren.';
					});
				}
				if (!active()) return;
				const previous = this.selected;
				this.documents = documents;
				this.selected = previous ? documents.find((document) => document.url && document.url === previous.url && document.id === previous.id) || null : null;
				if (previous && !this.selected) {
					this.clearPreview();
					this.previewMessage('Das ausgewaehlte Dokument ist nicht mehr in der Liste.');
					this.ui.download.disabled = true;
				}
				this.renderList();
				const problems = documents.filter((document) => document.metadataError || document.linkError).length;
				this.notice(documents.length + ' Dokumente' + (problems ? ' | ' + problems + ' mit Integrationsfehlern.' : '') +
					(typeError ? ' | Dokumentarten konnten nicht geladen werden: ' + typeError : ''), problems > 0 || !!typeError);
			} catch (error) {
				if (!active()) return;
				this.documents = [];
				this.selected = null;
				this.clearPreview();
				this.previewMessage('Dokumentliste konnte nicht geladen werden.');
				this.ui.download.disabled = true;
				this.renderList();
				this.notice(error.message || String(error), true);
			} finally {
				if (active()) this.ui.refresh.disabled = false;
			}
		}

		renderList() {
			const scroll = this.ui.list.scrollTop;
			this.ui.list.replaceChildren();
			this.ui.count.textContent = '(' + this.documents.length + ')';
			const search = text(this.ui.search.value).toLocaleLowerCase('de');
			const documents = this.documents.filter((document) => [document.name, document.type, document.description, document.language,
				document.revision, document.date].join(' ').toLocaleLowerCase('de').includes(search));
			if (!documents.length) this.ui.list.append(element('p', 'd3-empty', search ? 'Keine Treffer.' : 'Keine Dokumente vorhanden.'));
			const groups = new Map();
			documents.forEach((document) => {
				if (!groups.has(document.type)) groups.set(document.type, []);
				groups.get(document.type).push(document);
			});
			Array.from(groups.keys()).sort((left, right) => left.localeCompare(right, 'de')).forEach((type) => {
				const group = element('details', 'd3-group');
				group.open = !this.closedGroups.has(type);
				group.append(element('summary', '', type + ' (' + groups.get(type).length + ')'));
				group.addEventListener('toggle', () => {
					if (!group.isConnected) return;
					if (group.open) this.closedGroups.delete(type); else this.closedGroups.add(type);
				});
				groups.get(type).sort((left, right) => left.name.localeCompare(right.name, 'de', { numeric: true })).forEach((document) => {
					const row = element('div', 'd3-document');
					row.classList.toggle('d3-selected', this.selected === document);
					const select = element('button', 'd3-document-select');
					select.type = 'button';
					select.setAttribute('aria-pressed', String(this.selected === document));
					select.append(element('span', 'd3-filetype', document.extension.toUpperCase() || 'DATEI'), element('strong', 'd3-filename', document.name));
					select.addEventListener('click', () => this.select(document));
					select.draggable = !!document.url;
					select.title = document.name;
					select.addEventListener('dragstart', (event) => {
						if (!document.url) { event.preventDefault(); return; }
						const name = document.name.replace(/[\\/:*?"<>|\r\n]/g, '_');
						event.dataTransfer.effectAllowed = 'copy';
						event.dataTransfer.setData('DownloadURL', mimeType(document.extension) + ':' + name + ':' + proxyUrl(document));
					});
					const download = iconButton('\u2193', 'Herunterladen: ' + document.name);
					download.disabled = !document.url;
					download.addEventListener('click', () => this.download(document));
					row.append(select, download);
					const details = element('dl', 'd3-metadata');
					[['Beschreibung', document.description], ['Sprache', document.language], ['Revision', document.revision],
						['Datum', document.date], ['Groesse', document.size === null ? null : formatSize(document.size)]].forEach(([label, value]) => {
						const cell = element('div');
						cell.append(element('dt', '', label), element('dd', '', value === null ? 'Nicht verfuegbar' : value || '-'));
						details.append(cell);
					});
					row.append(details);
					if (document.metadataError || document.linkError) row.append(element('p', 'd3-row-error', [document.linkError, document.metadataError].filter(Boolean).join(' ')));
					group.append(row);
				});
				this.ui.list.append(group);
			});
			this.ui.list.scrollTop = scroll;
		}

		clearPreview() {
			this.previewNumber += 1;
			if (this.previewAbort) this.previewAbort.abort();
			if (this.previewObjectUrl) root.URL.revokeObjectURL(this.previewObjectUrl);
			this.previewObjectUrl = '';
		}

		previewMessage(message) {
			this.ui['preview-content'].replaceChildren(element('p', 'd3-empty', message));
		}

		async fetchBlob(document, signal) {
			if (!document || !document.url) throw new Error('Kein gueltiger Downloadpfad vorhanden.');
			const response = await root.fetch(proxyUrl(document), { credentials: 'same-origin', signal: signal });
			if (!response.ok || response.redirected) throw new Error('Dateiabruf fehlgeschlagen (HTTP ' + response.status + '). Anmeldung pruefen.');
			const blob = await response.blob();
			if (/text\/html/i.test(blob.type) && document.extension !== 'html' && document.extension !== 'htm') {
				throw new Error('Der Dateiproxy hat eine HTML-Seite statt der Datei geliefert.');
			}
			return blob;
		}

		async select(document) {
			this.clearPreview();
			this.selected = document;
			this.renderList();
			this.ui['preview-head'].querySelector('strong').textContent = document.name;
			this.ui.download.disabled = !document.url;
			if (!document.url) { this.previewMessage(document.linkError); return; }
			const mime = mimeType(document.extension);
			const number = this.previewNumber;
			this.previewAbort = new root.AbortController();
			if (textExtensions.has(document.extension)) {
				this.previewMessage('Textvorschau wird geladen ...');
				try {
					const blob = await this.fetchBlob(document, this.previewAbort.signal);
					const content = await readTextPreview(blob, document.extension);
					if (this.destroyed || number !== this.previewNumber) return;
					const preview = element('pre', 'd3-text-preview', content);
					preview.setAttribute('aria-label', 'Textinhalt von ' + document.name);
					this.ui['preview-content'].replaceChildren(preview);
				} catch (error) {
					if (number === this.previewNumber && error.name !== 'AbortError') this.previewMessage(error.message);
				}
				return;
			}
			if (mime === 'application/octet-stream') {
				const previewUrl = d3PreviewUrl(document);
				if (!previewUrl) { this.previewMessage('Fuer dieses Dateiformat ist keine Vorschau verfuegbar.'); return; }
				const wrapper = element('div', 'd3-dms-preview');
				const preview = element('iframe', 'd3-preview-media');
				preview.title = 'D3-Vorschau: ' + document.name;
				preview.src = previewUrl;
				const link = element('a', 'd3-preview-link', 'D3-Vorschau in neuem Fenster oeffnen');
				link.href = previewUrl;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				wrapper.append(preview, link);
				this.ui['preview-content'].replaceChildren(wrapper);
				return;
			}
			this.previewMessage('Vorschau wird geladen ...');
			try {
				const blob = await this.fetchBlob(document, this.previewAbort.signal);
				if (this.destroyed || number !== this.previewNumber) return;
				this.previewObjectUrl = root.URL.createObjectURL(new root.Blob([blob], { type: mime }));
				const preview = element(mime === 'application/pdf' ? 'iframe' : 'img', 'd3-preview-media');
				preview.setAttribute(mime === 'application/pdf' ? 'title' : 'alt', document.name);
				preview.src = this.previewObjectUrl;
				preview.addEventListener('error', () => {
					if (number === this.previewNumber) this.previewMessage('Vorschau konnte nicht angezeigt werden.');
				});
				this.ui['preview-content'].replaceChildren(preview);
			} catch (error) {
				if (number === this.previewNumber && error.name !== 'AbortError') this.previewMessage(error.message);
			}
		}

		async download(document) {
			const generation = this.generation;
			try {
				const blob = await this.fetchBlob(document);
				if (this.destroyed || generation !== this.generation) return;
				const url = root.URL.createObjectURL(blob);
				const link = element('a');
				link.href = url;
				link.download = document.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
				link.hidden = true;
				root.document.body.append(link);
				link.click();
				link.remove();
				root.setTimeout(() => root.URL.revokeObjectURL(url), 60000);
			} catch (error) {
				if (!this.destroyed && generation === this.generation) this.notice(error.message, true);
			}
		}

		addFiles(files) {
			if (!this.context) return;
			Array.from(files || []).forEach((file) => {
				if (this.queue.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) return;
				this.queue.push({ key: ++this.sequence, file: file, filename: file.name,
					description: file.name.replace(/\.[^.]+$/, ''), doctype: this.types.includes('Schriftverkehr') ? 'Schriftverkehr' : '',
					language: '', revision: '', status: 'pending', error: '' });
			});
			this.renderQueue();
		}

		renderQueue() {
			this.ui.upload.hidden = this.queue.length === 0;
			this.ui.queue.replaceChildren();
			this.ui['queue-count'].textContent = '(' + this.queue.length + ')';
			this.ui.send.disabled = this.busy || !this.types.length || !this.queue.some((item) => item.status === 'pending');
			this.queue.forEach((item) => {
				const row = element('div', 'd3-upload-row');
				row.dataset.state = item.status;
				row.dataset.key = String(item.key);
				row.append(element('div', 'd3-upload-source', item.file.name + ' (' + formatSize(item.file.size) + ')'));
				const locked = item.status === 'uploading' || item.status === 'uncertain';
				const field = (label, name, options) => {
					const wrapper = element('label', 'd3-field');
					wrapper.append(element('span', '', label));
					const control = element(options ? 'select' : 'input');
					control.name = name;
					if (options) {
						options.forEach(([value, caption]) => {
							const option = element('option', '', caption);
							option.value = value;
							control.append(option);
						});
					} else control.type = 'text';
					control.value = item[name];
					control.disabled = locked;
					control.required = name === 'filename' || name === 'doctype';
					const updateValue = () => {
						item[name] = control.value;
						if (name === 'doctype') item.doctypeTouched = true;
						item.error = '';
						row.querySelector('.d3-row-error').textContent = '';
					};
					control.addEventListener('input', updateValue);
					control.addEventListener('change', updateValue);
					wrapper.append(control);
					row.append(wrapper);
				};
				field('Dateiname *', 'filename');
				field('Beschreibung', 'description');
				const typePlaceholder = this.typesFallback && this.types.length ? [] : [['', this.types.length ? 'Auswaehlen' : 'Keine Dokumentarten geladen']];
				field('Dokumentart *', 'doctype', typePlaceholder.concat(this.types.map((type) => [type, type])));
				field('Sprache', 'language', languages);
				field('Revision', 'revision');
				const remove = iconButton('\u00d7', 'Aus Warteschlange entfernen');
				remove.disabled = item.status === 'uploading';
				remove.addEventListener('click', () => {
					this.queue = this.queue.filter((queued) => queued !== item);
					this.renderQueue();
				});
				row.append(remove);
				if (item.status === 'uploading') row.append(element('span', 'd3-upload-state', 'Wird hochgeladen ...'));
				const error = element('p', 'd3-row-error', item.error);
				error.setAttribute('role', 'status');
				row.append(error);
				if (item.status === 'uncertain') {
					const retry = element('button', 'd3-retry', 'Erneut freigeben');
					retry.type = 'button';
					retry.addEventListener('click', () => {
						if (!root.confirm('Der Upload kann bereits gespeichert sein. Haben Sie im Archiv geprueft, dass kein Duplikat entsteht?')) return;
						item.status = 'pending';
						item.error = '';
						this.renderQueue();
					});
					row.append(retry);
				}
				this.ui.queue.append(row);
			});
		}

		async upload() {
			if (this.busy || !this.context || !this.types.length) return;
			this.busy = true;
			const generation = this.generation;
			const context = Object.assign({}, this.context);
			const active = () => !this.destroyed && generation === this.generation;
			const items = this.queue.filter((item) => item.status === 'pending');
			let successes = 0;
			let failures = 0;
			try {
				for (const item of items) {
					if (!active()) break;
					if (!this.queue.includes(item)) continue;
					const row = this.ui.queue.querySelector('.d3-upload-row[data-key="' + item.key + '"]');
					if (row) {
						['filename', 'description', 'doctype', 'language', 'revision'].forEach((name) => {
							const control = row.querySelector('[name="' + name + '"]');
							if (control) item[name] = control.value;
						});
					}
					item.filename = text(item.filename);
					item.error = validateDraft(item, this.types);
					if (item.error) { failures += 1; continue; }
					item.status = 'uploading';
					this.renderQueue();
					const form = new root.FormData();
					Object.entries({ filename: item.filename, Description: text(item.description), DocumentType: item.doctype,
						sprache: text(item.language), Revision: text(item.revision),
						NavTable: context.table, Id: context.id }).forEach(([key, value]) => form.append(key, value));
					form.append('FileChooser', item.file);
					try {
						const response = await root.fetch('../custom/Anp_DMSUploadTarget.aspx', { method: 'POST', credentials: 'same-origin', body: form });
						const body = await response.text();
						if (!response.ok) {
							item.status = response.status >= 500 ? 'uncertain' : 'pending';
							throw new Error('Upload fehlgeschlagen (HTTP ' + response.status + ').');
						}
						const confirmed = !response.redirected && (typeof this.config.confirmUpload === 'function'
							? await this.config.confirmUpload(body, response) : assessUpload(body));
						if (confirmed !== true) {
							item.status = 'uncertain';
							item.error = 'Servererfolg nicht eindeutig bestaetigt. Archiv pruefen, bevor erneut gesendet wird.';
							failures += 1;
						} else {
							successes += 1;
							if (active()) this.queue = this.queue.filter((queued) => queued !== item);
						}
					} catch (error) {
						if (item.status === 'uploading') item.status = error.uploadRejected ? 'pending' : 'uncertain';
						item.error = error.message || 'Upload fehlgeschlagen.';
						failures += 1;
					}
					if (active()) this.renderQueue();
				}
			} finally {
				this.busy = false;
				if (!this.destroyed) this.renderQueue();
				if (active()) {
					this.ui['upload-result'].textContent = successes + ' erfolgreich, ' + failures + ' zu pruefen';
					await this.refresh();
				}
			}
		}
	}

	function mount(guid, tableContainer) {
		const queryId = text(guid).replace(/[{}]/g, '').toUpperCase();
		const knownQuery = queryId === QUERY_GUID || queryId === 'D3_004';
		const container = tableContainer && tableContainer.jquery ? tableContainer[0] : tableContainer;
		if (!container || container.nodeType !== 1) {
			if (knownQuery) throw new Error('D3_004: Tabellencontainer fehlt.');
			return;
		}
		let view = instances.get(container);
		const contextRow = container.matches('tr[data-id][data-tabelle]') ? container : container.querySelector('tr[data-id][data-tabelle]');
		if (!knownQuery && !contextRow && !view) return;
		if (view && !view.root.isConnected) { view.destroy(); view = null; }
		try {
			const context = readContext(container);
			const warning = container.querySelector('.d3-context-error');
			if (warning) warning.remove();
			if (!view) {
				const config = Object.assign({ d3BaseUrl: DEFAULT_D3_BASE, sqlRepositoryId: '' }, root.D3DocumentViewConfig || {});
				view = new DocumentView(container, config);
				instances.set(container, view);
			}
			return view.setContext(context, readTablePayload(container, context));
		} catch (error) {
			if (view) view.destroy();
			let warning = container.querySelector('.d3-context-error');
			if (!warning) { warning = element('p', 'd3-context-error'); container.append(warning); }
			warning.textContent = error.message;
			warning.setAttribute('role', 'alert');
		}
	}

	if (typeof module === 'object' && module.exports) {
		module.exports = { parseRows, toRecord, normalizeDocuments, enrichDocuments, formatSize, validateDraft, validateContext, assessUpload, parseQueryPayload, formatTextPreview, d3PreviewUrl };
	} else if (!root.D3DocumentView) {
		root.D3DocumentView = { mount: mount };
		const pending = root.D3DocumentViewPending || [];
		root.D3DocumentViewPending = [];
		pending.forEach((entry) => mount(entry.guid, entry.container));
	}
})(typeof window === 'object' ? window : globalThis);
