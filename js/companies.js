/* =====================================================
   DocuApply — Company Directory v3
   - Support override data dari Admin Dashboard
   - Multi-method apply: email & link (dengan subject)
   ===================================================== */
window.DA = window.DA || {};

DA.companies = (function () {
  'use strict';

  const FAV_KEY = 'companyFavorites';

  let els = {};
  let allCompanies = [];
  let allCategories = [];
  let activeCategory = 'all';
  let searchQuery = '';
  let showFavoritesOnly = false;

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      list: document.getElementById('companiesList'),
      search: document.getElementById('companiesSearch'),
      searchClear: document.getElementById('companiesSearchClear'),
      categoryBar: document.getElementById('companiesCategoryBar'),
      grid: document.getElementById('companiesGrid'),
      empty: document.getElementById('companiesEmpty'),
      loading: document.getElementById('companiesLoading'),
      statsTotal: document.getElementById('companiesStatsTotal'),
      statsShown: document.getElementById('companiesStatsShown'),
      favoritesToggle: document.getElementById('companiesFavoritesToggle'),
      favoritesCount: document.getElementById('companiesFavoritesCount'),
      disclaimer: document.getElementById('companiesDisclaimer'),
    };

    if (!els.grid) return;

    bindEvents();
    loadData();

    // Re-render saat admin update
    window.addEventListener('companies:updated', loadData);
  }

  /* ============================================
     LOAD DATA
     ============================================ */
  async function loadData() {
    try {
      // Prioritas: override dari admin
      const override = DA.storage.get('companiesOverride');
      if (override && override.companies) {
        applyData(override, null);
        return;
      }

      // Fallback: fetch dari server
      const res = await fetch('companies/companies.json?t=' + Date.now());
      if (!res.ok) throw new Error('companies.json tidak ditemukan');
      const data = await res.json();
      applyData(data, data);
    } catch (err) {
      console.warn('[Companies] Gagal memuat:', err);
      els.loading?.classList.add('hidden');
      els.empty?.classList.remove('hidden');
      if (els.empty) {
        els.empty.innerHTML = `
          <div class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fa-solid fa-triangle-exclamation text-3xl text-amber-400"></i>
          </div>
          <h3 class="text-base font-bold text-slate-600 dark:text-slate-300 mb-1">Gagal memuat data</h3>
          <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Pastikan file <code class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">companies/companies.json</code> tersedia.
          </p>`;
      }
    }
  }

  function applyData(source, originalData) {
    allCompanies = (source.companies || []).sort((a, b) =>
      a.name.localeCompare(b.name, 'id')
    );
    allCategories = source.categories ||
      (originalData && originalData.categories) ||
      [{ id: 'all', name: 'Semua', icon: 'fa-globe' }];

    if (els.statsTotal) els.statsTotal.textContent = allCompanies.length;
    if (els.disclaimer && (source.disclaimer || (originalData && originalData.disclaimer))) {
      const txt = source.disclaimer || originalData.disclaimer;
      els.disclaimer.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i>${escapeHtml(txt)}`;
    }

    renderCategories();
    renderCompanies();
    updateFavoritesCount();

    els.loading?.classList.add('hidden');
    els.empty?.classList.add('hidden');
  }

  /* ============================================
     FAVORITES
     ============================================ */
  function getFavorites() {
    return DA.storage.get(FAV_KEY, []);
  }
  function toggleFavorite(id) {
    let favs = getFavorites();
    if (favs.includes(id)) {
      favs = favs.filter((x) => x !== id);
    } else {
      favs.push(id);
    }
    DA.storage.set(FAV_KEY, favs);
    updateFavoritesCount();
    return favs.includes(id);
  }
  function updateFavoritesCount() {
    const count = getFavorites().length;
    if (els.favoritesCount) {
      els.favoritesCount.textContent = count;
      els.favoritesCount.classList.toggle('hidden', count === 0);
    }
  }

  /* ============================================
     RENDER CATEGORIES
     ============================================ */
  function renderCategories() {
    if (!els.categoryBar) return;
    els.categoryBar.innerHTML = '';
    allCategories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'cp-cat-chip' + (cat.id === activeCategory ? ' active' : '');
      btn.dataset.cat = cat.id;
      btn.innerHTML = `<i class="fa-solid ${cat.icon || 'fa-tag'}"></i><span>${escapeHtml(cat.name)}</span>`;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        document.querySelectorAll('.cp-cat-chip').forEach((b) =>
          b.classList.toggle('active', b.dataset.cat === activeCategory)
        );
        renderCompanies();
      });
      els.categoryBar.appendChild(btn);
    });
  }

  /* ============================================
     FILTER
     ============================================ */
  function filteredCompanies() {
    const q = searchQuery.toLowerCase().trim();
    const favs = getFavorites();

    return allCompanies.filter((c) => {
      if (showFavoritesOnly && !favs.includes(c.id)) return false;
      if (activeCategory !== 'all' && c.category !== activeCategory) return false;
      if (q) {
        const applies = (c.apply || []).map((a) => `${a.value} ${a.subject || ''}`).join(' ');
        const hay = `${c.name} ${c.location || ''} ${c.category || ''} ${applies}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /* ============================================
     RENDER COMPANIES
     ============================================ */
  function renderCompanies() {
    if (!els.grid) return;
    const list = filteredCompanies();

    if (els.statsShown) els.statsShown.textContent = list.length;

    if (!list.length) {
      els.grid.innerHTML = '';
      els.empty?.classList.remove('hidden');
      return;
    }
    els.empty?.classList.add('hidden');

    els.grid.innerHTML = '';
    const favs = getFavorites();

    list.forEach((c) => {
      const card = document.createElement('div');
      const isFav = favs.includes(c.id);
      card.className = 'cp-card group';

      const applies = c.apply || [];
      const applyHtml = applies.map((a) => renderApplyItem(a, c)).join('');

      card.innerHTML = `
        <div class="cp-card-header">
          <div class="cp-card-icon">
            <i class="fa-solid ${iconForCategory(c.category)}"></i>
          </div>
          <div class="cp-card-title-wrap">
            <h3 class="cp-card-title">${escapeHtml(c.name)}</h3>
            <div class="cp-card-meta">
              <span class="cp-card-location"><i class="fa-solid fa-location-dot text-[9px]"></i> ${escapeHtml(c.location || '-')}</span>
              <span class="cp-card-cat">${escapeHtml(catName(c.category))}</span>
            </div>
          </div>
          <button class="cp-fav-btn ${isFav ? 'active' : ''}" data-fav title="${isFav ? 'Hapus dari favorit' : 'Tambah ke favorit'}">
            <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
          </button>
        </div>

        <div class="cp-apply-list">
          ${applyHtml}
        </div>
      `;

      // Favorites
      card.querySelector('[data-fav]').addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFav = toggleFavorite(c.id);
        const btn = e.currentTarget;
        btn.classList.toggle('active', nowFav);
        btn.innerHTML = `<i class="fa-${nowFav ? 'solid' : 'regular'} fa-star"></i>`;
        btn.title = nowFav ? 'Hapus dari favorit' : 'Tambah ke favorit';
        DA.toast.success(nowFav ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit', 1500);
      });

      // Apply actions
      card.querySelectorAll('[data-copy-email]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText(btn.dataset.copyEmail, `Email ${c.name}`);
        });
      });

      card.querySelectorAll('[data-copy-subject]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText(btn.dataset.copySubject, `Subject ${c.name}`);
        });
      });

      card.querySelectorAll('[data-send-email]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const email = btn.dataset.sendEmail;
          const subj = btn.dataset.sendSubject || `Lamaran Pekerjaan di ${c.name}`;
          const body = `Kepada Yth,\nHRD ${c.name}\n\nDengan hormat,\n\n(Mohon tulis surat lamaran Anda di sini)\n\nHormat saya,\n[Nama Lengkap]\n[Nomor Telepon]`;
          window.location.href = `mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
        });
      });

      card.querySelectorAll('[data-open-link]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(btn.dataset.openLink, '_blank', 'noopener');
        });
      });

      els.grid.appendChild(card);
    });
  }

  /* ============================================
     RENDER SINGLE APPLY ITEM
     ============================================ */
  function renderApplyItem(a, company) {
    const isEmail = a.type === 'email';
    const typeIcon = isEmail ? 'fa-envelope' : 'fa-globe';
    const typeLabel = isEmail ? 'EMAIL' : 'WEB';
    const typeClass = isEmail ? 'cp-apply-email' : 'cp-apply-link';

    if (isEmail) {
      return `
        <div class="cp-apply-item ${typeClass}">
          <div class="cp-apply-head">
            <span class="cp-apply-badge"><i class="fa-solid ${typeIcon}"></i> ${typeLabel}</span>
            <code class="cp-apply-value">${escapeHtml(a.value)}</code>
            <button class="cp-apply-copy" data-copy-email="${escapeHtml(a.value)}" title="Copy email">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
          ${a.subject ? `
            <div class="cp-apply-subject">
              <span class="cp-apply-subject-label"><i class="fa-solid fa-heading text-[9px]"></i> Subj</span>
              <span class="cp-apply-subject-text">${escapeHtml(a.subject)}</span>
              <button class="cp-apply-copy" data-copy-subject="${escapeHtml(a.subject)}" title="Copy subjek">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
          ` : ''}
          <div class="cp-apply-actions">
            <button class="cp-btn cp-btn-send" data-send-email="${escapeHtml(a.value)}" data-send-subject="${escapeHtml(a.subject || '')}">
              <i class="fa-solid fa-paper-plane"></i> Kirim Email
            </button>
          </div>
        </div>
      `;
    } else {
      const shortUrl = shortenUrl(a.value);
      return `
        <div class="cp-apply-item ${typeClass}">
          <div class="cp-apply-head">
            <span class="cp-apply-badge"><i class="fa-solid ${typeIcon}"></i> ${typeLabel}</span>
            <code class="cp-apply-value" title="${escapeHtml(a.value)}">${escapeHtml(shortUrl)}</code>
          </div>
          ${a.subject ? `
            <div class="cp-apply-subject">
              <span class="cp-apply-subject-label"><i class="fa-solid fa-info-circle text-[9px]"></i> Info</span>
              <span class="cp-apply-subject-text">${escapeHtml(a.subject)}</span>
            </div>
          ` : ''}
          <div class="cp-apply-actions">
            <button class="cp-btn cp-btn-link" data-open-link="${escapeHtml(a.value)}">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Link
            </button>
          </div>
        </div>
      `;
    }
  }

  /* ============================================
     HELPERS
     ============================================ */
  function catName(id) {
    const c = allCategories.find((x) => x.id === id);
    return c ? c.name : id;
  }

  function iconForCategory(id) {
    const c = allCategories.find((x) => x.id === id);
    return (c && c.icon) ? c.icon : 'fa-building';
  }

  function shortenUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname === '/' ? '' : u.pathname;
      const full = u.hostname + path;
      return full.length > 42 ? full.slice(0, 40) + '…' : full;
    } catch {
      return url.length > 42 ? url.slice(0, 40) + '…' : url;
    }
  }

  async function copyText(text, label) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      DA.toast.success(`${label} dicopy!`, 2000);
    } catch {
      DA.toast.error('Gagal copy');
    }
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /* ============================================
     BIND EVENTS
     ============================================ */
  function bindEvents() {
    els.search?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      els.searchClear?.classList.toggle('hidden', !searchQuery);
      renderCompanies();
    });

    els.searchClear?.addEventListener('click', () => {
      if (els.search) els.search.value = '';
      searchQuery = '';
      els.searchClear.classList.add('hidden');
      renderCompanies();
      els.search?.focus();
    });

    els.favoritesToggle?.addEventListener('click', () => {
      showFavoritesOnly = !showFavoritesOnly;
      els.favoritesToggle.classList.toggle('active', showFavoritesOnly);
      renderCompanies();
      if (showFavoritesOnly && getFavorites().length === 0) {
        DA.toast.info('Belum ada perusahaan favorit. Klik ⭐ pada kartu.', 3500);
      }
    });
  }

  return { init };
})();
