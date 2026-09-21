/* =====================================================
   DocuApply — Admin Dashboard v3
   - Modern UI with modal forms (no more prompt())
   - Overview tab with stats & activity log
   - Category management
   - Search & filter
   - Duplicate entries
   - GitHub sync integration
   - Psikotes Manager integration
   ===================================================== */
window.DA = window.DA || {};

DA.admin = (function () {
  'use strict';

  const { storage, toast } = DA;
  const { downloadBlob, escapeHtml, uid, formatBytes } = DA.utils;

  /* ============================================
     STATE
     ============================================ */
  let els = {};
  let activeTab = 'overview';
  let activityLog = [];

  let cvCache = [];
  let cpCache = { categories: [], companies: [], disclaimer: '' };
  let emCache = [];

  const ACTIVITY_KEY = 'adminActivityLog';
  const CATEGORY_COLORS = ['blue', 'emerald', 'purple', 'amber', 'rose', 'indigo', 'slate'];
  const ICON_LIST_CV = [
    'fa-file-lines', 'fa-file-invoice', 'fa-briefcase', 'fa-palette', 'fa-star', 'fa-rocket',
    'fa-id-card', 'fa-file-word', 'fa-user-tie', 'fa-lightbulb', 'fa-gem', 'fa-crown',
  ];
  const ICON_LIST_CAT = [
    'fa-globe', 'fa-landmark', 'fa-building-columns', 'fa-tower-cell', 'fa-rocket',
    'fa-cart-shopping', 'fa-car', 'fa-industry', 'fa-plane', 'fa-store',
    'fa-bolt', 'fa-briefcase', 'fa-shirt', 'fa-scissors', 'fa-utensils',
    'fa-couch', 'fa-pills', 'fa-tag', 'fa-star', 'fa-heart',
  ];

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      screen: document.getElementById('adminDashboard'),
      close: document.getElementById('adminCloseBtn'),
      tabs: document.querySelectorAll('[data-admin-tab]'),
      panels: document.querySelectorAll('[data-admin-panel]'),

      // Overview
      statCvCount: document.getElementById('statCvCount'),
      statCompaniesCount: document.getElementById('statCompaniesCount'),
      statCategoriesCount: document.getElementById('statCategoriesCount'),
      statEmailCount: document.getElementById('statEmailCount'),
      overviewGhStatus: document.getElementById('overviewGhStatus'),
      adminActivityList: document.getElementById('adminActivityList'),
      clearActivityBtn: document.getElementById('clearActivityBtn'),

      // CV
      cvList: document.getElementById('adminCvList'),
      cvSearch: document.getElementById('adminCvSearch'),
      cvAddBtn: document.getElementById('adminCvAddBtn'),
      cvReset: document.getElementById('adminCvReset'),
      cvUploadBtn: document.getElementById('adminCvUploadBtn'),
      cvUploadInput: document.getElementById('adminCvUploadInput'),

      // Companies
      cpList: document.getElementById('adminCompaniesList'),
      cpSearch: document.getElementById('adminCompaniesSearch'),
      cpFilter: document.getElementById('adminCompaniesFilter'),
      cpAddBtn: document.getElementById('adminCompaniesAddBtn'),
      cpReset: document.getElementById('adminCompaniesReset'),
      cpSaveBtn: document.getElementById('adminCompaniesSaveBtn'),

      // Categories
      catList: document.getElementById('adminCategoriesList'),
      catSearch: document.getElementById('adminCategoriesSearch'),
      catAddBtn: document.getElementById('adminCategoriesAddBtn'),
      catSaveBtn: document.getElementById('adminCategoriesSaveBtn'),

      // Email
      emList: document.getElementById('adminEmailList'),
      emSearch: document.getElementById('adminEmailSearch'),
      emAddBtn: document.getElementById('adminEmailAddBtn'),
      emReset: document.getElementById('adminEmailReset'),
      emSaveBtn: document.getElementById('adminEmailSaveBtn'),

      // Settings
      passOld: document.getElementById('adminPassOld'),
      passNew: document.getElementById('adminPassNew'),
      passChangeBtn: document.getElementById('adminPassChangeBtn'),

      ghOwner: document.getElementById('ghOwner'),
      ghRepo: document.getElementById('ghRepo'),
      ghBranch: document.getElementById('ghBranch'),
      ghToken: document.getElementById('ghToken'),
      ghTestBtn: document.getElementById('ghTestBtn'),
      ghSaveBtn: document.getElementById('ghSaveBtn'),
      ghClearBtn: document.getElementById('ghClearBtn'),
      ghStatus: document.getElementById('ghStatus'),

      exportBtn: document.getElementById('adminExportBtn'),
      importBtn: document.getElementById('adminImportBtn'),
      importInput: document.getElementById('adminImportInput'),

      // Modal
      modal: document.getElementById('adminModal'),
      modalIcon: document.getElementById('adminModalIcon'),
      modalTitle: document.getElementById('adminModalTitle'),
      modalSubtitle: document.getElementById('adminModalSubtitle'),
      modalBody: document.getElementById('adminModalBody'),
      modalSubmit: document.getElementById('adminModalSubmit'),

      // Confirm
      confirmModal: document.getElementById('adminConfirmModal'),
      confirmTitle: document.getElementById('adminConfirmTitle'),
      confirmSubtitle: document.getElementById('adminConfirmSubtitle'),
      confirmMessage: document.getElementById('adminConfirmMessage'),
      confirmOk: document.getElementById('adminConfirmOk'),
    };

    if (!els.screen) {
      console.warn('[Admin] Dashboard element not found — skip init');
      return;
    }

    loadActivity();
    bindEvents();
    loadGithubConfig();

    // Init psikotes manager
    if (DA.adminPsikotes && typeof DA.adminPsikotes.init === 'function') {
      try { DA.adminPsikotes.init(); } catch (e) { console.warn('[Admin] psikotes init error:', e); }
    }
  }

  /* ============================================
     OPEN / CLOSE
     ============================================ */
  function open() {
    if (!DA.auth || !DA.auth.isAdmin()) {
      toast.error('Hanya admin yang bisa membuka dashboard');
      return;
    }
    els.screen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    switchTab('overview');
  }

  function close() {
    els.screen.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ============================================
     TABS
     ============================================ */
  function switchTab(name) {
    activeTab = name;
    els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.adminTab === name));
    els.panels.forEach((p) => p.classList.toggle('hidden', p.dataset.adminPanel !== name));
    renderTab(name);
  }

  function renderTab(name) {
    if (name === 'overview') renderOverview();
    else if (name === 'cv') renderCvList();
    else if (name === 'companies') renderCompaniesList();
    else if (name === 'categories') renderCategoriesList();
    else if (name === 'email') renderEmailList();
    else if (name === 'psikotes') {
      // adminPsikotes renders itself; no action needed here
    }
  }

  /* ============================================
     ACTIVITY LOG
     ============================================ */
  function loadActivity() {
    activityLog = storage.get(ACTIVITY_KEY, []);
    if (!Array.isArray(activityLog)) activityLog = [];
  }

  function logActivity(text, icon = 'fa-pen') {
    activityLog.unshift({ text, icon, ts: Date.now() });
    if (activityLog.length > 50) activityLog.length = 50;
    storage.set(ACTIVITY_KEY, activityLog);
    if (activeTab === 'overview') renderActivity();
  }

  function clearActivity() {
    activityLog = [];
    storage.remove(ACTIVITY_KEY);
    renderActivity();
    toast.info('Aktivitas dibersihkan');
  }

  function renderActivity() {
    if (!els.adminActivityList) return;
    if (!activityLog.length) {
      els.adminActivityList.innerHTML = `
        <div class="admin-empty" style="padding:24px;">
          <i class="fa-solid fa-clock" style="font-size:28px;"></i>
          <div>Belum ada aktivitas</div>
        </div>`;
      return;
    }
    els.adminActivityList.innerHTML = activityLog.slice(0, 20).map((a) => `
      <div class="admin-activity-item">
        <div class="admin-activity-icon"><i class="fa-solid ${escapeHtml(a.icon || 'fa-pen')}"></i></div>
        <div class="admin-activity-body">
          <div class="admin-activity-text">${escapeHtml(a.text)}</div>
          <div class="admin-activity-time">${escapeHtml(formatTimeAgo(a.ts))}</div>
        </div>
      </div>
    `).join('');
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Baru saja';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} menit lalu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} jam lalu`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} hari lalu`;
    return new Date(ts).toLocaleDateString('id-ID');
  }

  /* ============================================
     GITHUB CONFIG
     ============================================ */
  function loadGithubConfig() {
    const cfg = DA.github ? DA.github.getConfig() : null;
    if (!cfg) return;
    if (els.ghOwner) els.ghOwner.value = cfg.owner || '';
    if (els.ghRepo) els.ghRepo.value = cfg.repo || '';
    if (els.ghBranch) els.ghBranch.value = cfg.branch || 'main';
    if (els.ghToken) els.ghToken.value = cfg.token || '';
    updateGhStatus();
  }

  function updateGhStatus() {
    const cfg = DA.github ? DA.github.getConfig() : null;
    const ok = !!(cfg && cfg.owner && cfg.repo && cfg.token);

    if (els.ghStatus) {
      if (ok) {
        els.ghStatus.className = 'gh-status gh-status-ok';
        els.ghStatus.innerHTML = `
          <i class="fa-solid fa-circle-check text-emerald-500"></i>
          <span class="text-emerald-700 dark:text-emerald-400">
            Terhubung ke <strong>${escapeHtml(cfg.owner)}/${escapeHtml(cfg.repo)}</strong>
            (<code>${escapeHtml(cfg.branch || 'main')}</code>)
          </span>`;
      } else {
        els.ghStatus.className = 'gh-status gh-status-warn';
        els.ghStatus.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
          <span class="text-amber-700 dark:text-amber-400">Belum dikonfigurasi</span>`;
      }
    }

    if (els.overviewGhStatus) {
      if (ok) {
        els.overviewGhStatus.className = 'overview-gh-status ok';
        els.overviewGhStatus.innerHTML = `
          <i class="fa-solid fa-circle-check"></i>
          <span>Terhubung ke <strong>${escapeHtml(cfg.owner)}/${escapeHtml(cfg.repo)}</strong></span>`;
      } else {
        els.overviewGhStatus.className = 'overview-gh-status warn';
        els.overviewGhStatus.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Belum dikonfigurasi — setup di tab Pengaturan</span>`;
      }
    }
  }

  async function saveGithubConfig() {
    const owner = els.ghOwner?.value.trim();
    const repo = els.ghRepo?.value.trim();
    const branch = els.ghBranch?.value.trim() || 'main';
    const token = els.ghToken?.value.trim();

    if (!owner || !repo || !token) {
      toast.error('Semua field wajib diisi');
      return;
    }

    DA.github.setConfig({ owner, repo, branch, token });
    toast.info('Testing koneksi...', 1500);

    const result = await DA.github.testConnection();
    if (result.ok) {
      toast.success('✅ ' + result.msg, 3500);
      logActivity('GitHub terhubung: ' + owner + '/' + repo, 'fa-github');
    } else {
      toast.error('❌ Gagal: ' + result.msg, 5000);
    }
    updateGhStatus();
  }

  async function testGithub() {
    const result = await DA.github.testConnection();
    if (result.ok) toast.success('✅ ' + result.msg, 3500);
    else toast.error('❌ ' + result.msg, 5000);
  }

  function clearGithubConfig() {
    showConfirm({
      title: 'Hapus Config GitHub?',
      subtitle: 'Konfigurasi akan dihapus dari browser',
      message: 'Setelah dihapus, admin tidak bisa upload file atau sync ke GitHub sampai setup ulang.',
      okText: 'Ya, Hapus',
      onOk: () => {
        DA.github.clearConfig();
        if (els.ghOwner) els.ghOwner.value = '';
        if (els.ghRepo) els.ghRepo.value = '';
        if (els.ghBranch) els.ghBranch.value = 'main';
        if (els.ghToken) els.ghToken.value = '';
        updateGhStatus();
        toast.info('Konfigurasi dihapus');
        logActivity('Konfigurasi GitHub dihapus', 'fa-trash-can');
      },
    });
  }

  /* ============================================
     DATA LOADERS
     ============================================ */
  async function getCvTemplates() {
    if (DA.github && DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('cv-templates/templates.json');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return Array.isArray(data) ? data : (data.templates || []);
        } catch {}
      }
    }
    try {
      const res = await fetch('cv-templates/templates.json?t=' + Date.now());
      const data = await res.json();
      return Array.isArray(data) ? data : (data.templates || []);
    } catch {
      return [];
    }
  }

  async function getCompaniesData() {
    if (DA.github && DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('companies/companies.json');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return {
            categories: data.categories || [],
            companies: data.companies || [],
            disclaimer: data.disclaimer || '',
          };
        } catch {}
      }
    }
    try {
      const res = await fetch('companies/companies.json?t=' + Date.now());
      const data = await res.json();
      return {
        categories: data.categories || [],
        companies: data.companies || [],
        disclaimer: data.disclaimer || '',
      };
    } catch {
      return { categories: [], companies: [], disclaimer: '' };
    }
  }

  async function getEmailTemplates() {
    if (DA.github && DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('email-templates/email-templates.json');
      if (raw) {
        try { return JSON.parse(raw); } catch {}
      }
    }
    return null;
  }

  /* ============================================
     DATA SAVERS
     ============================================ */
  async function saveCvTemplates(list) {
    storage.set('cvTemplatesOverride', list);
    if (!DA.github || !DA.github.isConfigured()) {
      toast.warn('Tersimpan lokal. Setup GitHub untuk sync antar device.', 4000);
      return false;
    }
    try {
      toast.info('Menyimpan ke GitHub...', 2000);
      await DA.github.uploadFile(
        'cv-templates/templates.json',
        JSON.stringify({ templates: list }, null, 2),
        'chore: update CV templates from admin dashboard'
      );
      toast.success('✅ Tersimpan di GitHub. Deploy ~1 menit.', 5000);
      window.dispatchEvent(new Event('cvTemplates:updated'));
      return true;
    } catch (err) {
      toast.error('Gagal simpan ke GitHub: ' + err.message, 6000);
      return false;
    }
  }

  async function saveCompanies(data) {
    storage.set('companiesOverride', data);
    if (!DA.github || !DA.github.isConfigured()) {
      toast.warn('Tersimpan lokal. Setup GitHub untuk sync antar device.', 4000);
      return false;
    }
    try {
      toast.info('Menyimpan ke GitHub...', 2000);
      await DA.github.uploadFile(
        'companies/companies.json',
        JSON.stringify(data, null, 2),
        'chore: update companies data from admin dashboard'
      );
      toast.success('✅ Tersimpan di GitHub.', 5000);
      window.dispatchEvent(new Event('companies:updated'));
      return true;
    } catch (err) {
      toast.error('Gagal simpan: ' + err.message, 6000);
      return false;
    }
  }

  async function saveEmailTemplates(list) {
    storage.set('emailTemplatesOverride', list);
    if (!DA.github || !DA.github.isConfigured()) {
      toast.warn('Tersimpan lokal. Setup GitHub untuk sync antar device.', 4000);
      return false;
    }
    try {
      toast.info('Menyimpan ke GitHub...', 2000);
      await DA.github.uploadFile(
        'email-templates/email-templates.json',
        JSON.stringify({ templates: list }, null, 2),
        'chore: update email templates from admin dashboard'
      );
      toast.success('✅ Tersimpan di GitHub.', 5000);
      window.dispatchEvent(new Event('emailTemplates:updated'));
      return true;
    } catch (err) {
      toast.error('Gagal simpan: ' + err.message, 6000);
      return false;
    }
  }

  /* ============================================
     MODAL SYSTEM
     ============================================ */
  function openModal(opts = {}) {
    if (!els.modal) return;

    const {
      icon = 'fa-pen',
      title = 'Edit',
      subtitle = 'Isi form di bawah',
      bodyHtml = '',
      submitText = 'Simpan',
      onSubmit = null,
    } = opts;

    if (els.modalIcon) els.modalIcon.innerHTML = `<i class="fa-solid ${escapeHtml(icon)}"></i>`;
    if (els.modalTitle) els.modalTitle.textContent = title;
    if (els.modalSubtitle) els.modalSubtitle.textContent = subtitle;
    if (els.modalBody) els.modalBody.innerHTML = bodyHtml;
    if (els.modalSubmit) {
      els.modalSubmit.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(submitText)}`;
    }

    els.modal.classList.remove('hidden');

    // Rebind submit listener
    const fresh = els.modalSubmit.cloneNode(true);
    els.modalSubmit.parentNode.replaceChild(fresh, els.modalSubmit);
    els.modalSubmit = fresh;
    els.modalSubmit.addEventListener('click', () => {
      if (typeof onSubmit === 'function') onSubmit();
    });

    setTimeout(() => {
      const first = els.modalBody?.querySelector('input, select, textarea');
      first?.focus();
    }, 120);
  }

  function closeModal() {
    if (els.modal) els.modal.classList.add('hidden');
  }

  function showConfirm(opts = {}) {
    if (!els.confirmModal) return;

    const {
      title = 'Konfirmasi',
      subtitle = 'Apakah Anda yakin?',
      message = '',
      okText = 'Ya, Lanjutkan',
      onOk = null,
    } = opts;

    if (els.confirmTitle) els.confirmTitle.textContent = title;
    if (els.confirmSubtitle) els.confirmSubtitle.textContent = subtitle;
    if (els.confirmMessage) els.confirmMessage.innerHTML = message;
    if (els.confirmOk) {
      els.confirmOk.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(okText)}`;
    }

    els.confirmModal.classList.remove('hidden');

    const fresh = els.confirmOk.cloneNode(true);
    els.confirmOk.parentNode.replaceChild(fresh, els.confirmOk);
    els.confirmOk = fresh;
    els.confirmOk.addEventListener('click', () => {
      els.confirmModal.classList.add('hidden');
      if (typeof onOk === 'function') onOk();
    });
  }

  function closeConfirm() {
    if (els.confirmModal) els.confirmModal.classList.add('hidden');
  }

  /* ============================================
     HELPERS
     ============================================ */
  function colorHex(name) {
    const map = {
      blue: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
      emerald: 'linear-gradient(135deg,#10b981,#047857)',
      purple: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',
      amber: 'linear-gradient(135deg,#f59e0b,#d97706)',
      rose: 'linear-gradient(135deg,#f43f5e,#be123c)',
      indigo: 'linear-gradient(135deg,#6366f1,#4338ca)',
      slate: 'linear-gradient(135deg,#64748b,#334155)',
    };
    return map[name] || map.blue;
  }

  function bindColorPicker(rowId, inputId) {
    const row = document.getElementById(rowId);
    const input = document.getElementById(inputId);
    if (!row || !input) return;
    row.querySelectorAll('.color-option').forEach((el) => {
      el.addEventListener('click', () => {
        row.querySelectorAll('.color-option').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        input.value = el.dataset.color;
      });
    });
  }

  function bindIconPicker(rowId, inputId) {
    const row = document.getElementById(rowId);
    const input = document.getElementById(inputId);
    if (!row || !input) return;
    row.querySelectorAll('.icon-option').forEach((el) => {
      el.addEventListener('click', () => {
        row.querySelectorAll('.icon-option').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        input.value = el.dataset.icon;
      });
    });
  }

  /* ============================================
     TAB: OVERVIEW
     ============================================ */
  async function renderOverview() {
    const [cvList, cpData, emData] = await Promise.all([
      getCvTemplates(),
      getCompaniesData(),
      getEmailTemplates(),
    ]);

    if (els.statCvCount) els.statCvCount.textContent = cvList.length;
    if (els.statCompaniesCount) els.statCompaniesCount.textContent = (cpData.companies || []).length;
    if (els.statCategoriesCount) els.statCategoriesCount.textContent = (cpData.categories || []).length;
    if (els.statEmailCount) els.statEmailCount.textContent = (emData?.templates || []).length;

    renderActivity();
    updateGhStatus();
  }

  /* ============================================
     TAB: CV TEMPLATES
     ============================================ */
  async function renderCvList() {
    if (!els.cvList) return;
    els.cvList.innerHTML = '<div class="admin-empty" style="padding:24px;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    cvCache = await getCvTemplates();
    filterCvList();
  }

  function filterCvList() {
    if (!els.cvList) return;
    const q = (els.cvSearch?.value || '').toLowerCase().trim();

    const filtered = cvCache.filter((t) => {
      if (!q) return true;
      const hay = `${t.name || ''} ${t.file || ''} ${t.description || ''}`.toLowerCase();
      return hay.includes(q);
    });

    if (!filtered.length) {
      els.cvList.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-folder-open"></i>
          <div>${cvCache.length ? 'Tidak ada hasil' : 'Belum ada template CV'}</div>
        </div>`;
      return;
    }

    els.cvList.innerHTML = filtered.map((t) => {
      const idx = cvCache.indexOf(t);
      return `
        <div class="admin-row" data-idx="${idx}">
          <div class="admin-row-icon">
            <i class="fa-solid ${escapeHtml(t.icon || 'fa-file-lines')}"></i>
          </div>
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(t.name || '(tanpa nama)')}</div>
            <div class="admin-row-sub">${escapeHtml(t.file || '')} · ${escapeHtml(t.description || '')}</div>
          </div>
          <div class="admin-row-actions">
            <button data-action="edit" class="admin-btn-icon primary" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button data-action="dup" class="admin-btn-icon warn" title="Duplikat"><i class="fa-regular fa-clone"></i></button>
            <button data-action="del" class="admin-btn-icon danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');

    els.cvList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => editCvTemplate(idx));
      row.querySelector('[data-action="dup"]')?.addEventListener('click', () => duplicateCvTemplate(idx));
      row.querySelector('[data-action="del"]')?.addEventListener('click', () => deleteCvTemplate(idx));
    });
  }

  function cvFormHtml(t = {}) {
    const color = t.color || 'blue';
    const icon = t.icon || 'fa-file-lines';
    return `
      <div class="form-field">
        <label class="form-field-label">Nama Template <span class="req">*</span></label>
        <input type="text" id="cvName" class="form-field-input" value="${escapeHtml(t.name || '')}" placeholder="Contoh: CV Modern">
      </div>
      <div class="form-field">
        <label class="form-field-label">File .docx <span class="req">*</span></label>
        <input type="text" id="cvFile" class="form-field-input" value="${escapeHtml(t.file || '')}" placeholder="cv-modern.docx">
        <p class="form-field-hint">Nama file harus persis sama dengan file di folder <code>cv-templates/</code></p>
      </div>
      <div class="form-field">
        <label class="form-field-label">Deskripsi</label>
        <textarea id="cvDesc" class="form-field-input" rows="2" placeholder="Deskripsi singkat template">${escapeHtml(t.description || '')}</textarea>
      </div>
      <div class="form-field">
        <label class="form-field-label">Warna Kartu</label>
        <div class="color-options-row" id="cvColorRow">
          ${CATEGORY_COLORS.map((c) => `
            <div class="color-option ${color === c ? 'selected' : ''}" data-color="${c}" style="background:${colorHex(c)}"></div>
          `).join('')}
        </div>
        <input type="hidden" id="cvColor" value="${escapeHtml(color)}">
      </div>
      <div class="form-field">
        <label class="form-field-label">Icon</label>
        <div class="icon-options-row" id="cvIconRow">
          ${ICON_LIST_CV.map((ic) => `
            <div class="icon-option ${icon === ic ? 'selected' : ''}" data-icon="${ic}">
              <i class="fa-solid ${ic}"></i>
            </div>`).join('')}
        </div>
        <input type="hidden" id="cvIcon" value="${escapeHtml(icon)}">
      </div>
    `;
  }

  function addCvTemplate() {
    openModal({
      icon: 'fa-plus',
      title: 'Tambah Template CV',
      subtitle: 'Isi data template baru',
      bodyHtml: cvFormHtml(),
      submitText: 'Tambah',
      onSubmit: async () => {
        const name = document.getElementById('cvName')?.value.trim();
        const file = document.getElementById('cvFile')?.value.trim();
        const desc = document.getElementById('cvDesc')?.value.trim() || '';
        const color = document.getElementById('cvColor')?.value || 'blue';
        const icon = document.getElementById('cvIcon')?.value || 'fa-file-lines';

        if (!name || !file) {
          toast.error('Nama dan file wajib diisi');
          return;
        }

        const list = await getCvTemplates();
        list.push({ id: uid(), name, file, description: desc, icon, color });
        await saveCvTemplates(list);
        logActivity(`Menambah CV: ${name}`, 'fa-plus');
        closeModal();
        renderCvList();
      },
    });
    setTimeout(() => {
      bindColorPicker('cvColorRow', 'cvColor');
      bindIconPicker('cvIconRow', 'cvIcon');
    }, 60);
  }

  async function editCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;

    openModal({
      icon: 'fa-pen',
      title: 'Edit Template CV',
      subtitle: t.name || '',
      bodyHtml: cvFormHtml(t),
      submitText: 'Simpan',
      onSubmit: async () => {
        const name = document.getElementById('cvName')?.value.trim();
        const file = document.getElementById('cvFile')?.value.trim();
        const desc = document.getElementById('cvDesc')?.value.trim() || '';
        const color = document.getElementById('cvColor')?.value || 'blue';
        const icon = document.getElementById('cvIcon')?.value || 'fa-file-lines';

        if (!name || !file) {
          toast.error('Nama dan file wajib diisi');
          return;
        }

        t.name = name;
        t.file = file;
        t.description = desc;
        t.color = color;
        t.icon = icon;
        await saveCvTemplates(list);
        logActivity(`Mengedit CV: ${name}`, 'fa-pen');
        closeModal();
        renderCvList();
      },
    });
    setTimeout(() => {
      bindColorPicker('cvColorRow', 'cvColor');
      bindIconPicker('cvIconRow', 'cvIcon');
    }, 60);
  }

  async function duplicateCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;
    const dup = { ...t, id: uid(), name: (t.name || '') + ' (Copy)' };
    list.splice(idx + 1, 0, dup);
    await saveCvTemplates(list);
    logActivity(`Duplikasi CV: ${t.name}`, 'fa-clone');
    renderCvList();
  }

  async function deleteCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;
    showConfirm({
      title: 'Hapus Template CV?',
      subtitle: t.name || '',
      message: `Template <strong>${escapeHtml(t.name || '')}</strong> akan dihapus dari daftar. File .docx di GitHub tidak ikut terhapus.`,
      okText: 'Ya, Hapus',
      onOk: async () => {
        list.splice(idx, 1);
        await saveCvTemplates(list);
        logActivity(`Menghapus CV: ${t.name}`, 'fa-trash-can');
        renderCvList();
      },
    });
  }

  async function resetCvTemplates() {
    showConfirm({
      title: 'Reset Template CV?',
      subtitle: 'Kembalikan ke default dari server',
      message: 'Semua template CV akan dikembalikan ke data default dari server. Perubahan tidak bisa dibatalkan.',
      okText: 'Ya, Reset',
      onOk: async () => {
        try {
          const res = await fetch('cv-templates/templates.json?t=' + Date.now());
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.templates || []);
          await saveCvTemplates(list);
          logActivity('Reset template CV ke default', 'fa-rotate-left');
          renderCvList();
        } catch (err) {
          toast.error('Gagal reset: ' + err.message);
        }
      },
    });
  }

  async function uploadCvFile(file) {
    if (!DA.github || !DA.github.isConfigured()) {
      toast.error('Setup GitHub dulu di tab Pengaturan', 5000);
      return;
    }
    if (!file.name.endsWith('.docx')) {
      toast.error('File harus .docx');
      return;
    }

    openModal({
      icon: 'fa-cloud-arrow-up',
      title: 'Upload File .docx',
      subtitle: 'File akan diupload ke GitHub',
      bodyHtml: `
        <div class="upload-preview">
          <div class="upload-preview-icon"><i class="fa-solid fa-file-word"></i></div>
          <div class="upload-preview-body">
            <div class="upload-preview-name">${escapeHtml(file.name)}</div>
            <div class="upload-preview-size">${formatBytes(file.size)}</div>
          </div>
        </div>
        <div class="form-field">
          <label class="form-field-label">Nama Template untuk Ditampilkan <span class="req">*</span></label>
          <input type="text" id="uploadCvName" class="form-field-input"
                 value="${escapeHtml(file.name.replace('.docx', '').replace(/[-_]/g, ' '))}"
                 placeholder="CV Modern">
        </div>
        <div class="form-field">
          <label class="form-field-label">Deskripsi</label>
          <textarea id="uploadCvDesc" class="form-field-input" rows="2"
                    placeholder="Deskripsi singkat template">Template CV dari admin</textarea>
        </div>
        <div class="form-field">
          <label class="form-field-label">Warna Kartu</label>
          <div class="color-options-row" id="upCvColorRow">
            ${CATEGORY_COLORS.map((c) => `
              <div class="color-option ${c === 'blue' ? 'selected' : ''}" data-color="${c}" style="background:${colorHex(c)}"></div>
            `).join('')}
          </div>
          <input type="hidden" id="upCvColor" value="blue">
        </div>
      `,
      submitText: 'Upload & Tambah',
      onSubmit: async () => {
        const name = document.getElementById('uploadCvName')?.value.trim();
        const desc = document.getElementById('uploadCvDesc')?.value.trim() || 'Template CV dari admin';
        const color = document.getElementById('upCvColor')?.value || 'blue';
        if (!name) {
          toast.error('Nama wajib diisi');
          return;
        }
        closeModal();
        try {
          toast.info(`Mengupload ${file.name}...`, 3000);
          const path = 'cv-templates/' + file.name;
          await DA.github.uploadBinaryFile(path, file, `feat: upload ${file.name} via admin`);

          const list = await getCvTemplates();
          list.push({
            id: uid(),
            name,
            file: file.name,
            description: desc,
            icon: 'fa-file-lines',
            color,
          });
          await saveCvTemplates(list);
          logActivity(`Upload CV: ${file.name}`, 'fa-cloud-arrow-up');
          toast.success('✅ File terupload & template ditambahkan!', 5000);
          renderCvList();
        } catch (err) {
          toast.error('Gagal upload: ' + err.message, 6000);
        }
      },
    });
    setTimeout(() => bindColorPicker('upCvColorRow', 'upCvColor'), 60);
  }

  /* ============================================
     TAB: COMPANIES
     ============================================ */
  async function renderCompaniesList() {
    if (!els.cpList) return;
    els.cpList.innerHTML = '<div class="admin-empty" style="padding:24px;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    cpCache = await getCompaniesData();
    populateCompanyFilter();
    filterCompaniesList();
  }

  function populateCompanyFilter() {
    if (!els.cpFilter) return;
    const current = els.cpFilter.value;
    els.cpFilter.innerHTML = '<option value="">Semua Kategori</option>' +
      (cpCache.categories || []).map((c) => `
        <option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>
      `).join('');
    if (current) els.cpFilter.value = current;
  }

  function filterCompaniesList() {
    if (!els.cpList) return;
    const q = (els.cpSearch?.value || '').toLowerCase().trim();
    const cat = els.cpFilter?.value || '';

    const filtered = (cpCache.companies || []).filter((c) => {
      if (cat && c.category !== cat) return false;
      if (q) {
        const applies = (c.apply || []).map((a) => `${a.value || ''} ${a.subject || ''}`).join(' ');
        const hay = `${c.name || ''} ${c.location || ''} ${c.category || ''} ${applies}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      els.cpList.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-building"></i>
          <div>${(cpCache.companies || []).length ? 'Tidak ada hasil' : 'Belum ada perusahaan'}</div>
        </div>`;
      return;
    }

    els.cpList.innerHTML = filtered.map((c) => {
      const idx = cpCache.companies.indexOf(c);
      const applies = (c.apply || []).map((a) => {
        const icon = a.type === 'email' ? 'fa-envelope' : 'fa-globe';
        return `<span class="admin-chip"><i class="fa-solid ${icon}"></i> ${escapeHtml(a.value || '')}</span>`;
      }).join('');
      return `
        <div class="admin-row admin-row-lg" data-idx="${idx}">
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(c.name || '')}</div>
            <div class="admin-row-sub">${escapeHtml(catName(c.category))} · ${escapeHtml(c.location || '')}</div>
            <div class="admin-row-chips">${applies}</div>
          </div>
          <div class="admin-row-actions">
            <button data-action="edit" class="admin-btn-icon primary" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button data-action="dup" class="admin-btn-icon warn" title="Duplikat"><i class="fa-regular fa-clone"></i></button>
            <button data-action="del" class="admin-btn-icon danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');

    els.cpList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => editCompany(idx));
      row.querySelector('[data-action="dup"]')?.addEventListener('click', () => duplicateCompany(idx));
      row.querySelector('[data-action="del"]')?.addEventListener('click', () => deleteCompany(idx));
    });
  }

  function catName(id) {
    const c = (cpCache.categories || []).find((x) => x.id === id);
    return c ? c.name : (id || '');
  }

  function companyFormHtml(c = {}) {
    const cats = (cpCache.categories || []).filter((x) => x.id !== 'all');
    if (!cats.length) cats.push({ id: 'manufaktur', name: 'Manufaktur' });

    return `
      <div class="form-field">
        <label class="form-field-label">Nama Perusahaan <span class="req">*</span></label>
        <input type="text" id="cpName" class="form-field-input" value="${escapeHtml(c.name || '')}" placeholder="PT Contoh Sukses">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-field">
          <label class="form-field-label">Kategori</label>
          <select id="cpCategory" class="form-field-input">
            ${cats.map((cat) => `
              <option value="${escapeHtml(cat.id)}" ${c.category === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field-label">Kota</label>
          <input type="text" id="cpLocation" class="form-field-input" value="${escapeHtml(c.location || '')}" placeholder="Bandung">
        </div>
      </div>
      <div class="form-field">
        <label class="form-field-label">Metode Apply <span class="req">*</span></label>
        <div class="apply-list" id="applyList"></div>
        <button type="button" class="apply-add-btn" id="applyAddBtn">
          <i class="fa-solid fa-plus"></i> Tambah Metode
        </button>
      </div>
    `;
  }

  function renderApplyList(applyArr) {
    const list = document.getElementById('applyList');
    if (!list) return;

    list.innerHTML = applyArr.map((a, i) => `
      <div class="apply-item" data-idx="${i}">
        <div class="apply-item-head">
          <div class="apply-item-num">${i + 1}</div>
          <button type="button" class="apply-item-remove" data-remove="${i}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="apply-item-row">
          <select data-field="type">
            <option value="email" ${a.type === 'email' ? 'selected' : ''}>📧 Email</option>
            <option value="link" ${a.type === 'link' ? 'selected' : ''}>🔗 Link</option>
          </select>
          <input type="text" data-field="value" value="${escapeHtml(a.value || '')}" placeholder="hrd@pt.com atau https://...">
        </div>
        <input type="text" data-field="subject" value="${escapeHtml(a.subject || '')}" placeholder="Subjek email atau catatan link">
      </div>
    `).join('');

    list.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arr = collectApplyList();
        arr.splice(Number(btn.dataset.remove), 1);
        renderApplyList(arr.length ? arr : [{ type: 'email', value: '', subject: '' }]);
      });
    });
  }

  function collectApplyList() {
    const list = document.getElementById('applyList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.apply-item')).map((item) => ({
      type: item.querySelector('[data-field="type"]')?.value || 'email',
      value: (item.querySelector('[data-field="value"]')?.value || '').trim(),
      subject: (item.querySelector('[data-field="subject"]')?.value || '').trim(),
    })).filter((a) => a.value);
  }

  function bindCompanyFormEvents(initialApply) {
    renderApplyList(initialApply);
    document.getElementById('applyAddBtn')?.addEventListener('click', () => {
      const arr = collectApplyList();
      arr.push({ type: 'email', value: '', subject: '' });
      renderApplyList(arr);
    });
  }

  function addCompany() {
    openModal({
      icon: 'fa-plus',
      title: 'Tambah Perusahaan',
      subtitle: 'Data perusahaan baru',
      bodyHtml: companyFormHtml(),
      submitText: 'Tambah',
      onSubmit: async () => {
        const name = document.getElementById('cpName')?.value.trim();
        const cat = document.getElementById('cpCategory')?.value || 'manufaktur';
        const loc = document.getElementById('cpLocation')?.value.trim() || '';
        const apply = collectApplyList();

        if (!name) { toast.error('Nama perusahaan wajib'); return; }
        if (!apply.length) { toast.error('Minimal 1 metode apply'); return; }

        cpCache.companies.push({ id: uid(), name, category: cat, location: loc, apply });
        await saveCompanies(cpCache);
        logActivity(`Tambah perusahaan: ${name}`, 'fa-building');
        closeModal();
        renderCompaniesList();
      },
    });
    setTimeout(() => bindCompanyFormEvents([{ type: 'email', value: '', subject: '' }]), 60);
  }

  async function editCompany(idx) {
    const c = cpCache.companies[idx];
    if (!c) return;

    openModal({
      icon: 'fa-pen',
      title: 'Edit Perusahaan',
      subtitle: c.name || '',
      bodyHtml: companyFormHtml(c),
      submitText: 'Simpan',
      onSubmit: async () => {
        const name = document.getElementById('cpName')?.value.trim();
        const cat = document.getElementById('cpCategory')?.value || 'manufaktur';
        const loc = document.getElementById('cpLocation')?.value.trim() || '';
        const apply = collectApplyList();

        if (!name) { toast.error('Nama perusahaan wajib'); return; }
        if (!apply.length) { toast.error('Minimal 1 metode apply'); return; }

        c.name = name;
        c.category = cat;
        c.location = loc;
        c.apply = apply;
        await saveCompanies(cpCache);
        logActivity(`Edit perusahaan: ${name}`, 'fa-pen');
        closeModal();
        renderCompaniesList();
      },
    });
    setTimeout(() => bindCompanyFormEvents(c.apply || []), 60);
  }

  async function duplicateCompany(idx) {
    const c = cpCache.companies[idx];
    if (!c) return;
    const dup = {
      ...c,
      id: uid(),
      name: (c.name || '') + ' (Copy)',
      apply: (c.apply || []).map((a) => ({ ...a })),
    };
    cpCache.companies.splice(idx + 1, 0, dup);
    await saveCompanies(cpCache);
    logActivity(`Duplikasi perusahaan: ${c.name}`, 'fa-clone');
    renderCompaniesList();
  }

  async function deleteCompany(idx) {
    const c = cpCache.companies[idx];
    if (!c) return;
    showConfirm({
      title: 'Hapus Perusahaan?',
      subtitle: c.name || '',
      message: `Perusahaan <strong>${escapeHtml(c.name || '')}</strong> akan dihapus dari daftar.`,
      okText: 'Ya, Hapus',
      onOk: async () => {
        cpCache.companies.splice(idx, 1);
        await saveCompanies(cpCache);
        logActivity(`Hapus perusahaan: ${c.name}`, 'fa-trash-can');
        renderCompaniesList();
      },
    });
  }

  async function resetCompanies() {
    showConfirm({
      title: 'Reset Data Perusahaan?',
      subtitle: 'Kembalikan ke default server',
      message: 'Semua data perusahaan akan dikembalikan ke data default dari server.',
      okText: 'Ya, Reset',
      onOk: async () => {
        try {
          const res = await fetch('companies/companies.json?t=' + Date.now());
          const data = await res.json();
          await saveCompanies(data);
          logActivity('Reset data perusahaan', 'fa-rotate-left');
          renderCompaniesList();
        } catch (err) {
          toast.error('Gagal reset: ' + err.message);
        }
      },
    });
  }

  async function manualSaveCompanies() {
    await saveCompanies(cpCache);
    logActivity('Save perusahaan ke GitHub', 'fa-cloud-arrow-up');
  }

  /* ============================================
     TAB: CATEGORIES
     ============================================ */
  async function renderCategoriesList() {
    if (!els.catList) return;
    if (!cpCache.categories || !cpCache.categories.length) {
      els.catList.innerHTML = '<div class="admin-empty" style="padding:24px;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
      cpCache = await getCompaniesData();
    }
    filterCategoriesList();
  }

  function filterCategoriesList() {
    if (!els.catList) return;
    const q = (els.catSearch?.value || '').toLowerCase().trim();
    const cats = cpCache.categories || [];
    const filtered = cats.filter((c) => !q || (c.name || '').toLowerCase().includes(q));

    if (!filtered.length) {
      els.catList.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-tags"></i>
          <div>${cats.length ? 'Tidak ada hasil' : 'Belum ada kategori'}</div>
        </div>`;
      return;
    }

    els.catList.innerHTML = filtered.map((c) => {
      const idx = cats.indexOf(c);
      const count = (cpCache.companies || []).filter((x) => x.category === c.id).length;
      const isDefault = c.id === 'all';
      return `
        <div class="admin-row" data-idx="${idx}">
          <div class="admin-row-icon"><i class="fa-solid ${escapeHtml(c.icon || 'fa-tag')}"></i></div>
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(c.name || '')}</div>
            <div class="admin-row-sub">
              ID: <code>${escapeHtml(c.id)}</code> · ${count} perusahaan
            </div>
          </div>
          <div class="admin-row-actions">
            <button data-action="edit" class="admin-btn-icon primary"><i class="fa-solid fa-pen"></i></button>
            ${!isDefault ? `<button data-action="del" class="admin-btn-icon danger"><i class="fa-solid fa-trash-can"></i></button>` : ''}
          </div>
        </div>`;
    }).join('');

    els.catList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => editCategory(idx));
      row.querySelector('[data-action="del"]')?.addEventListener('click', () => deleteCategory(idx));
    });
  }

  function categoryFormHtml(c = {}) {
    const icon = c.icon || 'fa-tag';
    return `
      <div class="form-field">
        <label class="form-field-label">ID Kategori <span class="req">*</span></label>
        <input type="text" id="catId" class="form-field-input" value="${escapeHtml(c.id || '')}"
               placeholder="contoh: bank" ${c.id === 'all' ? 'readonly' : ''}>
        <p class="form-field-hint">Huruf kecil, tanpa spasi. Contoh: bumn, bank, startup</p>
      </div>
      <div class="form-field">
        <label class="form-field-label">Nama Kategori <span class="req">*</span></label>
        <input type="text" id="catName" class="form-field-input" value="${escapeHtml(c.name || '')}"
               placeholder="Contoh: Bank & Keuangan">
      </div>
      <div class="form-field">
        <label class="form-field-label">Icon</label>
        <div class="icon-options-row" id="catIconRow">
          ${ICON_LIST_CAT.map((ic) => `
            <div class="icon-option ${icon === ic ? 'selected' : ''}" data-icon="${ic}">
              <i class="fa-solid ${ic}"></i>
            </div>`).join('')}
        </div>
        <input type="hidden" id="catIcon" value="${escapeHtml(icon)}">
      </div>
    `;
  }

  function addCategory() {
    openModal({
      icon: 'fa-plus',
      title: 'Tambah Kategori',
      subtitle: 'Kategori untuk mengelompokkan perusahaan',
      bodyHtml: categoryFormHtml(),
      submitText: 'Tambah',
      onSubmit: async () => {
        const id = (document.getElementById('catId')?.value || '').trim().toLowerCase().replace(/\s+/g, '-');
        const name = document.getElementById('catName')?.value.trim();
        const icon = document.getElementById('catIcon')?.value || 'fa-tag';

        if (!id || !name) { toast.error('ID & Nama wajib'); return; }
        if ((cpCache.categories || []).find((c) => c.id === id)) {
          toast.error('ID kategori sudah dipakai');
          return;
        }

        cpCache.categories = cpCache.categories || [];
        cpCache.categories.push({ id, name, icon });
        await saveCompanies(cpCache);
        logActivity(`Tambah kategori: ${name}`, 'fa-tags');
        closeModal();
        renderCategoriesList();
      },
    });
    setTimeout(() => bindIconPicker('catIconRow', 'catIcon'), 60);
  }

  function editCategory(idx) {
    const c = cpCache.categories[idx];
    if (!c) return;

    openModal({
      icon: 'fa-pen',
      title: 'Edit Kategori',
      subtitle: c.name || '',
      bodyHtml: categoryFormHtml(c),
      submitText: 'Simpan',
      onSubmit: async () => {
        const newId = (document.getElementById('catId')?.value || '').trim().toLowerCase().replace(/\s+/g, '-');
        const name = document.getElementById('catName')?.value.trim();
        const icon = document.getElementById('catIcon')?.value || 'fa-tag';

        if (!newId || !name) { toast.error('ID & Nama wajib'); return; }

        const oldId = c.id;
        c.id = newId;
        c.name = name;
        c.icon = icon;

        if (oldId !== newId) {
          (cpCache.companies || []).forEach((comp) => {
            if (comp.category === oldId) comp.category = newId;
          });
        }

        await saveCompanies(cpCache);
        logActivity(`Edit kategori: ${name}`, 'fa-pen');
        closeModal();
        renderCategoriesList();
      },
    });
    setTimeout(() => bindIconPicker('catIconRow', 'catIcon'), 60);
  }

  function deleteCategory(idx) {
    const c = cpCache.categories[idx];
    if (!c || c.id === 'all') return;

    const used = (cpCache.companies || []).filter((x) => x.category === c.id).length;
    showConfirm({
      title: 'Hapus Kategori?',
      subtitle: c.name || '',
      message: used
        ? `Kategori <strong>${escapeHtml(c.name || '')}</strong> sedang dipakai oleh <strong>${used} perusahaan</strong>. Perusahaan tersebut akan kehilangan kategorinya.`
        : `Kategori <strong>${escapeHtml(c.name || '')}</strong> akan dihapus.`,
      okText: 'Ya, Hapus',
      onOk: async () => {
        cpCache.categories.splice(idx, 1);
        (cpCache.companies || []).forEach((comp) => {
          if (comp.category === c.id) comp.category = '';
        });
        await saveCompanies(cpCache);
        logActivity(`Hapus kategori: ${c.name}`, 'fa-trash-can');
        renderCategoriesList();
      },
    });
  }

  /* ============================================
     TAB: EMAIL
     ============================================ */
  async function renderEmailList() {
    if (!els.emList) return;
    els.emList.innerHTML = '<div class="admin-empty" style="padding:24px;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    const data = await getEmailTemplates();
    emCache = data?.templates || [];
    filterEmailList();
  }

  function filterEmailList() {
    if (!els.emList) return;
    const q = (els.emSearch?.value || '').toLowerCase().trim();
    const filtered = emCache.filter((t) => {
      if (!q) return true;
      return `${t.name || ''} ${t.desc || ''}`.toLowerCase().includes(q);
    });

    if (!filtered.length) {
      els.emList.innerHTML = `
        <div class="admin-empty">
          <i class="fa-regular fa-envelope"></i>
          <div>${emCache.length ? 'Tidak ada hasil' : 'Belum ada template email'}</div>
        </div>`;
      return;
    }

    els.emList.innerHTML = filtered.map((t) => {
      const idx = emCache.indexOf(t);
      return `
        <div class="admin-row" data-idx="${idx}">
          <div class="admin-row-icon"><i class="fa-solid ${escapeHtml(t.icon || 'fa-envelope')}"></i></div>
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(t.name || '')}</div>
            <div class="admin-row-sub">${escapeHtml(t.desc || '')}</div>
          </div>
          <div class="admin-row-actions">
            <button data-action="edit" class="admin-btn-icon primary"><i class="fa-solid fa-pen"></i></button>
            <button data-action="dup" class="admin-btn-icon warn"><i class="fa-regular fa-clone"></i></button>
            <button data-action="del" class="admin-btn-icon danger"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');

    els.emList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => editEmailTemplate(idx));
      row.querySelector('[data-action="dup"]')?.addEventListener('click', () => duplicateEmailTemplate(idx));
      row.querySelector('[data-action="del"]')?.addEventListener('click', () => deleteEmailTemplate(idx));
    });
  }

  function emailFormHtml(t = {}) {
    const color = t.color || 'blue';
    return `
      <div class="form-field">
        <label class="form-field-label">Nama Template <span class="req">*</span></label>
        <input type="text" id="emName" class="form-field-input" value="${escapeHtml(t.name || '')}" placeholder="Contoh: Lamaran Magang">
      </div>
      <div class="form-field">
        <label class="form-field-label">Deskripsi</label>
        <input type="text" id="emDesc" class="form-field-input" value="${escapeHtml(t.desc || '')}" placeholder="Untuk lulusan baru / magang">
      </div>
      <div class="form-field">
        <label class="form-field-label">Subjek Email <span class="req">*</span></label>
        <input type="text" id="emSubject" class="form-field-input" value="${escapeHtml(t.subject || '')}"
               placeholder="Lamaran Pekerjaan - [Posisi yang Dilamar]">
        <p class="form-field-hint">Gunakan <code>[Kurung Siku]</code> untuk placeholder yang bisa diisi user</p>
      </div>
      <div class="form-field">
        <label class="form-field-label">Isi Email <span class="req">*</span></label>
        <textarea id="emBody" class="form-field-input tall" placeholder="Kepada Yth,...">${escapeHtml(t.body || '')}</textarea>
      </div>
      <div class="form-field">
        <label class="form-field-label">Warna Kartu</label>
        <div class="color-options-row" id="emColorRow">
          ${CATEGORY_COLORS.map((c) => `
            <div class="color-option ${color === c ? 'selected' : ''}" data-color="${c}" style="background:${colorHex(c)}"></div>
          `).join('')}
        </div>
        <input type="hidden" id="emColor" value="${escapeHtml(color)}">
      </div>
    `;
  }

  function addEmailTemplate() {
    openModal({
      icon: 'fa-plus',
      title: 'Tambah Template Email',
      subtitle: 'Template lamaran baru',
      bodyHtml: emailFormHtml(),
      submitText: 'Tambah',
      onSubmit: async () => {
        const name = document.getElementById('emName')?.value.trim();
        const desc = document.getElementById('emDesc')?.value.trim() || '';
        const subject = document.getElementById('emSubject')?.value.trim();
        const body = document.getElementById('emBody')?.value.trim();
        const color = document.getElementById('emColor')?.value || 'blue';

        if (!name || !subject || !body) {
          toast.error('Nama, subjek, dan isi wajib diisi');
          return;
        }

        emCache.push({
          id: uid(),
          name,
          desc,
          icon: 'fa-envelope',
          color,
          subject,
          body,
        });
        await saveEmailTemplates(emCache);
        logActivity(`Tambah email: ${name}`, 'fa-envelope');
        closeModal();
        renderEmailList();
      },
    });
    setTimeout(() => bindColorPicker('emColorRow', 'emColor'), 60);
  }

  function editEmailTemplate(idx) {
    const t = emCache[idx];
    if (!t) return;

    openModal({
      icon: 'fa-pen',
      title: 'Edit Template Email',
      subtitle: t.name || '',
      bodyHtml: emailFormHtml(t),
      submitText: 'Simpan',
      onSubmit: async () => {
        const name = document.getElementById('emName')?.value.trim();
        const desc = document.getElementById('emDesc')?.value.trim() || '';
        const subject = document.getElementById('emSubject')?.value.trim();
        const body = document.getElementById('emBody')?.value.trim();
        const color = document.getElementById('emColor')?.value || 'blue';

        if (!name || !subject || !body) {
          toast.error('Nama, subjek, dan isi wajib diisi');
          return;
        }

        t.name = name;
        t.desc = desc;
        t.subject = subject;
        t.body = body;
        t.color = color;
        await saveEmailTemplates(emCache);
        logActivity(`Edit email: ${name}`, 'fa-pen');
        closeModal();
        renderEmailList();
      },
    });
    setTimeout(() => bindColorPicker('emColorRow', 'emColor'), 60);
  }

  async function duplicateEmailTemplate(idx) {
    const t = emCache[idx];
    if (!t) return;
    const dup = { ...t, id: uid(), name: (t.name || '') + ' (Copy)' };
    emCache.splice(idx + 1, 0, dup);
    await saveEmailTemplates(emCache);
    logActivity(`Duplikasi email: ${t.name}`, 'fa-clone');
    renderEmailList();
  }

  async function deleteEmailTemplate(idx) {
    const t = emCache[idx];
    if (!t) return;
    showConfirm({
      title: 'Hapus Template Email?',
      subtitle: t.name || '',
      message: `Template <strong>${escapeHtml(t.name || '')}</strong> akan dihapus.`,
      okText: 'Ya, Hapus',
      onOk: async () => {
        emCache.splice(idx, 1);
        await saveEmailTemplates(emCache);
        logActivity(`Hapus email: ${t.name}`, 'fa-trash-can');
        renderEmailList();
      },
    });
  }

  async function resetEmailTemplates() {
    showConfirm({
      title: 'Reset Template Email?',
      subtitle: 'Kembalikan ke default',
      message: 'Semua template email akan dikembalikan ke default. Perubahan akan hilang.',
      okText: 'Ya, Reset',
      onOk: async () => {
        storage.remove('emailTemplatesOverride');
        emCache = [];
        if (DA.github && DA.github.isConfigured()) {
          try {
            await DA.github.deleteFile('email-templates/email-templates.json',
              'chore: reset email templates to default');
          } catch (e) {
            console.warn('[Admin] Gagal hapus file GitHub:', e);
          }
        }
        logActivity('Reset email ke default', 'fa-rotate-left');
        toast.success('Reset berhasil');
        renderEmailList();
      },
    });
  }

  async function manualSaveEmails() {
    await saveEmailTemplates(emCache);
    logActivity('Save email ke GitHub', 'fa-cloud-arrow-up');
  }

  /* ============================================
     SETTINGS
     ============================================ */
  async function changePassword() {
    const oldPwd = els.passOld?.value || '';
    const newPwd = els.passNew?.value || '';
    const result = await DA.auth.changePassword(oldPwd, newPwd);
    if (result.ok) {
      toast.success('Password admin berhasil diganti');
      logActivity('Ganti password admin', 'fa-key');
      if (els.passOld) els.passOld.value = '';
      if (els.passNew) els.passNew.value = '';
    } else {
      toast.error(result.msg);
    }
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      appName: 'DocuApply',
      version: 3,
      githubConfig: DA.github ? DA.github.getConfig() : null,
      adminPasswordHash: storage.get('adminPasswordHash', null),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `DocuApply_Config_${Date.now()}.json`);
    toast.success('Config diunduh');
    logActivity('Export config', 'fa-download');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.appName !== 'DocuApply') throw new Error('File tidak valid');
        if (data.githubConfig && DA.github) DA.github.setConfig(data.githubConfig);
        if (data.adminPasswordHash) storage.set('adminPasswordHash', data.adminPasswordHash);
        toast.success('Config berhasil diimport');
        logActivity('Import config', 'fa-upload');
        loadGithubConfig();
      } catch (err) {
        toast.error('Gagal import: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ============================================
     BIND EVENTS
     ============================================ */
  function bindEvents() {
    // Header close
    els.close?.addEventListener('click', close);

    // Tabs
    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.adminTab));
    });

    // Modal close (backdrop & button)
    document.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    document.querySelectorAll('[data-confirm-close]').forEach((el) => {
      el.addEventListener('click', closeConfirm);
    });

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.modal && !els.modal.classList.contains('hidden')) closeModal();
        else if (els.confirmModal && !els.confirmModal.classList.contains('hidden')) closeConfirm();
        else if (els.screen && !els.screen.classList.contains('hidden')) close();
      }
    });

    // CV
    els.cvSearch?.addEventListener('input', filterCvList);
    els.cvAddBtn?.addEventListener('click', addCvTemplate);
    els.cvReset?.addEventListener('click', resetCvTemplates);
    els.cvUploadBtn?.addEventListener('click', () => els.cvUploadInput?.click());
    els.cvUploadInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) uploadCvFile(f);
    });

    // Companies
    els.cpSearch?.addEventListener('input', filterCompaniesList);
    els.cpFilter?.addEventListener('change', filterCompaniesList);
    els.cpAddBtn?.addEventListener('click', addCompany);
    els.cpReset?.addEventListener('click', resetCompanies);
    els.cpSaveBtn?.addEventListener('click', manualSaveCompanies);

    // Categories
    els.catSearch?.addEventListener('input', filterCategoriesList);
    els.catAddBtn?.addEventListener('click', addCategory);
    els.catSaveBtn?.addEventListener('click', async () => {
      await saveCompanies(cpCache);
      logActivity('Save kategori', 'fa-cloud-arrow-up');
    });

    // Email
    els.emSearch?.addEventListener('input', filterEmailList);
    els.emAddBtn?.addEventListener('click', addEmailTemplate);
    els.emReset?.addEventListener('click', resetEmailTemplates);
    els.emSaveBtn?.addEventListener('click', manualSaveEmails);

    // Settings
    els.passChangeBtn?.addEventListener('click', changePassword);
    els.ghTestBtn?.addEventListener('click', testGithub);
    els.ghSaveBtn?.addEventListener('click', saveGithubConfig);
    els.ghClearBtn?.addEventListener('click', clearGithubConfig);
    els.exportBtn?.addEventListener('click', exportData);
    els.importBtn?.addEventListener('click', () => els.importInput?.click());
    els.importInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) importData(f);
    });

    // Clear activity
    els.clearActivityBtn?.addEventListener('click', () => {
      showConfirm({
        title: 'Bersihkan Aktivitas?',
        subtitle: 'Hapus semua log',
        message: 'Semua catatan aktivitas admin akan dihapus.',
        okText: 'Ya, Bersihkan',
        onOk: clearActivity,
      });
    });

    // Quick actions
    document.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quick;
        if (q === 'upload-cv') {
          switchTab('cv');
          setTimeout(() => els.cvUploadInput?.click(), 220);
        }
        if (q === 'add-company') {
          switchTab('companies');
          setTimeout(addCompany, 220);
        }
        if (q === 'add-email') {
          switchTab('email');
          setTimeout(addEmailTemplate, 220);
        }
        if (q === 'sync-github') {
          if (DA.github && DA.github.isConfigured()) {
            saveCvTemplates(cvCache);
            saveCompanies(cpCache);
            saveEmailTemplates(emCache);
            logActivity('Sync ke GitHub', 'fa-github');
          } else {
            toast.warn('Setup GitHub dulu di Pengaturan');
            switchTab('settings');
          }
        }
        if (q === 'settings-github') switchTab('settings');
      });
    });
  }

  /* ============================================
     PUBLIC API
     ============================================ */
  return {
    init,
    open,
    close,
    // Expose for admin-psikotes module
    openModal,
    closeModal,
    showConfirm,
    logActivity,
  };
})();
