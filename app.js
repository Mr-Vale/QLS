/**
 * QLS — Quick Links & Status
 * app.js — tile management, drag-and-drop, reachability polling, settings
 */

'use strict';

/* ============================================================
   Constants & storage keys
   ============================================================ */
const STORAGE_TILES    = 'qls_tiles';
const STORAGE_SETTINGS = 'qls_settings';
const CONFIG_URL       = '/api/config';
const CONFIG_BG_URL    = '/api/config/background';

/* ============================================================
   State
   ============================================================ */
let state = {
  tiles: [],
  settings: {
    title: 'QLS',
    subtitle: 'Quick Links & Status',
    // Background
    backgroundImage: '',       // data URL or ''
    tileOpacity: 90,           // 10–100
    // Links
    openInNewTab: true,
    // Reachability (direct URL ping)
    reachabilityEnabled: false,
    reachIntervalSeconds: 30,
    // Docker status API (optional)
    statusEnabled: false,
    statusApiUrl: '/api/status',
    pollIntervalSeconds: 30,
  },
  status: {},         // { tileId|containerName: 'up'|'down'|'unknown' }
  editMode: false,
  pollTimer: null,
  reachTimer: null,
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
    // Don't save backgroundImage in settings JSON export (too large) — save separately
    const { backgroundImage, ...settingsWithoutBg } = state.settings;
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settingsWithoutBg));
    if (state.settings.backgroundImage) {
      localStorage.setItem('qls_bg', state.settings.backgroundImage);
    } else {
      localStorage.removeItem('qls_bg');
    }
  } catch (_) { /* storage unavailable */ }

  // Persist to server (best-effort, non-blocking)
  saveStateToServer();
}

function saveStateToServer() {
  const { backgroundImage, ...settingsWithoutBg } = state.settings;
  const payload = { settings: settingsWithoutBg, tiles: state.tiles };
  fetch(CONFIG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* server save failed — local save still valid */ });

  // Save background image separately (may be large — stored as a sidecar file)
  if (backgroundImage) {
    fetch(CONFIG_BG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: backgroundImage,
    }).catch(() => {});
  } else {
    fetch(CONFIG_BG_URL, { method: 'DELETE' }).catch(() => {});
  }
}

function loadState() {
  try {
    const rawTiles = localStorage.getItem(STORAGE_TILES);
    if (rawTiles) state.tiles = JSON.parse(rawTiles);
    const rawSettings = localStorage.getItem(STORAGE_SETTINGS);
    if (rawSettings) state.settings = { ...state.settings, ...JSON.parse(rawSettings) };
    const bg = localStorage.getItem('qls_bg');
    if (bg) state.settings.backgroundImage = bg;
  } catch (_) { /* ignore parse errors */ }
}

function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

function safeUrl(str) {
  try {
    const parsed = new URL(str);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? str : '#';
  } catch (_) {
    return '#';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  updateCategoryDatalist();
}

function buildTileEl(tile) {
  const showIcon   = tile.showIcon   !== false;
  const showTitle  = tile.showTitle  !== false;
  const showDesc   = tile.showDesc   !== false;
  const showStatus = tile.showStatus !== false;

  // Determine new-tab behaviour: per-tile override, else global setting
  const openNewTab = (tile.newTab !== undefined && tile.newTab !== null)
    ? tile.newTab
    : state.settings.openInNewTab;

  const a = document.createElement('a');
  a.className = 'tile';
  a.href = safeUrl(tile.url || '#');
  if (openNewTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.dataset.id = tile.id;
  a.setAttribute('role', 'listitem');
  a.setAttribute('aria-label', tile.label || 'Tile');
  a.draggable = true;

  // Icon
  if (showIcon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'tile-icon';
    if (tile.icon && isUrl(tile.icon)) {
      const img = document.createElement('img');
      img.src = safeUrl(tile.icon);
      img.alt = tile.label || '';
      img.loading = 'lazy';
      iconEl.appendChild(img);
    } else if (tile.icon && /^data:image\/[a-z+]+;base64,/.test(tile.icon)) {
      const img = document.createElement('img');
      img.src = tile.icon;
      img.alt = tile.label || '';
      img.loading = 'lazy';
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = tile.icon || '🔗';
    }
    a.appendChild(iconEl);
  }

  // Label
  if (showTitle) {
    const labelEl = document.createElement('div');
    labelEl.className = 'tile-label';
    labelEl.textContent = tile.label || '';
    a.appendChild(labelEl);
  }

  // Description
  if (showDesc && tile.description) {
    const descEl = document.createElement('div');
    descEl.className = 'tile-desc';
    descEl.textContent = tile.description;
    a.appendChild(descEl);
  }

  // Footer: status dot + drag handle
  const footer = document.createElement('div');
  footer.className = 'tile-footer';

  const statusDot = document.createElement('div');
  statusDot.className = 'status-dot';
  statusDot.dataset.tileid = tile.id;

  if (!showStatus) {
    statusDot.style.display = 'none';
  } else if (tile.container) {
    // Docker API status
    setStatusDotClass(statusDot, state.status[tile.container]);
    statusDot.title = `${tile.container}: ${state.status[tile.container] || 'unknown'}`;
  } else if (state.settings.reachabilityEnabled && tile.url) {
    // URL reachability status
    setStatusDotClass(statusDot, state.status[tile.id]);
    statusDot.title = tile.url;
  } else {
    statusDot.style.visibility = 'hidden';
  }

  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Drag to reorder';
  dragHandle.innerHTML = '⋮⋮';
  dragHandle.setAttribute('aria-hidden', 'true');

  footer.appendChild(statusDot);
  footer.appendChild(dragHandle);

  // Action buttons (only visible in edit mode via CSS)
  const actions = document.createElement('div');
  actions.className = 'tile-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'tile-action-btn';
  editBtn.innerHTML = '✏';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', `Edit ${tile.label || ''}`);
  editBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openEditModal(tile.id); });

  const moveUpBtn = document.createElement('button');
  moveUpBtn.className = 'tile-action-btn';
  moveUpBtn.innerHTML = '↑';
  moveUpBtn.title = 'Move up';
  moveUpBtn.setAttribute('aria-label', `Move ${tile.label || ''} up`);
  moveUpBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); moveTile(tile.id, -1); });

  const moveDownBtn = document.createElement('button');
  moveDownBtn.className = 'tile-action-btn';
  moveDownBtn.innerHTML = '↓';
  moveDownBtn.title = 'Move down';
  moveDownBtn.setAttribute('aria-label', `Move ${tile.label || ''} down`);
  moveDownBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); moveTile(tile.id, 1); });

  const delBtn = document.createElement('button');
  delBtn.className = 'tile-action-btn delete';
  delBtn.innerHTML = '✕';
  delBtn.title = 'Remove';
  delBtn.setAttribute('aria-label', `Remove ${tile.label || ''}`);
  delBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(tile.id); });

  actions.appendChild(editBtn);
  actions.appendChild(moveUpBtn);
  actions.appendChild(moveDownBtn);
  actions.appendChild(delBtn);

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
  // Preserve data-tileid attribute while resetting class
  const tileId = el.dataset.tileid;
  el.className = 'status-dot';
  if (tileId) el.dataset.tileid = tileId;
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
   Icon tab switching
   ============================================================ */
let selectedIconValue = ''; // the icon value chosen in the modal

document.querySelectorAll('.icon-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.icon-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`icon-panel-${btn.dataset.tab}`).classList.add('active');
  });
});

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
const fShowIcon       = document.getElementById('f-show-icon');
const fShowTitle      = document.getElementById('f-show-title');
const fShowDesc       = document.getElementById('f-show-desc');
const fShowStatus     = document.getElementById('f-show-status');
const fNewTab         = document.getElementById('f-new-tab');
const iconPreviewBox  = document.getElementById('icon-preview-box');

function resetIconTabs() {
  document.querySelectorAll('.icon-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.icon-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
  document.getElementById('si-results').innerHTML = '';
  document.getElementById('f-si-query').value = '';
  selectedIconValue = '';
}

function openAddModal() {
  tileModalTitle.textContent = 'Add Tile';
  editIdInput.value = '';
  tileForm.reset();
  fShowIcon.checked   = true;
  fShowTitle.checked  = true;
  fShowDesc.checked   = true;
  fShowStatus.checked = true;
  fNewTab.checked     = false;
  resetIconTabs();
  updateIconPreview('🔗');
  openModal(tileModal);
  fLabel.focus();
}

function openEditModal(id) {
  const tile = state.tiles.find(t => t.id === id);
  if (!tile) return;
  tileModalTitle.textContent = 'Edit Tile';
  editIdInput.value = id;
  fLabel.value     = tile.label || '';
  fUrl.value       = tile.url || '';
  fDesc.value      = tile.description || '';
  // Only populate the text input if the icon is an emoji/text (not a URL or data URL)
  const isIconUrl = tile.icon && (tile.icon.startsWith('data:') || isUrl(tile.icon));
  fIcon.value      = isIconUrl ? '' : (tile.icon || '');
  fCategory.value  = tile.category || '';
  fContainer.value = tile.container || '';
  fShowIcon.checked   = tile.showIcon   !== false;
  fShowTitle.checked  = tile.showTitle  !== false;
  fShowDesc.checked   = tile.showDesc   !== false;
  fShowStatus.checked = tile.showStatus !== false;
  fNewTab.checked     = !!tile.newTab;
  selectedIconValue   = tile.icon || '';
  resetIconTabs();
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

// Icon preview update (manual URL/emoji tab)
fIcon.addEventListener('input', () => {
  const val = fIcon.value.trim();
  selectedIconValue = val;
  updateIconPreview(val);
});

function updateIconPreview(value) {
  iconPreviewBox.textContent = '';
  if (!value) { iconPreviewBox.textContent = '🔗'; return; }

  if (value.startsWith('data:')) {
    // Only allow image data URLs to prevent setting non-image data as src
    if (!/^data:image\/[a-z+]+;base64,/.test(value)) {
      iconPreviewBox.textContent = '❓';
      return;
    }
    const img = document.createElement('img');
    img.setAttribute('src', value);
    img.alt = 'icon';
    img.onerror = () => { iconPreviewBox.textContent = '❓'; };
    iconPreviewBox.appendChild(img);
  } else if (isUrl(value)) {
    const src = safeUrl(value);
    if (src === '#') { iconPreviewBox.textContent = '🔗'; return; }
    const img = document.createElement('img');
    img.setAttribute('src', src);
    img.alt = 'icon';
    img.onerror = () => { iconPreviewBox.textContent = '❓'; };
    iconPreviewBox.appendChild(img);
  } else {
    iconPreviewBox.textContent = value || '🔗';
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

  // Determine icon: use selectedIconValue (set by SI/upload/manual tab)
  // Fall back to fIcon.value if selectedIconValue not set
  const iconVal = selectedIconValue || fIcon.value.trim();

  const tile = {
    id,
    label,
    url,
    description: fDesc.value.trim(),
    icon: iconVal,
    category: fCategory.value.trim(),
    container: fContainer.value.trim(),
    showIcon:   fShowIcon.checked,
    showTitle:  fShowTitle.checked,
    showDesc:   fShowDesc.checked,
    showStatus: fShowStatus.checked,
    newTab:     fNewTab.checked ? true : null,
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

document.getElementById('tile-modal-close').addEventListener('click', () => closeModal(tileModal));
document.getElementById('tile-form-cancel').addEventListener('click', () => closeModal(tileModal));
tileModal.addEventListener('click', (e) => { if (e.target === tileModal) closeModal(tileModal); });

/* ============================================================
   Simple Icons search
   ============================================================ */
const SI_CDN = 'https://cdn.simpleicons.org/';

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

document.getElementById('btn-si-search').addEventListener('click', searchSimpleIcons);
document.getElementById('f-si-query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); searchSimpleIcons(); }
});

function searchSimpleIcons() {
  const query = document.getElementById('f-si-query').value.trim();
  if (!query) return;
  const resultsEl = document.getElementById('si-results');
  resultsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Searching…</span>';

  // Try multiple slug variants
  const slugs = [slugify(query), query.toLowerCase().replace(/\s+/g, '-'), query.toLowerCase()];
  const unique = [...new Set(slugs)];

  const candidates = unique.map(slug => ({
    slug,
    url: `${SI_CDN}${encodeURIComponent(slug)}`,
  }));

  resultsEl.innerHTML = '';
  let found = 0;

  candidates.forEach(({ slug, url }, i) => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = slug;
    img.style.width = '32px';
    img.style.height = '32px';
    img.style.filter = 'invert(1)';
    img.style.display = 'none';

    img.onload = () => {
      found++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'si-result-btn';
      btn.title = slug;
      btn.appendChild(img.cloneNode());
      btn.querySelector('img').style.display = '';
      const label = document.createElement('span');
      label.textContent = slug;
      label.style.fontSize = '0.72rem';
      label.style.color = 'var(--text-muted)';
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        selectedIconValue = url;
        updateIconPreview(url);
        showToast(`Simple Icons: ${slug}`, 'success', 1800);
        // visually highlight selection
        document.querySelectorAll('.si-result-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      resultsEl.appendChild(btn);
    };

    img.onerror = () => {
      if (found === 0 && i === candidates.length - 1) {
        resultsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">No icon found — try uploading a custom image.</span>';
      }
    };

    // Need to actually attach img to check load
    img.style.position = 'absolute';
    img.style.visibility = 'hidden';
    document.body.appendChild(img);
    setTimeout(() => img.remove(), 5000);
  });

  // Show "not found" after a delay if nothing loaded
  setTimeout(() => {
    if (resultsEl.children.length === 0) {
      resultsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">No icon found — try a different name or upload a custom image.</span>';
    }
  }, 3000);
}

/* ============================================================
   Icon file upload
   ============================================================ */
document.getElementById('f-icon-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    selectedIconValue = dataUrl;
    updateIconPreview(dataUrl);
    showToast('Icon uploaded.', 'success', 1800);
  };
  reader.readAsDataURL(file);
});

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
  document.getElementById('s-title').value             = state.settings.title;
  document.getElementById('s-subtitle').value          = state.settings.subtitle;
  document.getElementById('s-new-tab').checked         = state.settings.openInNewTab;
  document.getElementById('s-reach-enabled').checked   = state.settings.reachabilityEnabled;
  document.getElementById('s-reach-interval').value    = state.settings.reachIntervalSeconds;
  document.getElementById('s-status-enabled').checked  = state.settings.statusEnabled;
  document.getElementById('s-status-url').value        = state.settings.statusApiUrl;
  document.getElementById('s-poll-interval').value     = state.settings.pollIntervalSeconds;
  const opacityEl = document.getElementById('s-opacity');
  opacityEl.value = state.settings.tileOpacity;
  document.getElementById('s-opacity-val').textContent = `${state.settings.tileOpacity}%`;
  document.getElementById('s-bg-clear-row').style.display = state.settings.backgroundImage ? '' : 'none';
}

function readSettingsUI() {
  state.settings.title                = document.getElementById('s-title').value.trim()    || 'QLS';
  state.settings.subtitle             = document.getElementById('s-subtitle').value.trim() || 'Quick Links & Status';
  state.settings.openInNewTab         = document.getElementById('s-new-tab').checked;
  state.settings.reachabilityEnabled  = document.getElementById('s-reach-enabled').checked;
  state.settings.reachIntervalSeconds = parseInt(document.getElementById('s-reach-interval').value, 10) || 30;
  state.settings.statusEnabled        = document.getElementById('s-status-enabled').checked;
  state.settings.statusApiUrl         = document.getElementById('s-status-url').value.trim() || '/api/status';
  state.settings.pollIntervalSeconds  = parseInt(document.getElementById('s-poll-interval').value, 10) || 30;
  state.settings.tileOpacity          = parseInt(document.getElementById('s-opacity').value, 10) || 90;
}

// Live-apply settings
[
  's-title', 's-subtitle', 's-new-tab', 's-reach-enabled', 's-reach-interval',
  's-status-enabled', 's-status-url', 's-poll-interval',
].forEach(id => {
  document.getElementById(id).addEventListener('change', applySettings);
});

// Opacity slider — live preview
document.getElementById('s-opacity').addEventListener('input', () => {
  const val = parseInt(document.getElementById('s-opacity').value, 10);
  document.getElementById('s-opacity-val').textContent = `${val}%`;
  state.settings.tileOpacity = val;
  applyUISettings();
  saveState();
});

function applySettings() {
  readSettingsUI();
  saveState();
  applyUISettings();
  restartStatusPolling();
  restartReachabilityPolling();
  renderTiles(); // re-render to apply new-tab changes
}

function applyUISettings() {
  document.title = `${state.settings.title} — HomeLab Dashboard`;
  document.getElementById('site-title').innerHTML = `${escHtml(state.settings.title)} <span>&middot;</span>`;
  document.getElementById('site-subtitle').textContent = state.settings.subtitle;

  // Background image — only apply if it is a valid data:image URL to prevent CSS injection
  const bg = state.settings.backgroundImage;
  if (bg && /^data:image\/[a-z+]+;base64,/.test(bg)) {
    // Escape double-quotes to prevent breaking out of the CSS url("…") context
    document.body.style.backgroundImage = `url("${bg.replace(/"/g, '%22')}")`;
    document.body.classList.add('has-bg');
  } else {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg');
  }

  // Tile opacity
  document.documentElement.style.setProperty('--tile-opacity', String(state.settings.tileOpacity / 100));
}

/* ============================================================
   Background image upload
   ============================================================ */
document.getElementById('s-bg-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.settings.backgroundImage = ev.target.result;
    saveState();
    applyUISettings();
    syncSettingsUI();
    showToast('Background updated.', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

document.getElementById('s-bg-clear').addEventListener('click', () => {
  state.settings.backgroundImage = '';
  saveState();
  applyUISettings();
  syncSettingsUI();
  showToast('Background removed.', 'info');
});

/* ============================================================
   Export / Import / Reset
   ============================================================ */
document.getElementById('s-export').addEventListener('click', () => {
  const { backgroundImage, ...settingsToExport } = state.settings;
  const blob = new Blob([JSON.stringify({ settings: settingsToExport, tiles: state.tiles }, null, 2)], { type: 'application/json' });
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
      restartReachabilityPolling();
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
  localStorage.removeItem('qls_bg');
  const defaults = {
    title: 'QLS',
    subtitle: 'Quick Links & Status',
    backgroundImage: '',
    tileOpacity: 90,
    openInNewTab: true,
    reachabilityEnabled: false,
    reachIntervalSeconds: 30,
    statusEnabled: false,
    statusApiUrl: '/api/status',
    pollIntervalSeconds: 30,
  };
  state.tiles = [];
  state.settings = { ...defaults };
  // Clear server-side state
  saveStateToServer();
  syncSettingsUI();
  applyUISettings();
  renderTiles();
  restartStatusPolling();
  restartReachabilityPolling();
  showToast('Reset to defaults.', 'info');
});

/* ============================================================
   URL Reachability polling (direct fetch of each tile's URL)
   ============================================================ */
async function checkTileReachability(tile) {
  if (!tile.url) return;
  const dotEls = document.querySelectorAll(`.status-dot[data-tileid="${tile.id}"]`);
  dotEls.forEach(el => setStatusDotClass(el, 'checking'));

  let result = 'unknown';
  try {
    // Use no-cors so CORS doesn't block homelab services.
    // An opaque (non-error) response means the host is reachable.
    // Network errors mean the host is down.
    await fetch(tile.url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    result = 'up';
  } catch (err) {
    result = 'down';
  }

  state.status[tile.id] = result;
  dotEls.forEach(el => {
    setStatusDotClass(el, result);
    el.title = `${tile.url}: ${result}`;
  });
}

async function pollReachability() {
  if (!state.settings.reachabilityEnabled) return;
  const tilesWithUrl = state.tiles.filter(t => t.url && t.showStatus !== false && !t.container);
  await Promise.allSettled(tilesWithUrl.map(checkTileReachability));
  updateStatusBar();
}

function updateStatusBar() {
  const statusBarDot  = document.getElementById('status-bar-dot');
  const statusBarText = document.getElementById('status-bar-text');
  if (!state.settings.reachabilityEnabled && !state.settings.statusEnabled) {
    statusBarText.textContent = 'Status off';
    statusBarDot.classList.remove('live');
    return;
  }
  const allStatuses = Object.values(state.status);
  const upCount = allStatuses.filter(v => v === 'up').length;
  const total   = allStatuses.length;
  if (total > 0) {
    statusBarDot.classList.add('live');
    statusBarText.textContent = `${upCount}/${total} up`;
  }
}

function restartReachabilityPolling() {
  if (state.reachTimer) clearInterval(state.reachTimer);
  if (!state.settings.reachabilityEnabled) {
    updateStatusBar();
    return;
  }
  pollReachability();
  state.reachTimer = setInterval(pollReachability, state.settings.reachIntervalSeconds * 1000);
}

/* ============================================================
   Container Status API polling (optional Docker backend)
   ============================================================ */
const statusBarDot  = document.getElementById('status-bar-dot');
const statusBarText = document.getElementById('status-bar-text');

async function pollStatus() {
  if (!state.settings.statusEnabled) return;
  document.querySelectorAll('.status-dot').forEach(el => {
    const tile = state.tiles.find(t => t.id === el.dataset.tileid);
    if (tile && tile.container) setStatusDotClass(el, 'checking');
  });

  try {
    const resp = await fetch(state.settings.statusApiUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // Merge container statuses into state.status using container name as key
    Object.assign(state.status, data);
    statusBarDot.classList.add('live');
    const upCount = Object.values(data).filter(v => v === 'up').length;
    statusBarText.textContent = `${upCount}/${Object.keys(data).length} up`;
    updateContainerDots();
  } catch (_) {
    statusBarDot.classList.remove('live');
    statusBarText.textContent = 'API unreachable';
    updateContainerDots();
  }
}

function updateContainerDots() {
  document.querySelectorAll('.tile').forEach(tileEl => {
    const tile = state.tiles.find(t => t.id === tileEl.dataset.id);
    if (!tile || !tile.container) return;
    const dot = tileEl.querySelector('.status-dot');
    if (!dot) return;
    setStatusDotClass(dot, state.status[tile.container]);
    dot.title = `${tile.container}: ${state.status[tile.container] || 'unknown'}`;
  });
}

function restartStatusPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (!state.settings.statusEnabled) {
    updateStatusBar();
    return;
  }
  pollStatus();
  state.pollTimer = setInterval(pollStatus, state.settings.pollIntervalSeconds * 1000);
}

/* ============================================================
   Load shared config from server (GET /api/config)
   Falls back to localStorage if server is unavailable.
   ============================================================ */
async function loadServerConfig() {
  try {
    const resp = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!resp.ok) return false;
    const cfg = await resp.json();
    if (cfg.settings) {
      state.settings = { ...state.settings, ...cfg.settings };
    } else {
      // Legacy config.json format (site/status/tiles keys)
      if (cfg.site) {
        if (cfg.site.title)    state.settings.title    = cfg.site.title;
        if (cfg.site.subtitle) state.settings.subtitle = cfg.site.subtitle;
      }
      if (cfg.status) {
        if (cfg.status.enabled !== undefined)  state.settings.statusEnabled       = cfg.status.enabled;
        if (cfg.status.apiUrl)                 state.settings.statusApiUrl        = cfg.status.apiUrl;
        if (cfg.status.pollIntervalSeconds)    state.settings.pollIntervalSeconds = cfg.status.pollIntervalSeconds;
      }
    }
    if (Array.isArray(cfg.tiles)) {
      state.tiles = cfg.tiles.map(t => ({ id: t.id || uid(), ...t }));
    }

    // Load background image from sidecar endpoint (server validates format on write)
    try {
      const bgResp = await fetch(CONFIG_BG_URL, { cache: 'no-cache' });
      if (bgResp.ok) {
        const bg = await bgResp.text();
        state.settings.backgroundImage = bg || '';
      } else {
        state.settings.backgroundImage = '';
      }
    } catch (_) { /* background unavailable — leave as default */ }

    return true;
  } catch (_) {
    return false;
  }
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
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openAddModal();
  }
});

/* ============================================================
   Bootstrap
   ============================================================ */
async function init() {
  // Try server config first (shared across devices); fall back to localStorage
  const serverLoaded = await loadServerConfig();
  if (!serverLoaded) {
    loadState();
  }

  applyUISettings();
  renderTiles();
  restartStatusPolling();
  restartReachabilityPolling();
}

init();
