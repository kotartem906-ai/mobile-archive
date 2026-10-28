// ===== Data & State =====
const SECTION_TYPES = ['models', 'onlyfans', 'webcam', 'celebrities', 'people', 'videos', 'games', 'hentai', 'comics'];
const MODEL_TYPES = ['models', 'onlyfans', 'webcam', 'celebrities']; // cross-drag between these
const SIMPLE_TYPES = ['videos', 'games', 'hentai', 'comics'];
const PERSON_PHOTO_TYPES = ['models', 'onlyfans', 'webcam', 'celebrities', 'people']; // body photos + desire
const SKILL_TYPES = ['models', 'onlyfans', 'webcam', 'celebrities']; // sex skills
const BODY_SLOTS = ['face', 'breasts', 'ass', 'pussy', 'legs', 'full'];

const SECTION_TITLES = {
  models:       { add: 'Нова картка',  edit: 'Картка',  nameLabel: "Ім'я / Нік *",   namePlaceholder: 'Sofia / @nick' },
  onlyfans:     { add: 'Нова картка',  edit: 'Картка',  nameLabel: "Ім'я / Нік *",   namePlaceholder: 'Sofia / @nick' },
  webcam:       { add: 'Нова картка',  edit: 'Картка',  nameLabel: "Ім'я / Нік *",   namePlaceholder: 'Sofia / @nick' },
  celebrities:  { add: 'Нова картка',  edit: 'Картка',  nameLabel: "Ім'я *",         namePlaceholder: 'Ім\'я знаменитості' },
  people:       { add: 'Нова картка',  edit: 'Картка',  nameLabel: "Ім'я *",         namePlaceholder: "Ім'я" },
  videos:       { add: 'Нове відео',   edit: 'Відео',   nameLabel: 'Назва відео *',  namePlaceholder: 'Назва відео' },
  games:        { add: 'Нова гра',     edit: 'Гра',     nameLabel: 'Назва гри *',    namePlaceholder: 'Назва гри' },
  hentai:       { add: 'Новий хентай', edit: 'Хентай',  nameLabel: 'Назва *',        namePlaceholder: 'Назва' },
  comics:       { add: 'Новий комікс', edit: 'Комікс',  nameLabel: 'Назва комікса *', namePlaceholder: 'Назва' }
};

let data = { models: [], onlyfans: [], webcam: [], celebrities: [], people: [], videos: [], games: [], hentai: [], comics: [] };
let currentEditId = null;
let currentEditType = null;
let dragSrcEl = null;
let lastOpenedSection = null;
let currentSort = 'manual';
let currentTheme = 'blood';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ===== IndexedDB (великий ліміт; localStorage ~5МБ замалий для фото) =====
var DB_NAME = 'intimate-archive';
var DB_STORE = 'kv';
var dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
  return dbPromise;
}

function idbSet(key, value) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function idbGet(key) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readonly');
      var req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

async function saveData() {
  try {
    await idbSet('profilesData', data);
    // міграція: прибрати старий localStorage, щоб не займав місце
    try { localStorage.removeItem('profilesData'); } catch (e) {}
    return true;
  } catch (err) {
    console.error('Save error:', err);
    var msg = (err && err.message || '').toLowerCase();
    if (msg.indexOf('quota') !== -1 || msg.indexOf('storage') !== -1) {
      alert('Не вистачає місця навіть у великому сховищі.\\nВидали зайві фото частин тіла або зроби експорт і почисти.');
    } else {
      alert('Помилка збереження: ' + (err && err.message || err));
    }
    return false;
  }
}

async function loadData() {
  try {
    var fromIdb = await idbGet('profilesData');
    if (fromIdb && typeof fromIdb === 'object') {
      data = fromIdb;
    } else {
      // міграція зі старого localStorage
      var raw = localStorage.getItem('profilesData');
      if (raw) {
        data = JSON.parse(raw);
        await idbSet('profilesData', data);
        try { localStorage.removeItem('profilesData'); } catch (e) {}
      }
    }
  } catch (e) {
    console.error(e);
    try {
      var raw2 = localStorage.getItem('profilesData');
      if (raw2) data = JSON.parse(raw2);
    } catch (e2) {}
  }
  SECTION_TYPES.forEach(function(t) {
    if (!Array.isArray(data[t])) data[t] = [];
  });
  try {
    var ui = localStorage.getItem('uiSettings');
    if (ui) {
      var parsed = JSON.parse(ui);
      if (parsed.sort) currentSort = parsed.sort;
      if (parsed.theme) currentTheme = parsed.theme;
      if (parsed.coverTitle) {
        var tEl = document.getElementById('appTitle');
        if (tEl) tEl.firstChild.textContent = parsed.coverTitle + ' ';
        document.title = parsed.coverTitle;
      }
    }
  } catch (e) {}
  applyTheme(currentTheme);
  if (typeof updateMenuActiveStates === 'function') updateMenuActiveStates();
  document.querySelectorAll('.section').forEach(function(s) {
    s.classList.add('collapsed');
  });
  render();
  updateStorageInfo();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Hard compression for body parts; slightly softer for main photo
function compressImage(dataUrl, maxWidth, quality) {
  maxWidth = maxWidth || 400;
  quality = quality || 0.75;
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var width = img.width, height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

function compressBodyPart(dataUrl) {
  // Aggressive: 280px, quality 0.62 ≈ 15–40 KB
  return compressImage(dataUrl, 280, 0.62);
}

async function updateStorageInfo() {
  try {
    var approx = 0;
    try { approx = JSON.stringify(data).length * 2; } catch (e) {}
    var mb = (approx / (1024 * 1024)).toFixed(2);
    var el = document.getElementById('storageInfo');
    if (el) {
      el.textContent = mb + ' МБ';
      el.title = 'Приблизний розмір даних: ' + mb + ' МБ (IndexedDB)';
    }
  } catch (e) {}
}

function isPeopleType(type) { return type === 'people'; }
function isSimpleType(type) { return SIMPLE_TYPES.indexOf(type) !== -1; }
function hasDesire(type) { return PERSON_PHOTO_TYPES.indexOf(type) !== -1; }
function hasSkills(type) { return SKILL_TYPES.indexOf(type) !== -1; }
function hasBodyPhotos(type) { return PERSON_PHOTO_TYPES.indexOf(type) !== -1; }

function hasDetailBody(type) { return !isSimpleType(type); }

function formatRating(r) {
  var n = parseInt(r, 10);
  if (!n || n < 1) return '';
  if (n > 10) n = 10;
  return String(n);
}

// ===== Render =====
function render() {
  SECTION_TYPES.forEach(function(t) { renderSection(t); });
  updateCounts();
  updateStorageInfo();
}

function updateCounts() {
  SECTION_TYPES.forEach(function(t) {
    var el = document.getElementById(t + 'Count');
    if (el) el.textContent = (data[t] || []).length;
  });
}



function applyTheme(theme) {
  currentTheme = theme || 'blood';
  document.body.setAttribute('data-theme', currentTheme);
  // animated themes get extra class for pseudo-elements
  document.body.classList.toggle('theme-animated',
    currentTheme === 'pulse' || currentTheme === 'glow' || currentTheme === 'neon' || currentTheme === 'heat');
}

async function saveUiSettings() {
  try {
    var prev = {};
    try { prev = JSON.parse(localStorage.getItem('uiSettings') || '{}'); } catch (e) {}
    prev.sort = currentSort;
    prev.theme = currentTheme;
    localStorage.setItem('uiSettings', JSON.stringify(prev));
  } catch (e) {
    console.error(e);
  }
}

function sortItems(items) {
  var list = items.slice();
  var mode = currentSort || 'manual';
  if (mode === 'manual') return list;

  function rate(x) { return parseInt(x.rating, 10) || 0; }
  function desire(x) { return parseInt(x.desire, 10) || 0; }
  function nameKey(x) { return (x.name || '').toLowerCase(); }
  function created(x) { return x.createdAt || 0; }

  list.sort(function(a, b) {
    if (mode === 'rating_desc') return rate(b) - rate(a) || nameKey(a).localeCompare(nameKey(b), 'uk');
    if (mode === 'rating_asc') return rate(a) - rate(b) || nameKey(a).localeCompare(nameKey(b), 'uk');
    if (mode === 'desire_desc') return desire(b) - desire(a) || rate(b) - rate(a);
    if (mode === 'name_asc') return nameKey(a).localeCompare(nameKey(b), 'uk');
    if (mode === 'name_desc') return nameKey(b).localeCompare(nameKey(a), 'uk');
    if (mode === 'newest') return created(b) - created(a);
    if (mode === 'oldest') return created(a) - created(b);
    return 0;
  });
  return list;
}

function renderSection(type) {
  var grid = document.getElementById(type + 'Grid');
  var empty = document.getElementById(type + 'Empty');
  if (!grid || !empty) return;

  var items = sortItems(data[type] || []);
  if (items.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  var searchEl = document.getElementById('searchInput');
  var search = (searchEl && searchEl.value || '').toLowerCase().trim();
  var isSearching = search.length > 0;

  var filtered = items.filter(function(item) {
    if (!search) return true;
    var hay = [item.name, item.description, item.age, item.phone,
      item.rating ? String(item.rating) : '',
      item.desire ? String(item.desire) : ''].join(' ').toLowerCase();
    return hay.indexOf(search) !== -1;
  });

  grid.innerHTML = filtered.map(function(item) {
    var photoHtml = item.photo
      ? '<img class="card-photo" src="' + item.photo + '" alt="" draggable="false">'
      : '<div class="card-photo placeholder">👤</div>';

    var badges = [];
    var ratingStr = formatRating(item.rating);
    if (ratingStr) badges.push('<span class="card-badge card-badge-rating">★ ' + ratingStr + '</span>');
    var desireStr = formatRating(item.desire);
    if (desireStr) badges.push('<span class="card-badge card-badge-desire">🔥 ' + desireStr + '</span>');
    var badgeHtml = badges.length ? '<div class="card-badges">' + badges.join('') + '</div>' : '';

    var tags = [];
    var bp = item.bodyPhotos || {};
    var hasBody = Object.keys(bp).some(function(k) { return !!bp[k]; });
    if (hasBody) tags.push('<span class="card-tag">+тіло</span>');
    var sk = item.skills || {};
    var hasSkillsFlag = Object.keys(sk).some(function(k) { return (parseInt(sk[k], 10) || 0) > 0; });
    if (hasSkillsFlag) tags.push('<span class="card-tag">скіли</span>');
    var tagHtml = tags.length ? '<div class="card-tags">' + tags.join('') + '</div>' : '';

    var metaParts = [];
    if (isPeopleType(type) && item.age) metaParts.push(escapeHtml(item.age) + ' р.');
    else if (item.links && item.links.length) metaParts.push(item.links.length + ' пос.');

    var draggableAttr = (!isSearching && currentSort === 'manual') ? 'draggable="true"' : '';

    return (
      '<div class="card" data-id="' + item.id + '" data-type="' + type + '" ' + draggableAttr + '>' +
        '<div class="card-photo-wrap">' + photoHtml + badgeHtml + tagHtml + '</div>' +
        '<div class="card-info">' +
          '<div class="card-name">' + escapeHtml(item.name) + '</div>' +
          (metaParts.length ? '<div class="card-meta">' + metaParts.join(' · ') + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }).join('');

  var canDrag = !isSearching && currentSort === 'manual';
  grid.querySelectorAll('.card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (card.dataset.dragging === '1') {
        card.dataset.dragging = '0';
        return;
      }
      openEditModal(card.dataset.type, card.dataset.id);
    });
    if (canDrag) {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('dragenter', handleDragEnter);
      card.addEventListener('dragleave', handleDragLeave);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
    }
  });

  if (canDrag) {
    grid.addEventListener('dragover', handleDragOver);
    grid.addEventListener('drop', handleGridDrop);
  }
}

// ===== Drag & Drop =====
function canCrossMove(fromType, toType) {
  if (fromType === toType) return true;
  if (MODEL_TYPES.indexOf(fromType) !== -1 && MODEL_TYPES.indexOf(toType) !== -1) return true;
  return false;
}

function handleDragStart(e) {
  dragSrcEl = this;
  this.classList.add('dragging');
  this.dataset.dragging = '1';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  document.querySelectorAll('.cards-grid').forEach(function(grid) {
    var t = grid.id.replace('Grid', '');
    if (canCrossMove(dragSrcEl.dataset.type, t)) grid.classList.add('drop-zone-active');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  if (this !== dragSrcEl) this.classList.add('drag-over');
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function moveItem(fromType, toType, srcId, targetId) {
  var srcList = data[fromType];
  if (!srcList) return false;
  var srcIdx = srcList.findIndex(function(x) { return x.id === srcId; });
  if (srcIdx === -1) return false;
  var moved = srcList.splice(srcIdx, 1)[0];
  if (!data[toType]) data[toType] = [];
  var dstList = data[toType];
  if (targetId) {
    var targetIdx = dstList.findIndex(function(x) { return x.id === targetId; });
    if (targetIdx !== -1) dstList.splice(targetIdx, 0, moved);
    else dstList.push(moved);
  } else {
    dstList.push(moved);
  }
  return true;
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  if (!dragSrcEl || dragSrcEl === this) return false;
  var fromType = dragSrcEl.dataset.type;
  var toType = this.dataset.type;
  if (!canCrossMove(fromType, toType)) return false;
  var srcId = dragSrcEl.dataset.id;
  var targetId = this.classList.contains('card') ? this.dataset.id : null;
  if (moveItem(fromType, toType, srcId, targetId)) {
    saveData().then(function() { render(); });
  }
  return false;
}

function handleGridDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  if (!dragSrcEl) return false;
  var toType = e.currentTarget.id.replace('Grid', '');
  var fromType = dragSrcEl.dataset.type;
  if (!canCrossMove(fromType, toType)) return false;
  if (e.target.closest && e.target.closest('.card') && e.target.closest('.card') !== dragSrcEl) return false;
  if (moveItem(fromType, toType, dragSrcEl.dataset.id, null)) {
    saveData().then(function() { render(); });
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.card.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
  document.querySelectorAll('.cards-grid.drop-zone-active').forEach(function(g) {
    g.classList.remove('drop-zone-active');
  });
  setTimeout(function() {
    if (e.target && e.target.dataset) e.target.dataset.dragging = '0';
  }, 50);
  dragSrcEl = null;
}

// ===== Rating helpers =====
function updateBadge(sliderId, badgeId) {
  var slider = document.getElementById(sliderId);
  var badge = document.getElementById(badgeId);
  if (!slider || !badge) return;
  var v = parseInt(slider.value, 10) || 0;
  if (v < 1) {
    badge.textContent = '—';
    badge.className = 'rating-badge rating-none';
  } else {
    var prefix = sliderId === 'desire' ? '🔥 ' : '★ ';
    badge.textContent = prefix + v;
    badge.className = 'rating-badge rating-' + (v >= 8 ? 'high' : v >= 5 ? 'mid' : 'low');
  }
}

function updateRatingDisplay() { updateBadge('rating', 'ratingValue'); }
function updateDesireDisplay() { updateBadge('desire', 'desireValue'); }

function updateDetailVal(input) {
  var span = input.parentElement.querySelector('.detail-val');
  if (!span) return;
  var v = parseInt(input.value, 10) || 0;
  span.textContent = v < 1 ? '—' : v;
}

function collapseToggle(contentId, btnId) {
  var content = document.getElementById(contentId);
  var btn = document.getElementById(btnId);
  if (content) content.classList.add('hidden');
  if (btn) {
    var arrow = btn.querySelector('.toggle-arrow');
    if (arrow) arrow.textContent = '▶';
  }
}

function resetDetailRatings() {
  document.querySelectorAll('.detail-rating').forEach(function(inp) {
    inp.value = '0';
    updateDetailVal(inp);
  });
  collapseToggle('detailRatingsContent', 'btnToggleDetails');
}

function setDetailRatings(details) {
  details = details || {};
  document.querySelectorAll('.detail-rating').forEach(function(inp) {
    var v = parseInt(details[inp.dataset.key], 10) || 0;
    inp.value = String(v);
    updateDetailVal(inp);
  });
}

function getDetailRatingsFromForm() {
  var out = {};
  document.querySelectorAll('.detail-rating').forEach(function(inp) {
    out[inp.dataset.key] = parseInt(inp.value, 10) || 0;
  });
  return out;
}

function resetSkills() {
  document.querySelectorAll('.skill-rating').forEach(function(inp) {
    inp.value = '0';
    updateDetailVal(inp);
  });
  collapseToggle('sexSkillsContent', 'btnToggleSkills');
}

function setSkills(skills) {
  skills = skills || {};
  document.querySelectorAll('.skill-rating').forEach(function(inp) {
    var v = parseInt(skills[inp.dataset.key], 10) || 0;
    inp.value = String(v);
    updateDetailVal(inp);
  });
}

function getSkillsFromForm() {
  var out = {};
  document.querySelectorAll('.skill-rating').forEach(function(inp) {
    out[inp.dataset.key] = parseInt(inp.value, 10) || 0;
  });
  return out;
}

function resetBodyPhotos() {
  document.querySelectorAll('.body-slot').forEach(function(slot) {
    var img = slot.querySelector('.body-slot-img');
    var clearBtn = slot.querySelector('.body-slot-clear');
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    var file = slot.querySelector('.body-slot-file');
    if (file) file.value = '';
  });
  collapseToggle('bodyPhotosContent', 'btnToggleBodyPhotos');
}

function setBodyPhotos(photos) {
  photos = photos || {};
  document.querySelectorAll('.body-slot').forEach(function(slot) {
    var key = slot.dataset.slot;
    var img = slot.querySelector('.body-slot-img');
    var clearBtn = slot.querySelector('.body-slot-clear');
    var src = photos[key] || '';
    if (src && img) {
      img.src = src;
      img.classList.remove('hidden');
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else if (img) {
      img.src = '';
      img.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
    }
  });
}

function getBodyPhotosFromForm() {
  var out = {};
  document.querySelectorAll('.body-slot').forEach(function(slot) {
    var key = slot.dataset.slot;
    var img = slot.querySelector('.body-slot-img');
    if (img && img.src && !img.classList.contains('hidden') && img.src.indexOf('data:') === 0 || (img && img.src && img.src.indexOf('http') === 0)) {
      if (img.src && !img.classList.contains('hidden')) out[key] = img.src;
    }
  });
  // cleaner
  out = {};
  document.querySelectorAll('.body-slot').forEach(function(slot) {
    var key = slot.dataset.slot;
    var img = slot.querySelector('.body-slot-img');
    if (img && !img.classList.contains('hidden') && img.src) {
      out[key] = img.src;
    }
  });
  return out;
}

function showBlock(id, show) {
  var el = document.getElementById(id);
  if (!el) return;
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function applyTypeVisibility(type) {
  showBlock('desireBlock', hasDesire(type));
  showBlock('sexSkillsBlock', hasSkills(type));
  showBlock('bodyPhotosBlock', hasBodyPhotos(type));
  showBlock('detailRatingsBlock', hasDetailBody(type));
  var peopleFields = document.getElementById('peopleFields');
  if (peopleFields) {
    if (isPeopleType(type)) peopleFields.classList.remove('hidden');
    else peopleFields.classList.add('hidden');
  }
}


// ===== Modal =====
function applyNameLabel(type) {
  var info = SECTION_TITLES[type] || SECTION_TITLES.models;
  var label = document.getElementById('nameLabel');
  var input = document.getElementById('name');
  if (label) label.textContent = info.nameLabel;
  if (input) input.placeholder = info.namePlaceholder;
}

function openAddModal(type) {
  currentEditId = null;
  currentEditType = type;
  lastOpenedSection = type;

  var titles = SECTION_TITLES[type] || SECTION_TITLES.models;
  document.getElementById('modalTitle').textContent = titles.add;
  document.getElementById('profileId').value = '';
  document.getElementById('profileType').value = type;
  document.getElementById('name').value = '';
  document.getElementById('description').value = '';
  var ageEl = document.getElementById('age');
  var phoneEl = document.getElementById('phone');
  if (ageEl) ageEl.value = '';
  if (phoneEl) phoneEl.value = '';
  clearMainPhoto();
  document.getElementById('btnDelete').classList.add('hidden');
  document.getElementById('rating').value = '0';
  updateRatingDisplay();
  var desire = document.getElementById('desire');
  if (desire) { desire.value = '0'; updateDesireDisplay(); }

  resetDetailRatings();
  resetSkills();
  resetBodyPhotos();
  applyNameLabel(type);
  applyTypeVisibility(type);

  document.getElementById('linksContainer').innerHTML = '';
  addLinkRow();
  document.getElementById('modal').classList.remove('hidden');
}

function openEditModal(type, id) {
  lastOpenedSection = type;
  var list = data[type];
  if (!list) return;
  var item = list.find(function(x) { return x.id === id; });
  if (!item) return;

  currentEditId = id;
  currentEditType = type;

  var titles = SECTION_TITLES[type] || SECTION_TITLES.models;
  document.getElementById('modalTitle').textContent = titles.edit;
  document.getElementById('profileId').value = id;
  document.getElementById('profileType').value = type;
  document.getElementById('name').value = item.name || '';
  document.getElementById('description').value = item.description || '';
  var ageEl = document.getElementById('age');
  var phoneEl = document.getElementById('phone');
  if (ageEl) ageEl.value = item.age || '';
  if (phoneEl) phoneEl.value = item.phone || '';
  document.getElementById('rating').value = item.rating ? String(item.rating) : '0';
  updateRatingDisplay();
  var desire = document.getElementById('desire');
  if (desire) {
    desire.value = item.desire ? String(item.desire) : '0';
    updateDesireDisplay();
  }

  setDetailRatings(item.details);
  setSkills(item.skills);
  setBodyPhotos(item.bodyPhotos);
  collapseToggle('detailRatingsContent', 'btnToggleDetails');
  collapseToggle('sexSkillsContent', 'btnToggleSkills');
  collapseToggle('bodyPhotosContent', 'btnToggleBodyPhotos');

  applyNameLabel(type);
  applyTypeVisibility(type);

  var preview = document.getElementById('photoPreview');
  if (item.photo) {
    preview.onerror = null;
    preview.src = item.photo;
    preview.classList.remove('hidden');
    document.getElementById('btnClearPhoto').classList.remove('hidden');
  } else {
    preview.onerror = null;
    preview.removeAttribute('src');
    preview.src = '';
    preview.classList.add('hidden');
    document.getElementById('btnClearPhoto').classList.add('hidden');
  }
  document.getElementById('photoInput').value = '';
  var photoUrl = document.getElementById('photoUrl');
  if (photoUrl) photoUrl.value = '';
  document.getElementById('btnDelete').classList.remove('hidden');

  var container = document.getElementById('linksContainer');
  container.innerHTML = '';
  if (item.links && item.links.length) {
    item.links.forEach(function(link) { addLinkRow(link.title, link.url); });
  } else {
    addLinkRow();
  }

  document.getElementById('modal').classList.remove('hidden');
}

function addLinkRow(title, url) {
  title = title || '';
  url = url || '';
  var container = document.getElementById('linksContainer');
  var row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML =
    '<input type="text" class="link-title" placeholder="Назва (SimpCity, OF...)" value="' + escapeHtml(title) + '">' +
    '<input type="url" class="link-url" placeholder="https://..." value="' + escapeHtml(url) + '">' +
    '<button type="button" class="btn-open-link" title="Відкрити">↗</button>' +
    '<button type="button" class="btn-remove-link" title="Видалити">×</button>';
  row.querySelector('.btn-remove-link').addEventListener('click', function() { row.remove(); });
  row.querySelector('.btn-open-link').addEventListener('click', function() {
    var linkUrl = row.querySelector('.link-url').value.trim();
    if (linkUrl) window.open(linkUrl, '_blank');
  });
  container.appendChild(row);
}

function getLinksFromForm() {
  var rows = document.querySelectorAll('#linksContainer .link-row');
  var links = [];
  rows.forEach(function(row) {
    var title = row.querySelector('.link-title').value.trim();
    var url = row.querySelector('.link-url').value.trim();
    if (url) links.push({ title: title || 'Посилання', url: url });
  });
  return links;
}


function clearMainPhoto() {
  var preview = document.getElementById('photoPreview');
  if (!preview) return;
  preview.onerror = null;
  preview.onload = null;
  // avoid empty src firing error in some browsers
  preview.removeAttribute('src');
  preview.src = '';
  preview.classList.add('hidden');
  var btn = document.getElementById('btnClearPhoto');
  if (btn) btn.classList.add('hidden');
  var input = document.getElementById('photoInput');
  if (input) input.value = '';
  var photoUrl = document.getElementById('photoUrl');
  if (photoUrl) photoUrl.value = '';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  currentEditId = null;
  currentEditType = null;
}

// ===== Form Submit =====
document.getElementById('profileForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  var type = document.getElementById('profileType').value;
  var name = document.getElementById('name').value.trim();
  if (!name) return;
  if (SECTION_TYPES.indexOf(type) === -1) return;

  var ratingVal = parseInt(document.getElementById('rating').value, 10) || 0;
  if (ratingVal < 0) ratingVal = 0;
  if (ratingVal > 10) ratingVal = 10;

  var item = {
    id: currentEditId || generateId(),
    name: name,
    description: document.getElementById('description').value.trim(),
    links: getLinksFromForm(),
    photo: document.getElementById('photoPreview').src || '',
    rating: ratingVal,
    updatedAt: Date.now()
  };

  if (hasDesire(type)) {
    var d = parseInt(document.getElementById('desire').value, 10) || 0;
    item.desire = d;
  }


  if (hasDetailBody(type)) {
    item.details = getDetailRatingsFromForm();
  }

  if (hasSkills(type)) {
    item.skills = getSkillsFromForm();
  }

  if (hasBodyPhotos(type)) {
    item.bodyPhotos = getBodyPhotosFromForm();
  }

  if (isPeopleType(type)) {
    item.age = document.getElementById('age').value.trim();
    item.phone = document.getElementById('phone').value.trim();
  }

  if (!data[type]) data[type] = [];

  if (currentEditId) {
    var idx = data[type].findIndex(function(x) { return x.id === currentEditId; });
    if (idx !== -1) data[type][idx] = Object.assign({}, data[type][idx], item);
  } else {
    item.createdAt = Date.now();
    data[type].unshift(item);
  }

  var ok = await saveData();
  if (ok) {
    render();
    if (lastOpenedSection) {
      var sec = document.getElementById('section-' + lastOpenedSection);
      if (sec) sec.classList.remove('collapsed');
    }
    closeModal();
  }
});

// ===== Main photo =====
document.getElementById('photoInput').addEventListener('change', async function(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    alert('Фото занадто велике (макс. 8 МБ).');
    return;
  }
  var reader = new FileReader();
  reader.onload = async function(ev) {
    var compressed = await compressImage(ev.target.result, 400, 0.75);
    var preview = document.getElementById('photoPreview');
    preview.src = compressed;
    preview.classList.remove('hidden');
    document.getElementById('btnClearPhoto').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

var btnLoadPhotoUrl = document.getElementById('btnLoadPhotoUrl');
if (btnLoadPhotoUrl) {
  btnLoadPhotoUrl.addEventListener('click', async function() {
    var urlInput = document.getElementById('photoUrl');
    var url = (urlInput && urlInput.value || '').trim();
    if (!url) { alert('Встав URL зображення'); return; }
    if (!/^https?:\/\//i.test(url)) {
      alert('URL має починатися з http:// або https://');
      return;
    }
    try {
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var blob = await resp.blob();
      var reader = new FileReader();
      reader.onload = async function(ev) {
        var compressed = await compressImage(ev.target.result, 400, 0.75);
        var preview = document.getElementById('photoPreview');
        preview.src = compressed;
        preview.classList.remove('hidden');
        document.getElementById('btnClearPhoto').classList.remove('hidden');
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      var preview = document.getElementById('photoPreview');
      preview.onerror = function() {
        preview.onerror = null;
        if (!preview.src || preview.src === window.location.href || preview.src.endsWith('/')) return;
        alert('Не вдалося завантажити зображення за URL (CORS або бите посилання).');
        clearMainPhoto();
      };
      preview.src = url;
      preview.classList.remove('hidden');
      document.getElementById('btnClearPhoto').classList.remove('hidden');
    }
  });
}

document.getElementById('btnClearPhoto').addEventListener('click', function() {
  clearMainPhoto();
});

// ===== Body slot photo handlers =====
function setSlotImage(slot, dataUrl) {
  var img = slot.querySelector('.body-slot-img');
  var clearBtn = slot.querySelector('.body-slot-clear');
  if (!img) return;
  img.src = dataUrl;
  img.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function clearSlotImage(slot) {
  var img = slot.querySelector('.body-slot-img');
  var clearBtn = slot.querySelector('.body-slot-clear');
  var file = slot.querySelector('.body-slot-file');
  if (img) {
    img.src = '';
    img.classList.add('hidden');
  }
  if (clearBtn) clearBtn.classList.add('hidden');
  if (file) file.value = '';
}

document.querySelectorAll('.body-slot').forEach(function(slot) {
  var fileInput = slot.querySelector('.body-slot-file');
  var urlBtn = slot.querySelector('.body-slot-url-btn');
  var clearBtn = slot.querySelector('.body-slot-clear');

  if (fileInput) {
    fileInput.addEventListener('change', async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        alert('Фото занадто велике (макс. 8 МБ).');
        return;
      }
      var reader = new FileReader();
      reader.onload = async function(ev) {
        var compressed = await compressBodyPart(ev.target.result);
        setSlotImage(slot, compressed);
      };
      reader.readAsDataURL(file);
    });
  }

  if (urlBtn) {
    urlBtn.addEventListener('click', async function() {
      var url = prompt('URL фото:');
      if (!url) return;
      url = url.trim();
      if (!/^https?:\/\//i.test(url)) {
        alert('URL має починатися з http:// або https://');
        return;
      }
      try {
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP');
        var blob = await resp.blob();
        var reader = new FileReader();
        reader.onload = async function(ev) {
          var compressed = await compressBodyPart(ev.target.result);
          setSlotImage(slot, compressed);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        // store URL as-is if CORS blocks
        setSlotImage(slot, url);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      clearSlotImage(slot);
    });
  }
});

// Sliders
var ratingEl = document.getElementById('rating');
if (ratingEl) ratingEl.addEventListener('input', updateRatingDisplay);
var desireEl = document.getElementById('desire');
if (desireEl) desireEl.addEventListener('input', updateDesireDisplay);

document.querySelectorAll('.detail-rating, .skill-rating').forEach(function(inp) {
  inp.addEventListener('input', function() { updateDetailVal(inp); });
});

function bindToggle(btnId, contentId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', function() {
    var content = document.getElementById(contentId);
    if (!content) return;
    content.classList.toggle('hidden');
    var arrow = btn.querySelector('.toggle-arrow');
    if (arrow) arrow.textContent = content.classList.contains('hidden') ? '▶' : '▼';
  });
}
bindToggle('btnToggleDetails', 'detailRatingsContent');
bindToggle('btnToggleSkills', 'sexSkillsContent');
bindToggle('btnToggleBodyPhotos', 'bodyPhotosContent');

// ===== Delete =====
document.getElementById('btnDelete').addEventListener('click', async function() {
  if (!currentEditId || !currentEditType) return;
  if (!confirm('Точно видалити цей профіль?')) return;
  data[currentEditType] = data[currentEditType].filter(function(x) { return x.id !== currentEditId; });
  var ok = await saveData();
  if (ok) { render(); closeModal(); }
});

document.querySelectorAll('.section-header').forEach(function(header) {
  header.addEventListener('click', function(e) {
    if (e.target.closest('.btn-add')) return;
    header.closest('.section').classList.toggle('collapsed');
  });
});

document.querySelectorAll('.btn-add').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    openAddModal(btn.dataset.type);
  });
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target.id === 'modal') closeModal();
});

document.getElementById('btnAddLink').addEventListener('click', function() { addLinkRow(); });
document.getElementById('btnOpenAll').addEventListener('click', function() {
  var links = getLinksFromForm();
  if (links.length === 0) { alert('Немає посилань для відкриття'); return; }
  links.forEach(function(link) { window.open(link.url, '_blank'); });
});

document.getElementById('btnSearch').addEventListener('click', function() {
  var bar = document.getElementById('searchBar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    document.getElementById('searchInput').focus();
  } else {
    document.getElementById('searchInput').value = '';
    render();
  }
});
document.getElementById('searchInput').addEventListener('input', function() { render(); });

document.getElementById('btnExport').addEventListener('click', function() {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'profiles-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnImport').addEventListener('click', function() {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      var imported = JSON.parse(ev.target.result);
      if (imported.models || imported.people || imported.onlyfans || imported.webcam || imported.celebrities || imported.videos || imported.games || imported.hentai || imported.comics) {
        if (confirm('Замінити всі поточні дані імпортованими?')) {
          data = {
            models:       imported.models       || [],
            onlyfans:     imported.onlyfans     || [],
            webcam:       imported.webcam       || [],
            celebrities:  imported.celebrities  || [],
            people:       imported.people       || [],
            videos:       imported.videos       || [],
            games:        imported.games        || [],
            hentai:       imported.hentai       || [],
            comics:       imported.comics       || []
          };
          var ok = await saveData();
          if (ok) { render(); alert('Імпортовано успішно!'); }
        }
      } else {
        alert('Невірний формат файлу');
      }
    } catch (err) {
      alert('Помилка читання файлу');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});



function closeSettingsMenu() {
  var menu = document.getElementById('settingsMenu');
  if (menu) menu.classList.add('hidden');
}

function updateMenuActiveStates() {
  document.querySelectorAll('#settingsMenu [data-sort]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sort === currentSort);
  });
  document.querySelectorAll('#settingsMenu [data-theme]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
}

var btnSettings = document.getElementById('btnSettings');
if (btnSettings) {
  btnSettings.addEventListener('click', function(e) {
    e.stopPropagation();
    var menu = document.getElementById('settingsMenu');
    if (!menu) return;
    var open = menu.classList.contains('hidden');
    if (open) {
      updateMenuActiveStates();
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  });
}

document.querySelectorAll('#settingsMenu [data-sort]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    currentSort = btn.dataset.sort;
    saveUiSettings();
    updateMenuActiveStates();
    render();
  });
});

document.querySelectorAll('#settingsMenu [data-theme]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    applyTheme(btn.dataset.theme);
    saveUiSettings();
    updateMenuActiveStates();
  });
});

document.addEventListener('click', function(e) {
  var wrap = document.querySelector('.menu-wrap-settings');
  if (wrap && !wrap.contains(e.target)) closeSettingsMenu();
});


var coverInput = document.getElementById('coverTitleInput');
var btnSaveCover = document.getElementById('btnSaveCover');
if (coverInput) {
  try {
    var ui0 = JSON.parse(localStorage.getItem('uiSettings') || '{}');
    if (ui0.coverTitle) coverInput.value = ui0.coverTitle;
  } catch (e) {}
}
if (btnSaveCover) {
  btnSaveCover.addEventListener('click', function(e) {
    e.stopPropagation();
    var title = (coverInput && coverInput.value || '').trim() || 'Нотатки';
    try {
      var prev = JSON.parse(localStorage.getItem('uiSettings') || '{}');
      prev.coverTitle = title;
      localStorage.setItem('uiSettings', JSON.stringify(prev));
    } catch (err) {}
    var tEl = document.getElementById('appTitle');
    if (tEl) {
      // keep storageInfo span
      var info = document.getElementById('storageInfo');
      tEl.innerHTML = '';
      tEl.appendChild(document.createTextNode(title + ' '));
      if (info) tEl.appendChild(info);
      else {
        var sp = document.createElement('span');
        sp.id = 'storageInfo';
        sp.className = 'storage-info';
        tEl.appendChild(sp);
      }
    }
    document.title = title;
    alert('Назву збережено: ' + title);
  });
}

loadData();
