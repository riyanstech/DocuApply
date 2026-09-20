/* =====================================================
   DocuApply — Utilities
   Global namespace: window.DA
   ===================================================== */
window.DA = window.DA || {};

/* ---------- Small helpers ---------- */
DA.utils = (function () {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i ? 1 : 0) + ' ' + sizes[i];
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function readAsArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  }

  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function escapeHtml(s = '') {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait = 200) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
  }

  /**
   * Bind a dropzone (click + drag&drop) to a hidden file input.
   */
  function bindDropZone(dropEl, inputEl, onFiles) {
    dropEl.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', (e) => {
      if (e.target.files?.length) onFiles(e.target.files);
      e.target.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev =>
      dropEl.addEventListener(ev, (e) => {
        e.preventDefault();
        dropEl.classList.add('drop-active');
      })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropEl.addEventListener(ev, (e) => {
        e.preventDefault();
        dropEl.classList.remove('drop-active');
      })
    );
    dropEl.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    });
  }

  return { uid, formatBytes, downloadBlob, readAsArrayBuffer, readAsDataURL, escapeHtml, debounce, bindDropZone };
})();

/* ---------- Toast ---------- */
DA.toast = (function () {
  let container;
  const ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    warn: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
  };
  const COLORS = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300',
    warn: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300',
  };
  const ICON_COLORS = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    warn: 'text-amber-500',
    info: 'text-blue-500',
  };

  function show(message, type = 'info', duration = 3200) {
    if (!container) container = document.getElementById('toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg shadow-black/5 backdrop-blur ${COLORS[type] || COLORS.info}`;
    el.innerHTML = `
      <i class="fa-solid ${ICONS[type] || ICONS.info} mt-0.5 ${ICON_COLORS[type] || ''}"></i>
      <div class="flex-1 text-xs font-semibold leading-relaxed">${DA.utils.escapeHtml(message)}</div>
      <button class="opacity-50 hover:opacity-100 transition-opacity -mr-1">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>`;
    const close = () => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector('button').addEventListener('click', close);
    container.appendChild(el);
    if (duration > 0) setTimeout(close, duration);
  }

  return {
    show,
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d),
    warn: (m, d) => show(m, 'warn', d),
    info: (m, d) => show(m, 'info', d),
  };
})();

/* ---------- Local storage ---------- */
DA.storage = (function () {
  const PREFIX = 'docuapply:';
  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
  }
  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  }
  return { get, set, remove };
})();

/* ---------- Confirm modal (simple) ---------- */
DA.confirm = function (message) {
  return window.confirm(message);
};