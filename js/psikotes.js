/* =====================================================
   DocuApply — Psikotes (User Side) v2
   - Section interaktif: logika-angka, matematika-dasar, kepribadian
   - Section worksheet: kraepelin, logika-gambar, wartegg,
     menggambar, ketelitian (print & kerjakan manual)
   ===================================================== */
window.DA = window.DA || {};

DA.psikotes = (function () {
  'use strict';

  const { escapeHtml, uid } = DA.utils;
  const STORAGE_KEY = 'psikotesOverride';
  const RESULT_KEY = 'psikotesResults';

  let els = {};
  let packages = [];
  let activeSession = null;
  let activePkg = null;
  let activeWorksheet = null;
  let currentWorksheetIdx = 0;
  let timerInterval = null;

  const COLORS = {
    blue:    { bg: 'bg-blue-100',    text: 'text-blue-600',    grad: 'from-blue-500 to-blue-700' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', grad: 'from-emerald-500 to-emerald-700' },
    purple:  { bg: 'bg-purple-100',  text: 'text-purple-600',  grad: 'from-purple-500 to-purple-700' },
    amber:   { bg: 'bg-amber-100',   text: 'text-amber-600',   grad: 'from-amber-500 to-amber-700' },
    rose:    { bg: 'bg-rose-100',    text: 'text-rose-600',    grad: 'from-rose-500 to-rose-700' },
    indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-600',  grad: 'from-indigo-500 to-indigo-700' },
  };

  const TYPE_LABEL = {
    'logika-angka':     'Tes Logika Angka',
    'matematika-dasar': 'Tes Matematika Dasar',
    'kepribadian':      'Tes Kepribadian',
    'worksheet':        'Worksheet',
  };

  const INTERACTIVE_TYPES = ['logika-angka', 'matematika-dasar', 'kepribadian'];
  const isInteractive = (sec) => INTERACTIVE_TYPES.indexOf(sec.type) >= 0;
  const isWorksheet   = (sec) => sec.type === 'worksheet';

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      list:         document.getElementById('pkPackageGrid'),
      empty:        document.getElementById('pkEmpty'),
      loading:      document.getElementById('pkLoading'),
      listWrap:     document.getElementById('pkListWrap'),
      testWrap:     document.getElementById('pkTestWrap'),
      wsWrap:       document.getElementById('pkWorksheetWrap'),
      resultWrap:   document.getElementById('pkResultWrap'),
      // Modal
      startModal:   document.getElementById('pkStartModal'),
      startBackdrop: document.getElementById('pkStartBackdrop'),
      startTitle:   document.getElementById('pkStartTitle'),
      startDesc:    document.getElementById('pkStartDesc'),
      startInfo:    document.getElementById('pkStartInfo'),
      startFooter:  document.getElementById('pkStartFooter'),
      startCancel:  document.getElementById('pkStartCancel'),
      startClose:   document.getElementById('pkStartClose'),
      // Test UI
      testPkgName:  document.getElementById('pkTestPkgName'),
      testSecName:  document.getElementById('pkTestSecName'),
      testTimer:    document.getElementById('pkTestTimer'),
      testProgress: document.getElementById('pkTestProgress'),
      testProgressBar: document.getElementById('pkTestProgressBar'),
      testQuestion: document.getElementById('pkTestQuestion'),
      testNavPrev:  document.getElementById('pkTestPrev'),
      testNavNext:  document.getElementById('pkTestNext'),
      testNavSubmit: document.getElementById('pkTestSubmit'),
      testExit:     document.getElementById('pkTestExit'),
      testNavGrid:  document.getElementById('pkTestNavGrid'),
      // Worksheet UI
      wsTitle:      document.getElementById('pkWsTitle'),
      wsSubtitle:   document.getElementById('pkWsSubtitle'),
      wsInstruction: document.getElementById('pkWsInstruction'),
      wsStage:      document.getElementById('pkWsStage'),
      wsThumbs:     document.getElementById('pkWsThumbs'),
      wsPrev:       document.getElementById('pkWsPrev'),
      wsNext:       document.getElementById('pkWsNext'),
      wsCounter:    document.getElementById('pkWsCounter'),
      wsPrint:      document.getElementById('pkWsPrint'),
      wsZoomIn:     document.getElementById('pkWsZoomIn'),
      wsZoomOut:    document.getElementById('pkWsZoomOut'),
      wsZoomReset:  document.getElementById('pkWsZoomReset'),
      wsClose:      document.getElementById('pkWsClose'),
      // Result UI
      resultTitle:  document.getElementById('pkResultTitle'),
      resultScore:  document.getElementById('pkResultScore'),
      resultStats:  document.getElementById('pkResultStats'),
      resultReview: document.getElementById('pkResultReview'),
      resultClose:  document.getElementById('pkResultClose'),
    };

    if (!els.list) return;

    bindEvents();
    loadData();
    window.addEventListener('psikotes:updated', loadData);
  }

  /* ============================================
     DATA
     ============================================ */
  async function loadData() {
    try {
      const override = DA.storage.get(STORAGE_KEY);
      if (override && Array.isArray(override.packages)) {
        packages = override.packages;
      } else {
        const res = await fetch('psikotes/packages.json?t=' + Date.now());
        if (!res.ok) throw new Error('packages.json tidak ditemukan');
        const data = await res.json();
        packages = data.packages || [];
      }
      renderList();
    } catch (err) {
      console.warn('[Psikotes]', err);
      els.loading?.classList.add('hidden');
      els.empty?.classList.remove('hidden');
    }
  }

  /* ============================================
     RENDER LIST PAKET
     ============================================ */
  function renderList() {
    els.loading?.classList.add('hidden');
    if (!packages.length) {
      els.empty?.classList.remove('hidden');
      return;
    }
    els.empty?.classList.add('hidden');
    els.list.innerHTML = '';

    packages.forEach((pkg) => {
      const c = COLORS[pkg.color] || COLORS.blue;
      const interSecs = (pkg.sections || []).filter(isInteractive);
      const wsSecs = (pkg.sections || []).filter(isWorksheet);
      const totalQ = interSecs.reduce((s, sec) => s + (sec.questions?.length || 0), 0);
      const totalWs = wsSecs.reduce((s, sec) => s + (sec.questions?.length || 0), 0);

      const card = document.createElement('div');
      card.className = 'pk-card group';
      card.innerHTML = `
        <div class="pk-card-header">
          <div class="pk-card-icon ${c.bg} ${c.text}">
            <i class="fa-solid ${escapeHtml(pkg.icon || 'fa-brain')}"></i>
          </div>
          <div class="pk-card-title-wrap">
            <h3 class="pk-card-title">${escapeHtml(pkg.name)}</h3>
            <p class="pk-card-desc">${escapeHtml(pkg.description || '')}</p>
          </div>
        </div>
        <div class="pk-card-stats">
          <span><i class="fa-solid fa-clock text-[10px]"></i> ${pkg.duration || 0} menit</span>
          ${interSecs.length ? `<span><i class="fa-solid fa-list-check text-[10px]"></i> ${totalQ} soal</span>` : ''}
          ${wsSecs.length ? `<span><i class="fa-solid fa-file-lines text-[10px]"></i> ${totalWs} lembar worksheet</span>` : ''}
        </div>
        <div class="pk-card-footer">
          <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Lihat <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </span>
        </div>
      `;
      card.addEventListener('click', () => openStartModal(pkg));
      els.list.appendChild(card);
    });
  }

  /* ============================================
     START MODAL (kaya)
     ============================================ */
  function openStartModal(pkg) {
    activePkg = pkg;

    if (els.startTitle) els.startTitle.textContent = pkg.name;
    if (els.startDesc) els.startDesc.textContent = pkg.description || '';

    const interSecs = (pkg.sections || []).filter(isInteractive);
    const wsSecs = (pkg.sections || []).filter(isWorksheet);

    const totalQ = interSecs.reduce((s, sec) => s + (sec.questions?.length || 0), 0);

    // ===== Info summary =====
    let infoHtml = `
      <div class="pk-info-item">
        <i class="fa-solid fa-clock text-indigo-500"></i>
        <span>Durasi: <strong>${pkg.duration || 0} menit</strong></span>
      </div>`;

    if (interSecs.length) {
      infoHtml += `
        <div class="pk-info-item">
          <i class="fa-solid fa-list-check text-indigo-500"></i>
          <span>${interSecs.length} bagian tes interaktif · ${totalQ} soal</span>
        </div>`;
    }
    if (wsSecs.length) {
      infoHtml += `
        <div class="pk-info-item">
          <i class="fa-solid fa-print text-indigo-500"></i>
          <span>${wsSecs.length} worksheet untuk latihan cetak</span>
        </div>`;
    }

    // ===== Section list =====
    if (interSecs.length) {
      infoHtml += `<div class="pk-section-group">
        <div class="pk-section-group-head"><i class="fa-solid fa-bolt text-amber-500"></i> Tes Interaktif</div>`;
      interSecs.forEach((sec) => {
        infoHtml += `
          <div class="pk-section-item">
            <div class="pk-section-item-icon pk-si-interactive">
              <i class="fa-solid fa-circle-question"></i>
            </div>
            <div class="pk-section-item-body">
              <div class="pk-section-item-title">${escapeHtml(sec.name)}</div>
              <div class="pk-section-item-sub">${(sec.questions?.length || 0)} soal · ${sec.duration || 0} menit</div>
            </div>
          </div>`;
      });
      infoHtml += `</div>`;
    }

    if (wsSecs.length) {
      infoHtml += `<div class="pk-section-group">
        <div class="pk-section-group-head"><i class="fa-solid fa-print text-indigo-500"></i> Worksheet (Latihan Cetak)</div>`;
      wsSecs.forEach((sec, i) => {
        infoHtml += `
          <div class="pk-section-item pk-section-ws" data-ws-idx="${i}">
            <div class="pk-section-item-icon pk-si-worksheet">
              <i class="fa-solid fa-file-lines"></i>
            </div>
            <div class="pk-section-item-body">
              <div class="pk-section-item-title">${escapeHtml(sec.name)}</div>
              <div class="pk-section-item-sub">${(sec.questions?.length || 0)} halaman · ${sec.duration || 0} menit</div>
            </div>
            <button class="pk-section-open-btn" data-open-ws="${i}">
              <i class="fa-solid fa-up-right-from-square"></i> Buka
            </button>
          </div>`;
      });
      infoHtml += `</div>`;
    }

    if (!interSecs.length && !wsSecs.length) {
      infoHtml += `<div class="pk-info-warn"><i class="fa-solid fa-circle-info"></i><span>Paket ini belum memiliki bagian tes.</span></div>`;
    }

    if (els.startInfo) els.startInfo.innerHTML = infoHtml;

    // ===== Footer buttons =====
    let footerHtml = '';
    if (interSecs.length) {
      footerHtml += `
        <button id="pkStartConfirm" class="pk-start-btn-primary">
          <i class="fa-solid fa-play text-xs"></i> Mulai Tes
        </button>`;
    }
    if (els.startFooter) els.startFooter.innerHTML = footerHtml;

    // ===== Bind =====
    els.startInfo?.querySelectorAll('[data-open-ws]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.openWs);
        openWorksheet(pkg, wsSecs[idx]);
      });
    });

    const confirmBtn = document.getElementById('pkStartConfirm');
    confirmBtn?.addEventListener('click', () => startTest(pkg));

    els.startModal?.classList.remove('hidden');
    els.startModal?.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }

  function closeStartModal() {
    els.startModal?.classList.add('hidden');
    els.startModal?.classList.remove('flex');
    document.body.style.overflow = '';
    activePkg = null;
  }

  /* ============================================
     TEST (Interactive)
     ============================================ */
  function startTest(pkg) {
    closeStartModal();

    const interSecs = (pkg.sections || []).filter(isInteractive);
    if (!interSecs.length) {
      DA.toast.warn('Tidak ada tes interaktif di paket ini');
      return;
    }

    activeSession = {
      pkg,
      startedAt: Date.now(),
      timeLeft: (pkg.duration || 0) * 60,
      currentIdx: 0,
      flatQuestions: [],
      answers: {},
    };

    interSecs.forEach((sec) => {
      (sec.questions || []).forEach((q) => {
        activeSession.flatQuestions.push({ section: sec, question: q });
      });
    });

    if (!activeSession.flatQuestions.length) {
      DA.toast.warn('Paket ini belum memiliki soal');
      activeSession = null;
      return;
    }

    showTestUI();
    startTimer();
    renderQuestion();
  }

  function showTestUI() {
    els.listWrap?.classList.add('hidden');
    els.resultWrap?.classList.add('hidden');
    els.wsWrap?.classList.add('hidden');
    els.testWrap?.classList.remove('hidden');
    if (els.testPkgName) els.testPkgName.textContent = activeSession.pkg.name;
    document.body.style.overflow = 'hidden';
  }

  function exitTestUI() {
    stopTimer();
    els.testWrap?.classList.add('hidden');
    els.listWrap?.classList.remove('hidden');
    document.body.style.overflow = '';
    activeSession = null;
  }

  /* ============================================
     TIMER
     ============================================ */
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (!activeSession) return;
      activeSession.timeLeft--;
      updateTimerDisplay();
      if (activeSession.timeLeft <= 0) {
        stopTimer();
        DA.toast.warn('Waktu habis! Jawaban otomatis dikirim.');
        submitTest(true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function updateTimerDisplay() {
    if (!els.testTimer || !activeSession) return;
    const t = Math.max(0, activeSession.timeLeft);
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    els.testTimer.textContent = `${m}:${s}`;
    els.testTimer.classList.toggle('pk-timer-warn', t <= 60);
  }

  /* ============================================
     RENDER QUESTION
     ============================================ */
  function renderQuestion() {
    if (!activeSession) return;
    const { flatQuestions, currentIdx, answers } = activeSession;
    const item = flatQuestions[currentIdx];
    if (!item) return;
    const { section, question } = item;

    if (els.testSecName) els.testSecName.textContent = section.name || '';
    if (els.testProgress) els.testProgress.textContent = `${currentIdx + 1} / ${flatQuestions.length}`;
    if (els.testProgressBar) {
      const pct = ((currentIdx + 1) / flatQuestions.length) * 100;
      els.testProgressBar.style.width = pct + '%';
    }

    const userAns = answers[question.id];
    const qImgHtml = question.image
      ? `<div class="pk-q-image"><img src="${question.image}" alt="Soal"></div>` : '';

    let optionsHtml = '';
    if (question.type === 'essay') {
      optionsHtml = `
        <div class="pk-essay-wrap">
          <textarea class="pk-essay-input" id="pkEssayInput" placeholder="Tulis jawaban Anda di sini...">${escapeHtml(userAns || '')}</textarea>
        </div>`;
    } else {
      optionsHtml = '<div class="pk-options">';
      (question.options || []).forEach((opt) => {
        const selected = userAns === opt.id;
        const optImgHtml = opt.image
          ? `<div class="pk-opt-image"><img src="${opt.image}" alt="Opsi ${opt.id}"></div>` : '';
        optionsHtml += `
          <button class="pk-option ${selected ? 'selected' : ''}" data-opt="${escapeHtml(opt.id)}">
            <span class="pk-option-letter">${escapeHtml(opt.id)}</span>
            <div class="pk-option-content">
              ${opt.text ? `<span class="pk-option-text">${escapeHtml(opt.text)}</span>` : ''}
              ${optImgHtml}
            </div>
          </button>`;
      });
      optionsHtml += '</div>';
    }

    els.testQuestion.innerHTML = `
      <div class="pk-q-section-badge">${escapeHtml(TYPE_LABEL[section.type] || section.name)}</div>
      <div class="pk-q-text">${escapeHtml(question.text || '')}</div>
      ${qImgHtml}
      ${optionsHtml}
    `;

    els.testQuestion.querySelectorAll('.pk-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSession.answers[question.id] = btn.dataset.opt;
        els.testQuestion.querySelectorAll('.pk-option').forEach((b) =>
          b.classList.toggle('selected', b === btn)
        );
        updateNavGrid();
      });
    });

    const essay = els.testQuestion.querySelector('#pkEssayInput');
    essay?.addEventListener('input', () => {
      activeSession.answers[question.id] = essay.value;
      updateNavGrid();
    });

    els.testNavPrev.disabled = currentIdx === 0;
    const isLast = currentIdx === flatQuestions.length - 1;
    els.testNavNext.classList.toggle('hidden', isLast);
    els.testNavSubmit.classList.toggle('hidden', !isLast);

    renderNavGrid();
    els.testQuestion.scrollTop = 0;
  }

  function renderNavGrid() {
    if (!els.testNavGrid || !activeSession) return;
    els.testNavGrid.innerHTML = '';
    activeSession.flatQuestions.forEach((item, i) => {
      const btn = document.createElement('button');
      const answered = activeSession.answers[item.question.id] != null &&
                       activeSession.answers[item.question.id] !== '';
      btn.className = 'pk-nav-dot' +
        (i === activeSession.currentIdx ? ' current' : '') +
        (answered ? ' answered' : '');
      btn.textContent = i + 1;
      btn.addEventListener('click', () => {
        activeSession.currentIdx = i;
        renderQuestion();
      });
      els.testNavGrid.appendChild(btn);
    });
  }

  function updateNavGrid() {
    if (!els.testNavGrid || !activeSession) return;
    els.testNavGrid.querySelectorAll('.pk-nav-dot').forEach((btn, i) => {
      const item = activeSession.flatQuestions[i];
      const answered = activeSession.answers[item.question.id] != null &&
                       activeSession.answers[item.question.id] !== '';
      btn.classList.toggle('answered', answered);
    });
  }

  /* ============================================
     SUBMIT
     ============================================ */
  function confirmSubmit() {
    if (!activeSession) return;
    const answered = Object.keys(activeSession.answers).filter((k) => {
      const v = activeSession.answers[k];
      return v != null && v !== '';
    }).length;
    const total = activeSession.flatQuestions.length;
    const unanswered = total - answered;

    const msg = unanswered > 0
      ? `Masih ada ${unanswered} soal yang belum dijawab. Yakin ingin mengirim?`
      : 'Yakin ingin mengirim jawaban Anda?';

    if (!DA.confirm(msg)) return;
    submitTest(false);
  }

  function submitTest(force) {
    if (!activeSession) return;
    stopTimer();

    const { pkg, flatQuestions, answers, startedAt } = activeSession;

    let correct = 0, wrong = 0, essayCount = 0, kepribadianCount = 0, totalScored = 0;
    const traitCounts = {};

    flatQuestions.forEach((item) => {
      const { section, question } = item;
      const userAns = answers[question.id];
      if (section.type === 'kepribadian') {
        kepribadianCount++;
        if (userAns != null) {
          const opt = (question.options || []).find((o) => o.id === userAns);
          if (opt?.trait) traitCounts[opt.trait] = (traitCounts[opt.trait] || 0) + 1;
        }
        return;
      }
      if (question.type === 'essay') {
        essayCount++;
        return;
      }
      totalScored++;
      if (userAns === question.correct) correct++;
      else if (userAns != null) wrong++;
    });

    const duration = Math.round((Date.now() - startedAt) / 1000);

    const history = DA.storage.get(RESULT_KEY, []);
    history.unshift({
      id: uid(),
      packageId: pkg.id,
      packageName: pkg.name,
      score: totalScored ? Math.round((correct / totalScored) * 100) : 0,
      correct, wrong, total: totalScored,
      essayCount, kepribadianCount,
      duration,
      at: Date.now(),
    });
    if (history.length > 30) history.length = 30;
    DA.storage.set(RESULT_KEY, history);

    showResults({ correct, wrong, totalScored, essayCount, kepribadianCount, traitCounts, duration });
  }

  /* ============================================
     RESULTS
     ============================================ */
  function showResults({ correct, wrong, totalScored, essayCount, kepribadianCount, traitCounts, duration }) {
    const { pkg, flatQuestions, answers } = activeSession;

    els.testWrap?.classList.add('hidden');
    els.resultWrap?.classList.remove('hidden');

    const hasScored = totalScored > 0;
    const pct = hasScored ? Math.round((correct / totalScored) * 100) : 0;

    if (els.resultTitle) els.resultTitle.textContent = pkg.name;
    if (els.resultScore) {
      if (hasScored) {
        els.resultScore.innerHTML = `
          <div class="pk-score-circle" style="--pct:${pct}">
            <div class="pk-score-inner">
              <div class="pk-score-num">${pct}<span>%</span></div>
              <div class="pk-score-label">Skor</div>
            </div>
          </div>`;
      } else {
        els.resultScore.innerHTML = `
          <div class="pk-score-circle pk-score-kepribadian">
            <div class="pk-score-inner">
              <div class="pk-score-num"><i class="fa-solid fa-user-astronaut"></i></div>
              <div class="pk-score-label">Tes Kepribadian</div>
            </div>
          </div>`;
      }
    }

    if (els.resultStats) {
      let statsHtml = `
        <div class="pk-stat pk-stat-time">
          <i class="fa-solid fa-stopwatch"></i>
          <div><div class="pk-stat-num">${formatDuration(duration)}</div><div class="pk-stat-label">Waktu</div></div>
        </div>`;
      if (hasScored) {
        statsHtml += `
          <div class="pk-stat pk-stat-correct">
            <i class="fa-solid fa-circle-check"></i>
            <div><div class="pk-stat-num">${correct}</div><div class="pk-stat-label">Benar</div></div>
          </div>
          <div class="pk-stat pk-stat-wrong">
            <i class="fa-solid fa-circle-xmark"></i>
            <div><div class="pk-stat-num">${wrong}</div><div class="pk-stat-label">Salah</div></div>
          </div>`;
      }
      if (essayCount) {
        statsHtml += `
          <div class="pk-stat pk-stat-essay">
            <i class="fa-solid fa-pen-fancy"></i>
            <div><div class="pk-stat-num">${essayCount}</div><div class="pk-stat-label">Esai</div></div>
          </div>`;
      }
      els.resultStats.innerHTML = statsHtml;
    }

    let reviewHtml = '';

    if (kepribadianCount > 0 && Object.keys(traitCounts).length) {
      const maxTrait = Math.max(...Object.values(traitCounts));
      reviewHtml += `
        <div class="pk-review-section">
          <h3 class="pk-review-title"><i class="fa-solid fa-user-astronaut"></i> Profil Kepribadian</h3>
          <div class="pk-traits">
            ${Object.entries(traitCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `
              <div class="pk-trait-row">
                <span class="pk-trait-name">${escapeHtml(t)}</span>
                <div class="pk-trait-bar"><div class="pk-trait-fill" style="width:${(c / maxTrait) * 100}%"></div></div>
                <span class="pk-trait-count">${c}</span>
              </div>
            `).join('')}
          </div>
          <p class="pk-trait-note"><i class="fa-solid fa-info-circle"></i> Tes kepribadian tidak memiliki jawaban benar/salah. Hasil di atas adalah dominasi karakter Anda.</p>
        </div>`;
    }

    if (hasScored || essayCount) {
      reviewHtml += `<div class="pk-review-section"><h3 class="pk-review-title"><i class="fa-solid fa-list-check"></i> Review Jawaban</h3>`;
      flatQuestions.forEach((item, i) => {
        const { section, question } = item;
        if (section.type === 'kepribadian') return;
        const userAns = answers[question.id];
        const isEssay = question.type === 'essay';
        const isCorrect = !isEssay && userAns === question.correct;
        const noAns = userAns == null || userAns === '';

        let cls = 'pk-review-item';
        if (isEssay) cls += ' pk-review-essay';
        else if (noAns) cls += ' pk-review-skip';
        else if (isCorrect) cls += ' pk-review-correct';
        else cls += ' pk-review-wrong';

        const qImg = question.image ? `<div class="pk-review-qimg"><img src="${question.image}"></div>` : '';

        let answerBlock = '';
        if (isEssay) {
          answerBlock = `
            <div class="pk-review-answer">
              <div class="pk-review-label">Jawaban Anda:</div>
              <div class="pk-review-text">${escapeHtml(userAns || '(kosong)')}</div>
              ${question.modelAnswer ? `
                <div class="pk-review-label mt-2">Kunci / Contoh Jawaban:</div>
                <div class="pk-review-text pk-model-answer">${escapeHtml(question.modelAnswer)}</div>` : ''}
            </div>`;
        } else {
          const userOpt = (question.options || []).find((o) => o.id === userAns);
          const correctOpt = (question.options || []).find((o) => o.id === question.correct);
          answerBlock = `
            <div class="pk-review-answer">
              <div class="pk-review-row">
                <span class="pk-review-label">Jawaban Anda:</span>
                <span class="pk-review-val ${isCorrect ? 'ok' : (noAns ? 'skip' : 'bad')}">
                  ${userAns ? escapeHtml(userAns + '. ' + (userOpt?.text || '')) : '(tidak dijawab)'}
                </span>
              </div>
              ${!isCorrect ? `
                <div class="pk-review-row">
                  <span class="pk-review-label">Jawaban Benar:</span>
                  <span class="pk-review-val ok">${escapeHtml(question.correct + '. ' + (correctOpt?.text || ''))}</span>
                </div>` : ''}
            </div>`;
        }

        reviewHtml += `
          <div class="${cls}">
            <div class="pk-review-head">
              <span class="pk-review-num">Soal ${i + 1}</span>
              <span class="pk-review-badge">
                ${isEssay ? '<i class="fa-solid fa-pen-fancy"></i> Esai'
                  : noAns ? '<i class="fa-solid fa-minus"></i> Kosong'
                  : isCorrect ? '<i class="fa-solid fa-check"></i> Benar'
                  : '<i class="fa-solid fa-xmark"></i> Salah'}
              </span>
            </div>
            <div class="pk-review-qtext">${escapeHtml(question.text || '')}</div>
            ${qImg}
            ${answerBlock}
          </div>`;
      });
      reviewHtml += '</div>';
    }

    if (els.resultReview) els.resultReview.innerHTML = reviewHtml;
    els.resultWrap.scrollTop = 0;
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function closeResults() {
    els.resultWrap?.classList.add('hidden');
    els.listWrap?.classList.remove('hidden');
    document.body.style.overflow = '';
    activeSession = null;
  }

  /* ============================================
     WORKSHEET (BARU)
     ============================================ */
  function openWorksheet(pkg, section) {
    activeWorksheet = section;
    currentWorksheetIdx = 0;

    closeStartModal();

    els.listWrap?.classList.add('hidden');
    els.testWrap?.classList.add('hidden');
    els.resultWrap?.classList.add('hidden');
    els.wsWrap?.classList.remove('hidden');

    if (els.wsTitle) els.wsTitle.textContent = section.name;
    if (els.wsSubtitle) els.wsSubtitle.textContent = pkg.name;

    // Instruction
    if (els.wsInstruction) {
      if (section.instruction) {
        els.wsInstruction.classList.remove('hidden');
        els.wsInstruction.innerHTML = `<i class="fa-solid fa-circle-info"></i><div>${escapeHtml(section.instruction)}</div>`;
      } else {
        els.wsInstruction.classList.add('hidden');
      }
    }

    renderWorksheetThumbs();
    renderWorksheetPage(0);
    document.body.style.overflow = 'hidden';
  }

  function renderWorksheetThumbs() {
    if (!els.wsThumbs || !activeWorksheet) return;
    const questions = activeWorksheet.questions || [];
    els.wsThumbs.innerHTML = questions.map((q, i) => `
      <button class="pk-ws-thumb ${i === currentWorksheetIdx ? 'active' : ''}" data-ws-page="${i}">
        <img src="${q.image}" alt="Hal ${i + 1}">
        <span class="pk-ws-thumb-num">${i + 1}</span>
      </button>
    `).join('');

    els.wsThumbs.querySelectorAll('[data-ws-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.wsPage);
        renderWorksheetPage(idx);
      });
    });
  }

  function renderWorksheetPage(idx) {
    if (!activeWorksheet) return;
    const questions = activeWorksheet.questions || [];
    const q = questions[idx];
    if (!q) return;

    currentWorksheetIdx = idx;

    if (els.wsStage) {
      els.wsStage.innerHTML = `
        <div class="pk-ws-page">
          ${q.text ? `<div class="pk-ws-page-title">${escapeHtml(q.text)}</div>` : ''}
          <img src="${q.image}" alt="Halaman ${idx + 1}">
          ${q.notes ? `<div class="pk-ws-page-notes">${escapeHtml(q.notes)}</div>` : ''}
        </div>`;
    }
    if (els.wsCounter) els.wsCounter.textContent = `${idx + 1} / ${questions.length}`;
    if (els.wsPrev) els.wsPrev.disabled = idx === 0;
    if (els.wsNext) els.wsNext.disabled = idx === questions.length - 1;

    // Update active thumb
    els.wsThumbs?.querySelectorAll('.pk-ws-thumb').forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });

    // Reset zoom
    applyWorksheetZoom(1);
  }

  function closeWorksheet() {
    els.wsWrap?.classList.add('hidden');
    els.listWrap?.classList.remove('hidden');
    document.body.style.overflow = '';
    activeWorksheet = null;
  }

  let wsZoom = 1;
  function applyWorksheetZoom(z) {
    wsZoom = Math.max(0.5, Math.min(3, z));
    const page = els.wsStage?.querySelector('.pk-ws-page img');
    if (page) page.style.transform = `scale(${wsZoom})`;
  }

  function printWorksheet() {
    if (!activeWorksheet) return;
    const sec = activeWorksheet;
    const questions = sec.questions || [];
    const title = sec.name || 'Worksheet';

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e2e8f0; -webkit-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .ws-toolbar {
    position: sticky; top: 0; z-index: 999;
    background: #1e293b; color: #fff;
    padding: 12px 16px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  }
  .ws-toolbar-info { flex: 1; min-width: 0; }
  .ws-toolbar-title { font-size: 14px; font-weight: 700; }
  .ws-toolbar-hint { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  .ws-print-btn {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff; border: none; padding: 11px 20px; border-radius: 12px;
    font-size: 14px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    white-space: nowrap; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
  }
  .ws-print-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .ws-paper-wrapper { padding: 20px 12px 40px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .ws-page-card {
    width: 100%; max-width: 21cm; background: #fff;
    padding: 1.2cm; box-shadow: 0 4px 32px rgba(15, 23, 42, 0.18);
    border-radius: 6px;
  }
  .ws-page-title {
    font-size: 14px; font-weight: 800; color: #0f172a;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 2px solid #cbd5e1;
  }
  .ws-page-img {
    width: 100%; height: auto; display: block; border-radius: 4px;
  }
  .ws-page-notes {
    font-size: 11px; color: #64748b; margin-top: 8px;
    padding: 8px 12px; background: #f8fafc; border-radius: 6px;
    border-left: 3px solid #6366f1;
  }
  @media print {
    @page { size: A4; margin: 0; }
    html, body { background: #fff !important; }
    .ws-toolbar { display: none !important; }
    .ws-paper-wrapper { padding: 0 !important; gap: 0 !important; }
    .ws-page-card {
      box-shadow: none !important;
      padding: 0.8cm !important;
      border-radius: 0 !important;
      max-width: none !important;
      page-break-after: always;
    }
    .ws-page-card:last-child { page-break-after: auto; }
  }
</style>
</head>
<body>
  <div class="ws-toolbar">
    <div class="ws-toolbar-info">
      <div class="ws-toolbar-title">📄 ${escapeHtml(title)}</div>
      <div class="ws-toolbar-hint">Tap <strong>Print / Save as PDF</strong> untuk mencetak. Kerjakan di kertas terpisah.</div>
    </div>
    <button class="ws-print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
  </div>
  <div class="ws-paper-wrapper">
    ${questions.map((q) => `
      <div class="ws-page-card">
        ${q.text ? `<div class="ws-page-title">${escapeHtml(q.text)}</div>` : ''}
        <img class="ws-page-img" src="${q.image}" alt="">
        ${q.notes ? `<div class="ws-page-notes">${escapeHtml(q.notes)}</div>` : ''}
      </div>
    `).join('')}
  </div>
  <script>
    (function(){
      var isDesktop = !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isDesktop) {
        setTimeout(function(){ try { window.print(); } catch(e){} }, 600);
      }
    })();
  <\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      DA.toast.warn('Popup diblokir. Membuka dalam tab yang sama...', 3000);
      const a = document.createElement('a');
      a.href = url;
      a.download = title.replace(/[^a-zA-Z0-9_\s]/g, '_') + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      DA.toast.success('Tab baru dibuka. Klik "Print / Save PDF" di sana.', 5000);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ============================================
     EVENTS
     ============================================ */
  function bindEvents() {
    els.startCancel?.addEventListener('click', closeStartModal);
    els.startClose?.addEventListener('click', closeStartModal);
    els.startBackdrop?.addEventListener('click', closeStartModal);

    els.testNavPrev?.addEventListener('click', () => {
      if (!activeSession || activeSession.currentIdx <= 0) return;
      activeSession.currentIdx--;
      renderQuestion();
    });
    els.testNavNext?.addEventListener('click', () => {
      if (!activeSession) return;
      if (activeSession.currentIdx >= activeSession.flatQuestions.length - 1) return;
      activeSession.currentIdx++;
      renderQuestion();
    });
    els.testNavSubmit?.addEventListener('click', confirmSubmit);
    els.testExit?.addEventListener('click', () => {
      if (DA.confirm('Keluar dari tes? Semua jawaban akan hilang.')) {
        exitTestUI();
      }
    });

    els.resultClose?.addEventListener('click', closeResults);

    // Worksheet events
    els.wsClose?.addEventListener('click', closeWorksheet);
    els.wsPrev?.addEventListener('click', () => {
      if (currentWorksheetIdx > 0) renderWorksheetPage(currentWorksheetIdx - 1);
    });
    els.wsNext?.addEventListener('click', () => {
      const total = activeWorksheet?.questions?.length || 0;
      if (currentWorksheetIdx < total - 1) renderWorksheetPage(currentWorksheetIdx + 1);
    });
    els.wsPrint?.addEventListener('click', printWorksheet);
    els.wsZoomIn?.addEventListener('click', () => applyWorksheetZoom(wsZoom + 0.25));
    els.wsZoomOut?.addEventListener('click', () => applyWorksheetZoom(wsZoom - 0.25));
    els.wsZoomReset?.addEventListener('click', () => applyWorksheetZoom(1));

    // Warn before unload
    window.addEventListener('beforeunload', (e) => {
      const testActive = activeSession && els.testWrap && !els.testWrap.classList.contains('hidden');
      if (testActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Keyboard navigation for worksheet
    document.addEventListener('keydown', (e) => {
      if (!activeWorksheet) return;
      if (els.wsWrap?.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft' && currentWorksheetIdx > 0) renderWorksheetPage(currentWorksheetIdx - 1);
      if (e.key === 'ArrowRight') {
        const total = activeWorksheet?.questions?.length || 0;
        if (currentWorksheetIdx < total - 1) renderWorksheetPage(currentWorksheetIdx + 1);
      }
      if (e.key === 'Escape') closeWorksheet();
    });
  }

  return { init, reload: loadData };
})();
