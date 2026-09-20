/* =====================================================
   DocuApply — Photo Studio
   Auto background removal + manual brush + bg replacement
   AI Library: @imgly/background-removal (via ESM CDN)
   ===================================================== */
window.DA = window.DA || {};

DA.photoStudio = (function () {
  'use strict';

  const { downloadBlob, bindDropZone } = DA.utils;

  /* ---------- Constants ---------- */
  const MAX_DIM = 1400;
  const PAS_FOTO = {
    '2x3': { w: 236, h: 354 },
    '3x4': { w: 354, h: 472 },
    '4x6': { w: 472, h: 709 },
  };

  /* ---------- State ---------- */
  const S = {
    file: null,
    W: 0, H: 0,
    originalCanvas: null,
    imageData: null,
    baseMask: null,
    mask: null,
    bg: {
      type: 'transparent',
      color: '#ffffff',
      g1: '#dbeafe',
      g2: '#93c5fd',
      img: null,
      blur: 24,
    },
    bgData: null,
    brushSize: 40,
    brushMode: 'erase',
    drawing: false,
    history: [],
    hasCutout: false,
    aiReady: false,
    aiFailed: false,
  };

  let els = {};
  let rafPending = false;

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      drop: document.getElementById('photoDrop'),
      input: document.getElementById('photoInput'),
      stage: document.getElementById('photoStage'),
      empty: document.getElementById('photoEmpty'),
      canvas: document.getElementById('photoCanvas'),
      cursor: document.getElementById('brushCursor'),
      status: document.getElementById('photoStatus'),
      dimensions: document.getElementById('photoDimensions'),
      removeBtn: document.getElementById('photoRemoveBtn'),
      resetBtn: document.getElementById('photoResetBtn'),
      undoBtn: document.getElementById('photoUndoBtn'),
      brushPanel: document.getElementById('photoBrushPanel'),
      brushSize: document.getElementById('photoBrushSize'),
      brushSizeVal: document.getElementById('photoBrushSizeVal'),
      progress: document.getElementById('photoProgress'),
      progressBar: document.getElementById('photoProgressBar'),
      progressText: document.getElementById('photoProgressText'),
      colorOpts: document.getElementById('photoColorOptions'),
      gradOpts: document.getElementById('photoGradientOptions'),
      imgOpts: document.getElementById('photoImageOptions'),
      blurOpts: document.getElementById('photoBlurOptions'),
      bgColor: document.getElementById('photoColor'),
      bgGrad1: document.getElementById('photoGrad1'),
      bgGrad2: document.getElementById('photoGrad2'),
      bgImgInput: document.getElementById('photoBgImage'),
      bgImgBtn: document.getElementById('photoBgImageBtn'),
      blurRadius: document.getElementById('photoBlurRadius'),
      sizeSel: document.getElementById('photoSize'),
      formatSel: document.getElementById('photoFormat'),
      downloadBtn: document.getElementById('photoDownload'),
    };

    if (!els.canvas) return;

    /* ===== AI library ready/error listeners ===== */
    window.addEventListener('imgy:ready', () => {
      S.aiReady = true;
      S.aiFailed = false;
      updateUI();
      console.info('[PhotoStudio] AI siap digunakan');
    });
    window.addEventListener('imgy:error', () => {
      S.aiReady = false;
      S.aiFailed = true;
      updateUI();
      DA.toast.warn('AI Background Removal gagal dimuat. Cek koneksi internet.', 5000);
    });

    /* Kalau library sudah ready duluan (race condition) */
    if (typeof (window.imglyRemoveBackground) === 'function') {
      S.aiReady = true;
    }

    /* ===== Dropzone ===== */
    bindDropZone(els.drop, els.input, onFile);

    /* ===== Buttons ===== */
    els.removeBtn.addEventListener('click', removeBg);
    els.resetBtn.addEventListener('click', resetMask);
    els.undoBtn.addEventListener('click', undo);
    els.downloadBtn.addEventListener('click', download);

    els.brushSize.addEventListener('input', (e) => {
      S.brushSize = Number(e.target.value);
      els.brushSizeVal.textContent = S.brushSize;
    });

    document.querySelectorAll('[data-brush-mode]').forEach((b) =>
      b.addEventListener('click', () => setBrushMode(b.dataset.brushMode))
    );
    document.querySelectorAll('[data-bg-type]').forEach((b) =>
      b.addEventListener('click', () => setBgType(b.dataset.bgType))
    );
    document.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        els.bgColor.value = b.dataset.preset;
        S.bg.color = b.dataset.preset;
        rebuildBg();
        scheduleRender();
      })
    );

    els.bgColor.addEventListener('input', (e) => {
      S.bg.color = e.target.value; rebuildBg(); scheduleRender();
    });
    els.bgGrad1.addEventListener('input', (e) => {
      S.bg.g1 = e.target.value; rebuildBg(); scheduleRender();
    });
    els.bgGrad2.addEventListener('input', (e) => {
      S.bg.g2 = e.target.value; rebuildBg(); scheduleRender();
    });
    els.blurRadius.addEventListener('input', (e) => {
      S.bg.blur = Number(e.target.value); rebuildBg(); scheduleRender();
    });
    els.bgImgBtn.addEventListener('click', () => els.bgImgInput.click());
    els.bgImgInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        S.bg.img = img;
        URL.revokeObjectURL(url);
        rebuildBg();
        scheduleRender();
        DA.toast.success('Background gambar dimuat');
      };
      img.onerror = () => DA.toast.error('Gagal memuat gambar background');
      img.src = url;
    });

    /* ===== Canvas events ===== */
    const c = els.canvas;
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('pointerleave', () => { els.cursor.classList.add('hidden'); });
    c.addEventListener('pointerenter', () => {
      if (S.hasCutout) els.cursor.classList.remove('hidden');
    });

    /* Re-render canvas on theme toggle (biar checker pattern sinkron) */
    const themeBtn = document.getElementById('themeToggle');
    themeBtn?.addEventListener('click', () => scheduleRender());

    updateUI();

    /* Timeout: kalau AI 20 detik tidak ready, tampilkan warning */
    setTimeout(() => {
      if (!S.aiReady && !S.aiFailed) {
        S.aiFailed = true;
        updateUI();
        DA.toast.warn('AI lambat dimuat. Coba refresh halaman.', 5000);
      }
    }, 20000);
  }

  /* ============================================
     LOAD FOTO
     ============================================ */
  async function onFile(list) {
    const f = list?.[0];
    if (!f || !f.type.startsWith('image/')) {
      DA.toast.error('Harap pilih file gambar.');
      return;
    }
    S.file = f;

    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      prepareOriginal(img);
      DA.toast.success('Foto dimuat. Klik "Hapus BG" untuk mulai.');
    } catch (e) {
      DA.toast.error('Gagal memuat gambar: ' + e.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function prepareOriginal(img) {
    const { canvas, w, h } = fitToMax(img, MAX_DIM);
    S.W = w;
    S.H = h;
    S.originalCanvas = canvas;
    S.imageData = canvas.getContext('2d').getImageData(0, 0, w, h);
    S.baseMask = null;
    S.mask = null;
    S.bgData = null;
    S.hasCutout = false;
    S.history = [];
    S.bg.img = null;

    els.canvas.width = w;
    els.canvas.height = h;
    els.stage.classList.remove('hidden');
    els.empty.classList.add('hidden');
    els.dimensions.textContent = `${w} × ${h}px`;
    els.status.textContent = 'Foto siap — belum ada cutout';

    els.canvas.getContext('2d').drawImage(canvas, 0, 0);
    updateUI();
  }

  /* ============================================
     AI BACKGROUND REMOVAL
     ============================================ */
  async function removeBg() {
    if (!S.file) return;

    const remover =
      window.imglyRemoveBackground ||
      window.removeBackground;

    if (typeof remover !== 'function') {
      if (S.aiFailed) {
        DA.toast.error('AI gagal dimuat. Refresh halaman dan cek koneksi internet.');
      } else {
        DA.toast.warn('AI masih dimuat... tunggu sebentar lalu coba lagi.');
      }
      return;
    }

    setBusy(true);
    els.progress.classList.remove('hidden');
    setProgress(2, 'Menyiapkan model AI...');
    els.status.textContent = 'Menghapus background...';

    try {
      const blob = await remover(S.file, {
        output: { format: 'image/png', quality: 0.8 },
        progress: (key, current, total) => {
          if (!total) return;
          const pct = Math.round((current / total) * 100);
          let label = 'Memproses';
          if (typeof key === 'string') {
            if (key.startsWith('fetch')) label = 'Mengunduh model';
            else if (key.startsWith('compute')) label = 'Menghitung';
            else label = key;
          }
          setProgress(pct, `${label} · ${pct}%`);
        },
      });

      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);

      const tmp = document.createElement('canvas');
      tmp.width = S.W;
      tmp.height = S.H;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0, S.W, S.H);
      const data = ctx.getImageData(0, 0, S.W, S.H).data;

      const mask = new Uint8ClampedArray(S.W * S.H);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];

      S.baseMask = new Uint8ClampedArray(mask);
      S.mask = mask;
      S.hasCutout = true;
      S.history = [];

      rebuildBg();
      render();
      updateUI();
      els.status.textContent = 'Cutout siap — rapikan dengan kuas jika perlu';
      DA.toast.success('Background berhasil dihapus!');
    } catch (err) {
      console.error('[PhotoStudio] removeBg error:', err);
      DA.toast.error('Gagal menghapus background: ' + (err?.message || 'unknown error'));
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add('hidden'), 400);
    }
  }

  /* ============================================
     RENDER
     ============================================ */
  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      render();
    });
  }

  function render() {
    if (!S.imageData) return;
    const { W, H, imageData, mask } = S;
    const ctx = els.canvas.getContext('2d');

    if (!mask) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(S.originalCanvas, 0, 0);
      return;
    }

    const out = ctx.createImageData(W, H);
    const outData = out.data;
    const src = imageData.data;
    const bg = S.bgData;
    const isTransparent = S.bg.type === 'transparent' || !bg;

    if (isTransparent) {
      for (let i = 0; i < W * H; i++) {
        const a = mask[i];
        outData[i * 4]     = src[i * 4];
        outData[i * 4 + 1] = src[i * 4 + 1];
        outData[i * 4 + 2] = src[i * 4 + 2];
        outData[i * 4 + 3] = a;
      }
    } else {
      for (let i = 0; i < W * H; i++) {
        const a = mask[i] / 255;
        const ia = 1 - a;
        outData[i * 4]     = src[i * 4]     * a + bg[i * 4]     * ia;
        outData[i * 4 + 1] = src[i * 4 + 1] * a + bg[i * 4 + 1] * ia;
        outData[i * 4 + 2] = src[i * 4 + 2] * a + bg[i * 4 + 2] * ia;
        outData[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function rebuildBg() {
    if (!S.W || !S.H) return;
    const { W, H } = S;
    const bg = S.bg;

    if (bg.type === 'transparent') { S.bgData = null; return; }

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    if (bg.type === 'color') {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, W, H);
    } else if (bg.type === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, bg.g1);
      g.addColorStop(1, bg.g2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (bg.type === 'image' && bg.img) {
      drawCover(ctx, bg.img, W, H);
    } else if (bg.type === 'blur') {
      const pad = 40;
      ctx.filter = `blur(${bg.blur}px)`;
      ctx.drawImage(S.originalCanvas, -pad, -pad, W + pad * 2, H + pad * 2);
      ctx.filter = 'none';
    } else {
      S.bgData = null;
      return;
    }

    S.bgData = ctx.getImageData(0, 0, W, H).data;
  }

  /* ============================================
     BRUSH
     ============================================ */
  function onPointerDown(e) {
    if (!S.hasCutout) return;
    e.preventDefault();
    S.drawing = true;
    try { els.canvas.setPointerCapture(e.pointerId); } catch {}
    pushHistory();
    applyBrush(e);
  }

  function onPointerMove(e) {
    updateCursor(e);
    if (!S.drawing) return;
    e.preventDefault();
    applyBrush(e);
  }

  function onPointerUp(e) {
    if (!S.drawing) return;
    S.drawing = false;
    try { els.canvas.releasePointerCapture(e.pointerId); } catch {}
  }

  function applyBrush(e) {
    const pos = getCanvasPos(e);
    const r = S.brushSize / 2;
    const r2 = r * r;
    const { W, H, mask, baseMask } = S;
    const x0 = Math.max(0, Math.floor(pos.x - r));
    const x1 = Math.min(W - 1, Math.ceil(pos.x + r));
    const y0 = Math.max(0, Math.floor(pos.y - r));
    const y1 = Math.min(H - 1, Math.ceil(pos.y + r));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - pos.x;
        const dy = py - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const dist = Math.sqrt(d2);
        const t = Math.max(0, Math.min(1, (r - dist) / (r * 0.35)));
        const i = py * W + px;
        const cur = mask[i];
        const tgt = S.brushMode === 'erase' ? 0 : baseMask[i];
        mask[i] = cur + (tgt - cur) * t;
      }
    }
    scheduleRender();
  }

  function getCanvasPos(e) {
    const r = els.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (S.W / r.width);
    const y = (e.clientY - r.top) * (S.H / r.height);
    return { x, y };
  }

  function updateCursor(e) {
    if (!S.hasCutout) return;
    const rect = els.canvas.getBoundingClientRect();
    const stageRect = els.stage.getBoundingClientRect();
    const scale = rect.width / S.W;
    els.cursor.style.left = (rect.left - stageRect.left + (e.clientX - rect.left)) + 'px';
    els.cursor.style.top  = (rect.top - stageRect.top + (e.clientY - rect.top)) + 'px';
    els.cursor.style.width  = (S.brushSize * scale) + 'px';
    els.cursor.style.height = (S.brushSize * scale) + 'px';
    els.cursor.classList.remove('hidden');
  }

  function setBrushMode(mode) {
    S.brushMode = mode;
    document.querySelectorAll('[data-brush-mode]').forEach((b) =>
      b.classList.toggle('active', b.dataset.brushMode === mode)
    );
  }

  /* ============================================
     HISTORY
     ============================================ */
  function pushHistory() {
    if (S.history.length > 20) S.history.shift();
    S.history.push(new Uint8ClampedArray(S.mask));
    updateUI();
  }
  function undo() {
    const prev = S.history.pop();
    if (prev) {
      S.mask = prev;
      scheduleRender();
    }
    updateUI();
  }

  /* ============================================
     RESET
     ============================================ */
  function resetMask() {
    if (!S.baseMask) return;
    if (!DA.confirm('Reset semua sapuan kuas ke hasil AI awal?')) return;
    S.mask = new Uint8ClampedArray(S.baseMask);
    S.history = [];
    scheduleRender();
    updateUI();
    DA.toast.info('Mask direset');
  }

  /* ============================================
     BACKGROUND TYPE
     ============================================ */
  function setBgType(type) {
    S.bg.type = type;
    document.querySelectorAll('[data-bg-type]').forEach((b) =>
      b.classList.toggle('active', b.dataset.bgType === type)
    );
    els.colorOpts.classList.toggle('hidden', type !== 'color');
    els.gradOpts.classList.toggle('hidden', type !== 'gradient');
    els.imgOpts.classList.toggle('hidden', type !== 'image');
    els.blurOpts.classList.toggle('hidden', type !== 'blur');

    if (type === 'image' && !S.bg.img) {
      DA.toast.info('Pilih gambar background terlebih dahulu');
    }
    rebuildBg();
    scheduleRender();
  }

  /* ============================================
     UI STATE
     ============================================ */
  function updateUI() {
    /* Tombol Hapus BG: hanya aktif kalau ada file DAN AI ready */
    const canRemove = !!S.file && S.aiReady;
    els.removeBtn.disabled = !canRemove;

    /* Update label tombol Hapus BG kalau AI belum ready */
    if (!S.aiReady && !S.aiFailed && S.file) {
      els.removeBtn.title = 'AI masih dimuat...';
    } else if (S.aiFailed) {
      els.removeBtn.title = 'AI gagal dimuat — refresh halaman';
    } else {
      els.removeBtn.title = 'Hapus background otomatis';
    }

    /* Status text */
    if (!S.file) {
      els.status.textContent = 'Belum ada foto';
    } else if (!S.aiReady && !S.aiFailed && !S.hasCutout) {
      els.status.textContent = 'Foto siap — AI masih dimuat...';
    } else if (S.aiFailed && !S.hasCutout) {
      els.status.textContent = 'Foto siap — AI gagal dimuat';
    }

    els.resetBtn.disabled = !S.hasCutout;
    els.undoBtn.disabled = !S.history.length;
    els.brushPanel.classList.toggle('hidden', !S.hasCutout);
    els.downloadBtn.disabled = !S.file;
  }

  function setBusy(busy) {
    els.removeBtn.disabled = busy || !S.file || !S.aiReady;
    els.removeBtn.innerHTML = busy
      ? '<div class="loader !w-3.5 !h-3.5 !border-slate-300 !border-t-indigo-500 mr-2"></div><span class="text-xs">Proses...</span>'
      : '<i class="fa-solid fa-wand-magic-sparkles text-indigo-500"></i><span class="text-xs">Hapus BG</span>';
  }

  function setProgress(pct, text) {
    els.progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    els.progressText.textContent = text || 'Memproses...';
  }

  /* ============================================
     DOWNLOAD
     ============================================ */
  function download() {
    if (!S.file) return;
    const sizeKey = els.sizeSel.value;
    const format = els.formatSel.value;

    let outW = S.W, outH = S.H;
    if (sizeKey !== 'original' && PAS_FOTO[sizeKey]) {
      outW = PAS_FOTO[sizeKey].w;
      outH = PAS_FOTO[sizeKey].h;
    }

    const tmp = document.createElement('canvas');
    tmp.width = S.W;
    tmp.height = S.H;
    tmp.getContext('2d').drawImage(els.canvas, 0, 0);

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');

    const isJpg = format === 'jpg';
    if (isJpg) {
      ctx.fillStyle = S.bg.type === 'color' ? S.bg.color : '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }

    if (sizeKey === 'original') {
      ctx.drawImage(tmp, 0, 0, outW, outH);
    } else {
      drawCover(ctx, tmp, outW, outH);
    }

    const mime = isJpg ? 'image/jpeg' : 'image/png';
    out.toBlob(
      (blob) => {
        const name = sizeKey === 'original'
          ? `PhotoStudio_${Date.now()}.${format}`
          : `PasFoto_${sizeKey}_${Date.now()}.${format}`;
        downloadBlob(blob, name);
        DA.toast.success(`Berhasil diunduh (${DA.utils.formatBytes(blob.size)})`);
      },
      mime,
      0.95
    );
  }

  /* ============================================
     HELPERS
     ============================================ */
  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Gagal memuat gambar'));
      i.src = src;
    });
  }

  function fitToMax(img, maxDim) {
    let w = img.naturalWidth, h = img.naturalHeight;
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
    return { canvas: c, w, h };
  }

  function drawCover(ctx, img, W, H) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const ir = iw / ih;
    const cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = H; dw = H * ir;
      dx = (W - dw) / 2; dy = 0;
    } else {
      dw = W; dh = W / ir;
      dx = 0; dy = (H - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ============================================
     PUBLIC API
     ============================================ */
  return {
    init,
    loadFromDataURL(dataUrl) {
      loadImage(dataUrl).then((img) => prepareOriginal(img));
    },
    isAiReady: () => S.aiReady,
  };
})();
