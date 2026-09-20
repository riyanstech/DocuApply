/* =====================================================
   DocuApply — Photo Studio v3
   Improvements:
   - SOFT dilate (gaussian-weighted, tidak bikin tepi tajam)
   - Box-blur mask (anti-alias tepi)
   - S-curve threshold untuk restore kontras setelah blur
   - Erode 1px sebelum dilate (hapus halo/contamination)
   - Alpha decontamination (opsional)
   - Deteksi otomatis kalau cutout jelek → saran
   ===================================================== */
window.DA = window.DA || {};

DA.photoStudio = (function () {
  'use strict';

  const { downloadBlob, bindDropZone } = DA.utils;

  const MAX_DIM = 1400;
  const PAS_FOTO = {
    '2x3': { w: 236, h: 354 },
    '3x4': { w: 354, h: 472 },
    '4x6': { w: 472, h: 709 },
  };

  const S = {
    file: null,
    W: 0, H: 0,
    originalCanvas: null,
    imageData: null,
    aiOutputMask: null,     // raw AI output
    baseMask: null,         // setelah post-process
    mask: null,             // working (bisa di-edit kuas)
    bg: {
      type: 'transparent',
      color: '#ffffff',
      g1: '#dbeafe', g2: '#93c5fd',
      img: null, blur: 24,
    },
    bgData: null,
    brushSize: 40,
    brushMode: 'erase',
    drawing: false,
    history: [],
    hasCutout: false,
    aiReady: false,
    aiFailed: false,
    model: 'isnet_fp16',
    expand: 3,
    smooth: 2,
    fillHoles: true,
    decontam: true,
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
      stageWrap: document.getElementById('photoStageWrap'),
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
      aiStatus: document.getElementById('photoAiStatus'),
      modelSel: document.getElementById('photoModel'),
      expand: document.getElementById('photoExpand'),
      expandVal: document.getElementById('photoExpandVal'),
      smooth: document.getElementById('photoSmooth'),
      smoothVal: document.getElementById('photoSmoothVal'),
      fillHoles: document.getElementById('photoFillHoles'),
      decontam: document.getElementById('photoDecontam'),
    };

    if (!els.canvas) return;

    /* ===== AI ready/error ===== */
    window.addEventListener('imgy:ready', () => {
      S.aiReady = true; S.aiFailed = false;
      updateAIStatusBadge(); updateUI();
      console.info('[PhotoStudio] AI siap');
      preloadModel();
    });
    window.addEventListener('imgy:error', () => {
      S.aiReady = false; S.aiFailed = true;
      updateAIStatusBadge(); updateUI();
      DA.toast.warn('AI gagal dimuat. Cek koneksi internet lalu refresh.', 5000);
    });
    if (typeof window.imglyRemoveBackground === 'function') {
      S.aiReady = true; updateAIStatusBadge();
    }

    /* ===== AI settings ===== */
    els.modelSel.addEventListener('change', () => {
      S.model = els.modelSel.value;
      DA.storage.set('photoModel', S.model);
      preloadModel();
    });
    const savedModel = DA.storage.get('photoModel');
    if (savedModel) { S.model = savedModel; els.modelSel.value = savedModel; }

    els.expand.addEventListener('input', (e) => {
      S.expand = Number(e.target.value);
      els.expandVal.textContent = S.expand;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });

    els.smooth.addEventListener('input', (e) => {
      S.smooth = Number(e.target.value);
      els.smoothVal.textContent = S.smooth;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });

    els.fillHoles.addEventListener('change', () => {
      S.fillHoles = els.fillHoles.checked;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });

    els.decontam.addEventListener('change', () => {
      S.decontam = els.decontam.checked;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });

    /* ===== Restore saved prefs ===== */
    const savedExpand = DA.storage.get('photoExpand');
    if (savedExpand != null) { S.expand = savedExpand; els.expand.value = savedExpand; els.expandVal.textContent = savedExpand; }
    const savedSmooth = DA.storage.get('photoSmooth');
    if (savedSmooth != null) { S.smooth = savedSmooth; els.smooth.value = savedSmooth; els.smoothVal.textContent = savedSmooth; }

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
        rebuildBg(); scheduleRender();
      })
    );

    els.bgColor.addEventListener('input', (e) => { S.bg.color = e.target.value; rebuildBg(); scheduleRender(); });
    els.bgGrad1.addEventListener('input', (e) => { S.bg.g1 = e.target.value; rebuildBg(); scheduleRender(); });
    els.bgGrad2.addEventListener('input', (e) => { S.bg.g2 = e.target.value; rebuildBg(); scheduleRender(); });
    els.blurRadius.addEventListener('input', (e) => { S.bg.blur = Number(e.target.value); rebuildBg(); scheduleRender(); });

    els.bgImgBtn.addEventListener('click', () => els.bgImgInput.click());
    els.bgImgInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        S.bg.img = img; URL.revokeObjectURL(url);
        rebuildBg(); scheduleRender();
        DA.toast.success('Background gambar dimuat');
      };
      img.onerror = () => DA.toast.error('Gagal memuat gambar background');
      img.src = url;
    });

    const c = els.canvas;
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('pointerleave', () => { els.cursor.classList.add('hidden'); });
    c.addEventListener('pointerenter', () => { if (S.hasCutout) els.cursor.classList.remove('hidden'); });

    const themeBtn = document.getElementById('themeToggle');
    themeBtn?.addEventListener('click', () => scheduleRender());

    window.addEventListener('resize', () => scheduleRender());

    updateUI();
    updateAIStatusBadge();

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { if (S.aiReady) preloadModel(); }, { timeout: 5000 });
    } else {
      setTimeout(() => { if (S.aiReady) preloadModel(); }, 3000);
    }

    setTimeout(() => {
      if (!S.aiReady && !S.aiFailed) {
        S.aiFailed = true;
        updateAIStatusBadge(); updateUI();
      }
    }, 25000);
  }

  /* ============================================
     AI STATUS BADGE
     ============================================ */
  function updateAIStatusBadge() {
    if (!els.aiStatus) return;
    if (S.aiReady) {
      els.aiStatus.textContent = 'siap';
      els.aiStatus.className = 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
    } else if (S.aiFailed) {
      els.aiStatus.textContent = 'gagal';
      els.aiStatus.className = 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300';
    } else {
      els.aiStatus.textContent = 'memuat…';
      els.aiStatus.className = 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
    }
  }

  /* ============================================
     PRELOAD MODEL
     ============================================ */
  function preloadModel() {
    if (!S.aiReady || !S.file) return;
    try {
      const dummy = document.createElement('canvas');
      dummy.width = 64; dummy.height = 64;
      const ctx = dummy.getContext('2d');
      ctx.fillStyle = '#333'; ctx.fillRect(0, 0, 64, 64);
      dummy.toBlob((blob) => {
        if (!blob) return;
        const remover = window.imglyRemoveBackground;
        if (typeof remover !== 'function') return;
        remover(blob, { model: S.model, output: { format: 'image/png' } })
          .then(() => console.info('[PhotoStudio] Model preloaded:', S.model))
          .catch(() => {});
      }, 'image/png');
    } catch {}
  }

  /* ============================================
     LOAD FOTO
     ============================================ */
  async function onFile(list) {
    const f = list?.[0];
    if (!f || !f.type.startsWith('image/')) {
      DA.toast.error('Harap pilih file gambar.'); return;
    }
    S.file = f;
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      prepareOriginal(img);
      DA.toast.success('Foto dimuat. Klik "Hapus BG" untuk mulai.');
      if (S.aiReady) preloadModel();
    } catch (e) {
      DA.toast.error('Gagal memuat gambar: ' + e.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function prepareOriginal(img) {
    const { canvas, w, h } = fitToMax(img, MAX_DIM);
    S.W = w; S.H = h;
    S.originalCanvas = canvas;
    S.imageData = canvas.getContext('2d').getImageData(0, 0, w, h);
    S.aiOutputMask = null; S.baseMask = null; S.mask = null;
    S.bgData = null;
    S.hasCutout = false; S.history = [];
    S.bg.img = null;

    els.canvas.width = w; els.canvas.height = h;
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
    const remover = window.imglyRemoveBackground;
    if (typeof remover !== 'function') {
      DA.toast.error(S.aiFailed ? 'AI gagal dimuat. Refresh halaman.' : 'AI masih dimuat...');
      return;
    }

    setBusy(true);
    els.progress.classList.remove('hidden');
    setProgress(2, 'Menyiapkan AI...');
    els.status.textContent = 'Menghapus background...';
    const t0 = performance.now();

    try {
      const blob = await remover(S.file, {
        model: S.model,
        output: { format: 'image/png', quality: 0.9 },
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
      tmp.width = S.W; tmp.height = S.H;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0, S.W, S.H);
      const data = ctx.getImageData(0, 0, S.W, S.H).data;

      const aiMask = new Uint8ClampedArray(S.W * S.H);
      for (let i = 0; i < aiMask.length; i++) aiMask[i] = data[i * 4 + 3];
      S.aiOutputMask = aiMask;

      applyPostProcess();
      S.hasCutout = true;
      S.history = [];

      rebuildBg();
      render();
      updateUI();
      checkCutoutQuality();

      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      els.status.textContent = `Cutout siap (${dt}s) — rapikan dengan kuas jika perlu`;
      DA.toast.success(`Background dihapus dalam ${dt}s`);
    } catch (err) {
      console.error('[PhotoStudio] removeBg error:', err);
      DA.toast.error('Gagal: ' + (err?.message || 'unknown error'));
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add('hidden'), 400);
    }
  }

  /* ============================================
     POST-PROCESSING PIPELINE
     1. Fill holes (flood fill dari border)
     2. Erode 1px (hapus kontaminasi warna background asli)
     3. Soft dilate N pixel (user-controlled)
     4. Box-blur x3 (anti-alias tepi = gaussian approx)
     5. S-curve threshold (restore kontras setelah blur)
     6. Alpha decontamination (opsional)
     ============================================ */
  function applyPostProcess() {
    if (!S.aiOutputMask) return;
    const W = S.W, H = S.H;
    let m = new Uint8ClampedArray(S.aiOutputMask);

    // 1. Fill holes
    if (S.fillHoles) m = fillHoles(m, W, H);

    // 2. Erode 1px — bikin tepi sedikit masuk, menghilangkan halo/kontaminasi warna
    m = morphOp(m, W, H, 1, 'erode');

    // 3. Soft dilate — perluas dengan gaussian-weighted
    if (S.expand > 0) m = softDilate(m, W, H, S.expand);

    // 4. Box blur x3 ≈ gaussian → anti-aliasing tepi
    const smoothRadius = Math.max(0, Math.round(S.smooth));
    if (smoothRadius > 0) {
      m = boxBlur(m, W, H, smoothRadius);
      m = boxBlur(m, W, H, smoothRadius);
      m = boxBlur(m, W, H, smoothRadius);
      // 5. S-curve sharpen untuk restore "punch" setelah blur
      m = sCurve(m, W, H);
    }

    // 6. Alpha decontamination — paksa pixel tepi jadi pure binary kalau dekat 0/255
    if (S.decontam) m = decontaminate(m, W, H);

    S.baseMask = new Uint8ClampedArray(m);
    S.mask = new Uint8ClampedArray(m);
    scheduleRender();
    updateUI();
  }

  /* -------- Fill holes: flood fill dari border -------- */
  function fillHoles(mask, W, H) {
    const visited = new Uint8Array(W * H);
    const stack = [];
    const THRESH = 128;

    for (let x = 0; x < W; x++) {
      if (mask[x] < THRESH && !visited[x]) { visited[x] = 1; stack.push(x); }
      const b = (H - 1) * W + x;
      if (mask[b] < THRESH && !visited[b]) { visited[b] = 1; stack.push(b); }
    }
    for (let y = 0; y < H; y++) {
      const l = y * W;
      if (mask[l] < THRESH && !visited[l]) { visited[l] = 1; stack.push(l); }
      const r = y * W + W - 1;
      if (mask[r] < THRESH && !visited[r]) { visited[r] = 1; stack.push(r); }
    }

    while (stack.length) {
      const i = stack.pop();
      const x = i % W;
      const y = (i - x) / W;
      if (x > 0)     { const n = i - 1; if (!visited[n] && mask[n] < THRESH) { visited[n] = 1; stack.push(n); } }
      if (x < W - 1) { const n = i + 1; if (!visited[n] && mask[n] < THRESH) { visited[n] = 1; stack.push(n); } }
      if (y > 0)     { const n = i - W; if (!visited[n] && mask[n] < THRESH) { visited[n] = 1; stack.push(n); } }
      if (y < H - 1) { const n = i + W; if (!visited[n] && mask[n] < THRESH) { visited[n] = 1; stack.push(n); } }
    }

    const out = new Uint8ClampedArray(mask);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] < THRESH && !visited[i]) out[i] = 255;
    }
    return out;
  }

  /* -------- Morphology (erode/dilate) circular -------- */
  function morphOp(mask, W, H, r, op) {
    const out = new Uint8ClampedArray(W * H);
    const r2 = r * r;
    const isErode = op === 'erode';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = isErode ? 255 : 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          const dy2 = dy * dy;
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy2 > r2) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            const nv = mask[ny * W + nx];
            if (isErode) { if (nv < v) v = nv; }
            else         { if (nv > v) v = nv; }
          }
        }
        out[i] = v;
      }
    }
    return out;
  }

  /* -------- Soft dilate dengan gaussian weight -------- */
  function softDilate(mask, W, H, r) {
    // Buat kernel gaussian
    const rad = Math.ceil(r);
    const sigma = r / 2;
    const kernel = [];
    let kSum = 0;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const w = Math.exp(-d2 / (2 * sigma * sigma));
        kernel.push({ dx, dy, w });
        kSum += w;
      }
    }
    for (const k of kernel) k.w /= kSum;

    const out = new Uint8ClampedArray(mask);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mask[i] >= 255) { out[i] = 255; continue; }
        let acc = 0;
        for (const k of kernel) {
          const nx = x + k.dx, ny = y + k.dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          acc += mask[ny * W + nx] * k.w;
        }
        if (acc > out[i]) out[i] = acc;
      }
    }
    return out;
  }

  /* -------- Box blur (O(n) — horizontal + vertical) -------- */
  function boxBlur(mask, W, H, radius) {
    if (radius < 1) return mask;
    const tmp = new Float32Array(W * H);
    const w = radius * 2 + 1;

    // Horizontal
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += mask[row + Math.max(0, Math.min(W - 1, k))];
      }
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / w;
        const outX = x - radius;
        const inX = x + radius + 1;
        sum -= mask[row + Math.max(0, Math.min(W - 1, outX))];
        sum += mask[row + Math.max(0, Math.min(W - 1, inX))];
      }
    }

    // Vertical
    const out = new Uint8ClampedArray(W * H);
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[Math.max(0, Math.min(H - 1, k)) * W + x];
      }
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum / w;
        const outY = y - radius;
        const inY = y + radius + 1;
        sum -= tmp[Math.max(0, Math.min(H - 1, outY)) * W + x];
        sum += tmp[Math.max(0, Math.min(H - 1, inY)) * W + x];
      }
    }
    return out;
  }

  /* -------- S-curve: sharpen edges setelah blur -------- */
  function sCurve(mask, W, H) {
    const out = new Uint8ClampedArray(W * H);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i] / 255;
      // smoothstep
      const s = v < 0.5
        ? 2 * v * v
        : 1 - Math.pow(-2 * v + 2, 2) / 2;
      out[i] = s * 255;
    }
    return out;
  }

  /* -------- Alpha decontamination -------- */
  function decontaminate(mask, W, H) {
    const out = new Uint8ClampedArray(mask);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i];
      if (v < 30) out[i] = 0;
      else if (v > 225) out[i] = 255;
    }
    return out;
  }

  /* -------- Quality check -------- */
  function checkCutoutQuality() {
    if (!S.mask) return;
    let fg = 0;
    for (let i = 0; i < S.mask.length; i++) if (S.mask[i] > 128) fg++;
    const ratio = fg / S.mask.length;
    if (ratio < 0.15) {
      DA.toast.warn('Subjek terdeteksi kecil. Coba naikkan "Perluas Subjek" atau pakai model "Akurat".', 6000);
    }
  }

  /* ============================================
     RENDER
     ============================================ */
  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
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
    const o = out.data;
    const src = imageData.data;
    const bg = S.bgData;
    const isTransparent = S.bg.type === 'transparent' || !bg;

    if (isTransparent) {
      for (let i = 0; i < W * H; i++) {
        const a = mask[i];
        o[i * 4]     = src[i * 4];
        o[i * 4 + 1] = src[i * 4 + 1];
        o[i * 4 + 2] = src[i * 4 + 2];
        o[i * 4 + 3] = a;
      }
    } else {
      for (let i = 0; i < W * H; i++) {
        const a = mask[i] / 255;
        const ia = 1 - a;
        o[i * 4]     = src[i * 4]     * a + bg[i * 4]     * ia;
        o[i * 4 + 1] = src[i * 4 + 1] * a + bg[i * 4 + 1] * ia;
        o[i * 4 + 2] = src[i * 4 + 2] * a + bg[i * 4 + 2] * ia;
        o[i * 4 + 3] = 255;
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
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H);
    } else if (bg.type === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, bg.g1); g.addColorStop(1, bg.g2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (bg.type === 'image' && bg.img) {
      drawCover(ctx, bg.img, W, H);
    } else if (bg.type === 'blur') {
      const pad = 40;
      ctx.filter = `blur(${bg.blur}px)`;
      ctx.drawImage(S.originalCanvas, -pad, -pad, W + pad * 2, H + pad * 2);
      ctx.filter = 'none';
    } else {
      S.bgData = null; return;
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
        const dx = px - pos.x, dy = py - pos.y;
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
    return {
      x: (e.clientX - r.left) * (S.W / r.width),
      y: (e.clientY - r.top)  * (S.H / r.height),
    };
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
    if (prev) { S.mask = prev; scheduleRender(); }
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
    if (type === 'image' && !S.bg.img) DA.toast.info('Pilih gambar background dulu');
    rebuildBg();
    scheduleRender();
  }

  /* ============================================
     UI STATE
     ============================================ */
  function updateUI() {
    const canRemove = !!S.file && S.aiReady;
    els.removeBtn.disabled = !canRemove;
    if (!S.aiReady && !S.aiFailed && S.file) els.removeBtn.title = 'AI masih dimuat...';
    else if (S.aiFailed) els.removeBtn.title = 'AI gagal dimuat';
    else els.removeBtn.title = 'Hapus background otomatis';

    if (!S.file) els.status.textContent = 'Belum ada foto';
    else if (!S.aiReady && !S.aiFailed && !S.hasCutout) els.status.textContent = 'Foto siap — AI masih dimuat...';
    else if (S.aiFailed && !S.hasCutout) els.status.textContent = 'Foto siap — AI gagal dimuat';

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
    tmp.width = S.W; tmp.height = S.H;
    tmp.getContext('2d').drawImage(els.canvas, 0, 0);

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const ctx = out.getContext('2d');

    const isJpg = format === 'jpg';
    if (isJpg) {
      ctx.fillStyle = S.bg.type === 'color' ? S.bg.color : '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }

    if (sizeKey === 'original') ctx.drawImage(tmp, 0, 0, outW, outH);
    else drawCover(ctx, tmp, outW, outH);

    const mime = isJpg ? 'image/jpeg' : 'image/png';
    out.toBlob((blob) => {
      const name = sizeKey === 'original'
        ? `PhotoStudio_${Date.now()}.${format}`
        : `PasFoto_${sizeKey}_${Date.now()}.${format}`;
      downloadBlob(blob, name);
      DA.toast.success(`Berhasil diunduh (${DA.utils.formatBytes(blob.size)})`);
    }, mime, 0.95);
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
    const ir = iw / ih, cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
    else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  return {
    init,
    loadFromDataURL(dataUrl) {
      loadImage(dataUrl).then((img) => prepareOriginal(img));
    },
    isAiReady: () => S.aiReady,
  };
})();
