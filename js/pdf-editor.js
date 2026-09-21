/* =====================================================
   DocuApply — PDF Editor (Merge + Page operations)
   FIX: embedJpg base64 extraction + mobile settings
   ===================================================== */
window.DA = window.DA || {};

DA.pdfEditor = (function () {
  const { uid, downloadBlob, readAsArrayBuffer, bindDropZone } = DA.utils;

  let pages = [];
  let undoStack = [];
  let redoStack = [];
  let zoom = 1;
  let sortable = null;
  let els = {};
  let mobileInput = null;

  function init() {
    els = {
      grid: document.getElementById('gridArea'),
      empty: document.getElementById('emptyState'),
      dropZone: document.getElementById('dropZone'),
      fileInput: document.getElementById('fileInput'),
      mergeBtn: document.getElementById('mergeBtn'),
      undoBtn: document.getElementById('undoBtn'),
      redoBtn: document.getElementById('redoBtn'),
      clearBtn: document.getElementById('clearBtn'),
      zoomLabel: document.getElementById('zoomLabel'),
      pageCountBadge: document.getElementById('pageCountBadge'),
      compression: document.getElementById('compressionToggle'),
      quality: document.getElementById('qualitySelect'),
      qualityWrapper: document.getElementById('qualityWrapper'),
      // Mobile
      editorUploadBtn: document.getElementById('editorUploadBtn'),
      editorCameraBtn: document.getElementById('editorCameraBtn'),
      editorMergeBtn: document.getElementById('editorMergeBtn'),
      editorSettingsBtn: document.getElementById('editorSettingsBtn'),
      editorSettingsSheet: document.getElementById('editorSettingsSheet'),
      editorSheetClose: document.getElementById('editorSheetClose'),
      editorBackdrop: document.getElementById('editorBackdrop'),
      compressionMobile: document.getElementById('compressionToggleMobile'),
      qualityMobile: document.getElementById('qualitySelectMobile'),
      qualityWrapperMobile: document.getElementById('qualityWrapperMobile'),
    };

    // Desktop dropzone
    if (els.dropZone && els.fileInput) bindDropZone(els.dropZone, els.fileInput, handleFiles);

    // Desktop buttons
    document.querySelector('[data-action="add"]')?.addEventListener('click', () => els.fileInput?.click());
    document.querySelector('[data-action="camera"]')?.addEventListener('click', () =>
      DA.camera.open(addCapturedImage)
    );
    els.mergeBtn?.addEventListener('click', mergeAndDownload);
    els.undoBtn?.addEventListener('click', undo);
    els.redoBtn?.addEventListener('click', redo);
    els.clearBtn?.addEventListener('click', clearAll);

    // Zoom
    document.querySelectorAll('[data-zoom]').forEach((b) =>
      b.addEventListener('click', () => setZoom(zoom + Number(b.dataset.zoom) * 0.15))
    );

    // Compression toggle (desktop)
    const syncQuality = () => {
      if (els.qualityWrapper) els.qualityWrapper.style.display = els.compression?.checked ? '' : 'none';
    };
    els.compression?.addEventListener('change', syncQuality);
    syncQuality();

    // Mobile buttons
    els.editorUploadBtn?.addEventListener('click', () => els.fileInput?.click());
    els.editorCameraBtn?.addEventListener('click', () => DA.camera.open(addCapturedImage));
    els.editorMergeBtn?.addEventListener('click', mergeAndDownload);

    // Mobile settings sheet
    els.editorSettingsBtn?.addEventListener('click', () => {
      els.editorSettingsSheet?.classList.add('open');
      els.editorBackdrop?.classList.add('show');
    });
    els.editorSheetClose?.addEventListener('click', () => {
      els.editorSettingsSheet?.classList.remove('open');
      els.editorBackdrop?.classList.remove('show');
    });
    els.editorBackdrop?.addEventListener('click', () => {
      els.editorSettingsSheet?.classList.remove('open');
      els.editorBackdrop?.classList.remove('show');
    });

    // Mobile compression sync
    const syncMobile = () => {
      if (els.qualityWrapperMobile) els.qualityWrapperMobile.style.display = els.compressionMobile?.checked ? '' : 'none';
    };
    els.compressionMobile?.addEventListener('change', syncMobile);
    syncMobile();

    // Sync desktop ↔ mobile values
    els.compressionMobile?.addEventListener('change', () => {
      if (els.compression) els.compression.checked = els.compressionMobile.checked;
    });
    els.qualityMobile?.addEventListener('change', () => {
      if (els.quality) els.quality.value = els.qualityMobile.value;
    });

    // Sortable
    if (els.grid) {
      sortable = Sortable.create(els.grid, {
        animation: 180,
        ghostClass: 'opacity-40',
        onStart: () => snapshot(),
        onEnd: (evt) => {
          if (evt.oldIndex === evt.newIndex) return;
          const item = pages.splice(evt.oldIndex, 1)[0];
          pages.splice(evt.newIndex, 0, item);
          requestAnimationFrame(() => renderGrid(true));
        },
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (typing) return;
        e.preventDefault(); undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (typing) return;
        e.preventDefault(); redo();
      }
    });

    updateToolbar();
  }

  function snapshot() {
    undoStack.push(pages.map((p) => ({ ...p })));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
    updateToolbar();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(pages.map((p) => ({ ...p })));
    pages = undoStack.pop();
    renderGrid(true);
    updateToolbar();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(pages.map((p) => ({ ...p })));
    pages = redoStack.pop();
    renderGrid(true);
    updateToolbar();
  }

  function updateToolbar() {
    if (els.undoBtn) els.undoBtn.disabled = !undoStack.length;
    if (els.redoBtn) els.redoBtn.disabled = !redoStack.length;
    if (els.pageCountBadge) els.pageCountBadge.textContent = `${pages.length} halaman`;
    const disabled = !pages.length;
    if (els.mergeBtn) els.mergeBtn.disabled = disabled;
    if (els.editorMergeBtn) els.editorMergeBtn.disabled = disabled;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    snapshot();
    try {
      for (const file of files) {
        if (file.type === 'application/pdf') await processPDF(file);
        else if (file.type.startsWith('image/')) await processImage(file);
      }
      renderGrid(true);
      DA.toast.success(`${files.length} file ditambahkan`);
    } catch (err) {
      console.error(err);
      DA.toast.error('Gagal memproses file: ' + err.message);
    }
  }

  async function processImage(file) {
    const dataUrl = await DA.utils.readAsDataURL(file);
    const img = await loadImage(dataUrl);
    const canvas = downscaleCanvas(img, 1600);
    const preview = canvas.toDataURL('image/jpeg', 0.8);
    const original = canvas.toDataURL('image/jpeg', 0.95);
    pages.push({ id: uid(), type: 'image', src: preview, originalData: original, rotation: 0 });
  }

  async function processPDF(file) {
    const buf = await readAsArrayBuffer(file);
    const doc = await pdfjsLib.getDocument(buf.slice(0)).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pages.push({
        id: uid(),
        type: 'pdf',
        src: canvas.toDataURL('image/jpeg', 0.7),
        originalData: buf.slice(0),
        pageIndex: i - 1,
        rotation: 0,
      });
    }
  }

  function addCapturedImage(dataUrl) {
    snapshot();
    loadImage(dataUrl).then((img) => {
      const canvas = downscaleCanvas(img, 1600);
      pages.push({
        id: uid(),
        type: 'image',
        src: canvas.toDataURL('image/jpeg', 0.8),
        originalData: canvas.toDataURL('image/jpeg', 0.92),
        rotation: 0,
      });
      renderGrid(true);
      DA.toast.success('Foto ditambahkan');
    });
  }

  function renderGrid(syncCount = false) {
    if (!els.grid || !els.empty) return;
    if (!pages.length) {
      els.empty.classList.remove('hidden');
      els.grid.classList.add('hidden');
      updateToolbar();
      return;
    }
    els.empty.classList.add('hidden');
    els.grid.classList.remove('hidden');

    els.grid.innerHTML = '';
    pages.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'thumb-card group';
      card.dataset.id = p.id;
      card.innerHTML = `
        <img src="${p.src}" alt="Page ${idx + 1}"
             class="max-w-full max-h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
             style="transform: rotate(${p.rotation}deg) scale(${zoom})">
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>
        <div class="thumb-actions">
          <button class="thumb-action primary" data-act="rot-l" title="Putar kiri"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="thumb-action primary" data-act="rot-r" title="Putar kanan"><i class="fa-solid fa-rotate-right"></i></button>
          <button class="thumb-action" data-act="dup" title="Duplikat"><i class="fa-regular fa-clone"></i></button>
          <button class="thumb-action danger" data-act="del" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="absolute bottom-2 left-2 bg-slate-800/85 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md">${idx + 1}</div>
        <div class="absolute bottom-2 right-2 bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm text-slate-600 dark:text-slate-300 text-[9px] font-semibold px-1.5 py-0.5 rounded-md uppercase">${p.type}</div>
      `;
      card.querySelectorAll('[data-act]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handlePageAction(btn.dataset.act, p.id);
        })
      );
      els.grid.appendChild(card);
    });

    if (syncCount) updateToolbar();
  }

  function handlePageAction(act, id) {
    const idx = pages.findIndex((p) => p.id === id);
    if (idx < 0) return;
    snapshot();
    if (act === 'rot-l') pages[idx].rotation = (pages[idx].rotation - 90 + 360) % 360;
    if (act === 'rot-r') pages[idx].rotation = (pages[idx].rotation + 90) % 360;
    if (act === 'dup') {
      const dup = { ...pages[idx], id: uid() };
      pages.splice(idx + 1, 0, dup);
    }
    if (act === 'del') pages.splice(idx, 1);
    renderGrid(true);
  }

  function clearAll() {
    if (!pages.length) return;
    if (!DA.confirm('Hapus semua halaman?')) return;
    snapshot();
    pages = [];
    renderGrid(true);
    DA.toast.info('Semua halaman dihapus');
  }

  function setZoom(v) {
    zoom = Math.max(0.5, Math.min(2.5, v));
    if (els.zoomLabel) els.zoomLabel.textContent = Math.round(zoom * 100) + '%';
    els.grid?.querySelectorAll('img').forEach((img) => {
      const match = /rotate\((-?\d+)deg\)/.exec(img.style.transform);
      const r = match ? match[1] : '0';
      img.style.transform = `rotate(${r}deg) scale(${zoom})`;
    });
  }

  async function mergeAndDownload() {
    if (!pages.length) return;
    const btns = [els.mergeBtn, els.editorMergeBtn].filter(Boolean);
    const originals = btns.map((b) => b.innerHTML);
    btns.forEach((b) => {
      b.innerHTML = `<div class="loader mr-2" style="border-color:rgba(255,255,255,.3);border-top-color:#fff;"></div> Memproses...`;
      b.disabled = true;
    });

    try {
      const { PDFDocument, degrees } = PDFLib;
      const outDoc = await PDFDocument.create();
      const compressEl = els.compressionMobile?.checked ?? els.compression?.checked ?? true;
      const qualityEl = parseFloat(els.qualityMobile?.value ?? els.quality?.value ?? 0.6);
      const compress = compressEl;
      const quality = qualityEl || 0.6;

      for (const p of pages) {
        if (p.type === 'image') {
          const img = await loadImage(p.originalData);
          const canvas = rasterize(img);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1]; // FIX: extract base64
          const embed = await outDoc.embedJpg(base64);
          const page = outDoc.addPage([canvas.width, canvas.height]);
          page.drawImage(embed, { x: 0, y: 0, width: canvas.width, height: canvas.height });
          if (p.rotation) page.setRotation(degrees(p.rotation));
        } else {
          if (compress) {
            const srcDoc = await pdfjsLib.getDocument(p.originalData.slice(0)).promise;
            const pdfPage = await srcDoc.getPage(p.pageIndex + 1);
            const viewport = pdfPage.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const base64 = dataUrl.split(',')[1]; // FIX: extract base64
            const embed = await outDoc.embedJpg(base64);
            const page = outDoc.addPage([canvas.width, canvas.height]);
            page.drawImage(embed, { x: 0, y: 0, width: canvas.width, height: canvas.height });
            if (p.rotation) page.setRotation(degrees(p.rotation));
          } else {
            const srcDoc = await PDFDocument.load(p.originalData, { ignoreEncryption: true });
            const [donor] = await outDoc.copyPages(srcDoc, [p.pageIndex]);
            outDoc.addPage(donor);
            if (p.rotation) {
              const cur = donor.getRotation().angle;
              donor.setRotation(degrees(cur + p.rotation));
            }
          }
        }
      }

      const bytes = await outDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      downloadBlob(blob, `DocuApply_${Date.now()}.pdf`);
      DA.toast.success(`PDF dibuat (${DA.utils.formatBytes(blob.size)})`);
    } catch (err) {
      console.error(err);
      DA.toast.error('Gagal: ' + err.message);
    } finally {
      btns.forEach((b, i) => {
        b.innerHTML = originals[i];
        b.disabled = false;
      });
      updateToolbar();
    }
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  function downscaleCanvas(img, maxDim) {
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > h && w > maxDim) { h *= maxDim / w; w = maxDim; }
    else if (h > w && h > maxDim) { w *= maxDim / h; h = maxDim; }
    const c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function rasterize(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c;
  }

  return {
    init,
    getPages: () => pages,
    addCapturedImage,
    renderGrid,
  };
})();
