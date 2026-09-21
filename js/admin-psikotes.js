/* =====================================================
   DocuApply — Admin: Psikotes Manager
   CRUD paket, section, soal + upload gambar (base64)
   ===================================================== */
window.DA = window.DA || {};

DA.adminPsikotes = (function () {
  'use strict';

  const { escapeHtml, uid } = DA.utils;
  const STORAGE_KEY = 'psikotesOverride';
  const MAX_IMG_DIM = 800; // resize target

  let els = {};
  let data = { packages: [] };
  let nav = { view: 'list', pkgId: null, secId: null };
  let cache = { pkg: null, sec: null, question: null };

  const COLORS = ['blue', 'emerald', 'purple', 'amber', 'rose', 'indigo'];
  const TYPES = [
    { id: 'logika-angka',     label: 'Tes Logika Angka' },
    { id: 'matematika-dasar', label: 'Tes Matematika Dasar' },
    { id: 'kepribadian',      label: 'Tes Kepribadian' },
  ];
  const ICONS = [
    'fa-brain', 'fa-calculator', 'fa-user-astronaut', 'fa-lightbulb',
    'fa-chart-line', 'fa-puzzle-piece', 'fa-shield-halved', 'fa-graduation-cap',
    'fa-flask', 'fa-rocket', 'fa-star', 'fa-award',
  ];

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      breadcrumb: document.getElementById('apkBreadcrumb'),
      container:  document.getElementById('apkContainer'),
      backBtn:    document.getElementById('apkBackBtn'),
      addBtn:     document.getElementById('apkAddBtn'),
    };
    if (!els.container) return;
    loadData();
  }

  async function loadData() {
    const override = DA.storage.get(STORAGE_KEY);
    if (override && Array.isArray(override.packages)) {
      data = JSON.parse(JSON.stringify(override));
    } else {
      try {
        const res = await fetch('psikotes/packages.json?t=' + Date.now());
        const j = await res.json();
        data = { packages: j.packages || [] };
      } catch {
        data = { packages: [] };
      }
    }
    nav = { view: 'list', pkgId: null, secId: null };
    render();
  }

  function save() {
    DA.storage.set(STORAGE_KEY, data);
    window.dispatchEvent(new Event('psikotes:updated'));
    // Sync GitHub if configured
    if (DA.github && DA.github.isConfigured()) {
      DA.github.uploadFile(
        'psikotes/packages.json',
        JSON.stringify(data, null, 2),
        'chore: update psikotes data from admin'
      ).then(() => DA.toast.success('✅ Tersimpan ke GitHub'))
        .catch((e) => console.warn('[Admin] GitHub sync:', e));
    }
  }

  /* ============================================
     RENDER MAIN
     ============================================ */
  function render() {
    renderBreadcrumb();
    if (nav.view === 'list') renderList();
    else if (nav.view === 'pkg') renderSections();
    else if (nav.view === 'sec') renderQuestions();
  }

  function renderBreadcrumb() {
    if (!els.breadcrumb) return;
    const items = [`<button class="apk-crumb" data-nav="list">Paket</button>`];
    if (nav.pkgId) {
      const pkg = data.packages.find((p) => p.id === nav.pkgId);
      if (pkg) items.push(`<span class="apk-crumb-sep">/</span><button class="apk-crumb ${nav.view === 'pkg' ? 'current' : ''}" data-nav="pkg">${escapeHtml(pkg.name)}</button>`);
    }
    if (nav.secId && nav.pkgId) {
      const pkg = data.packages.find((p) => p.id === nav.pkgId);
      const sec = pkg?.sections?.find((s) => s.id === nav.secId);
      if (sec) items.push(`<span class="apk-crumb-sep">/</span><span class="apk-crumb current">${escapeHtml(sec.name)}</span>`);
    }
    els.breadcrumb.innerHTML = items.join('');

    els.breadcrumb.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nav;
        if (target === 'list') nav = { view: 'list', pkgId: null, secId: null };
        if (target === 'pkg') nav.view = 'pkg';
        render();
      });
    });

    // Back button
    if (els.backBtn) {
      const show = nav.view !== 'list';
      els.backBtn.classList.toggle('hidden', !show);
    }
  }

  /* ============================================
     VIEW: PACKAGE LIST
     ============================================ */
  function renderList() {
    if (els.addBtn) els.addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Paket';

    if (!data.packages.length) {
      els.container.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-brain"></i>
          <div>Belum ada paket psikotes</div>
          <p class="text-xs mt-1">Klik "Tambah Paket" untuk memulai</p>
        </div>`;
      return;
    }

    els.container.innerHTML = data.packages.map((pkg) => {
      const totalQ = (pkg.sections || []).reduce((s, sec) => s + (sec.questions?.length || 0), 0);
      return `
        <div class="admin-row admin-row-lg" data-id="${pkg.id}">
          <div class="admin-row-icon"><i class="fa-solid ${escapeHtml(pkg.icon || 'fa-brain')}"></i></div>
          <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(pkg.name)}</div>
            <div class="admin-row-sub">${escapeHtml(pkg.description || '')}</div>
            <div class="admin-row-chips">
              <span class="admin-chip"><i class="fa-solid fa-clock"></i> ${pkg.duration || 0} menit</span>
              <span class="admin-chip"><i class="fa-solid fa-list-check"></i> ${pkg.sections?.length || 0} bagian</span>
              <span class="admin-chip"><i class="fa-solid fa-circle-question"></i> ${totalQ} soal</span>
            </div>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn-icon primary" data-act="open" title="Kelola"><i class="fa-solid fa-folder-open"></i></button>
            <button class="admin-btn-icon" data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="admin-btn-icon warn" data-act="dup" title="Duplikat"><i class="fa-regular fa-clone"></i></button>
            <button class="admin-btn-icon danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');

    els.container.querySelectorAll('.admin-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="open"]').addEventListener('click', () => {
        nav = { view: 'pkg', pkgId: id, secId: null };
        render();
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editPackage(id));
      row.querySelector('[data-act="dup"]').addEventListener('click', () => dupPackage(id));
      row.querySelector('[data-act="del"]').addEventListener('click', () => delPackage(id));
    });
  }

  /* ============================================
     VIEW: SECTION LIST (dalam paket)
     ============================================ */
  function renderSections() {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    if (!pkg) { nav = { view: 'list' }; return render(); }
    if (els.addBtn) els.addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Bagian';

    if (!pkg.sections?.length) {
      els.container.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-list-check"></i>
          <div>Belum ada bagian tes di paket ini</div>
        </div>`;
      return;
    }

    els.container.innerHTML = pkg.sections.map((sec) => `
      <div class="admin-row admin-row-lg" data-id="${sec.id}">
        <div class="admin-row-icon"><i class="fa-solid fa-list-check"></i></div>
        <div class="admin-row-body">
          <div class="admin-row-title">${escapeHtml(sec.name)}</div>
          <div class="admin-row-chips">
            <span class="admin-chip">${escapeHtml(TYPES.find((t) => t.id === sec.type)?.label || sec.type)}</span>
            <span class="admin-chip"><i class="fa-solid fa-clock"></i> ${sec.duration || 0} menit</span>
            <span class="admin-chip"><i class="fa-solid fa-circle-question"></i> ${sec.questions?.length || 0} soal</span>
          </div>
        </div>
        <div class="admin-row-actions">
          <button class="admin-btn-icon primary" data-act="open" title="Kelola Soal"><i class="fa-solid fa-folder-open"></i></button>
          <button class="admin-btn-icon" data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="admin-btn-icon danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `).join('');

    els.container.querySelectorAll('.admin-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="open"]').addEventListener('click', () => {
        nav.view = 'sec';
        nav.secId = id;
        render();
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editSection(id));
      row.querySelector('[data-act="del"]').addEventListener('click', () => delSection(id));
    });
  }

  /* ============================================
     VIEW: QUESTION LIST (dalam section)
     ============================================ */
  function renderQuestions() {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === nav.secId);
    if (!sec) { nav.view = 'pkg'; return render(); }
    if (els.addBtn) els.addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Soal';

    if (!sec.questions?.length) {
      els.container.innerHTML = `
        <div class="admin-empty">
          <i class="fa-solid fa-circle-question"></i>
          <div>Belum ada soal di bagian ini</div>
        </div>`;
      return;
    }

    const isKepribadian = sec.type === 'kepribadian';
    els.container.innerHTML = sec.questions.map((q, i) => {
      const qImg = q.image ? '<i class="fa-solid fa-image text-blue-500"></i>' : '';
      let meta = '';
      if (q.type === 'essay') meta = '<span class="admin-chip"><i class="fa-solid fa-pen-fancy"></i> Esai</span>';
      else {
        const correctOpt = (q.options || []).find((o) => o.id === q.correct);
        meta = `<span class="admin-chip"><i class="fa-solid fa-list"></i> ${(q.options || []).length} opsi</span>`;
        if (!isKepribadian && q.correct) {
          meta += `<span class="admin-chip admin-chip-correct"><i class="fa-solid fa-check"></i> ${escapeHtml(q.correct)}</span>`;
        }
      }
      const optImgs = (q.options || []).some((o) => o.image) ? '<span class="admin-chip"><i class="fa-solid fa-image"></i> opsi bergambar</span>' : '';
      return `
        <div class="admin-row admin-row-lg" data-id="${q.id}">
          <div class="admin-row-icon"><span class="font-bold text-xs">${i + 1}</span></div>
          <div class="admin-row-body">
            <div class="admin-row-title" style="white-space:normal;">${escapeHtml(q.text || '(tanpa teks)')}</div>
            <div class="admin-row-chips">
              ${meta}
              ${qImg}
              ${optImgs}
            </div>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn-icon" data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="admin-btn-icon warn" data-act="dup" title="Duplikat"><i class="fa-regular fa-clone"></i></button>
            <button class="admin-btn-icon danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');

    els.container.querySelectorAll('.admin-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editQuestion(id));
      row.querySelector('[data-act="dup"]').addEventListener('click', () => dupQuestion(id));
      row.querySelector('[data-act="del"]').addEventListener('click', () => delQuestion(id));
    });
  }

  /* ============================================
     PACKAGE MODAL
     ============================================ */
  function packageFormHtml(p = {}) {
    const color = p.color || 'blue';
    const icon = p.icon || 'fa-brain';
    return `
      <div class="form-field">
        <label class="form-field-label">Nama Paket <span class="req">*</span></label>
        <input type="text" id="pkName" class="form-field-input" value="${escapeHtml(p.name || '')}" placeholder="Contoh: Psikotes PT Epson">
      </div>
      <div class="form-field">
        <label class="form-field-label">Deskripsi</label>
        <textarea id="pkDesc" class="form-field-input" rows="2" placeholder="Deskripsi singkat paket">${escapeHtml(p.description || '')}</textarea>
      </div>
      <div class="form-field">
        <label class="form-field-label">Durasi Total (menit) <span class="req">*</span></label>
        <input type="number" id="pkDur" class="form-field-input" value="${p.duration || 30}" min="1" max="300">
      </div>
      <div class="form-field">
        <label class="form-field-label">Warna Kartu</label>
        <div class="color-options-row" id="pkColorRow">
          ${COLORS.map((c) => `<div class="color-option ${color === c ? 'selected' : ''}" data-color="${c}" style="background:${gradFor(c)}"></div>`).join('')}
        </div>
        <input type="hidden" id="pkColor" value="${escapeHtml(color)}">
      </div>
      <div class="form-field">
        <label class="form-field-label">Icon</label>
        <div class="icon-options-row" id="pkIconRow">
          ${ICONS.map((ic) => `<div class="icon-option ${icon === ic ? 'selected' : ''}" data-icon="${ic}"><i class="fa-solid ${ic}"></i></div>`).join('')}
        </div>
        <input type="hidden" id="pkIcon" value="${escapeHtml(icon)}">
      </div>
    `;
  }

  function gradFor(c) {
    const m = {
      blue: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
      emerald: 'linear-gradient(135deg,#10b981,#047857)',
      purple: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',
      amber: 'linear-gradient(135deg,#f59e0b,#d97706)',
      rose: 'linear-gradient(135deg,#f43f5e,#be123c)',
      indigo: 'linear-gradient(135deg,#6366f1,#4338ca)',
    };
    return m[c] || m.blue;
  }

  function addPackage() {
    DA.admin.openModal({
      icon: 'fa-plus', title: 'Tambah Paket Psikotes', subtitle: 'Buat paket baru',
      bodyHtml: packageFormHtml(), submitText: 'Tambah',
      onSubmit: () => {
        const name = document.getElementById('pkName').value.trim();
        if (!name) return DA.toast.error('Nama wajib diisi');
        data.packages.push({
          id: uid(),
          name,
          description: document.getElementById('pkDesc').value.trim(),
          duration: parseInt(document.getElementById('pkDur').value) || 30,
          color: document.getElementById('pkColor').value,
          icon: document.getElementById('pkIcon').value,
          sections: [],
        });
        save();
        DA.admin.closeModal();
        render();
        DA.toast.success('Paket ditambahkan');
      },
    });
    setTimeout(() => bindColorIcon('pkColorRow', 'pkColor', 'pkIconRow', 'pkIcon'), 50);
  }

  function editPackage(id) {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) return;
    DA.admin.openModal({
      icon: 'fa-pen', title: 'Edit Paket', subtitle: pkg.name,
      bodyHtml: packageFormHtml(pkg), submitText: 'Simpan',
      onSubmit: () => {
        pkg.name = document.getElementById('pkName').value.trim() || pkg.name;
        pkg.description = document.getElementById('pkDesc').value.trim();
        pkg.duration = parseInt(document.getElementById('pkDur').value) || 30;
        pkg.color = document.getElementById('pkColor').value;
        pkg.icon = document.getElementById('pkIcon').value;
        save();
        DA.admin.closeModal();
        render();
      },
    });
    setTimeout(() => bindColorIcon('pkColorRow', 'pkColor', 'pkIconRow', 'pkIcon'), 50);
  }

  function dupPackage(id) {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) return;
    const dup = JSON.parse(JSON.stringify(pkg));
    dup.id = uid();
    dup.name = pkg.name + ' (Copy)';
    (dup.sections || []).forEach((s) => {
      s.id = uid();
      (s.questions || []).forEach((q) => { q.id = uid(); });
    });
    data.packages.push(dup);
    save();
    render();
    DA.toast.success('Paket diduplikat');
  }

  function delPackage(id) {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) return;
    DA.admin.showConfirm({
      title: 'Hapus Paket?', subtitle: pkg.name,
      message: `Paket <strong>${escapeHtml(pkg.name)}</strong> beserta semua soal akan dihapus.`,
      okText: 'Ya, Hapus',
      onOk: () => {
        data.packages = data.packages.filter((p) => p.id !== id);
        save();
        render();
      },
    });
  }

  /* ============================================
     SECTION MODAL
     ============================================ */
  function sectionFormHtml(s = {}) {
    return `
      <div class="form-field">
        <label class="form-field-label">Nama Bagian <span class="req">*</span></label>
        <input type="text" id="secName" class="form-field-input" value="${escapeHtml(s.name || '')}" placeholder="Contoh: Tes Logika Angka">
      </div>
      <div class="form-field">
        <label class="form-field-label">Jenis Tes <span class="req">*</span></label>
        <select id="secType" class="form-field-input">
          ${TYPES.map((t) => `<option value="${t.id}" ${s.type === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label class="form-field-label">Durasi Bagian (menit)</label>
        <input type="number" id="secDur" class="form-field-input" value="${s.duration || 10}" min="1" max="180">
      </div>
    `;
  }

  function addSection() {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    if (!pkg) return;
    DA.admin.openModal({
      icon: 'fa-plus', title: 'Tambah Bagian', subtitle: pkg.name,
      bodyHtml: sectionFormHtml(), submitText: 'Tambah',
      onSubmit: () => {
        const name = document.getElementById('secName').value.trim();
        if (!name) return DA.toast.error('Nama wajib diisi');
        pkg.sections = pkg.sections || [];
        pkg.sections.push({
          id: uid(),
          name,
          type: document.getElementById('secType').value,
          duration: parseInt(document.getElementById('secDur').value) || 10,
          questions: [],
        });
        save();
        DA.admin.closeModal();
        render();
      },
    });
  }

  function editSection(id) {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === id);
    if (!sec) return;
    DA.admin.openModal({
      icon: 'fa-pen', title: 'Edit Bagian', subtitle: sec.name,
      bodyHtml: sectionFormHtml(sec), submitText: 'Simpan',
      onSubmit: () => {
        sec.name = document.getElementById('secName').value.trim() || sec.name;
        sec.type = document.getElementById('secType').value;
        sec.duration = parseInt(document.getElementById('secDur').value) || 10;
        save();
        DA.admin.closeModal();
        render();
      },
    });
  }

  function delSection(id) {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === id);
    if (!sec) return;
    DA.admin.showConfirm({
      title: 'Hapus Bagian?', subtitle: sec.name,
      message: `Bagian <strong>${escapeHtml(sec.name)}</strong> dan ${sec.questions?.length || 0} soal di dalamnya akan dihapus.`,
      okText: 'Ya, Hapus',
      onOk: () => {
        pkg.sections = pkg.sections.filter((s) => s.id !== id);
        save();
        render();
      },
    });
  }

  /* ============================================
     QUESTION MODAL
     ============================================ */
  function questionFormHtml(q = {}, sectionType) {
    const isKepribadian = sectionType === 'kepribadian';
    const type = q.type || 'mc';
    return `
      <div class="form-field">
        <label class="form-field-label">Tipe Soal</label>
        <div class="apk-type-tabs">
          <button type="button" class="apk-type-btn ${type === 'mc' ? 'active' : ''}" data-qtype="mc">
            <i class="fa-solid fa-list-ul"></i> Pilihan Ganda
          </button>
          <button type="button" class="apk-type-btn ${type === 'essay' ? 'active' : ''}" data-qtype="essay">
            <i class="fa-solid fa-pen-fancy"></i> Esai
          </button>
        </div>
        <input type="hidden" id="qType" value="${type}">
      </div>

      <div class="form-field">
        <label class="form-field-label">Pertanyaan <span class="req">*</span></label>
        <textarea id="qText" class="form-field-input" rows="3" placeholder="Tulis pertanyaan...">${escapeHtml(q.text || '')}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field-label">Gambar Soal (opsional)</label>
        <div class="apk-img-upload" id="qImgBox">
          ${q.image ? `
            <div class="apk-img-preview">
              <img src="${q.image}" alt="">
              <button type="button" class="apk-img-remove" id="qImgRemove"><i class="fa-solid fa-xmark"></i></button>
            </div>` : `
            <label class="apk-img-drop" for="qImgInput">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>Klik untuk upload</span>
              <small>Maks ~1MB (otomatis dikompres)</small>
            </label>`}
          <input type="file" id="qImgInput" accept="image/*" class="hidden">
        </div>
      </div>

      <div id="qMcWrap" class="${type === 'essay' ? 'hidden' : ''}">
        <div class="form-field">
          <label class="form-field-label">Pilihan Jawaban</label>
          <div id="qOptionsList" class="apk-options-list"></div>
          <button type="button" class="apply-add-btn" id="qAddOption">
            <i class="fa-solid fa-plus"></i> Tambah Pilihan
          </button>
        </div>
        ${!isKepribadian ? `
          <div class="form-field">
            <label class="form-field-label">Jawaban Benar</label>
            <select id="qCorrect" class="form-field-input"></select>
          </div>` : ''}
      </div>

      <div id="qEssayWrap" class="${type === 'mc' ? 'hidden' : ''}">
        <div class="form-field">
          <label class="form-field-label">Kunci / Contoh Jawaban (opsional)</label>
          <textarea id="qModelAnswer" class="form-field-input" rows="3" placeholder="Digunakan hanya untuk referensi review">${escapeHtml(q.modelAnswer || '')}</textarea>
        </div>
      </div>
    `;
  }

  function bindQuestionForm(q, sectionType) {
    const isKepribadian = sectionType === 'kepribadian';
    let options = q.options ? JSON.parse(JSON.stringify(q.options)) : [
      { id: 'A', text: '', image: null, trait: '' },
      { id: 'B', text: '', image: null, trait: '' },
      { id: 'C', text: '', image: null, trait: '' },
      { id: 'D', text: '', image: null, trait: '' },
    ];

    // Tipe soal
    document.querySelectorAll('.apk-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.qtype;
        document.getElementById('qType').value = t;
        document.querySelectorAll('.apk-type-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.getElementById('qMcWrap').classList.toggle('hidden', t === 'essay');
        document.getElementById('qEssayWrap').classList.toggle('hidden', t === 'mc');
      });
    });

    // Render opsi
    function renderOptions() {
      const list = document.getElementById('qOptionsList');
      list.innerHTML = options.map((o, i) => `
        <div class="apk-option-item" data-i="${i}">
          <div class="apk-option-head">
            <span class="apk-option-letter">${String.fromCharCode(65 + i)}</span>
            <button type="button" class="apk-option-del" data-i="${i}"><i class="fa-solid fa-trash-can"></i></button>
          </div>
          <input type="text" class="form-field-input apk-opt-text" data-i="${i}" value="${escapeHtml(o.text || '')}" placeholder="Teks pilihan">
          ${isKepribadian ? `<input type="text" class="form-field-input apk-opt-trait" data-i="${i}" value="${escapeHtml(o.trait || '')}" placeholder="Trait (mis: Leadership, Analitis)">` : ''}
          <div class="apk-opt-img-row">
            ${o.image ? `
              <div class="apk-opt-img-preview">
                <img src="${o.image}">
                <button type="button" class="apk-img-remove" data-remove-img="${i}"><i class="fa-solid fa-xmark"></i></button>
              </div>` : `
              <label class="apk-opt-img-add">
                <i class="fa-solid fa-image"></i> Gambar
                <input type="file" accept="image/*" class="hidden" data-opt-img="${i}">
              </label>`}
          </div>
        </div>
      `).join('');

      // Update correct select
      const sel = document.getElementById('qCorrect');
      if (sel) {
        const curVal = q.correct || options[0]?.id;
        sel.innerHTML = options.map((o, i) =>
          `<option value="${String.fromCharCode(65 + i)}" ${curVal === String.fromCharCode(65 + i) ? 'selected' : ''}>
            ${String.fromCharCode(65 + i)}. ${escapeHtml((o.text || '').slice(0, 40)) || '(kosong)'}
          </option>`).join('');
      }

      // Bind events
      list.querySelectorAll('.apk-opt-text').forEach((inp) => {
        inp.addEventListener('input', (e) => { options[Number(e.target.dataset.i)].text = e.target.value; });
      });
      list.querySelectorAll('.apk-opt-trait').forEach((inp) => {
        inp.addEventListener('input', (e) => { options[Number(e.target.dataset.i)].trait = e.target.value; });
      });
      list.querySelectorAll('.apk-option-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (options.length <= 2) return DA.toast.warn('Minimal 2 pilihan');
          options.splice(Number(btn.dataset.i), 1);
          reindexOptions();
          renderOptions();
        });
      });
      list.querySelectorAll('[data-opt-img]').forEach((inp) => {
        inp.addEventListener('change', async (e) => {
          const i = Number(inp.dataset.optImg);
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const b64 = await fileToResizedBase64(f, MAX_IMG_DIM);
          options[i].image = b64;
          renderOptions();
        });
      });
      list.querySelectorAll('[data-remove-img]').forEach((btn) => {
        btn.addEventListener('click', () => {
          options[Number(btn.dataset.removeImg)].image = null;
          renderOptions();
        });
      });
    }

    function reindexOptions() {
      // After removal, reindex IDs A, B, C...
      options.forEach((o, i) => { o.id = String.fromCharCode(65 + i); });
    }

    renderOptions();

    // Add option
    document.getElementById('qAddOption')?.addEventListener('click', () => {
      if (options.length >= 8) return DA.toast.warn('Maks 8 pilihan');
      options.push({ id: String.fromCharCode(65 + options.length), text: '', image: null, trait: '' });
      renderOptions();
    });

    // Question image upload
    const qImgInput = document.getElementById('qImgInput');
    qImgInput?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      const b64 = await fileToResizedBase64(f, MAX_IMG_DIM);
      const box = document.getElementById('qImgBox');
      box.querySelector('.apk-img-drop')?.remove();
      const old = box.querySelector('.apk-img-preview');
      if (old) old.remove();
      const preview = document.createElement('div');
      preview.className = 'apk-img-preview';
      preview.innerHTML = `<img src="${b64}"><button type="button" class="apk-img-remove" id="qImgRemove"><i class="fa-solid fa-xmark"></i></button>`;
      box.insertBefore(preview, qImgInput);
      box.dataset.qImg = b64;
      preview.querySelector('#qImgRemove').addEventListener('click', () => {
        preview.remove();
        box.dataset.qImg = '';
        box.insertAdjacentHTML('afterbegin', `
          <label class="apk-img-drop" for="qImgInput">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Klik untuk upload</span>
            <small>Maks ~1MB (otomatis dikompres)</small>
          </label>`);
      });
    });
    document.getElementById('qImgRemove')?.addEventListener('click', (e) => {
      const box = document.getElementById('qImgBox');
      e.target.closest('.apk-img-preview').remove();
      box.dataset.qImg = '';
      box.insertAdjacentHTML('afterbegin', `
        <label class="apk-img-drop" for="qImgInput">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Klik untuk upload</span>
          <small>Maks ~1MB (otomatis dikompres)</small>
        </label>`);
    });
    const imgBox = document.getElementById('qImgBox');
    if (q.image) imgBox.dataset.qImg = q.image;

    // Return collector
    return () => {
      const type = document.getElementById('qType').value;
      const text = document.getElementById('qText').value.trim();
      const image = document.getElementById('qImgBox').dataset.qImg || null;
      const correct = document.getElementById('qCorrect')?.value || null;
      const modelAnswer = document.getElementById('qModelAnswer')?.value.trim() || '';
      return { type, text, image, options, correct, modelAnswer };
    };
  }

  function addQuestion() {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === nav.secId);
    if (!sec) return;

    let collect;
    DA.admin.openModal({
      icon: 'fa-plus', title: 'Tambah Soal', subtitle: sec.name,
      bodyHtml: questionFormHtml({}, sec.type),
      submitText: 'Tambah',
      onSubmit: () => {
        const v = collect();
        if (!v.text && !v.image) return DA.toast.error('Soal harus punya teks atau gambar');
        const q = { id: uid(), ...v };
        sec.questions = sec.questions || [];
        sec.questions.push(q);
        save();
        DA.admin.closeModal();
        render();
      },
    });
    setTimeout(() => { collect = bindQuestionForm({}, sec.type); }, 50);
  }

  function editQuestion(qid) {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === nav.secId);
    const q = sec?.questions?.find((x) => x.id === qid);
    if (!q) return;

    let collect;
    DA.admin.openModal({
      icon: 'fa-pen', title: 'Edit Soal', subtitle: sec.name,
      bodyHtml: questionFormHtml(q, sec.type),
      submitText: 'Simpan',
      onSubmit: () => {
        const v = collect();
        if (!v.text && !v.image) return DA.toast.error('Soal harus punya teks atau gambar');
        Object.assign(q, v);
        save();
        DA.admin.closeModal();
        render();
      },
    });
    setTimeout(() => { collect = bindQuestionForm(q, sec.type); }, 50);
  }

  function dupQuestion(qid) {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === nav.secId);
    const q = sec?.questions?.find((x) => x.id === qid);
    if (!q) return;
    const dup = JSON.parse(JSON.stringify(q));
    dup.id = uid();
    sec.questions.push(dup);
    save();
    render();
  }

  function delQuestion(qid) {
    const pkg = data.packages.find((p) => p.id === nav.pkgId);
    const sec = pkg?.sections?.find((s) => s.id === nav.secId);
    if (!sec) return;
    DA.admin.showConfirm({
      title: 'Hapus Soal?', subtitle: '',
      message: 'Soal akan dihapus dari bagian ini.',
      okText: 'Ya, Hapus',
      onOk: () => {
        sec.questions = sec.questions.filter((x) => x.id !== qid);
        save();
        render();
      },
    });
  }

  /* ============================================
     HELPERS
     ============================================ */
  function bindColorIcon(colorRowId, colorInputId, iconRowId, iconInputId) {
    const cr = document.getElementById(colorRowId);
    const ci = document.getElementById(colorInputId);
    cr?.querySelectorAll('.color-option').forEach((el) => {
      el.addEventListener('click', () => {
        cr.querySelectorAll('.color-option').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        ci.value = el.dataset.color;
      });
    });
    const ir = document.getElementById(iconRowId);
    const ii = document.getElementById(iconInputId);
    ir?.querySelectorAll('.icon-option').forEach((el) => {
      el.addEventListener('click', () => {
        ir.querySelectorAll('.icon-option').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        ii.value = el.dataset.icon;
      });
    });
  }

  function fileToResizedBase64(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          // PNG untuk yang butuh transparansi (jarang untuk soal), JPG untuk yang lain
          const mime = 'image/jpeg';
          const q = 0.82;
          resolve(c.toDataURL(mime, q));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ============================================
     PUBLIC API
     ============================================ */
  function handleAddClick() {
    if (nav.view === 'list') addPackage();
    else if (nav.view === 'pkg') addSection();
    else if (nav.view === 'sec') addQuestion();
  }
  function handleBackClick() {
    if (nav.view === 'sec') { nav.view = 'pkg'; nav.secId = null; render(); }
    else if (nav.view === 'pkg') { nav = { view: 'list', pkgId: null, secId: null }; render(); }
  }

  function bindUI() {
    els.addBtn?.addEventListener('click', handleAddClick);
    els.backBtn?.addEventListener('click', handleBackClick);
  }

  const origInit = init;
  function initAndBind() {
    origInit();
    bindUI();
  }

  return { init: initAndBind, reload: loadData };
})();
