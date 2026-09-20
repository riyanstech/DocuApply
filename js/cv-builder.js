/* =====================================================
   DocuApply — CV Builder v8
   - Support override template dari Admin Dashboard
   - Export DOCX ASLI (Office Open XML)
   - PDF export pakai print-to-PDF (vector, ATS-friendly)
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
      fontFamily: document.getElementById('cvFontFamily'),
      fontSize: document.getElementById('cvFontSize'),
      formatBlock: document.getElementById('cvFormatBlock'),
      foreColor: document.getElementById('cvForeColor'),
      backColor: document.getElementById('cvBackColor'),
      clearBackColor: document.getElementById('cvClearBackColor'),
      lineHeight: document.getElementById('cvLineHeight'),
      insertLink: document.getElementById('cvInsertLink'),
      insertHr: document.getElementById('cvInsertHr'),
      insertImage: document.getElementById('cvInsertImage'),
      imageInput: document.getElementById('cvImageInput'),
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

    // Re-render saat admin update
    window.addEventListener('cvTemplates:updated', loadTemplates);
  }

  /* ============================================
     LOAD MANIFEST
     ============================================ */
  async function loadTemplates() {
    try {
      // Prioritas: override dari admin
      const override = DA.storage.get('cvTemplatesOverride');
      if (override && Array.isArray(override) && override.length) {
        els.loading?.classList.add('hidden');
        renderTemplates(override);
        return;
      }

      // Fallback: fetch dari server
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
    slate:   { bg: 'bg-slate-100',   text: 'text-slate-600',   hover: 'group-hover:bg-slate-600' },
  };

  function renderTemplates(templates) {
    if (!els.grid) return;
    els.grid.innerHTML = '';
    els.empty?.classList.add('hidden');
    els.loading?.classList.add('hidden');

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
     MODAL
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
      downloadBlob(blob, t.file || 'template.docx');
      setTimeout(() => DA.toast.success(`Berhasil! File "${t.file}" tersimpan.`, 5000), 300);
    } catch (err) {
      console.error('[CV] Download error:', err);
      DA.toast.error('Gagal mengunduh: ' + err.message);
    }
  }

  function chooseEdit() {
    if (!currentTemplate) return;
    const t = currentTemplate;
    hideChoiceModal();
    setTimeout(() => openEditor(t), 200);
  }

  /* ============================================
     OPEN EDITOR
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
      if (!res.ok) throw new Error(`Gagal unduh file (HTTP ${res.status})`);
      const arrayBuffer = await res.arrayBuffer();

      if (typeof mammoth === 'undefined' || typeof mammoth.convertToHtml !== 'function') {
        throw new Error('Library mammoth.js tidak termuat. Cek koneksi lalu refresh halaman.');
      }

      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
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
      if (!html) {
        throw new Error('File .docx tidak berisi teks yang bisa dikonversi. Coba "Download Original".');
      }

      let cleanedHtml = html;
      cleanedHtml = cleanedHtml.replace(
        /<p>(?:<strong>|<b>)([^<]{3,60})(?:<\/strong>|<\/b>)<\/p>/g,
        (match, text) => {
          const clean = text.trim();
          if (clean === clean.toUpperCase() && clean.length < 50) {
            return `<h1>${clean}</h1>`;
          }
          return match;
        }
      );

      els.content.innerHTML = cleanedHtml;
      originalHtml = els.content.innerHTML;

      const draftKey = 'cv_draft_' + template.id;
      const saved = DA.storage.get(draftKey);
      if (saved && saved.html && saved.html !== originalHtml) {
        setTimeout(() => DA.toast.info('Ada draft tersimpan. Klik "Draft" untuk memuat.', 4000), 800);
      }

      DA.toast.success('Template dimuat — siap diedit!');
    } catch (err) {
      console.error('[CV] Error:', err);
      els.content.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#ef4444;font-family:sans-serif;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem;margin-bottom:1rem;display:block;"></i>
          <p style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;">Gagal memuat template</p>
          <p style="font-size:0.85rem;opacity:0.8;">${escapeHtml(err.message || 'Unknown error')}</p>
          <p style="font-size:0.75rem;opacity:0.7;margin-top:1rem;padding:0.75rem;background:#fef2f2;border-radius:0.5rem;">
            💡 Coba klik tombol kembali → pilih template lagi → pilih <strong>"Download Original"</strong>.
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
  function focusEditor() {
    els.content?.focus();
  }

  function execCmd(cmd, value) {
    focusEditor();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand(cmd, false, value);
    updateToolbarState();
  }

  function applyFontSize(size) {
    focusEditor();
    if (!size) return;
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand('fontSize', false, '7');

    const fontEls = els.content.querySelectorAll('font[size="7"], span[style*="xxx-large"]');
    fontEls.forEach((el) => {
      const span = document.createElement('span');
      span.style.fontSize = size;
      span.innerHTML = el.innerHTML;
      el.parentNode.replaceChild(span, el);
    });
  }

  function applyLineHeight(value) {
    focusEditor();
    if (!value) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.anchorNode;
    while (node && node !== els.content) {
      if (node.nodeType === 1 && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(node.tagName)) {
        node.style.lineHeight = value;
        break;
      }
      node = node.parentNode;
    }
  }

  function applyBackColor(color) {
    focusEditor();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand('hiliteColor', false, color);
  }

  function insertLink() {
    const url = prompt('Masukkan URL:', 'https://');
    if (!url) return;
    focusEditor();
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
    }
  }

  function insertHr() {
    focusEditor();
    document.execCommand('insertHorizontalRule', false, null);
  }

  function insertImage() {
    els.imageInput?.click();
  }

  function handleImageUpload(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      DA.toast.error('File harus berupa gambar');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      focusEditor();
      document.execCommand('insertHTML', false,
        `<img src="${ev.target.result}" style="max-width:100%; height:auto; display:block; margin:8px auto;" alt="">`);
      DA.toast.success('Gambar disisipkan');
    };
    reader.readAsDataURL(f);
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
    DA.storage.set(draftKey, { html: els.content.innerHTML, savedAt: Date.now() });
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

    els.fontFamily?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) execCmd('fontName', v);
      e.target.value = '';
    });

    els.fontSize?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) applyFontSize(v);
      e.target.value = '';
    });

    els.formatBlock?.addEventListener('change', (e) => {
      const v = e.target.value;
      execCmd('formatBlock', v === 'P' ? 'P' : v);
      e.target.value = 'P';
    });

    els.foreColor?.addEventListener('input', (e) => {
      execCmd('foreColor', e.target.value);
      const bar = document.getElementById('cvForeColorBar');
      if (bar) bar.style.background = e.target.value;
    });

    els.backColor?.addEventListener('input', (e) => {
      applyBackColor(e.target.value);
      const bar = document.getElementById('cvBackColorBar');
      if (bar) bar.style.background = e.target.value;
    });

    els.clearBackColor?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      focusEditor();
      try { document.execCommand('styleWithCSS', false, true); } catch {}
      document.execCommand('hiliteColor', false, 'transparent');
    });

    els.lineHeight?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) applyLineHeight(v);
      e.target.value = '';
    });

    els.insertLink?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertLink();
    });

    els.insertHr?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertHr();
    });

    els.insertImage?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertImage();
    });

    els.imageInput?.addEventListener('change', handleImageUpload);

    els.content?.addEventListener('keyup', updateToolbarState);
    els.content?.addEventListener('mouseup', updateToolbarState);
    els.content?.addEventListener('input', debouncedSaveDraft);

    els.content?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
      }
    });

    els.content?.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
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

    // Scroll hint untuk toolbar
    const toolbarWrap = document.querySelector('.cv-toolbar-wrap');
    const toolbar = document.querySelector('.cv-toolbar');
    if (toolbarWrap && toolbar) {
      const updateScrollHint = () => {
        const canRight = toolbar.scrollLeft + toolbar.clientWidth < toolbar.scrollWidth - 2;
        const canLeft = toolbar.scrollLeft > 2;
        toolbarWrap.classList.toggle('scrollable-right', canRight);
        toolbarWrap.classList.toggle('scrollable-left', canLeft);
      };
      toolbar.addEventListener('scroll', updateScrollHint, { passive: true });
      window.addEventListener('resize', updateScrollHint);
      setTimeout(updateScrollHint, 200);
    }
  }

  /* ============================================
     EXPORT DOCX ASLI (Office Open XML)
     ============================================ */
  async function downloadDocx() {
    if (!els.content) return;

    if (typeof window.docx === 'undefined') {
      DA.toast.error('Library DOCX tidak termuat. Refresh halaman lalu coba lagi.');
      return;
    }

    DA.toast.info('Menyiapkan DOCX...', 2000);

    try {
      const {
        Document, Packer, Paragraph, TextRun, HeadingLevel,
        AlignmentType, UnderlineType, BorderStyle, Table, TableRow,
        TableCell, WidthType, ExternalHyperlink,
      } = window.docx;

      const htmlEl = els.content;

      const cssColorToHex = (cssColor) => {
        if (!cssColor) return null;
        const s = cssColor.trim();
        if (s.startsWith('#')) {
          return s.replace('#', '').padEnd(6, '0').slice(0, 6).toLowerCase();
        }
        const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
          const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
          const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
          const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
          return (r + g + b).toLowerCase();
        }
        return null;
      };

      const getRuns = (parent, inherited = {}) => {
        const runs = [];
        const walk = (node, styles) => {
          if (node.nodeType === 3) {
            const text = node.textContent;
            if (text && text.length) {
              runs.push(new TextRun({
                text: text.replace(/\s+/g, ' '),
                ...styles,
              }));
            }
            return;
          }
          if (node.nodeType !== 1) return;

          const tag = node.tagName.toLowerCase();
          const s = { ...styles };

          if (tag === 'strong' || tag === 'b') s.bold = true;
          if (tag === 'em' || tag === 'i') s.italics = true;
          if (tag === 'u') s.underline = { type: UnderlineType.SINGLE };
          if (tag === 's' || tag === 'strike' || tag === 'del') s.strike = true;
          if (tag === 'sup') s.superScript = true;
          if (tag === 'sub') s.subScript = true;

          if (tag === 'br') {
            runs.push(new TextRun({ break: 1 }));
            return;
          }

          if (tag === 'a') {
            const href = node.getAttribute('href') || '';
            const innerRuns = [];
            Array.from(node.childNodes).forEach((c) => {
              if (c.nodeType === 3) {
                innerRuns.push(new TextRun({
                  text: c.textContent,
                  color: '4f46e5',
                  underline: { type: UnderlineType.SINGLE },
                  ...s,
                }));
              } else if (c.nodeType === 1) {
                const innerS = { color: '4f46e5', underline: { type: UnderlineType.SINGLE }, ...s };
                if (c.tagName === 'STRONG' || c.tagName === 'B') innerS.bold = true;
                if (c.tagName === 'EM' || c.tagName === 'I') innerS.italics = true;
                innerRuns.push(new TextRun({ text: c.textContent, ...innerS }));
              }
            });
            if (href && innerRuns.length) {
              runs.push(new ExternalHyperlink({ children: innerRuns, link: href }));
            } else if (innerRuns.length) {
              innerRuns.forEach((r) => runs.push(r));
            }
            return;
          }

          if (node.style) {
            const st = node.style;
            const fw = st.fontWeight;
            if (fw === 'bold' || fw === '700' || fw === '800' || fw === '900') s.bold = true;
            const fs = st.fontStyle;
            if (fs === 'italic') s.italics = true;
            const td = st.textDecoration || st.textDecorationLine || '';
            if (td.indexOf('underline') >= 0) s.underline = { type: UnderlineType.SINGLE };
            if (td.indexOf('line-through') >= 0) s.strike = true;
            if (st.color) {
              const hex = cssColorToHex(st.color);
              if (hex) s.color = hex;
            }
            if (st.fontSize) {
              const px = parseFloat(st.fontSize);
              if (!isNaN(px)) s.size = Math.round(px * 2);
            }
            if (st.fontFamily) {
              s.font = st.fontFamily.replace(/["']/g, '').split(',')[0].trim();
            }
          }

          Array.from(node.childNodes).forEach((c) => walk(c, s));
        };
        Array.from(parent.childNodes).forEach((c) => walk(c, inherited));
        return runs;
      };

      const buildChildren = (parent) => {
        const out = [];
        Array.from(parent.childNodes).forEach((node) => {
          if (node.nodeType === 3) {
            const txt = node.textContent.replace(/\s+/g, ' ').trim();
            if (txt) out.push(new Paragraph({ children: [new TextRun(txt)] }));
            return;
          }
          if (node.nodeType !== 1) return;
          const tag = node.tagName.toLowerCase();

          if (/^h[1-6]$/.test(tag)) {
            const level = tag.toUpperCase();
            out.push(new Paragraph({
              children: getRuns(node),
              heading: HeadingLevel[level] || HeadingLevel.HEADING_1,
              alignment: tag === 'h1' ? AlignmentType.CENTER : undefined,
              spacing: { before: 200, after: 100 },
            }));
            return;
          }

          if (tag === 'p' || tag === 'div') {
            const runs = getRuns(node);
            out.push(new Paragraph({
              children: runs.length ? runs : [new TextRun('')],
              spacing: { after: 100 },
            }));
            return;
          }

          if (tag === 'ul' || tag === 'ol') {
            Array.from(node.querySelectorAll(':scope > li')).forEach((li) => {
              const runs = getRuns(li);
              const opts = {
                children: runs.length ? runs : [new TextRun('')],
                spacing: { after: 40 },
              };
              if (tag === 'ul') {
                opts.bullet = { level: 0 };
              } else {
                opts.numbering = { reference: 'cv-num-list', level: 0 };
              }
              out.push(new Paragraph(opts));
            });
            return;
          }

          if (tag === 'blockquote') {
            out.push(new Paragraph({
              children: getRuns(node),
              indent: { left: 720 },
              spacing: { before: 100, after: 100 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: 'cbd5e1', space: 8 },
              },
            }));
            return;
          }

          if (tag === 'hr') {
            out.push(new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'cbd5e1' } },
              spacing: { before: 100, after: 100 },
            }));
            return;
          }

          if (tag === 'table') {
            const rows = [];
            Array.from(node.querySelectorAll('tr')).forEach((tr) => {
              const cells = [];
              Array.from(tr.children).forEach((cell) => {
                const runs = getRuns(cell);
                cells.push(new TableCell({
                  children: [new Paragraph({
                    children: runs.length ? runs : [new TextRun('')],
                    spacing: { after: 0 },
                  })],
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                }));
              });
              if (cells.length) rows.push(new TableRow({ children: cells }));
            });
            if (rows.length) {
              out.push(new Table({
                rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
              }));
              out.push(new Paragraph({ text: '' }));
            }
            return;
          }

          out.push(new Paragraph({ children: getRuns(node) }));
        });
        return out;
      };

      const body = buildChildren(htmlEl);
      if (!body.length) {
        body.push(new Paragraph({ children: [new TextRun('(kosong)')] }));
      }

      const doc = new Document({
        creator: 'DocuApply',
        title: currentTemplate?.name || 'CV',
        description: 'Dibuat dengan DocuApply',
        styles: {
          default: {
            document: {
              run: { font: 'Georgia', size: 22 },
              paragraph: { spacing: { line: 320 } },
            },
            heading1: {
              run: { size: 40, bold: true, color: '0f172a', font: 'Georgia' },
              paragraph: { spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER },
            },
            heading2: {
              run: { size: 26, bold: true, color: '0f172a', font: 'Georgia' },
              paragraph: {
                spacing: { before: 280, after: 120 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'cbd5e1', space: 4 } },
              },
            },
            heading3: {
              run: { size: 24, bold: true, color: '1e293b', font: 'Georgia' },
              paragraph: { spacing: { before: 200, after: 80 } },
            },
            heading4: {
              run: { size: 23, bold: true, color: '334155', font: 'Georgia' },
              paragraph: { spacing: { before: 160, after: 80 } },
            },
          },
        },
        numbering: {
          config: [
            {
              reference: 'cv-num-list',
              levels: [
                {
                  level: 0,
                  format: 'decimal',
                  text: '%1.',
                  alignment: AlignmentType.START,
                  style: { paragraph: { indent: { left: 720, hanging: 360 } } },
                },
              ],
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                size: { width: 11906, height: 16838 },
                margin: { top: 850, right: 1134, bottom: 850, left: 1134 },
              },
            },
            children: body,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const name = (currentTemplate?.name || 'CV')
        .replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.docx';
      downloadBlob(blob, name);
      DA.toast.success('CV diunduh sebagai .docx asli — bisa dibuka di mana saja! 🎉');
    } catch (err) {
      console.error('[CV] DOCX export error:', err);
      DA.toast.error('Gagal export DOCX: ' + (err.message || err));
    }
  }

  /* ============================================
     EXPORT PDF — Print-to-PDF (Native Browser)
     ============================================ */
  function downloadPdf() {
    if (!els.content) return;

    const content = els.content.innerHTML;
    const title = currentTemplate?.name || 'CV';
    const safeTitle = title.replace(/[^a-zA-Z0-9_\s]/g, '_').trim();

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e2e8f0; -webkit-text-size-adjust: 100%; }
  .pdf-toolbar {
    position: sticky; top: 0; background: #1e293b; color: #fff;
    padding: 12px 16px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px; z-index: 999;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .pdf-toolbar-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .pdf-toolbar-title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pdf-toolbar-hint { font-size: 11px; opacity: 0.85; line-height: 1.3; }
  .pdf-print-btn {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff; border: none; padding: 11px 20px; border-radius: 12px;
    font-size: 14px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    white-space: nowrap; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
    transition: all 0.15s; -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .pdf-print-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .pdf-print-btn:active { transform: scale(0.97); }
  .pdf-paper-wrapper { padding: 20px 12px 40px; display: flex; justify-content: center; }
  .pdf-paper {
    width: 100%; max-width: 21cm; background: #fff;
    padding: 1.5cm 2cm; box-shadow: 0 4px 32px rgba(15, 23, 42, 0.18);
    color: #1e293b; font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt; line-height: 1.55; word-wrap: break-word;
  }
  .pdf-paper h1 { font-size: 20pt; font-weight: 700; margin: 0 0 8pt 0; line-height: 1.15; text-align: center; color: #0f172a; }
  .pdf-paper h2 { font-size: 13pt; font-weight: 700; margin: 14pt 0 6pt 0; padding-bottom: 3pt; border-bottom: 1.5px solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.03em; color: #0f172a; }
  .pdf-paper h3 { font-size: 12pt; font-weight: 700; margin: 10pt 0 4pt 0; color: #1e293b; }
  .pdf-paper h4 { font-size: 11.5pt; font-weight: 700; margin: 8pt 0 4pt 0; color: #334155; }
  .pdf-paper p { margin: 0 0 6pt 0; }
  .pdf-paper ul, .pdf-paper ol { margin: 0 0 8pt 0; padding-left: 20pt; list-style-position: outside; }
  .pdf-paper ul { list-style-type: disc; }
  .pdf-paper ul ul { list-style-type: circle; }
  .pdf-paper ol { list-style-type: decimal; }
  .pdf-paper li { margin-bottom: 3pt; line-height: 1.5; }
  .pdf-paper strong, .pdf-paper b { font-weight: 700; color: #0f172a; }
  .pdf-paper em, .pdf-paper i { font-style: italic; }
  .pdf-paper u { text-decoration: underline; }
  .pdf-paper s, .pdf-paper strike { text-decoration: line-through; }
  .pdf-paper sup { vertical-align: super; font-size: 0.75em; }
  .pdf-paper sub { vertical-align: sub; font-size: 0.75em; }
  .pdf-paper blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid #cbd5e1; color: #475569; font-style: italic; }
  .pdf-paper table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; font-size: 10.5pt; }
  .pdf-paper td, .pdf-paper th { padding: 5pt 8pt; border: 1px solid #cbd5e1; vertical-align: top; }
  .pdf-paper th { background: #f1f5f9; font-weight: 700; }
  .pdf-paper hr { border: none; border-top: 1px solid #cbd5e1; margin: 12pt 0; }
  .pdf-paper a { color: #4f46e5; text-decoration: underline; }
  .pdf-paper img { max-width: 100%; height: auto; display: block; margin: 6pt auto; }
  @media print {
    @page { size: A4; margin: 1.5cm 2cm; }
    html, body { background: #fff !important; }
    .pdf-toolbar { display: none !important; }
    .pdf-paper-wrapper { padding: 0 !important; display: block !important; }
    .pdf-paper { box-shadow: none !important; padding: 0 !important; max-width: none !important; width: 100% !important; margin: 0 !important; }
  }
</style>
</head>
<body>
  <div class="pdf-toolbar">
    <div class="pdf-toolbar-info">
      <div class="pdf-toolbar-title">📄 ${escapeHtml(title)}</div>
      <div class="pdf-toolbar-hint">
        Tap tombol <strong>Save as PDF</strong> di kanan, lalu pilih
        <strong>"Simpan sebagai PDF"</strong> di dialog.
      </div>
    </div>
    <button class="pdf-print-btn" onclick="window.print()">
      <i style="font-style:normal;">🖨️</i> Save as PDF
    </button>
  </div>

  <div class="pdf-paper-wrapper">
    <div class="pdf-paper">${content}</div>
  </div>

  <script>
    (function () {
      var isDesktop = !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isDesktop) {
        setTimeout(function () {
          try { window.print(); } catch (e) {}
        }, 500);
      }
    })();
  <\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');

    if (!win) {
      DA.toast.warn('Popup diblokir browser. File HTML diunduh — buka file itu lalu Ctrl+P / Share > Print.', 6000);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle || 'CV'}_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      DA.toast.success('Tab baru dibuka. Tap "Save as PDF" di sana untuk simpan.', 6000);
    }

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { init };
})();
