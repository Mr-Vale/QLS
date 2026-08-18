/**
 * QLS — Quick Links & Status
 * app.js — tile management, drag-and-drop, status polling, settings
 */

'use strict';

/* ============================================================
   Constants & storage keys
   ============================================================ */
const STORAGE_TILES    = 'qls_tiles';
const STORAGE_SETTINGS = 'qls_settings';
const CONFIG_URL       = 'config.json';

/* ============================================================
   State
   ============================================================ */
let state = {
  tiles: [],
  settings: {
    title: 'QLS',
    subtitle: 'Quick Links & Status',
    statusEnabled: false,
    statusApiUrl: '/api/status',
    pollIntervalSeconds: 30,
  },
  status: {},         // { containerName: 'up'|'down'|'unknown' }
  editMode: false,
  pollTimer: null,
  dragSrcId: null,
};

/* ============================================================
   Utilities
   ============================================================ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_TILES, JSON.stringify(state.tiles));
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
  } catch (_) { /* storage unavailable */ }
}

function loadState() {
  try {
    const rawTiles = localStorage.getItem(STORAGE_TILES);
    if (rawTiles) state.tiles = JSON.parse(rawTiles);
    const rawSettings = localStorage.getItem(STORAGE_SETTINGS);
    if (rawSettings) state.settings = { ...state.settings, ...JSON.parse(rawSettings) };
  } catch (_) { /* ignore parse errors */ }
}

function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

/* ============================================================
   Toast notifications
   ============================================================ */
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'info', durationMs = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'none';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s ease';
    setTimeout(() => el.remove(), 320);
  }, durationMs);
}

/* ============================================================
   Render tiles
   ============================================================ */
const main = document.getElementById('main');

function renderTiles() {
  main.innerHTML = '';

  if (state.tiles.length === 0) {
    main.innerHTML = `
      <div class="tile-grid">
        <div class="empty-state">
          <div class="empty-state-icon">🏠</div>
          <p>No tiles yet. Click <strong>＋</strong> to add your first link.</p>
        </div>
      </div>`;
    return;
  }

  // Group tiles by category
  const grouped = {};
  const noCategory = '__none__';
  for (const tile of state.tiles) {
    const cat = tile.category || noCategory;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tile);
  }

  for (const [cat, tiles] of Object.entries(grouped)) {
    const section = document.createElement('section');
    section.className = 'category-section';
    section.dataset.category = cat;

    if (cat !== noCategory) {
      const label = document.createElement('div');
      label.className = 'category-label';
      label.textContent = cat;
      section.appendChild(label);
    }

    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    grid.setAttribute('role', 'list');

    for (const tile of tiles) {
      grid.appendChild(buildTileEl(tile));
    }

    section.appendChild(grid);
    main.appendChild(section);
  }

  // Update category datalist
  updateCategoryDatalist();
}

function buildTileEl(tile) {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = tile.url || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.dataset.id = tile.id;
  a.setAttribute('role', 'listitem');
  a.setAttribute('aria-label', tile.label);
  a.draggable = true;

  // Icon
  const iconEl = document.createElement('span');
  iconEl.className = 'tile-icon';
  if (tile.icon && isUrl(tile.icon)) {
    const img = document.createElement('img');
    img.src = tile.icon;
    img.alt = tile.label;
    img.loading = 'lazy';
    iconEl.appendChild(img);
  } else {
    iconEl.textContent = tile.icon || '🔗';
  }

  // Label
  const labelEl = document.createElement('div');
  labelEl.className = 'tile-label';
  labelEl.textContent = tile.label;

  // Description
  const descEl = document.createElement('div');
  descEl.className = 'tile-desc';
  descEl.textContent = tile.description || '';

  // Footer: status + drag handle
  const footer = document.createElement('div');
  footer.className = 'tile-footer';

  const statusDot = document.createElement('div');
  statusDot.className = 'status-dot';
  const statusKey = tile.container || tile.id;
  setStatusDotClass(statusDot, state.status[statusKey]);
  statusDot.title = tile.container ? `${tile.container}: ${state.status[statusKey] || 'unknown'}` : 'No container linked';
  if (!tile.container) statusDot.style.visibility = 'hidden';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Drag to reorder';
  dragHandle.innerHTML = '⋮⋮';
  dragHandle.setAttribute('aria-hidden', 'true');

  footer.appendChild(statusDot);
  footer.appendChild(dragHandle);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tile-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'tile-action-btn';
  editBtn.innerHTML = '✏';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', `Edit ${tile.label}`);
  editBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openEditModal(tile.id); });

  const moveUpBtn = document.createElement('button');
  moveUpBtn.className = 'tile-action-btn';
  moveUpBtn.innerHTML = '↑';
  moveUpBtn.title = 'Move up';
  moveUpBtn.setAttribute('aria-label', `Move ${tile.label} up`);
  moveUpBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); moveTile(tile.id, -1); });

  const moveDownBtn = document.createElement('button');
  moveDownBtn.className = 'tile-action-btn';
  moveDownBtn.innerHTML = '↓';
  moveDownBtn.title = 'Move down';
  moveDownBtn.setAttribute('aria-label', `Move ${tile.label} down`);
  moveDownBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); moveTile(tile.id, 1); });

  const delBtn = document.createElement('button');
  delBtn.className = 'tile-action-btn delete';
  delBtn.innerHTML = '✕';
  delBtn.title = 'Remove';
  delBtn.setAttribute('aria-label', `Remove ${tile.label}`);
  delBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(tile.id); });

  actions.appendChild(editBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(delBtn);

  a.appendChild(iconEl);
  a.appendChild(labelEl);
  if (tile.description) a.appendChild(descEl);
  a.appendChild(footer);
  a.appendChild(actions);

  // Drag-and-drop events
  a.addEventListener('dragstart', onDragStart);
  a.addEventListener('dragend', onDragEnd);
  a.addEventListener('dragover', onDragOver);
  a.addEventListener('dragleave', onDragLeave);
  a.addEventListener('drop', onDrop);

  return a;
}

function setStatusDotClass(el, status) {
  el.className = 'status-dot';
  if (status === 'up') el.classList.add('up');
  else if (status === 'down') el.classList.add('down');
  else if (status === 'checking') el.classList.add('checking');
  else el.classList.add('unknown');
}

/* ============================================================
   Category datalist
   ============================================================ */
function updateCategoryDatalist() {
  const dl = document.getElementById('category-list');
  if (!dl) return;
  const cats = [...new Set(state.tiles.map(t => t.category).filter(Boolean))];
  dl.innerHTML = cats.map(c => `<option value="${escHtml(c)}"></option>`).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   Drag-and-drop reorder (HTML5 DnD)
   ============================================================ */
function onDragStart(e) {
  state.dragSrcId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', state.dragSrcId);
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.tile.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target.dataset.id !== state.dragSrcId) {
    target.classList.add('drag-over');
  }
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove('drag-over');
  if (!state.dragSrcId || state.dragSrcId === targetId) return;

  const srcIdx = state.tiles.findIndex(t => t.id === state.dragSrcId);
  const tgtIdx = state.tiles.findIndex(t => t.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [moved] = state.tiles.splice(srcIdx, 1);
  state.tiles.splice(tgtIdx, 0, moved);
  saveState();
  renderTiles();
}

/* ============================================================
   Move tile up/down
   ============================================================ */
function moveTile(id, direction) {
  const idx = state.tiles.findIndex(t => t.id === id);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.tiles.length) return;
  const [t] = state.tiles.splice(idx, 1);
  state.tiles.splice(newIdx, 0, t);
  saveState();
  renderTiles();
}

/* ============================================================
   Add / Edit modal
   ============================================================ */
const tileModal       = document.getElementById('tile-modal');
const tileForm        = document.getElementById('tile-form');
const tileModalTitle  = document.getElementById('tile-modal-title');
const editIdInput     = document.getElementById('edit-id');
const fLabel          = document.getElementById('f-label');
const fUrl            = document.getElementById('f-url');
const fDesc           = document.getElementById('f-desc');
const fIcon           = document.getElementById('f-icon');
const fCategory       = document.getElementById('f-category');
const fContainer      = document.getElementById('f-container');
const iconPreviewBox  = document.getElementById('icon-preview-box');

function openAddModal() {
  tileModalTitle.textContent = 'Add Tile';
  editIdInput.value = '';
  tileForm.reset();
  updateIconPreview('🔗');
  openModal(tileModal);
  fLabel.focus();
}

function openEditModal(id) {
  const tile = state.tiles.find(t => t.id === id);
  if (!tile) return;
  tileModalTitle.textContent = 'Edit Tile';
  editIdInput.value = id;
  fLabel.value    = tile.label || '';
  fUrl.value      = tile.url || '';
  fDesc.value     = tile.description || '';
  fIcon.value     = tile.icon || '';
  fCategory.value = tile.category || '';
  fContainer.value = tile.container || '';
  updateIconPreview(tile.icon);
  openModal(tileModal);
  fLabel.focus();
}

function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Icon preview update
fIcon.addEventListener('input', () => updateIconPreview(fIcon.value.trim()));

function updateIconPreview(value) {
  iconPreviewBox.innerHTML = '';
  if (!value) { iconPreviewBox.textContent = '🔗'; return; }
  if (isUrl(value)) {
    const img = document.createElement('img');
    img.src = value;
    img.alt = 'icon';
    img.onerror = () => { iconPreviewBox.textContent = '🔗'; };
    iconPreviewBox.appendChild(img);
  } else {
    iconPreviewBox.textContent = value;
  }
}

// Form submit
tileForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const label = fLabel.value.trim();
  const url   = fUrl.value.trim();
  if (!label) { fLabel.focus(); showToast('Label is required.', 'error'); return; }
  if (!url)   { fUrl.focus();   showToast('URL is required.',   'error'); return; }

  const id = editIdInput.value || uid();
  const tile = {
    id,
    label,
    url,
    description: fDesc.value.trim(),
    icon: fIcon.value.trim(),
    category: fCategory.value.trim(),
    container: fContainer.value.trim(),
  };

  const existingIdx = state.tiles.findIndex(t => t.id === id);
  if (existingIdx !== -1) {
    state.tiles[existingIdx] = tile;
    showToast(`"${label}" updated.`, 'success');
  } else {
    state.tiles.push(tile);
    showToast(`"${label}" added.`, 'success');
  }

  saveState();
  renderTiles();
  closeModal(tileModal);
});

// Modal close buttons
document.getElementById('tile-modal-close').addEventListener('click', () => closeModal(tileModal));
document.getElementById('tile-form-cancel').addEventListener('click', () => closeModal(tileModal));
tileModal.addEventListener('click', (e) => { if (e.target === tileModal) closeModal(tileModal); });

/* ============================================================
   Confirm delete modal
   ============================================================ */
const confirmModal  = document.getElementById('confirm-modal');
const confirmMsg    = document.getElementById('confirm-msg');
const confirmOkBtn  = document.getElementById('confirm-ok');
let pendingDeleteId = null;

function confirmDelete(id) {
  const tile = state.tiles.find(t => t.id === id);
  if (!tile) return;
  pendingDeleteId = id;
  confirmMsg.textContent = `Remove "${tile.label}"?`;
  openModal(confirmModal);
}

confirmOkBtn.addEventListener('click', () => {
  if (!pendingDeleteId) return;
  const tile = state.tiles.find(t => t.id === pendingDeleteId);
  state.tiles = state.tiles.filter(t => t.id !== pendingDeleteId);
  pendingDeleteId = null;
  saveState();
  renderTiles();
  closeModal(confirmModal);
  if (tile) showToast(`"${tile.label}" removed.`, 'info');
});

document.getElementById('confirm-cancel').addEventListener('click',       () => closeModal(confirmModal));
document.getElementById('confirm-modal-close').addEventListener('click',  () => closeModal(confirmModal));
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeModal(confirmModal); });

/* ============================================================
   Edit mode toggle
   ============================================================ */
const editModeBtn = document.getElementById('btn-edit-mode');

editModeBtn.addEventListener('click', () => {
  state.editMode = !state.editMode;
  document.body.classList.toggle('edit-mode', state.editMode);
  editModeBtn.title = state.editMode ? 'Exit edit mode' : 'Toggle edit mode';
  showToast(state.editMode ? 'Edit mode ON — hover tiles to edit/move/delete.' : 'Edit mode OFF', 'info', 2000);
});

/* ============================================================
   Add button
   ============================================================ */
document.getElementById('btn-add').addEventListener('click', openAddModal);

/* ============================================================
   Settings panel
   ============================================================ */
const settingsPanel   = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');

function openSettings() {
  syncSettingsUI();
  settingsPanel.classList.add('open');
  settingsOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

function syncSettingsUI() {
  document.getElementById('s-title').value          = state.settings.title;
  document.getElementById('s-subtitle').value       = state.settings.subtitle;
  document.getElementById('s-status-enabled').checked = state.settings.statusEnabled;
  document.getElementById('s-status-url').value     = state.settings.statusApiUrl;
  document.getElementById('s-poll-interval').value  = state.settings.pollIntervalSeconds;
}

function readSettingsUI() {
  state.settings.title               = document.getElementById('s-title').value.trim()    || 'QLS';
  state.settings.subtitle            = document.getElementById('s-subtitle').value.trim() || 'Quick Links & Status';
  state.settings.statusEnabled       = document.getElementById('s-status-enabled').checked;
  state.settings.statusApiUrl        = document.getElementById('s-status-url').value.trim() || '/api/status';
  state.settings.pollIntervalSeconds = parseInt(document.getElementById('s-poll-interval').value, 10) || 30;
}

// Live-apply settings as user types
['s-title', 's-subtitle', 's-status-enabled', 's-status-url', 's-poll-interval'].forEach(id => {
  document.getElementById(id).addEventListener('change', applySettings);
});

function applySettings() {
  readSettingsUI();
  saveState();
  applyUISettings();
  restartStatusPolling();
}

function applyUISettings() {
  document.title = `${state.settings.title} — HomeLab Dashboard`;
  document.getElementById('site-title').innerHTML = `${escHtml(state.settings.title)} <span>·</span>`;
  document.getElementById('site-subtitle').textContent = state.settings.subtitle;
}

/* ============================================================
   Export / Import / Reset
   ============================================================ */
document.getElementById('s-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ settings: state.settings, tiles: state.tiles }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'qls-config.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Config exported.', 'success');
});

document.getElementById('s-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (Array.isArray(parsed.tiles)) state.tiles = parsed.tiles;
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      saveState();
      syncSettingsUI();
      applyUISettings();
      renderTiles();
      restartStatusPolling();
      showToast('Config imported.', 'success');
    } catch (_) {
      showToast('Invalid JSON file.', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('s-reset').addEventListener('click', () => {
  if (!confirm('Reset all tiles and settings to defaults?')) return;
  localStorage.removeItem(STORAGE_TILES);
  localStorage.removeItem(STORAGE_SETTINGS);
  state.tiles = [];
  state.settings = {
    title: 'QLS',
    subtitle: 'Quick Links & Status',
    statusEnabled: false,
    statusApiUrl: '/api/status',
    pollIntervalSeconds: 30,
  };
  loadDefaults().then(() => {
    syncSettingsUI();
    applyUISettings();
    renderTiles();
    restartStatusPolling();
    showToast('Reset to defaults.', 'info');
  });
});

/* ============================================================
   Container Status polling
   ============================================================ */
const statusBarDot  = document.getElementById('status-bar-dot');
const statusBarText = document.getElementById('status-bar-text');

async function pollStatus() {
  if (!state.settings.statusEnabled) return;
  // Mark all as checking
  state.status = {};
  document.querySelectorAll('.status-dot').forEach(el => setStatusDotClass(el, 'checking'));

  try {
    const resp = await fetch(state.settings.statusApiUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // Expected: { "portainer": "up", "grafana": "down", ... }
    state.status = data;
    statusBarDot.classList.add('live');
    statusBarText.textContent = `${Object.values(data).filter(v => v === 'up').length}/${Object.keys(data).length} up`;
    updateStatusDots();
  } catch (err) {
    statusBarDot.classList.remove('live');
    statusBarText.textContent = 'Status unreachable';
    updateStatusDots();
  }
}

function updateStatusDots() {
  document.querySelectorAll('.tile').forEach(tileEl => {
    const tile = state.tiles.find(t => t.id === tileEl.dataset.id);
    if (!tile) return;
    const dot = tileEl.querySelector('.status-dot');
    if (!dot) return;
    const key = tile.container || tile.id;
    setStatusDotClass(dot, state.status[key]);
    dot.title = tile.container ? `${tile.container}: ${state.status[key] || 'unknown'}` : '';
  });
}

function restartStatusPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (!state.settings.statusEnabled) {
    statusBarText.textContent = 'Status off';
    statusBarDot.classList.remove('live');
    return;
  }
  pollStatus();
  state.pollTimer = setInterval(pollStatus, state.settings.pollIntervalSeconds * 1000);
}

/* ============================================================
   Load defaults from config.json (first visit)
   ============================================================ */
async function loadDefaults() {
  try {
    const resp = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!resp.ok) return;
    const cfg = await resp.json();
    if (cfg.site) {
      if (cfg.site.title)    state.settings.title    = cfg.site.title;
      if (cfg.site.subtitle) state.settings.subtitle = cfg.site.subtitle;
    }
    if (cfg.status) {
      if (cfg.status.enabled !== undefined)      state.settings.statusEnabled       = cfg.status.enabled;
      if (cfg.status.apiUrl)                     state.settings.statusApiUrl        = cfg.status.apiUrl;
      if (cfg.status.pollIntervalSeconds)        state.settings.pollIntervalSeconds = cfg.status.pollIntervalSeconds;
    }
    if (Array.isArray(cfg.tiles)) {
      state.tiles = cfg.tiles.map(t => ({ id: t.id || uid(), ...t }));
    }
  } catch (_) { /* config.json not found — that's fine */ }
}

/* ============================================================
   Keyboard shortcuts
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (tileModal.classList.contains('open'))    closeModal(tileModal);
    if (confirmModal.classList.contains('open')) closeModal(confirmModal);
    if (settingsPanel.classList.contains('open')) closeSettings();
  }
  // Ctrl/Cmd + K → open add modal
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openAddModal();
  }
});

/* ============================================================
   Bootstrap
   ============================================================ */
async function init() {
  loadState();

  // First visit: load from config.json if no localStorage data
  if (state.tiles.length === 0) {
    await loadDefaults();
  }

  applyUISettings();
  renderTiles();
  restartStatusPolling();
}

init();
