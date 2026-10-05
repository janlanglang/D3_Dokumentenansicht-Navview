async function event_table_loaded(guid, tableContainer) {
  if (window.D3DocumentView) {
    return window.D3DocumentView.mount(guid, tableContainer);
  }
  window.D3DocumentViewPending = window.D3DocumentViewPending || [];
  window.D3DocumentViewPending.push({ guid: guid, container: tableContainer });
}