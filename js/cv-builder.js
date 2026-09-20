/* =====================================================
   DocuApply — CV Builder
   - Load templates .docx dari /cv-templates/
   - Fetch dari server → parse jadi HTML (mammoth.js)
   - Edit di browser user (contenteditable)
   - Download hasil sebagai PDF / DOCX
   ===================================================== */
window.DA = window.DA || {};

DA.cvBuilder = (function () {
  'use strict';

  const { downloadBlob } = DA.utils;

  let els = {};
  let currentTemplate = null;
  let originalHtml = '';
  let saveTimer = null;

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      list: document.getElementById('cvTemplatesList'),
      grid: document.getElementById('cvTemplateGrid'),
      loading: document.getElementById('cvLoading'),
      empty: document.getElementById('cvEmpty'),
      editor: document.getElementById('cvEditor'),
      back: document.getElementById('cvBack'),
      editorTitle: document.getElementById('cvEditorTitle'),
      content: document.getElementById('cvContent'),
      paper: document.getElementById('cvPaper'),
      downloadDocx: document.getElementById('cvDownloadDocx'),
      downloadPdf: document.getElementById('cvDownloadPdf'),
      saveLocal: document.getElementById('cvSaveLocal'),
      formatBlock: document.getElementById('cvFormatBlock'),
      foreColor: document.getElementById('cvForeColor'),
    };

    if (!els.grid) return;

    loadTemplates();
    bindEvents();
  }

  /* ============================================
     LOAD TEMPLATES MANIFEST
     ============================================ */
  async function loadTemplates() {
    try {
      const res = await fetch('cv-templates/templates.json?t=' + Date.now());
      if (!res.ok) throw new Error('templates.json tidak ditemukan');
      const data = await res.json();
      const templates = Array.isArray(data) ? data : (data.templates || []);

      els.loading?.classList.add('hidden');
      if (!templates.length) {
        els.empty?.classList.remove('hidden');
        return;
      }
      renderTemplates(templates);
    } catch (err) {
      console.warn('[CV] Gagal memuat templates:', err);
      els.loading?.classList.add('hidden');
      els.empty?.classList.remove('hidden');
    }
  }

  const COLOR_MAP = {
    blue:    { bg: 'bg-blue-100',    text: 'text-blue-600',    hover: 'group-hover:bg-blue-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', hover: 'group-hover:bg-emerald-600' },
    purple:  { bg: 'bg-purple-100',  text: 'text-purple-600',  hover: 'group-hover:bg-purple-600' },
    amber:   { bg: 'bg-amber-100',   text: 'text-amber-600',   hover: 'group-hover:bg-amber-600' },
    rose:    { bg: 'bg-rose-100',    text: 'text-rose-600',    hover: 'group-hover:bg-rose-600' },
    indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-600',  hover: 'group-hover:bg-indigo-600' },
  };

  function renderTemplates(templates) {
    els.grid.innerHTML = '';
    templates.forEach((t) => {
      const c = COLOR_MAP[t.color] || COLOR_MAP.blue;
      const card = document.createElement('div');
      card.className = 'group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all duration-300 active:scale-[0.98]';
      card.innerHTML = `
        <div class="flex items-start gap-3 mb-4">
          <div class="w-12 h-12 ${c.bg} ${c.text} rounded-xl flex items-center justify-center ${c.hover} group-hover:text-white transition-colors shrink-0">
            <i class="fa-solid ${t.icon || 'fa-file-lines'} text-lg"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight mb-1">${escapeHtml(t.name)}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${escapeHtml(t.description || '')}</p>
          </div>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <i class="fa-solid fa-file-word text-blue-500 mr-1"></i> .docx
          </span>
          <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Gunakan <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </span>
        </div>
      `;
      card.addEventListener('click', () => openEditor(t));
      els.grid.appendChild(card);
    });
  }

  /* ============================================
     OPEN EDITOR — fetch .docx dari server
     ============================================ */
  async function openEditor(template) {
    currentTemplate = template;
    if (els.editorTitle) els.editorTitle.textContent = template.name;

    els.list.classList.add('hidden');
    els.editor.classList.remove('hidden');
    els.editor.classList.add('flex');

    els.content.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;font-family:sans-serif;">Memuat template dari server...</p>';

    try {
      const url = 'cv-templates/' + encodeURIComponent(template.file);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Gagal unduh file (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();

      if (typeof mammoth === 'undefined') {
        throw new Error('Library mammoth.js tidak termuat. Refresh halaman.');
      }

      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = (result.value || '').trim();

      if (!html) {
        els.content.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;font-family:sans-serif;">Template kosong. Silakan tulis CV Anda di sini.</p>';
      } else {
        els.content.innerHTML = html;
      }

      originalHtml = els.content.innerHTML;

      // Cek draft tersimpan
      const draftKey = 'cv_draft_' + template.id;
      const saved = DA.storage.get(draftKey);
      if (saved && saved.html && saved.html !== originalHtml) {
        setTimeout(() => {
          DA.toast.info('Ada draft tersimpan. Klik "Draft" untuk memuat.', 4000);
        }, 800);
      }

      DA.toast.success('Template dimuat — siap diedit!');
    } catch (err) {
      console.error('[CV] Error load template:', err);
      els.content.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#ef4444;font-family:sans-serif;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem;margin-bottom:1rem;"></i>
          <p style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;">Gagal memuat template</p>
          <p style="font-size:0.85rem;opacity:0.8;">${escapeHtml(err.message || 'Unknown error')}</p>
          <p style="font-size:0.75rem;opacity:0.6;margin-top:1rem;">Pastikan file <code>.docx</code> ada di folder <code>cv-templates/</code></p>
        </div>
      `;
      DA.toast.error('Gagal memuat template: ' + err.message);
    }
  }

  function closeEditor() {
    // Auto-save draft
    if (currentTemplate && els.content) {
      const currentHtml = els.content.innerHTML;
      if (currentHtml && currentHtml !== originalHtml) {
        const draftKey = 'cv_draft_' + currentTemplate.id;
        DA.storage.set(draftKey, { html: currentHtml, savedAt: Date.now() });
      }
    }
    els.editor.classList.add('hidden');
    els.editor.classList.remove('flex');
    els.list.classList.remove('hidden');
    currentTemplate = null;
  }

  /* ============================================
     FORMATTING
     ============================================ */
  function execCmd(cmd, value) {
    document.execCommand(cmd, false, value);
    els.content.focus();
    updateToolbarState();
  }

  function updateToolbarState() {
    document.querySelectorAll('.cv-tool-btn[data-cmd]').forEach((btn) => {
      try {
        const active = document.queryCommandState(btn.dataset.cmd);
        btn.classList.toggle('active', active);
      } catch {}
    });
  }

  /* ============================================
     DRAFT
     ============================================ */
  function debouncedSaveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 2000);
  }

  function saveDraft() {
    if (!currentTemplate || !els.content) return;
    const draftKey = 'cv_draft_' + currentTemplate.id;
    DA.storage.set(draftKey, {
      html: els.content.innerHTML,
      savedAt: Date.now(),
    });
    DA.toast.success('Draft tersimpan', 1500);
  }

  function loadDraft() {
    if (!currentTemplate) return;
    const draftKey = 'cv_draft_' + currentTemplate.id;
    const saved = DA.storage.get(draftKey);
    if (saved && saved.html) {
      els.content.innerHTML = saved.html;
      DA.toast.success('Draft dimuat');
    } else {
      DA.toast.info('Tidak ada draft tersimpan');
    }
  }

  /* ============================================
     BIND EVENTS
     ============================================ */
  function bindEvents() {
    els.back?.addEventListener('click', closeEditor);

    document.querySelectorAll('.cv-tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        execCmd(btn.dataset.cmd);
      });
    });

    els.formatBlock?.addEventListener('change', (e) => {
      execCmd('formatBlock', e.target.value);
    });

    els.foreColor?.addEventListener('input', (e) => {
      execCmd('foreColor', e.target.value);
    });

    els.content?.addEventListener('keyup', updateToolbarState);
    els.content?.addEventListener('mouseup', updateToolbarState);
    els.content?.addEventListener('input', debouncedSaveDraft);

    els.content?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft();
      }
    });

    els.saveLocal?.addEventListener('click', () => {
      const draft = DA.storage.get('cv_draft_' + (currentTemplate?.id || ''));
      if (draft && draft.html) {
        loadDraft();
      } else {
        saveDraft();
      }
    });

    els.downloadDocx?.addEventListener('click', downloadDocx);
    els.downloadPdf?.addEventListener('click', downloadPdf);
  }

  /* ============================================
     EXPORT DOCX
     ============================================ */
  function downloadDocx() {
    if (!els.content) return;
    try {
      if (typeof htmlDocx === 'undefined') {
        DA.toast.error('Library html-docx-js tidak termuat. Refresh halaman.');
        return;
      }

      const htmlContent = els.content.innerHTML;
      const styles = `
        @page { size: A4; margin: 1.5cm 2cm; }
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #1e293b; }
        h1 { font-size: 20pt; font-weight: bold; margin-bottom: 6pt; }
        h2 { font-size: 13pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; text-transform: uppercase; letter-spacing: 0.5pt; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 8pt; margin-bottom: 4pt; }
        p { margin-bottom: 6pt; }
        ul, ol { margin-left: 18pt; margin-bottom: 8pt; }
        li { margin-bottom: 2pt; }
        strong, b { font-weight: bold; }
        em, i { font-style: italic; }
        u { text-decoration: underline; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
        td, th { padding: 4pt 6pt; border: 1pt solid #cbd5e1; }
        a { color: #4f46e5; }
      `;

      const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>CV</title>
<style>${styles}</style>
</head>
<body>${htmlContent}</body>
</html>`;

      const blob = htmlDocx.asBlob(fullHtml);
      const name = (currentTemplate?.name || 'CV').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.docx';
      downloadBlob(blob, name);
      DA.toast.success('CV berhasil diunduh sebagai DOCX');
    } catch (err) {
      console.error('[CV] DOCX export error:', err);
      DA.toast.error('Gagal export DOCX: ' + err.message);
    }
  }

  /* ============================================
     EXPORT PDF
     ============================================ */
  async function downloadPdf() {
    if (!els.paper) return;
    try {
      if (typeof html2pdf === 'undefined') {
        DA.toast.error('Library html2pdf tidak termuat. Refresh halaman.');
        return;
      }

      DA.toast.info('Menyiapkan PDF...', 1500);

      const paper = els.paper;
      const oldStyle = paper.getAttribute('style') || '';
      const oldClass = paper.className;

      // Force A4 rendering
      paper.setAttribute('style',
        'width: 21cm; min-height: 29.7cm; padding: 1.5cm 2cm; background: #ffffff; color: #1e293b; position: absolute; left: -9999px; top: 0; z-index: -1;'
      );
      paper.className = 'cv-paper';

      await new Promise((r) => setTimeout(r, 150));

      await html2pdf().set({
        margin: 0,
        filename: (currentTemplate?.name || 'CV').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 794 },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(paper).save();

      paper.setAttribute('style', oldStyle);
      paper.className = oldClass;

      DA.toast.success('CV berhasil diunduh sebagai PDF');
    } catch (err) {
      console.error('[CV] PDF export error:', err);
      DA.toast.error('Gagal export PDF: ' + err.message);
    }
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { init };
})();
