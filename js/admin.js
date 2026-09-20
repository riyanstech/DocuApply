/* =====================================================
   DocuApply — Admin Dashboard v2
   - GitHub API integration (upload .docx, commit JSON)
   - Semua perubahan auto-commit ke GitHub → Vercel deploy
   ===================================================== */
window.DA = window.DA || {};

DA.admin = (function () {
  'use strict';

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

      // CV
      cvList: document.getElementById('adminCvList'),
      cvAddBtn: document.getElementById('adminCvAddBtn'),
      cvReset: document.getElementById('adminCvReset'),
      cvUploadBtn: document.getElementById('adminCvUploadBtn'),
      cvUploadInput: document.getElementById('adminCvUploadInput'),

      // Companies
      cpList: document.getElementById('adminCompaniesList'),
      cpAddBtn: document.getElementById('adminCompaniesAddBtn'),
      cpReset: document.getElementById('adminCompaniesReset'),
      cpSaveBtn: document.getElementById('adminCompaniesSaveBtn'),

      // Email
      emList: document.getElementById('adminEmailList'),
      emAddBtn: document.getElementById('adminEmailAddBtn'),
      emReset: document.getElementById('adminEmailReset'),
      emSaveBtn: document.getElementById('adminEmailSaveBtn'),

      // Settings
      passOld: document.getElementById('adminPassOld'),
      passNew: document.getElementById('adminPassNew'),
      passChangeBtn: document.getElementById('adminPassChangeBtn'),

      // GitHub config
      ghOwner: document.getElementById('ghOwner'),
      ghRepo: document.getElementById('ghRepo'),
      ghBranch: document.getElementById('ghBranch'),
      ghToken: document.getElementById('ghToken'),
      ghTestBtn: document.getElementById('ghTestBtn'),
      ghSaveBtn: document.getElementById('ghSaveBtn'),
      ghClearBtn: document.getElementById('ghClearBtn'),
      ghStatus: document.getElementById('ghStatus'),

      // Backup
      exportBtn: document.getElementById('adminExportBtn'),
      importBtn: document.getElementById('adminImportBtn'),
      importInput: document.getElementById('adminImportInput'),
    };

    bindEvents();
    loadGithubConfig();
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
     TABS
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
     GITHUB CONFIG
     ============================================ */
  function loadGithubConfig() {
    const cfg = DA.github.getConfig();
    if (!cfg) return;
    if (els.ghOwner) els.ghOwner.value = cfg.owner || '';
    if (els.ghRepo) els.ghRepo.value = cfg.repo || '';
    if (els.ghBranch) els.ghBranch.value = cfg.branch || 'main';
    if (els.ghToken) els.ghToken.value = cfg.token || '';
    updateGhStatus();
  }

  function updateGhStatus() {
    if (!els.ghStatus) return;
    const cfg = DA.github.getConfig();
    if (cfg && cfg.owner && cfg.repo && cfg.token) {
      els.ghStatus.innerHTML = `
        <i class="fa-solid fa-circle-check text-emerald-500"></i>
        <span class="text-emerald-700 dark:text-emerald-400">
          Terhubung ke <strong>${escapeHtml(cfg.owner)}/${escapeHtml(cfg.repo)}</strong>
          (<code>${escapeHtml(cfg.branch || 'main')}</code>)
        </span>`;
      els.ghStatus.className = 'gh-status gh-status-ok';
    } else {
      els.ghStatus.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
        <span class="text-amber-700 dark:text-amber-400">
          Belum dikonfigurasi. Isi form di bawah untuk aktifkan sync antar device.
        </span>`;
      els.ghStatus.className = 'gh-status gh-status-warn';
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
      updateGhStatus();
    } else {
      toast.error('❌ Gagal: ' + result.msg, 5000);
      updateGhStatus();
    }
  }

  async function testGithub() {
    const result = await DA.github.testConnection();
    if (result.ok) {
      toast.success('✅ ' + result.msg, 3500);
    } else {
      toast.error('❌ ' + result.msg, 5000);
    }
  }

  function clearGithubConfig() {
    if (!confirm('Hapus konfigurasi GitHub? Admin tidak bisa upload atau sync lagi.')) return;
    DA.github.clearConfig();
    if (els.ghOwner) els.ghOwner.value = '';
    if (els.ghRepo) els.ghRepo.value = '';
    if (els.ghBranch) els.ghBranch.value = 'main';
    if (els.ghToken) els.ghToken.value = '';
    updateGhStatus();
    toast.info('Konfigurasi dihapus');
  }

  /* ============================================
     GET DATA (GitHub priority, fallback ke server)
     ============================================ */
  async function getCvTemplates() {
    // Coba dari GitHub dulu
    if (DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('cv-templates/templates.json');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return Array.isArray(data) ? data : (data.templates || []);
        } catch {}
      }
    }
    // Fallback: server
    try {
      const res = await fetch('cv-templates/templates.json?t=' + Date.now());
      const data = await res.json();
      return Array.isArray(data) ? data : (data.templates || []);
    } catch {
      return [];
    }
  }

  async function getCompanies() {
    if (DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('companies/companies.json');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          return {
            categories: data.categories || [],
            companies: data.companies || [],
            disclaimer: data.disclaimer,
            lastUpdated: data.lastUpdated,
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
        disclaimer: data.disclaimer,
        lastUpdated: data.lastUpdated,
      };
    } catch {
      return { categories: [], companies: [] };
    }
  }

  async function getEmailTemplates() {
    if (DA.github.isConfigured()) {
      const raw = await DA.github.getFileContent('email-templates/email-templates.json');
      if (raw) {
        try { return JSON.parse(raw); } catch {}
      }
    }
    return null;
  }

  /* ============================================
     SAVE TO GITHUB
     ============================================ */
  async function saveCvTemplates(list) {
    if (!DA.github.isConfigured()) {
      toast.warn('GitHub belum dikonfigurasi. Data hanya tersimpan lokal.', 4000);
      storage.set('cvTemplatesOverride', list);
      return false;
    }
    try {
      toast.info('Menyimpan ke GitHub...', 2000);
      await DA.github.uploadFile(
        'cv-templates/templates.json',
        JSON.stringify({ templates: list }, null, 2),
        'chore: update CV templates list from admin dashboard'
      );
      toast.success('✅ Tersimpan di GitHub. Vercel akan auto-deploy ~1 menit.', 5000);
      // Refresh data di halaman publik
      window.dispatchEvent(new Event('cvTemplates:updated'));
      return true;
    } catch (err) {
      toast.error('Gagal simpan ke GitHub: ' + err.message, 6000);
      return false;
    }
  }

  async function saveCompanies(data) {
    if (!DA.github.isConfigured()) {
      toast.warn('GitHub belum dikonfigurasi. Data hanya tersimpan lokal.', 4000);
      storage.set('companiesOverride', data);
      return false;
    }
    try {
      toast.info('Menyimpan ke GitHub...', 2000);
      await DA.github.uploadFile(
        'companies/companies.json',
        JSON.stringify(data, null, 2),
        'chore: update companies data from admin dashboard'
      );
      toast.success('✅ Tersimpan di GitHub. Vercel akan auto-deploy ~1 menit.', 5000);
      window.dispatchEvent(new Event('companies:updated'));
      return true;
    } catch (err) {
      toast.error('Gagal simpan: ' + err.message, 6000);
      return false;
    }
  }

  async function saveEmailTemplates(list) {
    if (!DA.github.isConfigured()) {
      toast.warn('GitHub belum dikonfigurasi. Data hanya tersimpan lokal.', 4000);
      storage.set('emailTemplatesOverride', list);
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
     TAB: CV TEMPLATES
     ============================================ */
  async function renderCvList() {
    if (!els.cvList) return;
    els.cvList.innerHTML = '<div class="admin-empty">Memuat...</div>';
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
    await saveCvTemplates(list);
    renderCvList();
  }

  async function editCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;
    const name = prompt('Nama:', t.name);
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
    await saveCvTemplates(list);
    renderCvList();
  }

  async function deleteCvTemplate(idx) {
    const list = await getCvTemplates();
    const t = list[idx];
    if (!t) return;
    if (!confirm(`Hapus template "${t.name}"?`)) return;
    list.splice(idx, 1);
    await saveCvTemplates(list);
    renderCvList();
  }

  async function resetCvTemplates() {
    if (!confirm('Reset ke template default dari server? Perubahan tidak bisa dikembalikan.')) return;
    try {
      const res = await fetch('cv-templates/templates.json?t=' + Date.now());
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.templates || []);
      await saveCvTemplates(list);
      toast.success('Reset berhasil');
      renderCvList();
    } catch (err) {
      toast.error('Gagal reset: ' + err.message);
    }
  }

  async function uploadCvFile(file) {
    if (!DA.github.isConfigured()) {
      toast.error('Setup GitHub dulu di tab Pengaturan', 5000);
      return;
    }
    if (!file.name.endsWith('.docx')) {
      toast.error('File harus .docx');
      return;
    }

    try {
      toast.info(`Mengupload ${file.name}...`, 3000);
      const path = 'cv-templates/' + file.name;
      await DA.github.uploadBinaryFile(path, file, `feat: upload ${file.name} via admin dashboard`);
      toast.success(`✅ ${file.name} berhasil diupload ke GitHub. Vercel deploy ~1 menit.`, 6000);

      // Auto-register di templates.json
      const existing = await getCvTemplates();
      if (!existing.find((t) => t.file === file.name)) {
        if (confirm(`File berhasil diupload. Tambahkan "${file.name}" ke daftar template sekarang?`)) {
          existing.push({
            id: uid(),
            name: file.name.replace('.docx', '').replace(/-/g, ' ').replace(/_/g, ' '),
            description: 'Template CV dari admin',
            file: file.name,
            icon: 'fa-file-lines',
            color: 'blue',
          });
          await saveCvTemplates(existing);
          renderCvList();
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal upload: ' + err.message, 6000);
    }
  }

  /* ============================================
     TAB: COMPANIES
     ============================================ */
  async function renderCompaniesList() {
    if (!els.cpList) return;
    els.cpList.innerHTML = '<div class="admin-empty">Memuat...</div>';
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
    await saveCompanies(data);
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

    await saveCompanies(data);
    renderCompaniesList();
  }

  async function deleteCompany(idx) {
    const data = await getCompanies();
    if (!confirm(`Hapus "${data.companies[idx]?.name}"?`)) return;
    data.companies.splice(idx, 1);
    await saveCompanies(data);
    renderCompaniesList();
  }

  async function resetCompanies() {
    if (!confirm('Reset ke data default dari server?')) return;
    try {
      const res = await fetch('companies/companies.json?t=' + Date.now());
      const data = await res.json();
      await saveCompanies(data);
      toast.success('Reset berhasil');
      renderCompaniesList();
    } catch (err) {
      toast.error('Gagal reset: ' + err.message);
    }
  }

  async function manualSaveCompanies() {
    const data = await getCompanies();
    await saveCompanies(data);
  }

  /* ============================================
     TAB: EMAIL TEMPLATES
     ============================================ */
  async function renderEmailList() {
    if (!els.emList) return;
    els.emList.innerHTML = '<div class="admin-empty">Memuat...</div>';
    const data = await getEmailTemplates();
    const list = data?.templates || [];

    if (!list.length) {
      els.emList.innerHTML = '<div class="admin-empty">Belum ada template</div>';
      return;
    }

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

  async function addEmailTemplate() {
    const name = prompt('Nama template email:');
    if (!name) return;
    const subject = prompt('Subjek (placeholder pakai [Kurung Siku]):', 'Lamaran Pekerjaan - [Posisi yang Dilamar]');
    if (subject == null) return;
    const body = prompt('Isi email (bisa multi-baris):', 'Kepada Yth,\nHRD [Nama Perusahaan]\n\nDengan hormat,\n...');
    if (body == null) return;

    const data = (await getEmailTemplates()) || { templates: [] };
    data.templates = data.templates || [];
    data.templates.push({
      id: uid(),
      name: name.trim(),
      desc: 'Template kustom admin',
      icon: 'fa-envelope',
      color: 'slate',
      subject: subject.trim(),
      body: body.trim(),
    });
    await saveEmailTemplates(data.templates);
    renderEmailList();
  }

  async function editEmailTemplate(idx) {
    const data = (await getEmailTemplates()) || { templates: [] };
    const t = data.templates[idx];
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
    await saveEmailTemplates(data.templates);
    renderEmailList();
  }

  async function deleteEmailTemplate(idx) {
    const data = (await getEmailTemplates()) || { templates: [] };
    if (!confirm(`Hapus "${data.templates[idx]?.name}"?`)) return;
    data.templates.splice(idx, 1);
    await saveEmailTemplates(data.templates);
    renderEmailList();
  }

  async function resetEmailTemplates() {
    if (!confirm('Reset template email? Perubahan akan hilang.')) return;
    storage.remove('emailTemplatesOverride');
    if (DA.github.isConfigured()) {
      try {
        await DA.github.deleteFile(
          'email-templates/email-templates.json',
          'chore: reset email templates to default'
        );
        toast.success('Reset berhasil. Kembali ke default.');
      } catch (err) {
        toast.warn('Reset lokal berhasil. Gagal hapus di GitHub: ' + err.message);
      }
    } else {
      toast.success('Reset lokal berhasil');
    }
    renderEmailList();
  }

  async function manualSaveEmails() {
    const data = (await getEmailTemplates()) || { templates: [] };
    await saveEmailTemplates(data.templates);
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
      version: 2,
      githubConfig: DA.github.getConfig(),
      adminPasswordHash: storage.get('adminPasswordHash', null),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `DocuApply_Config_${Date.now()}.json`);
    toast.success('Config diunduh');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.appName || data.appName !== 'DocuApply') {
          throw new Error('File tidak valid');
        }
        if (data.githubConfig) DA.github.setConfig(data.githubConfig);
        if (data.adminPasswordHash) storage.set('adminPasswordHash', data.adminPasswordHash);

        toast.success('Config berhasil diimport');
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
    els.cvUploadBtn?.addEventListener('click', () => els.cvUploadInput?.click());
    els.cvUploadInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) uploadCvFile(f);
    });

    // Companies
    els.cpAddBtn?.addEventListener('click', addCompany);
    els.cpReset?.addEventListener('click', resetCompanies);
    els.cpSaveBtn?.addEventListener('click', manualSaveCompanies);

    // Email
    els.emAddBtn?.addEventListener('click', addEmailTemplate);
    els.emReset?.addEventListener('click', resetEmailTemplates);
    els.emSaveBtn?.addEventListener('click', manualSaveEmails);

    // Settings
    els.passChangeBtn?.addEventListener('click', changePassword);
    els.ghTestBtn?.addEventListener('click', testGithub);
    els.ghSaveBtn?.addEventListener('click', saveGithubConfig);
    els.ghClearBtn?.addEventListener('click', clearGithubConfig);

    // Backup
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
