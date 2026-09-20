/* =====================================================
   DocuApply — Photo Studio v5 (Mobile-First)
   - Model FIXED: isnet (Akurat)
   - Reset Brush tanpa confirm
   - Post-processing: fill holes + erode + soft dilate + box blur + s-curve
   - Mobile bottom sheet drawer dengan tab navigation
   ===================================================== */
window.DA = window.DA || {};

DA.photoStudio = (function () {
  'use strict';

  const { downloadBlob, bindDropZone } = DA.utils;

  const MAX_DIM = 1400;
  const AI_MODEL = 'isnet';
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
    aiOutputMask: null,
    baseMask: null,
    mask: null,
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
    expand: 3,
    smooth: 3,
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
      inputMobile: document.getElementById('photoInputMobile'),
      mobileUploadBtn: document.getElementById('mobileUploadBtn'),
      mobileSettingsBtn: document.getElementById('mobileSettingsBtn'),
      mobileCloseBtn: document.getElementById('mobileCloseBtn'),
      sidebar: document.getElementById('photoSidebar'),
      backdrop: document.getElementById('photoBackdrop'),
      sheetHandle: document.getElementById('sheetHandle'),
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
      console.info('[PhotoStudio] AI siap, model:', AI_MODEL);
      preloadModel();
    });
    window.addEventListener('imgy:error', () => {
      S.aiReady = false; S.aiFailed = true;
      updateAIStatusBadge(); updateUI();
      DA.toast.warn('AI gagal dimuat. Cek koneksi lalu refresh.', 5000);
    });
    if (typeof window.imglyRemoveBackground === 'function') {
      S.aiReady = true; updateAIStatusBadge();
    }

    /* ===== Settings ===== */
    els.expand?.addEventListener('input', (e) => {
      S.expand = Number(e.target.value);
      if (els.expandVal) els.expandVal.textContent = S.expand;
      DA.storage.set('photoExpand', S.expand);
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });
    els.smooth?.addEventListener('input', (e) => {
      S.smooth = Number(e.target.value);
      if (els.smoothVal) els.smoothVal.textContent = S.smooth;
      DA.storage.set('photoSmooth', S.smooth);
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });
    els.fillHoles?.addEventListener('change', () => {
      S.fillHoles = els.fillHoles.checked;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });
    els.decontam?.addEventListener('change', () => {
      S.decontam = els.decontam.checked;
      if (S.hasCutout && S.aiOutputMask) applyPostProcess();
    });

    const savedExpand = DA.storage.get('photoExpand');
    if (savedExpand != null && els.expand) {
      S.expand = savedExpand;
      els.expand.value = savedExpand;
      if (els.expandVal) els.expandVal.textContent = savedExpand;
    }
    const savedSmooth = DA.storage.get('photoSmooth');
    if (savedSmooth != null && els.smooth) {
      S.smooth = savedSmooth;
      els.smooth.value = savedSmooth;
      if (els.smoothVal) els.smoothVal.textContent = savedSmooth;
    }

    /* ===== Dropzones (desktop + mobile) ===== */
    if (els.drop && els.input) bindDropZone(els.drop, els.input, onFile);

    els.mobileUploadBtn?.addEventListener('click', () => els.inputMobile?.click());
    els.inputMobile?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      onFile([f]);
      setTimeout(openSheet, 300);
    });

    /* ===== Buttons ===== */
    els.removeBtn?.addEventListener('click', removeBg);
    els.resetBtn?.addEventListener('click', resetMask);
    els.undoBtn?.addEventListener('click', undo);
    els.downloadBtn?.addEventListener('click', download);

    els.brushSize?.addEventListener('input', (e) => {
      S.brushSize = Number(e.target.value);
      if (els.brushSizeVal) els.brushSizeVal.textContent = S.brushSize;
    });

    document.querySelectorAll('[data-brush-mode]').forEach((b) =>
      b.addEventListener('click', () => setBrushMode(b.dataset.brushMode))
    );
    document.querySelectorAll('[data-bg-type]').forEach((b) =>
      b.addEventListener('click', () => setBgType(b.dataset.bgType))
    );
    document.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        if (els.bgColor) els.bgColor.value = b.dataset.preset;
        S.bg.color = b.dataset.preset;
        rebuildBg(); scheduleRender();
      })
    );

    els.bgColor?.addEventListener('input', (e) => { S.bg.color = e.target.value; rebuildBg(); scheduleRender(); });
    els.bgGrad1?.addEventListener('input', (e) => { S.bg.g1 = e.target.value; rebuildBg(); scheduleRender(); });
    els.bgGrad2?.addEventListener('input', (e) => { S.bg.g2 = e.target.value; rebuildBg(); scheduleRender(); });
    els.blurRadius?.addEventListener('input', (e) => { S.bg.blur = Number(e.target.value); rebuildBg(); scheduleRender(); });

    els.bgImgBtn?.addEventListener('click', () => els.bgImgInput?.click());
    els.bgImgInput?.addEventListener('change', (e) => {
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

    /* ===== Canvas events ===== */
    const c = els.canvas;
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('pointerleave', () => { if (els.cursor) els.cursor.style.display = 'none'; });
    c.addEventListener('pointerenter', () => {
      if (S.hasCutout && !isTouchDevice() && els.cursor) els.cursor.style.display = 'block';
    });

    /* ===== Theme + resize ===== */
    document.getElementById('themeToggle')?.addEventListener('click', () => scheduleRender());
    window.addEventListener('resize', () => scheduleRender());

    /* ============================================
       MOBILE BOTTOM SHEET
       ============================================ */
    setupMobileSheet();

    updateUI();
    updateAIStatusBadge();

    /* Auto preload */
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { if (S.aiReady) preloadModel(); }, { timeout: 5000 });
    } else {
      setTimeout(() => { if (S.aiReady) preloadModel(); }, 3000);
    }

    /* Timeout warning */
    setTimeout(() => {
      if (!S.aiReady && !S.aiFailed) {
        S.aiFailed = true;
        updateAIStatusBadge(); updateUI();
      }
    }, 30000);

    /* Auto-switch to brush tab after cutout */
    window.addEventListener('photo-cutout-ready', () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        const brushTab = document.querySelector('[data-ps-tab="brush"]');
        if (brushTab) brushTab.click();
      }
    });
  }

  /* ============================================
     MOBILE SHEET
     ============================================ */
  function setupMobileSheet() {
    const sidebar = els.sidebar;
    const backdrop = els.backdrop;
    if (!sidebar) return;

    /* Open/close */
    window.openPhotoSheet = openSheet;
    window.closePhotoSheet = closeSheet;

    els.mobileSettingsBtn?.addEventListener('click', openSheet);
    els.mobileCloseBtn?.addEventListener('click', closeSheet);
    backdrop?.addEventListener('click', closeSheet);

    /* Tabs */
    document.querySelectorAll('[data-ps-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.psTab;
        document.querySelectorAll('[data-ps-tab]').forEach((t) =>
          t.classList.toggle('active', t === tab)
        );
        document.querySelectorAll('.ps-panel').forEach((p) =>
          p.classList.toggle('active', p.dataset.psPanel === key)
        );
        /* Scroll content to top */
        const scroll = sidebar.querySelector('.flex-1.overflow-y-auto');
        if (scroll) scroll.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    /* Initial tab on mobile */
    if (window.matchMedia('(max-width: 767px)').matches) {
      document.querySelector('[data-ps-tab="main"]')?.click();
    }

    /* Swipe down to close */
    const handle = els.sheetHandle;
    let startY = 0, deltaY = 0, dragging = false;

    handle?.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      dragging = true;
      sidebar.style.transition = 'none';
    }, { passive: true });

    handle?.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      deltaY = e.touches[0].clientY - startY;
      if (deltaY > 0) {
        sidebar.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: true });

    handle?.addEventListener('touchend', () => {
      dragging = false;
      sidebar.style.transition = '';
      sidebar.style.transform = '';
      if (deltaY > 80) closeSheet();
      deltaY = 0;
    });

    /* Ensure closed initially on mobile */
    if (window.matchMedia('(max-width: 767px)').matches) {
      closeSheet();
    }
  }

  function openSheet() {
    if (!els.sidebar) return;
    els.sidebar.classList.add('open');
    els.backdrop?.classList.add('show');
  }

  function closeSheet() {
    if (!els.sidebar) return;
    els.sidebar.classList.remove('open');
    els.backdrop?.classList.remove('show');
    els.sidebar.style.transform = '';
  }

  function isTouchDevice() {
    return matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  }

  /* ============================================
     AI STATUS
     ============================================ */
  function updateAIStatusBadge() {
    if (!els.aiStatus) return;
    if (S.aiReady) {
      els.aiStatus.textContent = 'siap';
      els.aiStatus.className = 'text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0';
    } else if (S.aiFailed) {
      els.aiStatus.textContent = 'gagal';
      els.aiStatus.className = 'text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 shrink-0';
    } else {
      els.aiStatus.textContent = 'memuat…';
      els.aiStatus.className = 'text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0';
    }
  }

  /* ============================================
     PRELOAD
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
        remover(blob, { model: AI_MODEL, output: { format: 'image/png' } })
          .then(() => console.info('[PhotoStudio] Model preloaded'))
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
    if (els.dimensions) els.dimensions.textContent = `${w} × ${h}px`;
    if (els.status) els.status.textContent = 'Foto siap — belum ada cutout';

    els.canvas.getContext('2d').drawImage(canvas, 0, 0);
    updateUI();
  }

  /* ============================================
     AI REMOVE BACKGROUND
     ============================================ */
  async function removeBg() {
    if (!S.file) return;
    const remover = window.imglyRemoveBackground;
    if (typeof remover !== 'function') {
      DA.toast.error(S.aiFailed ? 'AI gagal dimuat. Refresh halaman.' : 'AI masih dimuat...');
      return;
    }

    setBusy(true);
    els.progress?.classList.remove('hidden');
    setProgress(2, 'Menyiapkan AI...');
    if (els.status) els.status.textContent = 'Menghapus background...';
    const t0 = performance.now();

    try {
      const blob = await remover(S.file, {
        model: AI_MODEL,
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
      if (els.status) els.status.textContent = `Cutout siap (${dt}s)`;
      DA.toast.success(`Background dihapus dalam ${dt}s`);

      /* Notify UI → auto-switch to brush tab on mobile */
      window.dispatchEvent(new CustomEvent('photo-cutout-ready'));
    } catch (err) {
      console.error('[PhotoStudio] removeBg error:', err);
      DA.toast.error('Gagal: ' + (err?.message || 'unknown error'));
    } finally {
      setBusy(false);
      setTimeout(() => els.progress?.classList.add('hidden'), 400);
    }
  }

  /* ============================================
     POST-PROCESSING PIPELINE
     ============================================ */
  function applyPostProcess() {
    if (!S.aiOutputMask) return;
    const W = S.W, H = S.H;
    let m = new Uint8ClampedArray(S.aiOutputMask);

    if (S.fillHoles) m = fillHoles(m, W, H);
    m = morphOp(m, W, H, 1, 'erode');
    if (S.expand > 0) m = softDilate(m, W, H, S.expand);

    const smoothRadius = Math.max(0, Math.round(S.smooth));
    if (smoothRadius > 0) {
      const adaptive = Math.min(smoothRadius, Math.max(1, Math.round(W / 400)));
      const r = Math.max(1, adaptive);
      m = boxBlur(m, W, H, r);
      m = boxBlur(m, W, H, r);
      m = boxBlur(m, W, H, r);
      m = sCurve(m, W, H);
      m = sCurve(m, W, H);
    }

    if (S.decontam) m = decontaminate(m, W, H);

    S.baseMask = new Uint8ClampedArray(m);
    S.mask = new Uint8ClampedArray(m);
    scheduleRender();
    updateUI();
  }

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

  function softDilate(mask, W, H, r) {
    const rad = Math.ceil(r);
    const sigma = Math.max(0.5, r / 2);
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

  function boxBlur(src, W, H, radius) {
    if (radius < 1) return src;
    const r = radius;
    const size = r * 2 + 1;
    const tmp = new Float32Array(W * H);

    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const idx = Math.min(W - 1, Math.max(0, k));
        sum += src[row + idx];
      }
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / size;
        const removeIdx = Math.max(0, x - r);
        const addIdx = Math.min(W - 1, x + r + 1);
        sum += src[row + addIdx] - src[row + removeIdx];
      }
    }

    const out = new Uint8ClampedArray(W * H);
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const idx = Math.min(H - 1, Math.max(0, k));
        sum += tmp[idx * W + x];
      }
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum / size;
        const removeIdx = Math.max(0, y - r);
        const addIdx = Math.min(H - 1, y + r + 1);
        sum += tmp[addIdx * W + x] - tmp[removeIdx * W + x];
      }
    }
    return out;
  }

  function sCurve(mask, W, H) {
    const out = new Uint8ClampedArray(W * H);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i] / 255;
      const s = v < 0.5
        ? 2 * v * v
        : 1 - Math.pow(-2 * v + 2, 2) / 2;
      out[i] = s * 255;
    }
    return out;
  }

  function decontaminate(mask, W, H) {
    const out = new Uint8ClampedArray(mask);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i];
      if (v < 25) out[i] = 0;
      else if (v > 230) out[i] = 255;
    }
    return out;
  }

  function checkCutoutQuality() {
    if (!S.mask) return;
    let fg = 0;
    for (let i = 0; i < S.mask.length; i++) if (S.mask[i] > 128) fg++;
    const ratio = fg / S.mask.length;
    if (ratio < 0.15) {
      DA.toast.warn('Subjek terdeteksi kecil. Naikkan "Perluas Subjek".', 6000);
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
    if (!S.hasCutout || isTouchDevice() || !els.cursor) return;
    const rect = els.canvas.getBoundingClientRect();
    const stageRect = els.stage.getBoundingClientRect();
    const scale = rect.width / S.W;
    els.cursor.style.left = (rect.left - stageRect.left + (e.clientX - rect.left)) + 'px';
    els.cursor.style.top  = (rect.top - stageRect.top + (e.clientY - rect.top)) + 'px';
    els.cursor.style.width  = (S.brushSize * scale) + 'px';
    els.cursor.style.height = (S.brushSize * scale) + 'px';
    els.cursor.style.display = 'block';
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
     RESET (no confirm)
     ============================================ */
  function resetMask() {
    if (!S.baseMask) {
      DA.toast.warn('Belum ada cutout untuk direset');
      return;
    }
    S.mask = new Uint8ClampedArray(S.baseMask);
    S.history = [];
    scheduleRender();
    updateUI();
    DA.toast.success('Kuas direset ke hasil AI awal');
  }

  /* ============================================
     BG TYPE
     ============================================ */
  function setBgType(type) {
    S.bg.type = type;
    document.querySelectorAll('[data-bg-type]').forEach((b) =>
      b.classList.toggle('active', b.dataset.bgType === type)
    );
    els.colorOpts?.classList.toggle('hidden', type !== 'color');
    els.gradOpts?.classList.toggle('hidden', type !== 'gradient');
    els.imgOpts?.classList.toggle('hidden', type !== 'image');
    els.blurOpts?.classList.toggle('hidden', type !== 'blur');
    if (type === 'image' && !S.bg.img) DA.toast.info('Pilih gambar background dulu');
    rebuildBg();
    scheduleRender();
  }

  /* ============================================
     UI STATE
     ============================================ */
  function updateUI() {
    const canRemove = !!S.file && S.aiReady;
    if (els.removeBtn) els.removeBtn.disabled = !canRemove;
    if (els.resetBtn) els.resetBtn.disabled = !S.hasCutout;
    if (els.undoBtn) els.undoBtn.disabled = !S.history.length;
    if (els.brushPanel) els.brushPanel.classList.toggle('hidden', !S.hasCutout);
    if (els.downloadBtn) els.downloadBtn.disabled = !S.file;

    if (els.status) {
      if (!S.file) els.status.textContent = 'Belum ada foto';
      else if (!S.aiReady && !S.aiFailed && !S.hasCutout) els.status.textContent = 'Foto siap — AI dimuat...';
      else if (S.aiFailed && !S.hasCutout) els.status.textContent = 'Foto siap — AI gagal dimuat';
    }
  }

  function setBusy(busy) {
    if (!els.removeBtn) return;
    els.removeBtn.disabled = busy || !S.file || !S.aiReady;
    els.removeBtn.innerHTML = busy
      ? '<div class="loader !w-4 !h-4 !border-white/30 !border-t-white mr-2"></div><span>Proses...</span>'
      : '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Hapus BG</span>';
  }

  function setProgress(pct, text) {
    if (els.progressBar) els.progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (els.progressText) els.progressText.textContent = text || 'Memproses...';
  }

  /* ============================================
     DOWNLOAD
     ============================================ */
  function download() {
    if (!S.file) return;
    const sizeKey = els.sizeSel?.value || 'original';
    const format = els.formatSel?.value || 'png';

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
