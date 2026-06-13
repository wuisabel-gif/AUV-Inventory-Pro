'use strict';

// --------------------------------------------------------------------------
// AUV Inventory Pro — renderer (UI logic)
// --------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Per-category accent colors — used for sidebar dots and row chips so the eye
// can sort the table by component family at a glance.
const CAT_COLORS = {
  Resistors: '#ffb86b',
  Capacitors: '#5ad1ff',
  'Diodes/LEDs': '#ff7b9c',
  Inductors: '#b58cff',
  ICs: '#5af0c2',
  Connectors: '#ffd86b',
};
const catColor = (c) => CAT_COLORS[c] || '#7fa6c9';

// Sourcing status, inferred from the BOM fields (see the spreadsheet Legend):
// a link to a live Digi-Key product page = verified; a manufacturer part number
// without a detail link = standard numbering to confirm; nothing = needs lookup.
function sourcing(item) {
  if ((item.dkLink || '').includes('/products/detail/')) return { key: 'verified', label: 'Verified', color: 'var(--good)' };
  if (item.mfrPart) return { key: 'std', label: 'Confirm stock', color: 'var(--warn)' };
  if (item.dkLink || /needs confirmation/i.test(item.notes || '')) return { key: 'check', label: 'Needs confirm', color: 'var(--danger)' };
  return null;
}

let db = { categories: [], items: [], lastUpdated: null };
let activeCategory = 'All'; // 'All' or a category name
let query = '';
let sortMode = 'value';
let lowStockOnly = false;
let sourcingFilter = 'all';

// ---- helpers -------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Tokenized substring search: every whitespace-separated term must appear
// somewhere in the item's combined searchable text. Order-independent, so
// "0402 0.1uf" matches "0.1uF 0402".
function matches(item, terms) {
  if (!terms.length) return true;
  const hay = `${item.category} ${item.value} ${item.package} ${item.location} ${item.notes} ${item.mfrPart || ''} ${item.dkPart || ''}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function highlight(text, terms) {
  let out = escapeHtml(text || '');
  if (!terms.length || !text) return out;
  // Highlight the longest terms first to avoid nested-match weirdness.
  for (const t of [...terms].sort((a, b) => b.length - a.length)) {
    if (!t) continue;
    const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

function isLow(item) {
  return item.quantity <= (item.lowStockThreshold ?? 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2200);
}

// ---- rendering -----------------------------------------------------------

function visibleItems() {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let items = db.items.filter((i) => {
    if (activeCategory !== 'All' && i.category !== activeCategory) return false;
    if (lowStockOnly && !isLow(i)) return false;
    if (sourcingFilter !== 'all') {
      const s = sourcing(i);
      if ((s ? s.key : 'none') !== sourcingFilter) return false;
    }
    return matches(i, terms);
  });

  const byValue = (a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' });
  const sorters = {
    value: byValue,
    'qty-desc': (a, b) => b.quantity - a.quantity || byValue(a, b),
    'qty-asc': (a, b) => a.quantity - b.quantity || byValue(a, b),
    package: (a, b) => a.package.localeCompare(b.package, undefined, { numeric: true }) || byValue(a, b),
    updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
  };
  items.sort(sorters[sortMode] || byValue);
  return { items, terms };
}

function renderCategories() {
  const counts = { All: db.items.length };
  for (const c of db.categories) counts[c] = 0;
  for (const i of db.items) counts[i.category] = (counts[i.category] || 0) + 1;

  const cats = ['All', ...db.categories];
  $('#cats').innerHTML = cats
    .map(
      (c) => `
      <div class="cat ${c === activeCategory ? 'active' : ''}" data-cat="${escapeHtml(c)}" style="--c:${c === 'All' ? 'var(--accent)' : catColor(c)}">
        <span class="cat-label"><span class="dot"></span>${c === 'All' ? 'All parts' : escapeHtml(c)}</span>
        <span class="count">${counts[c] || 0}</span>
      </div>`
    )
    .join('');
  $$('#cats .cat').forEach((el) =>
    el.addEventListener('click', () => {
      activeCategory = el.dataset.cat;
      render();
    })
  );
}

function renderStats(items) {
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const lowCount = items.filter(isLow).length;
  const cards = [
    { num: items.length, lbl: 'Line items', accent: 'var(--accent-2)' },
    { num: totalUnits, lbl: 'Total units', accent: 'var(--accent)' },
    { num: lowCount, lbl: 'Low / out', warn: lowCount > 0, accent: lowCount > 0 ? 'var(--warn)' : 'var(--good)' },
  ];
  $('#stats').innerHTML = cards
    .map(
      (c) =>
        `<div class="stat ${c.warn ? 'warn' : ''}" style="--c:${c.accent}"><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`
    )
    .join('');
}

function renderRows(items, terms) {
  const tbody = $('#rows');
  const empty = $('#empty');
  if (!items.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    $('#empty-text').textContent = db.items.length
      ? 'No parts match your search.'
      : 'Inventory is empty — add your first part.';
    return;
  }
  empty.hidden = true;
  tbody.innerHTML = items
    .map((i) => {
      const qtyClass = i.quantity === 0 ? 'zero' : isLow(i) ? 'low' : '';
      const lowBadge = i.quantity === 0
        ? '<span class="low-badge">OUT</span>'
        : isLow(i)
        ? '<span class="low-badge">LOW</span>'
        : '';
      const src = sourcing(i);
      return `
      <tr data-id="${i.id}" style="--c:${catColor(i.category)}">
        <td><span class="tag"><span class="dot"></span>${escapeHtml(i.category)}</span></td>
        <td class="val-cell">${highlight(i.value, terms) || '<span class="muted">—</span>'}</td>
        <td class="pkg-cell">${i.package ? `<span class="pkg-chip">${highlight(i.package, terms)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="mfr-cell">${
          i.mfrPart
            ? `<span class="mfr-part">${highlight(i.mfrPart, terms)}</span>`
            : '<span class="muted">—</span>'
        }${src ? `<span class="src-badge" style="--c:${src.color}" title="${src.label}">${src.label}</span>` : ''}</td>
        <td class="muted notes-cell">${i.notes ? highlight(i.notes, terms) : '—'}</td>
        <td class="col-qty">
          <div class="qty-control">
            <button class="step" data-act="dec" title="Remove one">−</button>
            <span class="qty-num ${qtyClass}">${i.quantity}</span>
            <button class="step" data-act="inc" title="Add one">+</button>
            ${lowBadge}
          </div>
        </td>
        <td class="col-act">
          <div class="row-acts">
            ${i.dkLink ? '<button class="row-act" data-act="link" title="Open Digi-Key page">↗</button>' : ''}
            <button class="row-act" data-act="edit" title="Edit">✎</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.id;
    const item = db.items.find((x) => x.id === id);
    tr.querySelector('[data-act="inc"]').addEventListener('click', () => adjust(id, +1));
    tr.querySelector('[data-act="dec"]').addEventListener('click', () => adjust(id, -1));
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => openModal(id));
    const link = tr.querySelector('[data-act="link"]');
    if (link) link.addEventListener('click', () => window.inventory.openLink(item.dkLink));
  });
}

function renderFooter() {
  $('#updated').textContent = 'Updated ' + fmtDate(db.lastUpdated);
}

function render() {
  const { items, terms } = visibleItems();
  renderCategories();
  renderStats(items);
  renderRows(items, terms);
  renderFooter();
}

// ---- data actions --------------------------------------------------------

async function refresh(newDb) {
  db = newDb || (await window.inventory.get());
  render();
}

async function adjust(id, delta) {
  db = await window.inventory.adjust(id, delta);
  render();
}

// ---- modal ---------------------------------------------------------------

function populateCategorySelect(sel) {
  sel.innerHTML = db.categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
}

function openModal(id) {
  const editing = !!id;
  const item = editing ? db.items.find((i) => i.id === id) : null;
  $('#modal-title').textContent = editing ? 'Edit part' : 'Add part';
  populateCategorySelect($('#f-category'));
  $('#f-id').value = id || '';
  $('#f-category').value = item ? item.category : activeCategory !== 'All' ? activeCategory : db.categories[0];
  $('#f-value').value = item ? item.value : '';
  $('#f-package').value = item ? item.package : '';
  $('#f-quantity').value = item ? item.quantity : 1;
  $('#f-threshold').value = item ? (item.lowStockThreshold ?? 0) : 0;
  $('#f-location').value = item ? item.location : '';
  $('#f-notes').value = item ? item.notes : '';
  $('#f-mfrPart').value = item ? item.mfrPart || '' : '';
  $('#f-dkPart').value = item ? item.dkPart || '' : '';
  $('#f-dkLink').value = item ? item.dkLink || '' : '';
  $('#f-delete').hidden = !editing;
  $('#modal').hidden = false;
  setTimeout(() => $('#f-value').focus(), 30);
}

function closeModal() {
  $('#modal').hidden = true;
}

async function saveFromModal(e) {
  e.preventDefault();
  const id = $('#f-id').value;
  const payload = {
    category: $('#f-category').value,
    value: $('#f-value').value.trim(),
    package: $('#f-package').value.trim(),
    quantity: parseInt($('#f-quantity').value, 10) || 0,
    lowStockThreshold: parseInt($('#f-threshold').value, 10) || 0,
    location: $('#f-location').value.trim(),
    notes: $('#f-notes').value.trim(),
    mfrPart: $('#f-mfrPart').value.trim(),
    dkPart: $('#f-dkPart').value.trim(),
    dkLink: $('#f-dkLink').value.trim(),
  };
  if (!payload.value) {
    toast('Value is required.');
    return;
  }
  if (id) {
    db = await window.inventory.update({ id, ...payload });
    toast('Updated ' + payload.value);
  } else {
    db = await window.inventory.add(payload);
    toast('Added ' + payload.value);
  }
  closeModal();
  render();
}

async function deleteFromModal() {
  const id = $('#f-id').value;
  if (!id) return;
  const item = db.items.find((i) => i.id === id);
  if (!confirm(`Delete "${item ? item.value : 'this part'}"? This cannot be undone.`)) return;
  db = await window.inventory.remove(id);
  closeModal();
  render();
  toast('Deleted');
}

// ---- wiring --------------------------------------------------------------

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function init() {
  $('#search').addEventListener(
    'input',
    debounce((e) => {
      query = e.target.value;
      render();
    }, 90)
  );
  $('#sort').addEventListener('change', (e) => {
    sortMode = e.target.value;
    render();
  });
  $('#lowstock-only').addEventListener('change', (e) => {
    lowStockOnly = e.target.checked;
    render();
  });
  $('#sourcing-filter').addEventListener('change', (e) => {
    sourcingFilter = e.target.value;
    render();
  });

  $('#btn-add').addEventListener('click', () => openModal(null));
  $('#f-cancel').addEventListener('click', closeModal);
  $('#f-delete').addEventListener('click', deleteFromModal);
  $('#part-form').addEventListener('submit', saveFromModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  $('#btn-export-json').addEventListener('click', async () => {
    const r = await window.inventory.exportJson();
    if (r.ok) toast('Exported JSON');
  });
  $('#btn-export-csv').addEventListener('click', async () => {
    const r = await window.inventory.exportCsv();
    if (r.ok) toast('Exported CSV');
  });
  $('#btn-import').addEventListener('click', async () => {
    if (!confirm('Importing replaces the current inventory (a backup is kept automatically). Continue?')) return;
    const r = await window.inventory.importJson();
    if (r.ok) {
      await refresh(r.db);
      toast('Imported inventory');
    }
  });
  $('#btn-reveal').addEventListener('click', () => window.inventory.revealData());

  // ---- Google Sheets sync ----
  async function openSyncModal() {
    const s = await window.sheets.getSettings();
    $('#s-url').value = s.sheetUrl || '';
    $('#s-token').value = s.sheetToken || '';
    $('#sync-status').className = 'sync-status';
    $('#sync-status').textContent = s.lastSync
      ? 'Last synced ' + new Date(s.lastSync).toLocaleString()
      : 'Not synced yet.';
    $('#sync-modal').hidden = false;
    setTimeout(() => $('#s-url').focus(), 30);
  }
  async function saveSyncSettings() {
    await window.sheets.saveSettings({ sheetUrl: $('#s-url').value, sheetToken: $('#s-token').value });
  }
  async function runSync() {
    await saveSyncSettings();
    const status = $('#sync-status');
    const btn = $('#s-sync');
    status.className = 'sync-status busy';
    status.textContent = 'Syncing…';
    btn.disabled = true;
    const r = await window.sheets.sync();
    btn.disabled = false;
    if (r.ok) {
      status.className = 'sync-status ok';
      status.textContent = `Synced ${r.count} parts to Google Sheets ✓`;
      toast(`Synced ${r.count} parts to Google Sheets`);
    } else {
      status.className = 'sync-status err';
      status.textContent = r.error || 'Sync failed.';
    }
  }
  $('#btn-sync').addEventListener('click', openSyncModal);
  $('#s-cancel').addEventListener('click', () => ($('#sync-modal').hidden = true));
  $('#s-save').addEventListener('click', async () => {
    await saveSyncSettings();
    toast('Sync settings saved');
    $('#sync-modal').hidden = true;
  });
  $('#s-sync').addEventListener('click', runSync);
  $('#sync-modal').addEventListener('click', (e) => {
    if (e.target.id === 'sync-modal') $('#sync-modal').hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#search').focus();
      $('#search').select();
    } else if (e.key === 'Escape') {
      if (!$('#modal').hidden) closeModal();
      if (!$('#sync-modal').hidden) $('#sync-modal').hidden = true;
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openModal(null);
    }
  });

  refresh();
}

window.addEventListener('DOMContentLoaded', init);
