/* =====================================================
   DocuApply — Email Templates v2
   - Support override template dari Admin Dashboard
   ===================================================== */
window.DA = window.DA || {};

DA.email = (function () {
  const { escapeHtml } = DA.utils;

  const BUILT_IN = [
    {
      id: 'umum', name: 'Umum / Standar',
      desc: 'Bahasa formal dan sopan. Cocok untuk perusahaan BUMN, Korporat, atau instansi resmi.',
      icon: 'fa-briefcase', color: 'blue',
      subject: 'Lamaran Pekerjaan - [Posisi yang Dilamar] - [Nama Lengkap]',
      body: `Kepada Yth,\nBapak/Ibu HRD [Nama Perusahaan]\nDi Tempat\n\nDengan hormat,\n\nBerdasarkan informasi yang saya dapatkan dari [Sumber Info] bahwa [Nama Perusahaan] sedang membuka lowongan pekerjaan untuk posisi [Posisi yang Dilamar], saya bermaksud untuk melamar posisi tersebut.\n\nSaya adalah lulusan [Jurusan] dari [Nama Universitas/Sekolah] dengan pengalaman kerja sebagai [Posisi Terakhir] selama [Lama Kerja] tahun. Saya memiliki keahlian di bidang [Sebutkan Keahlian Utama] yang saya yakini dapat memberikan kontribusi positif bagi perusahaan Bapak/Ibu.\n\nSebagai bahan pertimbangan, saya lampirkan dokumen pendukung berupa CV dan Portofolio.\n\nBesar harapan saya untuk dapat mengikuti tahap seleksi selanjutnya. Atas perhatian Bapak/Ibu, saya ucapkan terima kasih.\n\nHormat saya,\n\n[Nama Lengkap]\n[Nomor Telepon]`,
    },
    {
      id: 'fresh', name: 'Fresh Graduate',
      desc: 'Menonjolkan motivasi belajar dan potensi diri. Cocok untuk lulusan baru atau magang.',
      icon: 'fa-graduation-cap', color: 'emerald',
      subject: 'Lamaran Magang - [Posisi yang Dilamar] - [Nama Lengkap]',
      body: `Kepada Yth,\nHRD [Nama Perusahaan]\n\nDengan hormat,\n\nSaya yang bertanda tangan di bawah ini:\n\nNama: [Nama Lengkap]\nPendidikan Terakhir: [Jurusan] - [Nama Universitas/Sekolah]\nNo. HP: [Nomor Telepon]\n\nBermaksud mengajukan lamaran untuk posisi Magang / Internship di perusahaan yang Bapak/Ibu pimpin. Meskipun saya baru lulus, saya memiliki semangat belajar yang tinggi dan telah aktif dalam organisasi [Sebutkan Organisasi] yang melatih kedisiplinan dan kerja tim saya.\n\nSaya menyertakan CV dan transkrip nilai sebagai bahan pertimbangan. Saya sangat berharap diberi kesempatan untuk wawancara.\n\nTerima kasih atas waktu dan perhatiannya.\n\nHormat saya,\n\n[Nama Lengkap]`,
    },
    {
      id: 'english', name: 'English Pro',
      desc: 'Format profesional berbahasa Inggris. Wajib untuk perusahaan Multinasional atau Startup.',
      icon: 'fa-earth-americas', color: 'purple',
      subject: 'Job Application - [Position Name] - [Full Name]',
      body: `Dear Hiring Manager,\n[Company Name]\n\nI am writing to express my interest in the [Position Name] position at [Company Name], as advertised on [Source of Info].\n\nWith my background in [Your Field] and [Number] years of experience in [Key Skill/Industry], I am confident that I can contribute effectively to your team. In my previous role at [Previous Company], I successfully [Mention a Key Achievement].\n\nAttached specifically are my Resume and Cover Letter for your review. I welcome the opportunity to discuss how my skills and experiences align with the needs of your team.\n\nThank you for your time and consideration.\n\nSincerely,\n\n[Full Name]\n[Phone Number]\n[LinkedIn Profile Link]`,
    },
  ];

  let els = {};

  function init() {
    els = {
      list: document.getElementById('emailTemplatesList'),
      grid: document.getElementById('templateGrid'),
      savedSection: document.getElementById('savedTemplatesSection'),
      savedGrid: document.getElementById('savedTemplateGrid'),
      form: document.getElementById('emailComposeForm'),
      back: document.getElementById('emailBack'),
      to: document.getElementById('emailTo'),
      subject: document.getElementById('emailSubject'),
      body: document.getElementById('emailBody'),
      send: document.getElementById('emailSend'),
      copy: document.getElementById('emailCopy'),
      copyText: document.getElementById('emailCopyText'),
      save: document.getElementById('emailSave'),
      phApply: document.getElementById('phApply'),
    };

    renderBuiltin();
    renderSaved();
    bindEvents();

    // Re-render saat admin update
    window.addEventListener('emailTemplates:updated', renderBuiltin);
  }

  function getTemplates() {
    const override = DA.storage.get('emailTemplatesOverride');
    if (override && Array.isArray(override) && override.length) {
      // Merge: gabungkan override dengan built-in (kalau ada id yang sama, override menang)
      const map = new Map();
      BUILT_IN.forEach((t) => map.set(t.id, t));
      override.forEach((t) => map.set(t.id, { ...map.get(t.id), ...t }));
      return Array.from(map.values());
    }
    return BUILT_IN;
  }

  function renderBuiltin() {
    if (!els.grid) return;
    const templates = getTemplates();
    els.grid.innerHTML = '';
    templates.forEach((t) => els.grid.appendChild(cardEl(t, false)));
  }

  function renderSaved() {
    const saved = DA.storage.get('emailTemplates', []);
    if (!saved.length) {
      els.savedSection?.classList.add('hidden');
      return;
    }
    els.savedSection?.classList.remove('hidden');
    if (els.savedGrid) {
      els.savedGrid.innerHTML = '';
      saved.forEach((t, i) => {
        const el = cardEl({ ...t, icon: 'fa-bookmark', color: 'slate' }, true, i);
        els.savedGrid.appendChild(el);
      });
    }
  }

  const COLOR_MAP = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600', groupHover: 'group-hover:bg-indigo-600', ring: 'group-hover:border-indigo-500', accent: 'text-indigo-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', groupHover: 'group-hover:bg-emerald-600', ring: 'group-hover:border-emerald-500', accent: 'text-emerald-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600', groupHover: 'group-hover:bg-purple-600', ring: 'group-hover:border-purple-500', accent: 'text-purple-600' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', groupHover: 'group-hover:bg-slate-700', ring: 'group-hover:border-slate-500', accent: 'text-slate-700' },
  };

  function cardEl(t, isSaved, index) {
    const c = COLOR_MAP[t.color] || COLOR_MAP.blue;
    const div = document.createElement('div');
    div.className = `group bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer shadow-sm active:scale-[0.98] md:hover:-translate-y-1 transition-all duration-300 relative overflow-hidden`;
    div.innerHTML = `
      <div class="relative z-10">
        <div class="flex items-start gap-3 mb-3">
          <div class="w-11 h-11 ${c.bg} ${c.text} rounded-xl flex items-center justify-center ${c.groupHover} group-hover:text-white transition-colors shrink-0">
            <i class="fa-solid ${t.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-slate-800 dark:text-slate-100 mb-1 text-base leading-tight">${escapeHtml(t.name)}</h3>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">${escapeHtml(t.desc || 'Template kustom')}</p>
        <span class="text-xs font-semibold ${c.accent} inline-flex items-center gap-1">
          Gunakan <i class="fa-solid fa-arrow-right text-[10px]"></i>
        </span>
      </div>
      ${isSaved ? `<button class="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors z-20 active:scale-90" data-del><i class="fa-solid fa-trash-can text-xs"></i></button>` : ''}
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      useTemplate(t);
    });
    if (isSaved) {
      div.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSaved(index);
      });
    }
    return div;
  }

  function useTemplate(t) {
    // Ambil dari override dulu (kalau ada subject/body di override)
    const override = DA.storage.get('emailTemplatesOverride');
    const overrideItem = override?.find((x) => x.id === t.id);
    const final = overrideItem ? { ...t, ...overrideItem } : t;

    if (els.subject) els.subject.value = final.subject || '';
    if (els.body) els.body.value = final.body || '';

    els.list?.classList.add('hidden');
    els.form?.classList.remove('hidden');
    els.form?.classList.add('flex');
  }

  function backToList() {
    els.form?.classList.add('hidden');
    els.form?.classList.remove('flex');
    els.list?.classList.remove('hidden');
  }

  function deleteSaved(index) {
    const saved = DA.storage.get('emailTemplates', []);
    if (index < 0 || index >= saved.length) return;
    saved.splice(index, 1);
    DA.storage.set('emailTemplates', saved);
    renderSaved();
    DA.toast.info('Template dihapus');
  }

  function saveCurrent() {
    const name = prompt('Nama template:');
    if (!name) return;
    const saved = DA.storage.get('emailTemplates', []);
    saved.push({
      name: name.trim().slice(0, 60),
      desc: 'Disimpan ' + new Date().toLocaleDateString('id-ID'),
      color: 'slate',
      icon: 'fa-bookmark',
      subject: els.subject?.value || '',
      body: els.body?.value || '',
    });
    DA.storage.set('emailTemplates', saved);
    renderSaved();
    DA.toast.success('Template disimpan');
  }

  function copyBody() {
    const text = els.body?.value || '';
    if (!text) return DA.toast.warn('Isi email masih kosong');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => DA.toast.success('Isi email dicopy'),
        () => DA.toast.error('Gagal copy')
      );
    } else {
      els.body.select();
      document.execCommand('copy');
      DA.toast.success('Isi email dicopy');
    }
  }

  function send() {
    const to = els.to?.value.trim();
    if (!to) return DA.toast.warn('Isi alamat email tujuan (HRD)');
    const subject = encodeURIComponent(els.subject?.value || '');
    const body = encodeURIComponent(els.body?.value || '');
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  }

  function applyPlaceholders() {
    const inputs = document.querySelectorAll('[data-ph]');
    let body = els.body?.value || '';
    let subject = els.subject?.value || '';
    inputs.forEach((inp) => {
      const val = inp.value.trim();
      if (!val) return;
      const ph = inp.dataset.ph;
      const re = new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      body = body.replace(re, val);
      subject = subject.replace(re, val);
    });
    if (els.body) els.body.value = body;
    if (els.subject) els.subject.value = subject;
    DA.toast.success('Placeholder diterapkan');
  }

  function bindEvents() {
    els.back?.addEventListener('click', backToList);
    els.send?.addEventListener('click', send);
    els.copy?.addEventListener('click', copyBody);
    els.copyText?.addEventListener('click', copyBody);
    els.save?.addEventListener('click', saveCurrent);
    els.phApply?.addEventListener('click', applyPlaceholders);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !els.form?.classList.contains('hidden')) {
        e.preventDefault(); send();
      }
    });
  }

  return { init };
})();
