/* =====================================================
   DocuApply — CV Builder v4
   - Pakai MAMMOTH.JS (proven working) bukan docx-preview
   - Modal pilihan: Download Original / Edit di App
   - Error detail di console untuk debug
   - Auto-styling setelah convert ke HTML
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
      modal: document.getElementById('cvChoiceModal'),
      modalBackdrop: document.getElementById('cvChoiceBackdrop'),
      modalCancel: document.getElementById('cvChoiceCancel'),
      modalTitle: document.getElementById('cvChoiceTitle'),
      modalSubtitle: document.getElementById('cvChoiceSubtitle'),
      choiceDownload: document.getElementById('cvChoiceDownload'),
      choiceEdit: document.getElementById('cvChoiceEdit'),
    };

    if (!els.grid) return;

    loadTemplates();
    bindEvents();
  }

  /* ============================================
     LOAD MANIFEST
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
            Pilih Opsi <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </span>
        </div>
      `;
      card.addEventListener('click', () => showChoiceModal(t));
      els.grid.appendChild(card);
    });
  }

  /* ============================================
     MODAL PILIHAN
     ============================================ */
  function showChoiceModal(template) {
    currentTemplate = template;
    if (els.modalTitle) els.modalTitle.textContent = template.name;
    if (els.modalSubtitle) els.modalSubtitle.textContent = template.description || 'Pilih cara menggunakan template ini';
    els.modal?.classList.remove('hidden');
    els.modal?.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }

  function hideChoiceModal() {
    els.modal?.classList.add('hidden');
    els.modal?.classList.remove('flex');
    document.body.style.overflow = '';
  }

  /* ============================================
     OPSI 1: DOWNLOAD ORIGINAL
     ============================================ */
  async function downloadOriginal() {
    if (!currentTemplate) return;
    const t = currentTemplate;
    hideChoiceModal();

    try {
      DA.toast.info('Mengunduh file asli...', 2000);

      const url = 'cv-templates/' + encodeURIComponent(t.file);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const filename = (t.file || 'template.docx');
      downloadBlob(blob, filename);

      setTimeout(() => {
        DA.toast.success(`Berhasil! File "${filename}" tersimpan.`, 5000);
      }, 300);
    } catch (err) {
      console.error('[CV] Download error:', err);
      DA.toast.error('Gagal mengunduh: ' + err.message);
    }
  }

  /* ============================================
     OPSI 2: EDIT DI APLIKASI
     ============================================ */
  function chooseEdit() {
    if (!currentTemplate) return;
    const t = currentTemplate;
    hideChoiceModal();
    setTimeout(() => openEditor(t), 200);
  }

  /* ============================================
     OPEN EDITOR — pakai mammoth.js
     ============================================ */
  async function openEditor(template) {
    currentTemplate = template;
    if (els.editorTitle) els.editorTitle.textContent = template.name;

    els.list.classList.add('hidden');
    els.editor.classList.remove('hidden');
    els.editor.classList.add('flex');

    els.content.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;font-family:sans-serif;">Memuat template dari server...</p>';

    try {
      // STEP 1: Fetch file .docx
      const url = 'cv-templates/' + encodeURIComponent(template.file);
      console.log('[CV] Fetching:', url);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Gagal unduh file (HTTP ${res.status})`);
      const arrayBuffer = await res.arrayBuffer();
      console.log('[CV] File size:', arrayBuffer.byteLength, 'bytes');

      // STEP 2: Cek library mammoth
      if (typeof mammoth === 'undefined' || typeof mammoth.convertToHtml !== 'function') {
        throw new Error('Library mammoth.js tidak termuat. Cek koneksi lalu refresh halaman.');
      }
      console.log('[CV] Mammoth loaded ✓');

      // STEP 3: Convert .docx → HTML
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: [
            "p[style-name='Title'] => h1.doc-title:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
          ],
          includeDefaultStyleMap: true,
          ignoreEmptyParagraphs: false,
        }
      );

      const html = (result.value || '').trim();
      const messages = result.messages || [];
      if (messages.length) {
        console.warn('[CV] Mammoth messages:', messages);
      }

      if (!html) {
        throw new Error('File .docx tidak berisi teks yang bisa dikonversi. Coba "Download Original".');
      }

      // STEP 4: Post-process HTML
      let cleanedHtml = html;

      // Konversi <p><strong>Nama</strong></p> jadi <h1> jika teks pendek & semua bold
      cleanedHtml = cleanedHtml.replace(
        /<p>(?:<strong>|<b>)([^<]{3,60})(?:<\/strong>|<\/b>)<\/p>/g,
        (match, text) => {
          const clean = text.trim();
          // Hanya convert kalau mirip nama/judul (huruf besar mayoritas)
          if (clean === clean.toUpperCase() && clean.length < 50) {
            return `<h1>${clean}</h1>`;
          }
          return match;
        }
      );

      // Set ke contenteditable
      els.content.innerHTML = cleanedHtml;
      console.log('[CV] Rendered content length:', cleanedHtml.length);

      originalHtml = els.content.innerHTML;

      // STEP 5: Cek draft tersimpan
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
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem;margin-bottom:1rem;display:block;"></i>
          <p style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;">Gagal memuat template</p>
          <p style="font-size:0.85rem;opacity:0.8;margin-bottom:0.5rem;">${escapeHtml(err.message || 'Unknown error')}</p>
          <p style="font-size:0.75rem;opacity:0.7;margin-top:1rem;padding:0.75rem;background:#fef2f2;border-radius:0.5rem;">
            💡 <strong>Solusi:</strong> Klik tombol kembali → pilih template lagi → pilih
            <strong>"Download Original"</strong> untuk edit di Microsoft Word / Google Docs.
          </p>
        </div>
      `;
      DA.toast.error('Gagal memuat template: ' + err.message);
    }
  }

  function closeEditor() {
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

    els.modalCancel?.addEventListener('click', hideChoiceModal);
    els.modalBackdrop?.addEventListener('click', hideChoiceModal);
    els.choiceDownload?.addEventListener('click', downloadOriginal);
    els.choiceEdit?.addEventListener('click', chooseEdit);

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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.modal?.classList.contains('hidden')) {
        hideChoiceModal();
      }
    });
  }

  /* ============================================
     EXPORT DOCX — pakai Blob HTML
     ============================================ */
  function downloadDocx() {
    if (!els.content) return;
    try {
      const htmlContent = els.content.innerHTML;

      const styles = `
        @page WordSection1 { size: 21cm 29.7cm; margin: 1.5cm 2cm 1.5cm 2cm; }
        div.WordSection1 { page: WordSection1; }
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #1e293b; }
        h1 { font-size: 20pt; font-weight: bold; margin-bottom: 6pt; line-height: 1.15; text-align: center; }
        h2 { font-size: 13pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; text-transform: uppercase; letter-spacing: 0.5pt; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 8pt; margin-bottom: 4pt; }
        p { margin-bottom: 6pt; margin-top: 0; }
        ul, ol { margin-left: 18pt; margin-bottom: 8pt; padding-left: 0; }
        li { margin-bottom: 2pt; }
        strong, b { font-weight: bold; }
        em, i { font-style: italic; }
        u { text-decoration: underline; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
        td, th { padding: 4pt 6pt; border: 1pt solid #cbd5e1; vertical-align: top; }
        a { color: #4f46e5; text-decoration: underline; }
      `;

      const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>CV</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->
<style>${styles}</style>
</head>
<body>
<div class="WordSection1">
${htmlContent}
</div>
</body>
</html>`;

      const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
      const name = (currentTemplate?.name || 'CV').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.doc';
      downloadBlob(blob, name);
      DA.toast.success('CV diunduh sebagai .doc — buka di Word');
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
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
      DA.toast.error('Library PDF tidak termuat. Refresh halaman.');
      return;
    }

    DA.toast.info('Menyiapkan PDF...', 2000);

    const clone = els.paper.cloneNode(true);
    clone.id = 'cvPaperClone';
    clone.style.cssText = `
      position: fixed; left: 0; top: 0;
      width: 794px; min-height: 1123px;
      background: #ffffff; color: #1e293b;
      padding: 57px 76px; box-shadow: none;
      border-radius: 0; z-index: 99999; margin: 0;
      transform: none; visibility: hidden;
    `;
    document.body.appendChild(clone);

    try {
      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: '#ffffff', logging: false,
        windowWidth: 794, windowHeight: clone.scrollHeight,
        width: 794, height: clone.scrollHeight,
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWmm = pdfW;
      const imgHmm = (canvas.height * imgWmm) / canvas.width;

      let y = 0, pageNum = 0;
      while (y < imgHmm) {
        if (pageNum > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -y, imgWmm, imgHmm, undefined, 'FAST');
        y += pdfH;
        pageNum++;
      }

      const name = (currentTemplate?.name || 'CV').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.pdf';
      pdf.save(name);
      DA.toast.success('CV berhasil diunduh sebagai PDF');
    } catch (err) {
      console.error('[CV] PDF export error:', err);
      DA.toast.error('Gagal export PDF: ' + err.message);
    } finally {
      clone.remove();
    }
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { init };
})();
