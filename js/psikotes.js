/* =====================================================
   DocuApply — Psikotes (User Side)
   Browse paket → Mulai → Kerjakan → Submit → Hasil
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
  };

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
      resultWrap:   document.getElementById('pkResultWrap'),
      // Modal start
      startModal:   document.getElementById('pkStartModal'),
      startBackdrop: document.getElementById('pkStartBackdrop'),
      startTitle:   document.getElementById('pkStartTitle'),
      startDesc:    document.getElementById('pkStartDesc'),
      startInfo:    document.getElementById('pkStartInfo'),
      startBtn:     document.getElementById('pkStartConfirm'),
      cancelBtn:    document.getElementById('pkStartCancel'),
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
      const totalQ = (pkg.sections || []).reduce((s, sec) => s + (sec.questions?.length || 0), 0);
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
          <span><i class="fa-solid fa-list-check text-[10px]"></i> ${pkg.sections?.length || 0} bagian</span>
          <span><i class="fa-solid fa-circle-question text-[10px]"></i> ${totalQ} soal</span>
        </div>
        <div class="pk-card-footer">
          <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Mulai <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </span>
        </div>
      `;
      card.addEventListener('click', () => openStartModal(pkg));
      els.list.appendChild(card);
    });
  }

  /* ============================================
     START MODAL
     ============================================ */
  function openStartModal(pkg) {
    activeSession = { pkg, mode: 'confirm' };
    const totalQ = (pkg.sections || []).reduce((s, sec) => s + (sec.questions?.length || 0), 0);
    if (els.startTitle) els.startTitle.textContent = pkg.name;
    if (els.startDesc) els.startDesc.textContent = pkg.description || '';
    if (els.startInfo) {
      els.startInfo.innerHTML = `
        <div class="pk-info-item">
          <i class="fa-solid fa-clock text-indigo-500"></i>
          <span>Durasi: <strong>${pkg.duration || 0} menit</strong></span>
        </div>
        <div class="pk-info-item">
          <i class="fa-solid fa-list-check text-indigo-500"></i>
          <span>${pkg.sections?.length || 0} bagian tes</span>
        </div>
        <div class="pk-info-item">
          <i class="fa-solid fa-circle-question text-indigo-500"></i>
          <span>${totalQ} soal total</span>
        </div>
        <div class="pk-info-warn">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Setelah mulai, Anda harus menyelesaikan tes. Waktu akan berjalan.</span>
        </div>
      `;
    }
    els.startModal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeStartModal() {
    els.startModal?.classList.add('hidden');
    document.body.style.overflow = '';
    activeSession = null;
  }

  /* ============================================
     START TEST
     ============================================ */
  function startTest() {
    if (!activeSession?.pkg) return;
    const pkg = activeSession.pkg;
    closeStartModal();

    // Build session
    activeSession = {
      pkg,
      startedAt: Date.now(),
      timeLeft: (pkg.duration || 0) * 60,
      currentIdx: 0,
      // Flatten questions: array of { section, question, answer }
      flatQuestions: [],
      answers: {},
    };

    (pkg.sections || []).forEach((sec) => {
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

    // Bind option clicks
    els.testQuestion.querySelectorAll('.pk-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSession.answers[question.id] = btn.dataset.opt;
        els.testQuestion.querySelectorAll('.pk-option').forEach((b) =>
          b.classList.toggle('selected', b === btn)
        );
        updateNavGrid();
      });
    });

    // Essay input
    const essay = els.testQuestion.querySelector('#pkEssayInput');
    essay?.addEventListener('input', () => {
      activeSession.answers[question.id] = essay.value;
      updateNavGrid();
    });

    // Nav buttons
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

    // Score
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

    // Save result history
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

    // Review
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
     EVENTS
     ============================================ */
  function bindEvents() {
    els.cancelBtn?.addEventListener('click', closeStartModal);
    els.startClose?.addEventListener('click', closeStartModal);
    els.startBackdrop?.addEventListener('click', closeStartModal);
    els.startBtn?.addEventListener('click', startTest);

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

    // Warn before unload saat tes aktif
    window.addEventListener('beforeunload', (e) => {
      if (activeSession && els.testWrap && !els.testWrap.classList.contains('hidden')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  return { init, reload: loadData };
})();
