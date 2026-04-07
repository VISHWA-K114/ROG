/**
 * PassForge — Premium Password Generator
 * script.js
 *
 * Modules:
 *  1. Character Sets & Constants
 *  2. App State
 *  3. Mode Configuration
 *  4. Password Generation
 *  5. Strength Evaluation
 *  6. UI — Generator
 *  7. UI — History
 *  8. LocalStorage
 *  9. CSV Export
 * 10. Modals & Toasts
 * 11. Init
 */

/* ═══════════════════════════════════════════
   1. CHARACTER SETS & CONSTANTS
═══════════════════════════════════════════ */
const CHARS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?/'
};

const STORAGE_KEY = 'passforge_history';

const MODES = {
  average: {
    minLen: 8, maxLen: 10,
    defaultLen: 9,
    required: ['lowercase', 'numbers'],
    optional: ['uppercase'],
    symbolWeight: 0
  },
  medium: {
    minLen: 10, maxLen: 14,
    defaultLen: 12,
    required: ['uppercase', 'lowercase', 'numbers'],
    optional: ['symbols'],
    symbolWeight: 0.25
  },
  strong: {
    minLen: 14, maxLen: 20,
    defaultLen: 16,
    required: ['uppercase', 'lowercase', 'numbers', 'symbols'],
    optional: [],
    symbolWeight: 0.5
  }
};

/* ═══════════════════════════════════════════
   2. APP STATE
═══════════════════════════════════════════ */
const state = {
  currentMode: 'average',
  currentPassword: '',
  isPasswordVisible: false,
  editingEntryId: null,
  history: []
};

/* ═══════════════════════════════════════════
   3. DOM HELPERS
═══════════════════════════════════════════ */
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════
   4. PASSWORD GENERATION
═══════════════════════════════════════════ */

/**
 * Builds the character pool based on user-selected options.
 * @returns {string} Character pool string
 */
function buildCharPool() {
  let pool = '';
  if ($('opt-uppercase').checked) pool += CHARS.uppercase;
  if ($('opt-lowercase').checked) pool += CHARS.lowercase;
  if ($('opt-numbers').checked) pool += CHARS.numbers;
  if ($('opt-symbols').checked) pool += CHARS.symbols;
  return pool;
}

/**
 * Cryptographically random integer in [0, max)
 */
function cryptoRand(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

/**
 * Fisher–Yates shuffle using crypto-random values
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a password meeting all selected constraints.
 * Guarantees at least one character from each selected type.
 * @returns {string}
 */
function generateSecurePassword() {
  const length = parseInt($('length-slider').value);
  const pool = buildCharPool();

  if (pool.length === 0) {
    showToast('⚠️ Select at least one character type!', 'warn');
    return '';
  }

  // Gather required characters (one from each checked set)
  const requiredChars = [];
  if ($('opt-uppercase').checked) requiredChars.push(CHARS.uppercase[cryptoRand(CHARS.uppercase.length)]);
  if ($('opt-lowercase').checked) requiredChars.push(CHARS.lowercase[cryptoRand(CHARS.lowercase.length)]);
  if ($('opt-numbers').checked) requiredChars.push(CHARS.numbers[cryptoRand(CHARS.numbers.length)]);
  if ($('opt-symbols').checked) requiredChars.push(CHARS.symbols[cryptoRand(CHARS.symbols.length)]);

  // Fill remaining length from pool
  const remainder = [];
  for (let i = requiredChars.length; i < length; i++) {
    remainder.push(pool[cryptoRand(pool.length)]);
  }

  // Combine + shuffle
  return shuffle([...requiredChars, ...remainder]).join('');
}

/**
 * Main generate handler — called from UI
 */
function generatePassword() {
  const pw = generateSecurePassword();
  if (!pw) return;

  state.currentPassword = pw;
  state.isPasswordVisible = false;

  updatePasswordDisplay();
  evaluateStrength(pw);
  animateRegenerateIcon();

  // Show save panel
  $('save-card').style.display = 'block';
  $('used-for-input').value = '';
}

/* ═══════════════════════════════════════════
   5. STRENGTH EVALUATION
═══════════════════════════════════════════ */

/**
 * Evaluates password entropy and returns score 0–100
 */
function calcStrengthScore(pw) {
  let poolSize = 0;
  if (/[A-Z]/.test(pw)) poolSize += 26;
  if (/[a-z]/.test(pw)) poolSize += 26;
  if (/[0-9]/.test(pw)) poolSize += 10;
  if (/[^A-Za-z0-9]/.test(pw)) poolSize += 32;

  const entropy = pw.length * Math.log2(poolSize || 1);

  // Scale: 0–28 bits = weak, 28–50 = fair, 50–72 = good, 72+ = strong
  if (entropy >= 80) return 100;
  if (entropy >= 60) return 70 + Math.round((entropy - 60) / 20 * 30);
  if (entropy >= 40) return 40 + Math.round((entropy - 40) / 20 * 30);
  if (entropy >= 24) return 15 + Math.round((entropy - 24) / 16 * 25);
  return Math.max(5, Math.round(entropy / 24 * 15));
}

const STRENGTH_LEVELS = [
  { min: 0, max: 24, label: 'Very Weak', color: '#ef4444', grad: 'linear-gradient(90deg,#ef4444,#dc2626)' },
  { min: 25, max: 44, label: 'Weak', color: '#f97316', grad: 'linear-gradient(90deg,#f97316,#ea580c)' },
  { min: 45, max: 64, label: 'Fair', color: '#f59e0b', grad: 'linear-gradient(90deg,#f59e0b,#d97706)' },
  { min: 65, max: 79, label: 'Good', color: '#22c55e', grad: 'linear-gradient(90deg,#22c55e,#16a34a)' },
  { min: 80, max: 100, label: 'Strong', color: '#06b6d4', grad: 'linear-gradient(90deg,#8b5cf6,#06b6d4)' }
];

function evaluateStrength(pw) {
  const score = calcStrengthScore(pw);
  const level = STRENGTH_LEVELS.find(l => score >= l.min && score <= l.max) || STRENGTH_LEVELS[0];

  const bar = $('strength-bar');
  const badge = $('strength-badge');
  const track = bar.parentElement;

  bar.style.width = `${score}%`;
  bar.style.background = level.grad;

  badge.textContent = level.label;
  badge.style.color = level.color;
  badge.style.borderColor = level.color + '55';
  badge.style.background = level.color + '18';

  track.setAttribute('aria-valuenow', score);
}

/* ═══════════════════════════════════════════
   6. UI — GENERATOR
═══════════════════════════════════════════ */

/**
 * Updates the password display field
 */
function updatePasswordDisplay() {
  const el = $('password-text');
  if (!state.currentPassword) {
    el.textContent = 'Click Generate';
    el.classList.add('blurred');
    return;
  }
  el.textContent = state.currentPassword;
  el.classList.toggle('blurred', !state.isPasswordVisible);

  const eyeIcon = $('eye-icon');
  eyeIcon.className = state.isPasswordVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

/**
 * Toggle show/hide password
 */
function toggleVisibility() {
  if (!state.currentPassword) return;
  state.isPasswordVisible = !state.isPasswordVisible;
  updatePasswordDisplay();
}

/**
 * Copy password to clipboard
 */
async function copyPassword(pw) {
  const text = pw || state.currentPassword;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Password copied to clipboard!');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Password copied!');
  }
}

/**
 * Set mode and update UI
 */
function setMode(mode) {
  state.currentMode = mode;
  const cfg = MODES[mode];

  // Update buttons
  ['average', 'medium', 'strong'].forEach(m => {
    const btn = $(`mode-${m}`);
    btn.classList.toggle('active', m === mode);
    btn.setAttribute('aria-pressed', m === mode ? 'true' : 'false');
  });

  // Clamp length slider to mode range
  const slider = $('length-slider');
  slider.min = cfg.minLen;
  slider.max = cfg.maxLen;
  const clamped = Math.min(Math.max(parseInt(slider.value), cfg.minLen), cfg.maxLen);
  slider.value = clamped;
  $('length-input').value = clamped;
  updateSliderFill(slider);

  // Apply mode's character presets
  $('opt-uppercase').checked = cfg.required.includes('uppercase') || cfg.optional.includes('uppercase');
  $('opt-lowercase').checked = cfg.required.includes('lowercase');
  $('opt-numbers').checked = cfg.required.includes('numbers');
  $('opt-symbols').checked = cfg.required.includes('symbols');

  // Auto-generate a password
  generatePassword();
}

/**
 * Slider input handler
 */
function onSliderChange(val) {
  const mode = MODES[state.currentMode];
  let v = parseInt(val);
  v = Math.min(Math.max(v, mode.minLen), mode.maxLen);
  $('length-input').value = v;
  updateSliderFill($('length-slider'));
}

/**
 * Number input handler
 */
function onLengthInputChange(val) {
  const mode = MODES[state.currentMode];
  let v = parseInt(val) || mode.minLen;
  v = Math.min(Math.max(v, 6), 32);
  $('length-slider').value = v;
  updateSliderFill($('length-slider'));
  $('length-input').value = v;
}

/**
 * Update slider fill gradient via CSS custom property
 */
function updateSliderFill(slider) {
  const min = parseInt(slider.min) || 6;
  const max = parseInt(slider.max) || 32;
  const val = parseInt(slider.value);
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', `${pct}%`);
}

/**
 * Sync options change (no auto-regen, just marks dirty)
 */
function syncOptions() { }

/**
 * Animate regenerate icon
 */
function animateRegenerateIcon() {
  const btn = $('btn-regenerate');
  const icon = btn.querySelector('i');
  icon.style.transition = 'transform 0.5s ease';
  icon.style.transform = 'rotate(360deg)';
  setTimeout(() => { icon.style.transition = ''; icon.style.transform = ''; }, 550);
}

/* ─── Tab Switching ─── */
function switchTab(tab) {
  $('section-generator').classList.toggle('active', tab === 'generator');
  $('section-history').classList.toggle('active', tab === 'history');
  $('tab-generator').classList.toggle('active', tab === 'generator');
  $('tab-history').classList.toggle('active', tab === 'history');
  if (tab === 'history') renderHistory();
}

/* ═══════════════════════════════════════════
   7. HISTORY — CRUD & RENDER
═══════════════════════════════════════════ */

/**
 * Save current password to history
 */
function saveToHistory() {
  if (!state.currentPassword) {
    showToast('Generate a password first!', 'warn');
    return;
  }
  const usedFor = $('used-for-input').value.trim() || 'Unlabelled';
  const entry = {
    id: Date.now().toString(),
    password: state.currentPassword,
    usedFor,
    createdAt: new Date().toISOString()
  };
  state.history.unshift(entry);
  persistHistory();
  updateHistoryBadge();
  showToast('Password saved to history!');
  $('used-for-input').value = '';
}

/**
 * Delete a single history entry
 */
function deleteEntry(id) {
  openConfirm(
    'Are you sure you want to delete this password entry? This action cannot be undone.',
    () => {
      state.history = state.history.filter(e => e.id !== id);
      persistHistory();
      renderHistory();
      updateHistoryBadge();
      showToast('Entry deleted.');
    }
  );
}

/**
 * Clear all history
 */
function clearAllHistory() {
  if (state.history.length === 0) return showToast('History is already empty!', 'warn');
  openConfirm(
    `This will permanently delete all ${state.history.length} saved password(s). Are you sure?`,
    () => {
      state.history = [];
      persistHistory();
      renderHistory();
      updateHistoryBadge();
      showToast('All history cleared.');
    }
  );
}

/**
 * Open the edit modal for a given entry
 */
function openEditModal(id) {
  const entry = state.history.find(e => e.id === id);
  if (!entry) return;
  state.editingEntryId = id;
  $('modal-used-for').value = entry.usedFor;
  $('edit-modal').style.display = 'flex';
  setTimeout(() => $('modal-used-for').focus(), 100);
}

/**
 * Close edit modal
 */
function closeModal() {
  $('edit-modal').style.display = 'none';
  state.editingEntryId = null;
}

/**
 * Save edit modal changes
 */
function saveEdit() {
  const entry = state.history.find(e => e.id === state.editingEntryId);
  if (!entry) return;
  const val = $('modal-used-for').value.trim();
  entry.usedFor = val || 'Unlabelled';
  persistHistory();
  renderHistory();
  closeModal();
  showToast('Label updated!');
}

/**
 * Render history list with optional search filter
 */
function renderHistory() {
  const query = ($('history-search').value || '').toLowerCase().trim();
  const list = $('history-list');
  const emptyEl = $('history-empty');

  const filtered = query
    ? state.history.filter(e =>
      e.usedFor.toLowerCase().includes(query) ||
      e.password.toLowerCase().includes(query)
    )
    : state.history;

  if (filtered.length === 0) {
    list.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  list.innerHTML = filtered.map(entry => buildEntryHTML(entry)).join('');
}

/**
 * Build HTML for a single history entry card
 */
function buildEntryHTML(entry) {
  const dateStr = formatDate(entry.createdAt);
  const escaped = escapeHTML(entry.password);
  const label = escapeHTML(entry.usedFor);
  return `
    <article class="history-entry" aria-label="Password for ${label}">
      <div class="entry-top">
        <div class="entry-label">
          <span class="label-pill" title="${label}"><i class="fa-solid fa-tag" style="margin-right:4px;opacity:.7"></i>${label}</span>
        </div>
        <div class="entry-actions">
          <button class="entry-action-btn copy-btn" onclick="copyPassword('${entry.password}')" title="Copy password" aria-label="Copy password for ${label}">
            <i class="fa-solid fa-copy"></i>
          </button>
          <button class="entry-action-btn edit-btn" onclick="openEditModal('${entry.id}')" title="Edit label" aria-label="Edit label for ${label}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="entry-action-btn delete-btn" onclick="deleteEntry('${entry.id}')" title="Delete entry" aria-label="Delete password for ${label}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
      <div class="entry-password" title="${escaped}">${escaped}</div>
      <div class="entry-meta">
        <i class="fa-solid fa-clock" style="font-size:.7rem"></i>
        <span>${dateStr}</span>
      </div>
    </article>
  `;
}

/**
 * Update history badge count
 */
function updateHistoryBadge() {
  const badge = $('history-badge');
  badge.textContent = state.history.length;
  badge.style.display = state.history.length === 0 ? 'none' : '';
}

/* ═══════════════════════════════════════════
   8. LOCAL STORAGE
═══════════════════════════════════════════ */

function persistHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  } catch (e) {
    console.warn('Storage quota exceeded:', e);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch {
    state.history = [];
  }
}

/* ═══════════════════════════════════════════
   9. CSV EXPORT
═══════════════════════════════════════════ */

function exportCSV() {
  if (state.history.length === 0) {
    showToast('No history to export!', 'warn');
    return;
  }
  const headers = ['Used For', 'Password', 'Created At'];
  const rows = state.history.map(e => [
    csvEscape(e.usedFor),
    csvEscape(e.password),
    csvEscape(formatDate(e.createdAt))
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passforge_history_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully!');
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/* ═══════════════════════════════════════════
  10. MODALS & TOASTS
═══════════════════════════════════════════ */

/* ─── Toast ─── */
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = $('toast');
  const icon = toast.querySelector('.toast-icon');
  $('toast-msg').textContent = msg;

  if (type === 'warn') {
    icon.className = 'fa-solid fa-triangle-exclamation toast-icon';
    icon.style.color = '#f59e0b';
  } else {
    icon.className = 'fa-solid fa-circle-check toast-icon';
    icon.style.color = '#22c55e';
  }

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ─── Confirm Modal ─── */
let _confirmCallback = null;

function openConfirm(message, callback) {
  $('confirm-message').textContent = message;
  _confirmCallback = callback;
  $('confirm-modal').style.display = 'flex';
  $('confirm-action-btn').onclick = () => {
    if (_confirmCallback) _confirmCallback();
    closeConfirm();
  };
}

function closeConfirm() {
  $('confirm-modal').style.display = 'none';
  _confirmCallback = null;
}

/* ─── Close modals on backdrop click ─── */
['edit-modal', 'confirm-modal'].forEach(id => {
  $(id).addEventListener('click', e => {
    if (e.target.id === id) {
      if (id === 'edit-modal') closeModal();
      else closeConfirm();
    }
  });
});

/* ─── Keyboard: Escape closes modals ─── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
  }
});

/* ═══════════════════════════════════════════
  11. UTILITIES
═══════════════════════════════════════════ */

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* ═══════════════════════════════════════════
  12. INIT
═══════════════════════════════════════════ */

function init() {
  loadHistory();

  // Setup slider fill on init
  const slider = $('length-slider');
  updateSliderFill(slider);

  slider.addEventListener('input', function () {
    updateSliderFill(this);
    $('length-input').value = this.value;
  });

  $('length-input').addEventListener('change', function () {
    const mode = MODES[state.currentMode];
    let v = parseInt(this.value) || mode.minLen;
    v = Math.min(Math.max(v, 6), 32);
    this.value = v;
    slider.value = v;
    updateSliderFill(slider);
  });

  // Set initial mode (triggers generate)
  setMode('average');

  updateHistoryBadge();

  // Show password immediately after first generate
  state.isPasswordVisible = true;
  updatePasswordDisplay();
}

document.addEventListener('DOMContentLoaded', init);
