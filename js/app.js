/* =====================================================
   DocuApply — Main entry (tab switching, theme, init)
   ===================================================== */
(function () {
  /* ---------- PDF.js worker ---------- */
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  /* ---------- Tab switching ---------- */
  const VIEWS = {
    editor:    document.getElementById('view-editor'),
    image2pdf: document.getElementById('view-image2pdf'),
    split:     document.getElementById('view-split'),
    photo:     document.getElementById('view-photo'),
    email:     document.getElementById('view-email'),
  };
  const ALL_NAV = document.querySelectorAll('[data-tab]');

  function switchTab(name) {
    if (!VIEWS[name]) name = 'editor';

    Object.entries(VIEWS).forEach(([k, el]) => {
      if (!el) return;
      if (k === name) {
        el.classList.remove('hidden');
        if (k === 'editor' || k === 'email' || k === 'photo') el.classList.add('flex');
      } else {
        el.classList.add('hidden');
        el.classList.remove('flex');
      }
    });

    ALL_NAV.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
    });

    DA.storage.set('lastTab', name);
  }

  ALL_NAV.forEach((btn) =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  /* ---------- Theme toggle ---------- */
  function initTheme() {
    const btn = document.getElementById('themeToggle');
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      DA.storage.set('theme', isDark ? 'dark' : 'light');
      DA.toast.info(isDark ? 'Mode gelap aktif' : 'Mode terang aktif', 1500);
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    if (DA.camera)       DA.camera.init();
    if (DA.pdfEditor)    DA.pdfEditor.init();
    if (DA.imageToPdf)   DA.imageToPdf.init();
    if (DA.splitPdf)     DA.splitPdf.init();
    if (DA.email)        DA.email.init();
    if (DA.photoStudio)  DA.photoStudio.init();

    const last = DA.storage.get('lastTab', 'editor');
    switchTab(VIEWS[last] ? last : 'editor');

    DA.toast.success('DocuApply siap digunakan', 2000);
  });
})();