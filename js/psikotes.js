/* =====================================================
   DocuApply — Psikotes (User Side) v3
   Fitur baru:
   - Mode: Ujian (timer) / Latihan (instant feedback)
   - Acak urutan soal & pilihan
   - Riwayat hasil + grafik skor (canvas)
   - Export hasil ke PDF
   - Worksheet viewer (Kraepelin, Wartegg, dll)
   ===================================================== */
window.DA = window.DA || {};

DA.psikotes = (function () {
  'use strict';

  const { escapeHtml, uid } = DA.utils;
  const STORAGE_KEY = 'psikotesOverride';
  const RESULT_KEY = 'psikotesResults';
  const MAX_HISTORY = 50;

  let els = {};
  let packages = [];
  let activeSession = null;
  let activePkg = null;
  let activeWorksheet = null;
  let activeSetup = { mode: 'exam', shuffleQ: false, shuffleO: false };
  let currentWorksheetIdx = 0;
  let timerInterval = null;
  let lastResult = null;
  let wsZoom = 1;

  const COLORS = {
    blue:    { bg: 'bg-blue-100',    text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    purple:  { bg: 'bg-purple-100',  text: 'text-purple-600' },
    amber:   { bg: 'bg-amber-100',   text: 'text-amber-600' },
    rose:    { bg: 'bg-rose-100',    text: 'text-rose-600' },
    indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-600' },
  };

  const TYPE_LABEL = {
    'logika-angka':     'Tes Logika Angka',
    'matematika-dasar': 'Tes Matematika Dasar',
    'kepribadian':      'Tes Kepribadian',
    'worksheet':        'Worksheet',
  };

  const INTERACTIVE_TYPES = ['logika-angka', 'matematika-dasar', 'kepribadian'];
  const isInteractive = (sec) => INTERACTIVE_TYPES.indexOf(sec.type) >= 0;
  const isWorksheet = (sec) => sec.type === 'worksheet';

  /* ============================================
     INIT
     ============================================ */
  function init() {
    els = {
      list:         document.getElementById('pkPackageGrid'),
      empty:        document.getElementById('pkEmpty'),
      loading:      document.getElementById('pkLoading'),
      listWrap:     document.getElementById('pkListWrap'),
      historyWrap:  document.getElementById('pkHistoryWrap'),
      historyBtn:   document.getElementById('pkHistoryBtn'),
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
      testModeBadge: document.getElementById('pkTestModeBadge'),
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
      resultPdf:    document.getElementById('pkResultPdf'),
      // History UI
      historyList:  document.getElementById('pkHistoryList'),
      historyChart: document.getElementById('pkHistoryChart'),
      historyEmpty: document.getElementById('pkHistoryEmpty'),
      historyBack:  document.getElementById('pkHistoryBack'),
      historyClear: document.getElementById('pkHistoryClear'),
      historyStats: document.getElementById('pkHistoryStats'),
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
     RENDER LIST
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
          ${wsSecs.length ? `<span><i class="fa-solid fa-file-lines text-[10px]"></i> ${totalWs} lembar</span>` : ''}
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
     START MODAL (dengan setup)
     ============================================ */
  function openStartModal(pkg) {
    activePkg = pkg;
    activeSetup = { mode: 'exam', shuffleQ: false, shuffleO: false };

    if (els.startTitle) els.startTitle.textContent = pkg.name;
    if (els.startDesc) els.startDesc.textContent = pkg.description || '';

    const interSecs = (pkg.sections || []).filter(isInteractive);
    const wsSecs = (pkg.sections || []).filter(isWorksheet);
    const totalQ = interSecs.reduce((s, sec) => s + (sec.questions?.length || 0), 0);

    let infoHtml = '';

    if (interSecs.length) {
      infoHtml += `<div class="pk-section-group">
        <div class="pk-section-group-head"><i class="fa-solid fa-bolt text-amber-500"></i> Tes Interaktif</div>`;
      interSecs.forEach((sec) => {
        infoHtml += `
          <div class="pk-section-item">
            <div class="pk-section-item-icon pk-si-interactive"><i class="fa-solid fa-circle-question"></i></div>
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
          <div class="pk-section-item pk-section-ws">
            <div class="pk-section-item-icon pk-si-worksheet"><i class="fa-solid fa-file-lines"></i></div>
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

    // Setup opsi (hanya jika ada tes interaktif)
    if (interSecs.length) {
      infoHtml += `
        <div class="pk-section-group">
          <div class="pk-section-group-head"><i class="fa-solid fa-gear text-indigo-500"></i> Pengaturan</div>
          <div class="pk-setup-box">
            <div class="pk-setup-label">Mode Pengerjaan</div>
            <div class="pk-setup-modes">
              <button class="pk-setup-mode ${activeSetup.mode === 'exam' ? 'active' : ''}" data-mode="exam">
                <i class="fa-solid fa-stopwatch"></i>
                <div>
                  <div class="pk-setup-mode-title">Ujian</div>
                  <div class="pk-setup-mode-desc">Dengan waktu · Dinilai</div>
                </div>
              </button>
              <button class="pk-setup-mode ${activeSetup.mode === 'practice' ? 'active' : ''}" data-mode="practice">
                <i class="fa-solid fa-graduation-cap"></i>
                <div>
                  <div class="pk-setup-mode-title">Latihan</div>
                  <div class="pk-setup-mode-desc">Tanpa waktu · Feedback</div>
                </div>
              </button>
            </div>

            <label class="pk-setup-check">
              <input type="checkbox" id="pkSetupShuffleQ" ${activeSetup.shuffleQ ? 'checked' : ''}>
              <span class="pk-setup-check-box"></span>
              <span>Acak urutan soal</span>
            </label>

            <label class="pk-setup-check">
              <input type="checkbox" id="pkSetupShuffleO" ${activeSetup.shuffleO ? 'checked' : ''}>
              <span class="pk-setup-check-box"></span>
              <span>Acak urutan pilihan jawaban</span>
            </label>
          </div>
        </div>`;
    }

    if (!interSecs.length && !wsSecs.length) {
      infoHtml += `<div class="pk-info-warn"><i class="fa-solid fa-circle-info"></i><span>Paket ini belum memiliki bagian tes.</span></div>`;
    }

    if (els.startInfo) els.startInfo.innerHTML = infoHtml;

    // Footer
    let footerHtml = '';
    if (interSecs.length) {
      footerHtml = `<button id="pkStartConfirm" class="pk-start-btn-primary">
        <i class="fa-solid fa-play text-xs"></i> Mulai Tes
      </button>`;
    }
    if (els.startFooter) els.startFooter.innerHTML = footerHtml;

    // Bind setup buttons
    els.startInfo?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSetup.mode = btn.dataset.mode;
        els.startInfo.querySelectorAll('[data-mode]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
      });
    });

    // Bind worksheet buttons
    els.startInfo?.querySelectorAll('[data-open-ws]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openWorksheet(pkg, wsSecs[Number(btn.dataset.openWs)]);
      });
    });

    // Bind confirm
    document.getElementById('pkStartConfirm')?.addEventListener('click', () => {
      activeSetup.shuffleQ = !!document.getElementById('pkSetupShuffleQ')?.checked;
      activeSetup.shuffleO = !!document.getElementById('pkSetupShuffleO')?.checked;
      startTest(pkg, activeSetup);
    });

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
     SHUFFLE HELPERS
     ============================================ */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ============================================
     TEST START
     ============================================ */
  function startTest(pkg, config) {
    closeStartModal();
    const interSecs = (pkg.sections || []).filter(isInteractive);
    if (!interSecs.length) {
      DA.toast.warn('Tidak ada tes interaktif di paket ini');
      return;
    }

    // Build flat questions
    let flat = [];
    interSecs.forEach((sec) => {
      (sec.questions || []).forEach((q) => {
        flat.push({ section: sec, question: q });
      });
    });

    if (config.shuffleQ) flat = shuffle(flat);

    if (!flat.length) {
      DA.toast.warn('Paket ini belum memiliki soal');
      return;
    }

    // Shuffle options per question if requested (buat mapping baru)
    if (config.shuffleO) {
      flat = flat.map((item) => {
        if (item.question.type === 'essay') return item;
        const origOpts = item.question.options || [];
        const shuffled = shuffle(origOpts);
        const newOpts = shuffled.map((opt, idx) => ({
          ...opt,
          id: String.fromCharCode(65 + idx),
          _origId: opt.id,
        }));
        return {
          ...item,
          question: { ...item.question, options: newOpts },
        };
      });
    }

    activeSession = {
      pkg,
      mode: config.mode,
      shuffleQ: config.shuffleQ,
      shuffleO: config.shuffleO,
      startedAt: Date.now(),
      timeLeft: config.mode === 'exam' ? (pkg.duration || 0) * 60 : 0,
      currentIdx: 0,
      flatQuestions: flat,
      answers: {},
      revealed: {}, // untuk practice mode: question.id -> true
    };

    showTestUI();

    if (config.mode === 'exam') {
      startTimer();
    } else {
      if (els.testTimer) els.testTimer.textContent = '∞';
      els.testTimer?.classList.remove('pk-timer-warn');
    }

    renderQuestion();
  }

  function showTestUI() {
    els.listWrap?.classList.add('hidden');
    els.historyWrap?.classList.add('hidden');
    els.resultWrap?.classList.add('hidden');
    els.wsWrap?.classList.add('hidden');
    els.testWrap?.classList.remove('hidden');
    if (els.testPkgName) els.testPkgName.textContent = activeSession.pkg.name;
    if (els.testModeBadge) {
      const isPractice = activeSession.mode === 'practice';
      els.testModeBadge.textContent = isPractice ? 'Latihan' : 'Ujian';
      els.testModeBadge.className = 'pk-mode-badge ' + (isPractice ? 'practice' : 'exam');
    }
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
    if (activeSession.mode === 'practice') {
      els.testTimer.textContent = '∞';
      return;
    }
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
    const { flatQuestions, currentIdx, answers, mode, revealed } = activeSession;
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
    const isPractice = mode === 'practice';
    const isRevealed = isPractice && revealed[question.id];
    const isKepribadian = section.type === 'kepribadian';

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
        let cls = 'pk-option';
        if (selected) cls += ' selected';
        if (isRevealed && !isKepribadian) {
          if (opt.id === question.correct) cls += ' pk-opt-correct';
          else if (selected) cls += ' pk-opt-wrong';
        }
        const optImgHtml = opt.image
          ? `<div class="pk-opt-image"><img src="${opt.image}" alt="Opsi ${opt.id}"></div>` : '';
        optionsHtml += `
          <button class="${cls}" data-opt="${escapeHtml(opt.id)}" ${isRevealed ? 'disabled' : ''}>
            <span class="pk-option-letter">${escapeHtml(opt.id)}</span>
            <div class="pk-option-content">
              ${opt.text ? `<span class="pk-option-text">${escapeHtml(opt.text)}</span>` : ''}
              ${optImgHtml}
            </div>
            ${isRevealed && !isKepribadian && opt.id === question.correct
              ? '<i class="fa-solid fa-circle-check text-emerald-500 ml-2 shrink-0"></i>' : ''}
            ${isRevealed && !isKepribadian && selected && opt.id !== question.correct
              ? '<i class="fa-solid fa-circle-xmark text-rose-500 ml-2 shrink-0"></i>' : ''}
          </button>`;
      });
      optionsHtml += '</div>';
    }

    // Feedback info box untuk practice mode
    let feedbackHtml = '';
    if (isPractice && isRevealed && !isKepribadian) {
      const isCorrect = userAns === question.correct;
      if (question.type !== 'essay') {
        feedbackHtml = `
          <div class="pk-feedback ${isCorrect ? 'ok' : 'bad'}">
            <i class="fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
            <div>
              <div class="pk-feedback-title">${isCorrect ? 'Benar!' : 'Salah'}</div>
              <div class="pk-feedback-desc">
                ${!isCorrect ? `Jawaban yang benar: <strong>${escapeHtml(question.correct)}</strong>` : 'Pertahankan!'}
              </div>
            </div>
          </div>`;
      }
    }

    els.testQuestion.innerHTML = `
      <div class="pk-q-section-badge">${escapeHtml(TYPE_LABEL[section.type] || section.name)}</div>
      <div class="pk-q-text">${escapeHtml(question.text || '')}</div>
      ${qImgHtml}
      ${optionsHtml}
      ${feedbackHtml}
    `;

    // Bind option clicks
    els.testQuestion.querySelectorAll('.pk-option:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleAnswer(question.id, btn.dataset.opt, section.type);
      });
    });

    // Essay input
    const essay = els.testQuestion.querySelector('#pkEssayInput');
    essay?.addEventListener('input', () => {
      activeSession.answers[question.id] = essay.value;
      updateNavGrid();
    });

    // Nav
    els.testNavPrev.disabled = currentIdx === 0;
    const isLast = currentIdx === flatQuestions.length - 1;
    els.testNavNext.classList.toggle('hidden', isLast);
    els.testNavSubmit.classList.toggle('hidden', !isLast);

    renderNavGrid();
    els.testQuestion.scrollTop = 0;
  }

  function handleAnswer(qId, optId, sectionType) {
    if (!activeSession) return;
    activeSession.answers[qId] = optId;

    // Practice mode: instant feedback untuk non-kepribadian
    if (activeSession.mode === 'practice' && sectionType !== 'kepribadian') {
      activeSession.revealed[qId] = true;
    }

    renderQuestion();
    updateNavGrid();
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

    const { pkg, flatQuestions, answers, startedAt, mode, shuffleQ, shuffleO } = activeSession;

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
    const score = totalScored ? Math.round((correct / totalScored) * 100) : 0;

    // Simpan history
    const history = DA.storage.get(RESULT_KEY, []);
    const resultData = {
      id: uid(),
      packageId: pkg.id,
      packageName: pkg.name,
      mode: mode || 'exam',
      shuffleQ: !!shuffleQ,
      shuffleO: !!shuffleO,
      score,
      correct, wrong, total: totalScored,
      essayCount, kepribadianCount,
      traitCounts: { ...traitCounts },
      duration,
      at: Date.now(),
      // Simpan snapshot soal & jawaban untuk review & PDF export
      snapshot: flatQuestions.map((item) => ({
        sectionName: item.section.name,
        sectionType: item.section.type,
        qText: item.question.text || '',
        qType: item.question.type || 'mc',
        qImage: item.question.image || null,
        correct: item.question.correct || null,
        options: (item.question.options || []).map((o) => ({ id: o.id, text: o.text || '' })),
        userAns: answers[item.question.id] || null,
      })),
    };

    history.unshift(resultData);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    DA.storage.set(RESULT_KEY, history);

    lastResult = resultData;
    showResults(resultData);
  }

  /* ============================================
     RESULTS
     ============================================ */
  function showResults(result) {
    els.testWrap?.classList.add('hidden');
    els.resultWrap?.classList.remove('hidden');

    const hasScored = result.total > 0;
    const pct = result.score;

    if (els.resultTitle) els.resultTitle.textContent = result.packageName;
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
          <div><div class="pk-stat-num">${formatDuration(result.duration)}</div><div class="pk-stat-label">Waktu</div></div>
        </div>`;
      if (hasScored) {
        statsHtml += `
          <div class="pk-stat pk-stat-correct">
            <i class="fa-solid fa-circle-check"></i>
            <div><div class="pk-stat-num">${result.correct}</div><div class="pk-stat-label">Benar</div></div>
          </div>
          <div class="pk-stat pk-stat-wrong">
            <i class="fa-solid fa-circle-xmark"></i>
            <div><div class="pk-stat-num">${result.wrong}</div><div class="pk-stat-label">Salah</div></div>
          </div>`;
      }
      if (result.essayCount) {
        statsHtml += `
          <div class="pk-stat pk-stat-essay">
            <i class="fa-solid fa-pen-fancy"></i>
            <div><div class="pk-stat-num">${result.essayCount}</div><div class="pk-stat-label">Esai</div></div>
          </div>`;
      }
      els.resultStats.innerHTML = statsHtml;
    }

    // Review
    let reviewHtml = '';

    if (result.kepribadianCount > 0 && Object.keys(result.traitCounts || {}).length) {
      const maxTrait = Math.max(...Object.values(result.traitCounts));
      reviewHtml += `
        <div class="pk-review-section">
          <h3 class="pk-review-title"><i class="fa-solid fa-user-astronaut"></i> Profil Kepribadian</h3>
          <div class="pk-traits">
            ${Object.entries(result.traitCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `
              <div class="pk-trait-row">
                <span class="pk-trait-name">${escapeHtml(t)}</span>
                <div class="pk-trait-bar"><div class="pk-trait-fill" style="width:${(c / maxTrait) * 100}%"></div></div>
                <span class="pk-trait-count">${c}</span>
              </div>
            `).join('')}
          </div>
          <p class="pk-trait-note"><i class="fa-solid fa-info-circle"></i> Tes kepribadian tidak memiliki jawaban benar/salah.</p>
        </div>`;
    }

    // Review dari snapshot
    const reviewItems = (result.snapshot || []).filter((s) => s.sectionType !== 'kepribadian');
    if (reviewItems.length) {
      reviewHtml += `<div class="pk-review-section"><h3 class="pk-review-title"><i class="fa-solid fa-list-check"></i> Review Jawaban</h3>`;
      reviewItems.forEach((s, i) => {
        const isEssay = s.qType === 'essay';
        const isCorrect = !isEssay && s.userAns === s.correct;
        const noAns = s.userAns == null || s.userAns === '';

        let cls = 'pk-review-item';
        if (isEssay) cls += ' pk-review-essay';
        else if (noAns) cls += ' pk-review-skip';
        else if (isCorrect) cls += ' pk-review-correct';
        else cls += ' pk-review-wrong';

        const qImg = s.qImage ? `<div class="pk-review-qimg"><img src="${s.qImage}"></div>` : '';
        const userOpt = (s.options || []).find((o) => o.id === s.userAns);
        const correctOpt = (s.options || []).find((o) => o.id === s.correct);

        let ansBlock = '';
        if (isEssay) {
          ansBlock = `
            <div class="pk-review-answer">
              <div class="pk-review-label">Jawaban Anda:</div>
              <div class="pk-review-text">${escapeHtml(s.userAns || '(kosong)')}</div>
            </div>`;
        } else {
          ansBlock = `
            <div class="pk-review-answer">
              <div class="pk-review-row">
                <span class="pk-review-label">Jawaban Anda:</span>
                <span class="pk-review-val ${isCorrect ? 'ok' : (noAns ? 'skip' : 'bad')}">
                  ${s.userAns ? escapeHtml(s.userAns + '. ' + (userOpt?.text || '')) : '(tidak dijawab)'}
                </span>
              </div>
              ${!isCorrect ? `
                <div class="pk-review-row">
                  <span class="pk-review-label">Jawaban Benar:</span>
                  <span class="pk-review-val ok">${escapeHtml(s.correct + '. ' + (correctOpt?.text || ''))}</span>
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
            <div class="pk-review-qtext">${escapeHtml(s.qText)}</div>
            ${qImg}
            ${ansBlock}
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
    lastResult = null;
  }

  /* ============================================
     EXPORT PDF
     ============================================ */
  function exportResultPdf() {
    if (!lastResult) {
      DA.toast.error('Tidak ada hasil untuk diexport');
      return;
    }
    if (!window.jspdf && !window.jsPDF) {
      DA.toast.error('Library PDF belum termuat');
      return;
    }

    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const checkPage = (needed = 20) => {
      if (y + needed > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Header
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageW, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Hasil Psikotes', margin, 28);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('DocuApply', margin, 46);
    y = 90;

    // Info paket
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(lastResult.packageName, margin, y);
    y += 20;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    const dateStr = new Date(lastResult.at).toLocaleString('id-ID');
    doc.text(`Tanggal: ${dateStr}`, margin, y);
    y += 14;
    doc.text(`Mode: ${lastResult.mode === 'practice' ? 'Latihan' : 'Ujian'} · Durasi: ${formatDuration(lastResult.duration)}`, margin, y);
    y += 24;

    // Skor box
    doc.setDrawColor(199, 210, 254);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, pageW - margin * 2, 80, 8, 8, 'FD');

    doc.setTextColor(79, 70, 229);
    doc.setFontSize(30);
    doc.setFont(undefined, 'bold');
    doc.text(`${lastResult.score}%`, margin + 20, y + 42);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'normal');
    doc.text('Skor Total', margin + 20, y + 62);

    // Stats kanan
    doc.setFontSize(10);
    const sx = pageW / 2 + 20;
    doc.setTextColor(16, 185, 129);
    doc.text(`Benar: ${lastResult.correct}`, sx, y + 30);
    doc.setTextColor(239, 68, 68);
    doc.text(`Salah: ${lastResult.wrong}`, sx, y + 46);
    doc.setTextColor(100, 116, 139);
    doc.text(`Total Soal Dinilai: ${lastResult.total}`, sx, y + 62);

    y += 110;

    // Ringkasan per bagian
    const bySec = {};
    (lastResult.snapshot || []).forEach((s) => {
      if (!bySec[s.sectionName]) bySec[s.sectionName] = { correct: 0, wrong: 0, total: 0, type: s.sectionType };
      if (s.sectionType === 'kepribadian') return;
      if (s.qType === 'essay') return;
      bySec[s.sectionName].total++;
      if (s.userAns === s.correct) bySec[s.sectionName].correct++;
      else if (s.userAns) bySec[s.sectionName].wrong++;
    });

    const secKeys = Object.keys(bySec);
    if (secKeys.length) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Ringkasan Per Bagian', margin, y);
      y += 18;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      secKeys.forEach((name) => {
        checkPage(20);
        const s = bySec[name];
        doc.setTextColor(51, 65, 85);
        doc.text(name, margin, y);
        const scoreTxt = s.total ? `${s.correct}/${s.total}` : '-';
        doc.text(scoreTxt, pageW - margin, y, { align: 'right' });
        y += 16;
      });
      y += 10;
    }

    // Kepribadian (jika ada)
    if (lastResult.kepribadianCount > 0 && Object.keys(lastResult.traitCounts || {}).length) {
      checkPage(60);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Profil Kepribadian', margin, y);
      y += 18;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const traits = Object.entries(lastResult.traitCounts).sort((a, b) => b[1] - a[1]);
      traits.forEach(([t, c]) => {
        checkPage(18);
        doc.setTextColor(51, 65, 85);
        doc.text(t, margin, y);
        doc.text(String(c), pageW - margin, y, { align: 'right' });
        y += 16;
      });
      y += 10;
    }

    // Review jawaban
    const reviewItems = (lastResult.snapshot || []).filter((s) => s.sectionType !== 'kepribadian');
    if (reviewItems.length) {
      checkPage(30);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Review Jawaban', margin, y);
      y += 18;

      reviewItems.forEach((s, i) => {
        const isEssay = s.qType === 'essay';
        const isCorrect = !isEssay && s.userAns === s.correct;
        const noAns = s.userAns == null || s.userAns === '';

        checkPage(50);

        // Badge
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        if (isEssay) { doc.setTextColor(245, 158, 11); }
        else if (isCorrect) { doc.setTextColor(16, 185, 129); }
        else if (noAns) { doc.setTextColor(148, 163, 184); }
        else { doc.setTextColor(239, 68, 68); }
        const badge = isEssay ? 'ESAI' : isCorrect ? 'BENAR' : noAns ? 'KOSONG' : 'SALAH';
        doc.text(`Soal ${i + 1} · ${badge}`, margin, y);
        y += 14;

        // Question text
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 41, 59);
        const qLines = doc.splitTextToSize(s.qText || '(tanpa teks)', pageW - margin * 2);
        qLines.forEach((ln) => {
          checkPage(14);
          doc.text(ln, margin, y);
          y += 14;
        });

        // Answer
        doc.setFontSize(9);
        if (isEssay) {
          doc.setTextColor(100, 116, 139);
          doc.text('Jawaban Anda:', margin + 10, y);
          y += 12;
          const aLines = doc.splitTextToSize(s.userAns || '(kosong)', pageW - margin * 2 - 20);
          aLines.forEach((ln) => {
            checkPage(12);
            doc.setTextColor(51, 65, 85);
            doc.text(ln, margin + 10, y);
            y += 12;
          });
        } else {
          const userOpt = (s.options || []).find((o) => o.id === s.userAns);
          const correctOpt = (s.options || []).find((o) => o.id === s.correct);
          doc.setTextColor(100, 116, 139);
          doc.text('Jawaban Anda: ', margin + 10, y);
          doc.setTextColor(isCorrect ? 16 : 239, isCorrect ? 185 : 68, isCorrect ? 129 : 68);
          const uTxt = s.userAns ? `${s.userAns}. ${userOpt?.text || ''}` : '(tidak dijawab)';
          doc.text(uTxt, margin + 90, y);
          y += 12;

          if (!isCorrect) {
            checkPage(14);
            doc.setTextColor(100, 116, 139);
            doc.text('Jawaban Benar: ', margin + 10, y);
            doc.setTextColor(16, 185, 129);
            doc.text(`${s.correct}. ${correctOpt?.text || ''}`, margin + 90, y);
            y += 12;
          }
        }
        y += 8;
      });
    }

    // Footer setiap page
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageW / 2, pageH - 20, { align: 'center' });
      doc.text('DocuApply · Hasil Psikotes', margin, pageH - 20);
    }

    const filename = `${lastResult.packageName.replace(/[^a-zA-Z0-9_\s]/g, '_')}_${Date.now()}.pdf`;
    doc.save(filename);
    DA.toast.success('PDF hasil tes berhasil diunduh');
  }

  /* ============================================
     HISTORY VIEW
     ============================================ */
  function showHistory() {
    els.listWrap?.classList.add('hidden');
    els.historyWrap?.classList.remove('hidden');
    renderHistory();
  }

  function hideHistory() {
    els.historyWrap?.classList.add('hidden');
    els.listWrap?.classList.remove('hidden');
  }

  function renderHistory() {
    const history = DA.storage.get(RESULT_KEY, []);
    if (!history.length) {
      els.historyEmpty?.classList.remove('hidden');
      els.historyList && (els.historyList.innerHTML = '');
      els.historyChart && (els.historyChart.innerHTML = '');
      if (els.historyStats) els.historyStats.innerHTML = '';
      return;
    }
    els.historyEmpty?.classList.add('hidden');

    // Stats summary
    const scored = history.filter((h) => h.total > 0);
    const avgScore = scored.length
      ? Math.round(scored.reduce((s, h) => s + h.score, 0) / scored.length)
      : 0;
    const bestScore = scored.length ? Math.max(...scored.map((h) => h.score)) : 0;
    const totalAttempts = history.length;

    if (els.historyStats) {
      els.historyStats.innerHTML = `
        <div class="pk-hist-stat">
          <div class="pk-hist-stat-icon" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);">
            <i class="fa-solid fa-list-check"></i>
          </div>
          <div>
            <div class="pk-hist-stat-num">${totalAttempts}</div>
            <div class="pk-hist-stat-label">Total Percobaan</div>
          </div>
        </div>
        <div class="pk-hist-stat">
          <div class="pk-hist-stat-icon" style="background:linear-gradient(135deg,#10b981,#059669);">
            <i class="fa-solid fa-trophy"></i>
          </div>
          <div>
            <div class="pk-hist-stat-num">${bestScore}%</div>
            <div class="pk-hist-stat-label">Skor Terbaik</div>
          </div>
        </div>
        <div class="pk-hist-stat">
          <div class="pk-hist-stat-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
            <i class="fa-solid fa-chart-line"></i>
          </div>
          <div>
            <div class="pk-hist-stat-num">${avgScore}%</div>
            <div class="pk-hist-stat-label">Rata-rata</div>
          </div>
        </div>
      `;
    }

    // Chart
    renderHistoryChart(history);

    // List
    if (els.historyList) {
      els.historyList.innerHTML = history.map((h) => {
        const date = new Date(h.at).toLocaleDateString('id-ID', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const modeBadge = h.mode === 'practice'
          ? '<span class="pk-hist-mode practice"><i class="fa-solid fa-graduation-cap"></i> Latihan</span>'
          : '<span class="pk-hist-mode exam"><i class="fa-solid fa-stopwatch"></i> Ujian</span>';
        const scoreColor = h.total === 0 ? '#8b5cf6'
          : h.score >= 80 ? '#10b981'
          : h.score >= 60 ? '#f59e0b'
          : '#ef4444';
        return `
          <div class="pk-hist-item" data-id="${h.id}">
            <div class="pk-hist-item-left">
              <div class="pk-hist-item-score" style="color:${scoreColor}">
                ${h.total > 0 ? h.score + '%' : '<i class="fa-solid fa-user-astronaut"></i>'}
              </div>
              <div class="pk-hist-item-info">
                <div class="pk-hist-item-title">${escapeHtml(h.packageName)}</div>
                <div class="pk-hist-item-meta">
                  ${modeBadge}
                  <span><i class="fa-solid fa-clock text-[9px]"></i> ${formatDuration(h.duration)}</span>
                  <span><i class="fa-solid fa-calendar text-[9px]"></i> ${date}</span>
                </div>
                ${h.total > 0 ? `
                  <div class="pk-hist-item-counts">
                    <span class="ok"><i class="fa-solid fa-check"></i> ${h.correct}</span>
                    <span class="bad"><i class="fa-solid fa-xmark"></i> ${h.wrong}</span>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="pk-hist-item-actions">
              <button class="pk-hist-act-btn" data-view="${h.id}" title="Lihat detail">
                <i class="fa-solid fa-eye"></i>
              </button>
              <button class="pk-hist-act-btn danger" data-del="${h.id}" title="Hapus">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>`;
      }).join('');

      // Bind
      els.historyList.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => viewHistoryItem(btn.dataset.view));
      });
      els.historyList.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => deleteHistoryItem(btn.dataset.del));
      });
    }
  }

  function renderHistoryChart(history) {
    if (!els.historyChart) return;
    // Ambil max 15 attempt terakhir dengan skor
    const scored = history.filter((h) => h.total > 0).slice(0, 15).reverse();
    if (scored.length < 2) {
      els.historyChart.innerHTML = `
        <div class="pk-chart-empty">
          <i class="fa-solid fa-chart-line"></i>
          <div>Butuh minimal 2 hasil untuk menampilkan grafik</div>
        </div>`;
      return;
    }

    const W = 640, H = 180;
    const pad = { l: 40, r: 15, t: 20, b: 30 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;

    const points = scored.map((h, i) => {
      const x = pad.l + (i / (scored.length - 1)) * innerW;
      const y = pad.t + innerH - (h.score / 100) * innerH;
      return { x, y, score: h.score, name: h.packageName, at: h.at };
    });

    // Grid lines
    let gridSvg = '';
    [0, 25, 50, 75, 100].forEach((v) => {
      const gy = pad.t + innerH - (v / 100) * innerH;
      gridSvg += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${v === 0 || v === 100 ? '0' : '3,3'}"/>`;
      gridSvg += `<text x="${pad.l - 6}" y="${gy + 3}" font-size="9" fill="#94a3b8" text-anchor="end">${v}%</text>`;
    });

    // Line path
    let linePath = '';
    points.forEach((p, i) => {
      linePath += i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`;
    });

    // Area path
    const areaPath = linePath +
      ` L ${points[points.length - 1].x} ${pad.t + innerH}` +
      ` L ${points[0].x} ${pad.t + innerH} Z`;

    // Dots
    let dotsSvg = '';
    points.forEach((p) => {
      dotsSvg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#fff" stroke="#6366f1" stroke-width="2"><title>${p.score}%</title></circle>`;
    });

    els.historyChart.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="pk-chart-svg">
        <defs>
          <linearGradient id="pkAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridSvg}
        <path d="${areaPath}" fill="url(#pkAreaGrad)"/>
        <path d="${linePath}" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dotsSvg}
      </svg>`;
  }

  function viewHistoryItem(id) {
    const history = DA.storage.get(RESULT_KEY, []);
    const item = history.find((h) => h.id === id);
    if (!item) return;
    lastResult = item;
    showResults(item);
  }

  function deleteHistoryItem(id) {
    if (!DA.confirm('Hapus hasil ini dari riwayat?')) return;
    const history = DA.storage.get(RESULT_KEY, []);
    const filtered = history.filter((h) => h.id !== id);
    DA.storage.set(RESULT_KEY, filtered);
    renderHistory();
    DA.toast.info('Riwayat dihapus');
  }

  function clearHistory() {
    if (!DA.confirm('Hapus SEMUA riwayat hasil tes? Tindakan ini tidak bisa dibatalkan.')) return;
    DA.storage.set(RESULT_KEY, []);
    renderHistory();
    DA.toast.success('Riwayat dibersihkan');
  }

  /* ============================================
     WORKSHEET (dipertahankan dari versi sebelumnya)
     ============================================ */
  function openWorksheet(pkg, section) {
    activeWorksheet = section;
    currentWorksheetIdx = 0;
    closeStartModal();

    els.listWrap?.classList.add('hidden');
    els.historyWrap?.classList.add('hidden');
    els.testWrap?.classList.add('hidden');
    els.resultWrap?.classList.add('hidden');
    els.wsWrap?.classList.remove('hidden');

    if (els.wsTitle) els.wsTitle.textContent = section.name;
    if (els.wsSubtitle) els.wsSubtitle.textContent = pkg.name;

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
        renderWorksheetPage(Number(btn.dataset.wsPage));
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

    els.wsThumbs?.querySelectorAll('.pk-ws-thumb').forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });

    applyWorksheetZoom(1);
  }

  function closeWorksheet() {
    els.wsWrap?.classList.add('hidden');
    els.listWrap?.classList.remove('hidden');
    document.body.style.overflow = '';
    activeWorksheet = null;
  }

  function applyWorksheetZoom(z) {
    wsZoom = Math.max(0.5, Math.min(3, z));
    const img = els.wsStage?.querySelector('.pk-ws-page img');
    if (img) img.style.transform = `scale(${wsZoom})`;
  }

  function printWorksheet() {
    if (!activeWorksheet) return;
    const sec = activeWorksheet;
    const questions = sec.questions || [];
    const title = sec.name || 'Worksheet';

    const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .ws-toolbar{position:sticky;top:0;z-index:999;background:#1e293b;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,0.25);}
  .ws-toolbar-info{flex:1;min-width:0;}
  .ws-toolbar-title{font-size:14px;font-weight:700;}
  .ws-toolbar-hint{font-size:11px;opacity:0.85;margin-top:2px;}
  .ws-print-btn{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:none;padding:11px 20px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(79,70,229,0.45);}
  .ws-paper-wrapper{padding:20px 12px 40px;display:flex;flex-direction:column;align-items:center;gap:16px;}
  .ws-page-card{width:100%;max-width:21cm;background:#fff;padding:1.2cm;box-shadow:0 4px 32px rgba(15,23,42,0.18);border-radius:6px;}
  .ws-page-title{font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #cbd5e1;}
  .ws-page-img{width:100%;height:auto;display:block;border-radius:4px;}
  .ws-page-notes{font-size:11px;color:#64748b;margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #6366f1;}
  @media print{@page{size:A4;margin:0;}html,body{background:#fff !important;}.ws-toolbar{display:none !important;}.ws-paper-wrapper{padding:0 !important;gap:0 !important;}.ws-page-card{box-shadow:none !important;padding:0.8cm !important;border-radius:0 !important;max-width:none !important;page-break-after:always;}.ws-page-card:last-child{page-break-after:auto;}}
</style></head><body>
<div class="ws-toolbar">
  <div class="ws-toolbar-info">
    <div class="ws-toolbar-title">📄 ${escapeHtml(title)}</div>
    <div class="ws-toolbar-hint">Tap <strong>Print / Save as PDF</strong> untuk mencetak.</div>
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
<script>(function(){var d=!/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);if(d){setTimeout(function(){try{window.print();}catch(e){}},600);}})();<\/script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      DA.toast.warn('Popup diblokir. Membuka tab yang sama...', 3000);
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
      if (DA.confirm('Keluar dari tes? Semua jawaban akan hilang.')) exitTestUI();
    });

    els.resultClose?.addEventListener('click', closeResults);
    els.resultPdf?.addEventListener('click', exportResultPdf);

    // Worksheet
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

    // History
    els.historyBtn?.addEventListener('click', showHistory);
    els.historyBack?.addEventListener('click', hideHistory);
    els.historyClear?.addEventListener('click', clearHistory);

    window.addEventListener('beforeunload', (e) => {
      const testActive = activeSession && els.testWrap && !els.testWrap.classList.contains('hidden');
      if (testActive) { e.preventDefault(); e.returnValue = ''; }
    });

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
