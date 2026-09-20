/* =====================================================
   DocuApply — Admin Dashboard
   Manage: CV Templates · Companies · Email Templates
   ===================================================== */
window.DA = window.DA || {};

DA.admin = (function () {
  const { storage, toast } = DA;
  const { downloadBlob, escapeHtml, uid } = DA.utils;

  let els = {};
  let activeTab = 'cv';

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      screen: document.getElementById('adminDashboard'),
      close: document.getElementById('adminCloseBtn'),
      tabs: document.querySelectorAll('[data-admin-tab]'),
      panels: document.querySelectorAll('[data-admin-panel]'),

      // CV tab
      cvList: document.getElementById('adminCvList'),
      cvAddBtn: document.getElementById('adminCvAddBtn'),
      cvInput: document.getElementById('adminCvInput'),
      cvReset: document.getElementById('adminCvReset'),

      // Companies tab
      cpList: document.getElementById('adminCompaniesList'),
      cpAddBtn: document.getElementById('adminCompaniesAddBtn'),
      cpReset: document.getElementById('adminCompaniesReset'),

      // Email tab
      emList: document.getElementById('adminEmailList'),
      emAddBtn: document.getElementById('adminEmailAddBtn'),
      emReset: document.getElementById('adminEmailReset'),

      // Settings
      passOld: document.getElementById('adminPassOld'),
      passNew: document.getElementById('adminPassNew'),
      passChangeBtn: document.getElementById('adminPassChangeBtn'),
      exportBtn: document.getElementById('adminExportBtn'),
      importBtn: document.getElementById('adminImportBtn'),
      importInput: document.getElementById('adminImportInput'),
    };

    bindEvents();
  }

  /* ============================================
     OPEN / CLOSE
     ============================================ */
  function open() {
    if (!DA.auth.isAdmin()) {
      toast.error('Hanya admin yang bisa membuka dashboard');
      return;
    }
    els.screen?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderAll();
  }

  function close() {
    els.screen?.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ============================================
     TAB NAVIGATION
     ============================================ */
  function switchTab(name) {
    activeTab = name;
    els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.adminTab === name));
    els.panels.forEach((p) => p.classList.toggle('hidden', p.dataset.adminPanel !== name));
    renderAll();
  }

  function renderAll() {
    renderCvList();
    renderCompaniesList();
    renderEmailList();
  }

  /* ============================================
     TAB 1: CV TEMPLATES
     ============================================ */
  async function getCvTemplates() {
    // Cek override di localStorage
    const override = storage.get('cvTemplatesOverride');
    if (override) return override;

    // Fallback: fetch dari server
    try {
      const res = await fetch('cv-templates/templates.json?t=' + Date.now());
      const data = await res.json();
      return Array.isArray(data) ? data : (data.templates || []);
    } catch {
      return [];
    }
  }

  async function renderCvList() {
    if (!els.cvList) return;
    const list = await getCvTemplates();

    if (!list.length) {
      els.cvList.innerHTML = '<div class="admin-empty">Belum ada template</div>';
      return;
    }

    els.cvList.innerHTML = list.map((t, i) => `
      <div class="admin-row" data-idx="${i}">
        <div class="admin-row-icon">
          <i class="fa-solid ${t.icon || 'fa-file-lines'}"></i>
        </div>
        <div class="admin-row-body">
          <div class="admin-row-title">${escapeHtml(t.name)}</div>
          <div class="admin-row-sub">${escapeHtml(t.file)} · ${escapeHtml(t.color || 'blue')}</div>
        </div>
        <div class="admin-row-actions">
          <button data-edit class="admin-btn-icon" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button data-del class="admin-btn-icon danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `).join('');

    // Bind actions
    els.cvList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-edit]')?.addEventListener('click', () => editCvTemplate(idx));
      row.querySelector('[data-del]')?.addEventListener('click', () => deleteCvTemplate(idx));
    });
  }

  async function addCvTemplate() {
    const name = prompt('Nama template:');
    if (!name) return;
    const file = prompt('Nama file .docx (contoh: cv-simple.docx):');
    if (!file) return;
    const description = prompt('Deskripsi singkat:', 'Template CV') || 'Template CV';
    const color = prompt('Warna (blue/emerald/purple/amber/rose/indigo):', 'blue') || 'blue';

    const list = await getCvTemplates();
    list.push({
      id: uid(),
      name: name.trim(),
      description: description.trim(),
      file: file.trim(),
      icon: 'fa-file-lines',
      color: color.trim(),
    });
    storage.set('cvTemplatesOverride', list);
    toast.success('Template ditambahkan. Jangan lupa upload file .docx ke folder cv-templates/');
    renderCvList();
  }

  async function editCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;
    const name = prompt('Nama template:', t.name);
    if (name == null) return;
    const file = prompt('Nama file .docx:', t.file);
    if (file == null) return;
    const description = prompt('Deskripsi:', t.description || '');
    if (description == null) return;
    const color = prompt('Warna:', t.color || 'blue');
    if (color == null) return;

    t.name = name.trim() || t.name;
    t.file = file.trim() || t.file;
    t.description = description.trim();
    t.color = color.trim() || 'blue';
    storage.set('cvTemplatesOverride', list);
    toast.success('Template diupdate');
    renderCvList();
  }

  async function deleteCvTemplate(idx) {
    const list = await getCvTemplates();
    if (!confirm(`Hapus template "${list[idx]?.name}"?`)) return;
    list.splice(idx, 1);
    storage.set('cvTemplatesOverride', list);
    toast.success('Template dihapus');
    renderCvList();
  }

  async function resetCvTemplates() {
    if (!confirm('Reset ke template default dari server? Semua perubahan akan hilang.')) return;
    storage.remove('cvTemplatesOverride');
    toast.success('Template direset ke default');
    renderCvList();
  }

  /* ============================================
     TAB 2: COMPANIES
     ============================================ */
  async function getCompanies() {
    const override = storage.get('companiesOverride');
    if (override) return override;

    try {
      const res = await fetch('companies/companies.json?t=' + Date.now());
      const data = await res.json();
      return {
        categories: data.categories || [],
        companies: data.companies || [],
      };
    } catch {
      return { categories: [], companies: [] };
    }
  }

  async function renderCompaniesList() {
    if (!els.cpList) return;
    const data = await getCompanies();
    const list = data.companies || [];

    if (!list.length) {
      els.cpList.innerHTML = '<div class="admin-empty">Belum ada perusahaan</div>';
      return;
    }

    els.cpList.innerHTML = list.map((c, i) => {
      const applies = (c.apply || []).map((a) => {
        const icon = a.type === 'email' ? 'fa-envelope' : 'fa-globe';
        return `<span class="admin-chip"><i class="fa-solid ${icon}"></i> ${escapeHtml(a.value)}</span>`;
      }).join('');
      return `
        <div class="admin-row admin-row-lg" data-idx="${i}">
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(c.name)}</div>
            <div class="admin-row-sub">${escapeHtml(c.category || '')} · ${escapeHtml(c.location || '')}</div>
            <div class="admin-row-chips">${applies}</div>
          </div>
          <div class="admin-row-actions">
            <button data-edit class="admin-btn-icon"><i class="fa-solid fa-pen"></i></button>
            <button data-del class="admin-btn-icon danger"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      `;
    }).join('');

    els.cpList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-edit]')?.addEventListener('click', () => editCompany(idx));
      row.querySelector('[data-del]')?.addEventListener('click', () => deleteCompany(idx));
    });
  }

  async function addCompany() {
    const name = prompt('Nama perusahaan:');
    if (!name) return;
    const category = prompt('Kategori (textile/garment/food/manufaktur/furniture/retail/farmasi/fmcg):', 'manufaktur') || 'manufaktur';
    const location = prompt('Kota:', 'Bandung') || 'Bandung';

    // Apply methods — bisa multiple
    const apply = [];
    let addMore = true;
    while (addMore) {
      const type = (prompt('Tipe apply (email/link):', 'email') || 'email').toLowerCase();
      if (type !== 'email' && type !== 'link') {
        toast.error('Tipe harus "email" atau "link"');
        continue;
      }
      const value = prompt(type === 'email' ? 'Email:' : 'URL Link:');
      if (!value) break;
      const subject = prompt('Subjek/Info:', type === 'email' ? 'Lamaran Pekerjaan_Nama' : 'Apply via portal') || '';
      apply.push({ type, value: value.trim(), subject: subject.trim() });
      addMore = confirm('Tambah metode apply lagi?');
    }

    if (!apply.length) {
      toast.warn('Minimal 1 metode apply');
      return;
    }

    const data = await getCompanies();
    data.companies.push({
      id: uid(),
      name: name.trim(),
      category: category.trim(),
      location: location.trim(),
      apply,
    });
    storage.set('companiesOverride', data);
    toast.success('Perusahaan ditambahkan');
    renderCompaniesList();
  }

  async function editCompany(idx) {
    const data = await getCompanies();
    const c = data.companies[idx];
    if (!c) return;
    const name = prompt('Nama perusahaan:', c.name);
    if (name == null) return;
    const category = prompt('Kategori:', c.category || '');
    if (category == null) return;
    const location = prompt('Kota:', c.location || '');
    if (location == null) return;

    c.name = name.trim() || c.name;
    c.category = category.trim();
    c.location = location.trim();

    // Edit apply methods — konfirmasi
    if (confirm('Edit metode apply juga?')) {
      const apply = [];
      let addMore = true;
      while (addMore) {
        const type = (prompt('Tipe apply (email/link):', 'email') || 'email').toLowerCase();
        if (type !== 'email' && type !== 'link') continue;
        const value = prompt(type === 'email' ? 'Email:' : 'URL Link:');
        if (!value) break;
        const subject = prompt('Subjek/Info:', '') || '';
        apply.push({ type, value: value.trim(), subject: subject.trim() });
        addMore = confirm('Tambah metode apply lagi?');
      }
      if (apply.length) c.apply = apply;
    }

    storage.set('companiesOverride', data);
    toast.success('Perusahaan diupdate');
    renderCompaniesList();
  }

  async function deleteCompany(idx) {
    const data = await getCompanies();
    if (!confirm(`Hapus "${data.companies[idx]?.name}"?`)) return;
    data.companies.splice(idx, 1);
    storage.set('companiesOverride', data);
    toast.success('Perusahaan dihapus');
    renderCompaniesList();
  }

  async function resetCompanies() {
    if (!confirm('Reset ke data default dari server?')) return;
    storage.remove('companiesOverride');
    toast.success('Data direset ke default');
    renderCompaniesList();
  }

  /* ============================================
     TAB 3: EMAIL TEMPLATES
     ============================================ */
  function getEmailTemplates() {
    // Cek built-in default (dari email.js) — kita ambil list statis
    const defaults = [
      { id: 'umum', name: 'Umum / Standar', desc: 'Bahasa formal dan sopan', icon: 'fa-briefcase', color: 'blue' },
      { id: 'fresh', name: 'Fresh Graduate', desc: 'Untuk lulusan baru atau magang', icon: 'fa-graduation-cap', color: 'emerald' },
      { id: 'english', name: 'English Pro', desc: 'Format bahasa Inggris profesional', icon: 'fa-earth-americas', color: 'purple' },
    ];

    const override = storage.get('emailTemplatesOverride');
    return override || defaults;
  }

  function renderEmailList() {
    if (!els.emList) return;
    const list = getEmailTemplates();

    els.emList.innerHTML = list.map((t, i) => `
      <div class="admin-row" data-idx="${i}">
        <div class="admin-row-icon">
          <i class="fa-solid ${t.icon || 'fa-envelope'}"></i>
        </div>
        <div class="admin-row-body">
          <div class="admin-row-title">${escapeHtml(t.name)}</div>
          <div class="admin-row-sub">${escapeHtml(t.desc || '')}</div>
        </div>
        <div class="admin-row-actions">
          <button data-edit class="admin-btn-icon"><i class="fa-solid fa-pen"></i></button>
          <button data-del class="admin-btn-icon danger"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `).join('');

    els.emList.querySelectorAll('.admin-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-edit]')?.addEventListener('click', () => editEmailTemplate(idx));
      row.querySelector('[data-del]')?.addEventListener('click', () => deleteEmailTemplate(idx));
    });
  }

  function addEmailTemplate() {
    const name = prompt('Nama template email:');
    if (!name) return;
    const subject = prompt('Subjek (placeholder pakai [Kurung Siku]):', 'Lamaran Pekerjaan - [Posisi yang Dilamar]');
    if (subject == null) return;
    const body = prompt('Isi email (bisa multi-baris):', 'Kepada Yth,\nHRD [Nama Perusahaan]\n\nDengan hormat,\n...');
    if (body == null) return;

    const list = getEmailTemplates();
    list.push({
      id: uid(),
      name: name.trim(),
      desc: 'Template kustom admin',
      icon: 'fa-envelope',
      color: 'slate',
      subject: subject.trim(),
      body: body.trim(),
    });
    storage.set('emailTemplatesOverride', list);
    toast.success('Template email ditambahkan');
    renderEmailList();
  }

  function editEmailTemplate(idx) {
    const list = getEmailTemplates();
    const t = list[idx];
    if (!t) return;
    const name = prompt('Nama:', t.name);
    if (name == null) return;
    const subject = prompt('Subjek:', t.subject || '');
    if (subject == null) return;
    const body = prompt('Isi:', t.body || '');
    if (body == null) return;

    t.name = name.trim() || t.name;
    t.subject = subject.trim();
    t.body = body.trim();
    storage.set('emailTemplatesOverride', list);
    toast.success('Template diupdate');
    renderEmailList();
  }

  function deleteEmailTemplate(idx) {
    const list = getEmailTemplates();
    if (!confirm(`Hapus "${list[idx]?.name}"?`)) return;
    list.splice(idx, 1);
    storage.set('emailTemplatesOverride', list);
    toast.success('Template dihapus');
    renderEmailList();
  }

  function resetEmailTemplates() {
    if (!confirm('Reset ke template default?')) return;
    storage.remove('emailTemplatesOverride');
    toast.success('Template direset');
    renderEmailList();
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
      version: 1,
      cvTemplates: storage.get('cvTemplatesOverride', null),
      companies: storage.get('companiesOverride', null),
      emailTemplates: storage.get('emailTemplatesOverride', null),
      adminPasswordHash: storage.get('adminPasswordHash', null),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `DocuApply_Backup_${Date.now()}.json`);
    toast.success('Backup diunduh');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.appName || data.appName !== 'DocuApply') {
          throw new Error('File backup tidak valid');
        }
        if (data.cvTemplates) storage.set('cvTemplatesOverride', data.cvTemplates);
        if (data.companies) storage.set('companiesOverride', data.companies);
        if (data.emailTemplates) storage.set('emailTemplatesOverride', data.emailTemplates);
        if (data.adminPasswordHash) storage.set('adminPasswordHash', data.adminPasswordHash);

        toast.success('Data berhasil diimport');
        renderAll();
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
    els.close?.addEventListener('click', close);
    els.screen?.addEventListener('click', (e) => {
      if (e.target === els.screen) close();
    });

    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.adminTab));
    });

    // CV
    els.cvAddBtn?.addEventListener('click', addCvTemplate);
    els.cvReset?.addEventListener('click', resetCvTemplates);

    // Companies
    els.cpAddBtn?.addEventListener('click', addCompany);
    els.cpReset?.addEventListener('click', resetCompanies);

    // Email
    els.emAddBtn?.addEventListener('click', addEmailTemplate);
    els.emReset?.addEventListener('click', resetEmailTemplates);

    // Settings
    els.passChangeBtn?.addEventListener('click', changePassword);
    els.exportBtn?.addEventListener('click', exportData);
    els.importBtn?.addEventListener('click', () => els.importInput?.click());
    els.importInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) importData(f);
    });

    // ESC close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.screen?.classList.contains('hidden')) close();
    });
  }

  return { init, open, close };
})();