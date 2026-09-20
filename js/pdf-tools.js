/* =====================================================
   DocuApply — Image→PDF & Split PDF
   v2 — Fix orientasi landscape/portrait + sync 2 arah
   ===================================================== */
window.DA = window.DA || {};

/* ============ IMAGE → PDF ============ */
DA.imageToPdf = (function () {
  const { uid, downloadBlob, readAsDataURL, bindDropZone } = DA.utils;
  let images = [];
  let els = {};
  let sortable;

  function init() {
    els = {
      drop: document.getElementById('i2pDrop'),
      input: document.getElementById('i2pInput'),
      grid: document.getElementById('i2pGrid'),
      panel: document.getElementById('i2pPanel'),
      convert: document.getElementById('i2pConvert'),
      // Desktop
      size: document.getElementById('i2pSize'),
      orient: document.getElementById('i2pOrient'),
      margin: document.getElementById('i2pMargin'),
      quality: document.getElementById('i2pQuality'),
      // Mobile
      sheet: document.getElementById('i2pSheet'),
      sheetClose: document.getElementById('i2pSheetClose'),
      backdrop: document.getElementById('i2pBackdrop'),
      settingsBtn: document.getElementById('i2pSettingsBtn'),
      settingsBtnM: document.getElementById('i2pSettingsBtnMobile'),
      sizeM: document.getElementById('i2pSizeM'),
      orientM: document.getElementById('i2pOrientM'),
      marginM: document.getElementById('i2pMarginM'),
      qualityM: document.getElementById('i2pQualityM'),
    };

    if (els.drop && els.input) bindDropZone(els.drop, els.input, handleFiles);
    els.convert?.addEventListener('click', convert);

    // Mobile sheet open/close
    const openSheet = () => {
      els.sheet?.classList.add('open');
      els.backdrop?.classList.add('show');
    };
    const closeSheet = () => {
      els.sheet?.classList.remove('open');
      els.backdrop?.classList.remove('show');
    };
    els.settingsBtnM?.addEventListener('click', openSheet);
    els.sheetClose?.addEventListener('click', closeSheet);
    els.backdrop?.addEventListener('click', closeSheet);

    /* ============================================================
       Sync Mobile ↔ Desktop (DUA ARAH)
       ============================================================ */
    // Mobile → Desktop
    els.sizeM?.addEventListener('change', () => {
      if (els.size) els.size.value = els.sizeM.value;
    });
    els.orientM?.addEventListener('change', () => {
      if (els.orient) els.orient.value = els.orientM.value;
    });
    els.marginM?.addEventListener('input', () => {
      if (els.margin) els.margin.value = els.marginM.value;
    });
    els.qualityM?.addEventListener('change', () => {
      if (els.quality) els.quality.value = els.qualityM.value;
    });

    // Desktop → Mobile
    els.size?.addEventListener('change', () => {
      if (els.sizeM) els.sizeM.value = els.size.value;
    });
    els.orient?.addEventListener('change', () => {
      if (els.orientM) els.orientM.value = els.orient.value;
    });
    els.margin?.addEventListener('input', () => {
      if (els.marginM) els.marginM.value = els.margin.value;
    });
    els.quality?.addEventListener('change', () => {
      if (els.qualityM) els.qualityM.value = els.quality.value;
    });

    if (els.grid) {
      sortable = Sortable.create(els.grid, {
        animation: 180,
        ghostClass: 'opacity-40',
        onEnd: (evt) => {
          const item = images.splice(evt.oldIndex, 1)[0];
          images.splice(evt.newIndex, 0, item);
          render();
        },
      });
    }
  }

  async function handleFiles(list) {
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    for (const f of files) {
      const src = await readAsDataURL(f);
      images.push({ id: uid(), src, name: f.name });
    }
    render();
    DA.toast.success(`${files.length} gambar ditambahkan`);
  }

  function render() {
    if (!els.grid) return;
    els.grid.innerHTML = '';
    images.forEach((im, i) => {
      const div = document.createElement('div');
      div.className = 'thumb-card';
      div.innerHTML = `
        <img src="${im.src}" class="max-w-full max-h-full object-contain p-1.5" alt="">
        <div class="absolute bottom-2 left-2 bg-slate-800/85 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">${i + 1}</div>
        <div class="thumb-actions">
          <button class="thumb-action danger" data-del><i class="fa-solid fa-trash-can"></i></button>
        </div>`;
      div.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        images = images.filter((x) => x.id !== im.id);
        render();
      });
      els.grid.appendChild(div);
    });
    if (els.panel) els.panel.classList.toggle('hidden', !images.length);
    if (els.convert) els.convert.disabled = !images.length;
  }

  /* Kertas A4 & Letter dalam satuan point (72pt = 1 inch) */
  const A4 = { p: [595.28, 841.89], l: [841.89, 595.28] };
  const LETTER = { p: [612, 792], l: [792, 612] };

  async function convert() {
    if (!images.length) return;
    els.convert.disabled = true;
    const original = els.convert.innerHTML;
    els.convert.innerHTML = `<div class="loader mr-2"></div> Mengonversi...`;

    try {
      const { PDFDocument } = PDFLib;
      const doc = await PDFDocument.create();

      // Baca nilai dari mobile dulu, fallback ke desktop, terakhir default
      const sizeMode = els.sizeM?.value || els.size?.value || 'fit';
      const orientMode = els.orientM?.value || els.orient?.value || 'auto';
      const margin = parseFloat(els.marginM?.value || els.margin?.value || 20) || 0;
      const quality = parseFloat(els.qualityM?.value || els.quality?.value || 0.85) || 0.85;

      for (const im of images) {
        const img = await loadImage(im.src);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const embed = await doc.embedJpg(dataUrl);

        let pw, ph;

        if (sizeMode === 'fit') {
          /* ============================================
             MODE "FIT" (Sesuai gambar)
             Ukuran halaman = ukuran gambar asli
             TAPI hormati orientasi yang dipilih user
             ============================================ */
          const w0 = canvas.width;
          const h0 = canvas.height;

          if (orientMode === 'l') {
            // User mau LANDSCAPE → pastikan lebar ≥ tinggi
            pw = Math.max(w0, h0);
            ph = Math.min(w0, h0);
          } else if (orientMode === 'p') {
            // User mau PORTRAIT → pastikan tinggi ≥ lebar
            pw = Math.min(w0, h0);
            ph = Math.max(w0, h0);
          } else {
            // Auto → pakai ukuran asli apa adanya
            pw = w0;
            ph = h0;
          }
        } else {
          /* ============================================
             MODE "A4" atau "LETTER"
             Ukuran halaman = ukuran kertas
             ============================================ */
          const base = sizeMode === 'a4' ? A4 : LETTER;
          let orientation = orientMode;
          if (orientation === 'auto') {
            // Auto: pilih orientasi berdasarkan bentuk gambar
            orientation = canvas.width > canvas.height ? 'l' : 'p';
          }
          [pw, ph] = base[orientation];
        }

        const page = doc.addPage([pw, ph]);

        // Hitung agar gambar fit dalam halaman (dengan margin & center)
        const availW = pw - margin * 2;
        const availH = ph - margin * 2;
        const ratio = Math.min(availW / canvas.width, availH / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;

        page.drawImage(embed, {
          x: (pw - w) / 2,
          y: (ph - h) / 2,
          width: w,
          height: h,
        });
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      downloadBlob(blob, `Images_${Date.now()}.pdf`);
      DA.toast.success(`PDF dibuat (${DA.utils.formatBytes(blob.size)})`);
    } catch (e) {
      console.error('[Image→PDF] Error:', e);
      DA.toast.error('Gagal: ' + e.message);
    } finally {
      els.convert.disabled = false;
      els.convert.innerHTML = original;
    }
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }

  return { init };
})();

/* ============ SPLIT PDF ============ */
DA.splitPdf = (function () {
  const { downloadBlob, bindDropZone } = DA.utils;
  let sourceBuffer = null;
  let sourceDoc = null;
  let selected = new Set();
  let numPages = 0;
  let els = {};

  function init() {
    els = {
      drop: document.getElementById('splitDrop'),
      input: document.getElementById('splitInput'),
      grid: document.getElementById('splitGrid'),
      bar: document.getElementById('splitBar'),
      count: document.getElementById('splitCount'),
      extract: document.getElementById('splitExtract'),
      every: document.getElementById('splitEvery'),
    };

    if (els.drop && els.input) bindDropZone(els.drop, els.input, handleFile);
    els.extract?.addEventListener('click', extractSelected);
    els.every?.addEventListener('click', splitEveryPage);

    document.querySelectorAll('[data-split]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.split === 'all') {
          for (let i = 0; i < numPages; i++) selected.add(i);
        } else {
          selected.clear();
        }
        updateSelectionUI();
      })
    );
  }

  async function handleFile(list) {
    const file = list[0];
    if (!file || file.type !== 'application/pdf') {
      DA.toast.error('Harap pilih file PDF.');
      return;
    }
    try {
      sourceBuffer = await DA.utils.readAsArrayBuffer(file);
      sourceDoc = await pdfjsLib.getDocument(sourceBuffer.slice(0)).promise;
      numPages = sourceDoc.numPages;
      selected.clear();
      renderThumbs();
    } catch (e) {
      DA.toast.error('Gagal membaca PDF: ' + e.message);
    }
  }

  async function renderThumbs() {
    if (!els.grid) return;
    els.grid.innerHTML = '';
    els.bar?.classList.remove('hidden');

    for (let i = 0; i < numPages; i++) {
      const page = await sourceDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const div = document.createElement('div');
      div.className = 'thumb-card';
      div.dataset.index = i;
      div.innerHTML = `
        <img src="${canvas.toDataURL('image/jpeg', 0.7)}" class="max-w-full max-h-full object-contain p-1.5" alt="">
        <div class="absolute top-2 right-2 w-7 h-7 rounded-md border-2 border-slate-300 bg-white/90 flex items-center justify-center text-white text-[10px] shadow check">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="absolute bottom-2 left-2 bg-slate-800/85 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">${i + 1}</div>
      `;
      div.addEventListener('click', () => {
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        updateSelectionUI();
      });
      els.grid.appendChild(div);
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    if (els.count) els.count.textContent = selected.size;
    els.grid?.querySelectorAll('.thumb-card').forEach((c) => {
      const i = Number(c.dataset.index);
      const check = c.querySelector('.check');
      if (selected.has(i)) {
        check.style.background = '#6366f1';
        check.style.borderColor = '#6366f1';
        c.style.outline = '2px solid #6366f1';
        c.style.outlineOffset = '-2px';
      } else {
        check.style.background = 'rgba(255,255,255,0.9)';
        check.style.borderColor = '#cbd5e1';
        c.style.outline = 'none';
      }
    });
  }

  async function extractSelected() {
    if (!selected.size) return DA.toast.warn('Pilih minimal satu halaman.');
    try {
      const { PDFDocument } = PDFLib;
      const src = await PDFDocument.load(sourceBuffer.slice(0), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const indices = [...selected].sort((a, b) => a - b);
      const copied = await out.copyPages(src, indices);
      copied.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `Extracted_${Date.now()}.pdf`);
      DA.toast.success(`${indices.length} halaman diekstrak.`);
    } catch (e) {
      console.error(e);
      DA.toast.error('Gagal: ' + e.message);
    }
  }

  async function splitEveryPage() {
    try {
      const { PDFDocument } = PDFLib;
      DA.toast.info(`Memisahkan ${numPages} halaman...`);
      for (let i = 0; i < numPages; i++) {
        const src = await PDFDocument.load(sourceBuffer.slice(0), { ignoreEncryption: true });
        const out = await PDFDocument.create();
        const [p] = await out.copyPages(src, [i]);
        out.addPage(p);
        const bytes = await out.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `Page_${i + 1}.pdf`);
        await new Promise((r) => setTimeout(r, 250));
      }
      DA.toast.success('Selesai memisahkan.');
    } catch (e) {
      console.error(e);
      DA.toast.error('Gagal: ' + e.message);
    }
  }

  return { init };
})();
