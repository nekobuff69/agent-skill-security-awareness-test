(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function byId(id) { return document.getElementById(id); }

  // Chrome String lookup, resolved at render time.
  function t(id, vars) {
    return app.I18n.t(id, vars);
  }

  function makeEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /**
   * Every animation in this module (beats, wipes, scroll) is instant under
   * prefers-reduced-motion — checked at call time, not cached.
   */
  function reducedMotion() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Timing beats (ADR 0020). The 200ms tap beat and the 400ms 100% hold
     before hand-off are the designed ones from the original quiz; the
     wipe runs inside them. */
  var ADVANCE_BEAT_MS = 200;
  var FINISH_BEAT_MS  = 400;
  var WIPE_MS         = 160;

  /* ── Quiz state ──────────────────────────────────────────────────── */

  var bank       = null;
  var questions  = [];   // bank.questions (flat)
  var phases     = [];   // bank.phases
  var answers    = [];   // length = questions.length, null | 0-3
  var currentIdx = 0;
  var activeBtns = [];   // DOM refs for current question's radio rows
  var currentCard = null; // current visible question card DOM element
  var advancing   = false; // true during a post-answer beat
  var swapPending = false; // true while a wipe swap is queued
  var backBtnEl   = null; // current Back control ref (absent on Q1)
  var finishBtnEl = null; // current [Finish] control ref (last card only)

  // The single-fire commit gate: the [Finish] click is the ONLY path to
  // Completion (ADR 0020) — the wizard-navigation module owns the guard.
  var commitGate  = app.WizardNav.createCommitGate();

  // Chrome bar DOM refs (built once in renderQuiz)
  var chromeFill    = null;
  var chromeCounter = null;
  var chromeChip    = null;

  /* ── Chrome bar: progress + counter + phase chip ─────────────────── */

  function updateChrome() {
    if (!chromeFill || !chromeCounter || !chromeChip) return;

    // Fill: answered / total
    var answered = 0;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] !== null) answered++;
    }
    var pct = (answered / questions.length) * 100;
    chromeFill.style.width = pct + '%';

    // Counter: 1-indexed question currently being viewed
    chromeCounter.textContent = (currentIdx + 1) + ' / ' + questions.length;

    // Phase chip: swap text in place — never append
    var q = questions[currentIdx];
    var data = null;
    for (var p = 0; p < phases.length; p++) {
      if (phases[p].id === q.phase) { data = phases[p]; break; }
    }
    var chipNum = '?';
    for (var c = 0; c < phases.length; c++) {
      if (phases[c].id === q.phase) { chipNum = c + 1; break; }
    }
    if (data) {
      chromeChip.textContent = t('quiz.phaseChip', { number: chipNum, title: data.title });
    }
  }

  /* ── Render one question card ────────────────────────────────────── */

  function renderQuestion(idx) {
    // Bounds are WizardNav's contract (next/prev clamp); Completion never
    // happens here — only the [Finish] click commits (ADR 0020).
    if (idx < 0) idx = 0;
    if (idx >= questions.length) idx = questions.length - 1;

    currentIdx = idx;
    advancing = false;
    swapPending = false;
    var q = questions[idx];
    var view = byId('quiz-view');
    if (!view) return;

    updateChrome();

    // Remove previous card
    if (currentCard && currentCard.parentNode) {
      currentCard.parentNode.removeChild(currentCard);
    }

    // Card container
    var card = makeEl('div', 'quiz-card');
    card.setAttribute('data-qid', q.id);

    // ── Card header: question-number chip ──
    var cardHeader = makeEl('div', 'quiz-card-header');
    var numChip = makeEl('span', 'quiz-number-chip', t('quiz.questionChip', { number: idx + 1 }));
    cardHeader.appendChild(numChip);
    card.appendChild(cardHeader);

    // ── Scenario block with micro-label ──
    if (q.scenario) {
      card.appendChild(makeEl('span', 'quiz-label', t('quiz.labelScenario')));
      card.appendChild(makeEl('p', 'quiz-scenario', q.scenario));
    }

    // ── Question block with micro-label ──
    card.appendChild(makeEl('span', 'quiz-label', t('quiz.labelQuestion')));
    card.appendChild(makeEl('p', 'quiz-question', q.question));

    // ── Radio group: one radio row per Option ──
    // role=radiogroup + role=radio rows: whole row is the tap target,
    // arrows move between Options, space/enter marks (ADR 0020). The
    // one-Option-per-Question invariant (ADR 0017) reads straight off
    // aria-checked — exactly one row is true.
    var optsWrap = makeEl('div', 'quiz-options');
    optsWrap.setAttribute('role', 'radiogroup');
    optsWrap.setAttribute('aria-label', t('quiz.labelQuestion'));
    activeBtns = [];
    var LETTERS = 'ABCD';

    for (var i = 0; i < q.options.length; i++) {
      /* jshint loopfunc:true */
      (function(optIdx) {
        var btn = makeEl('button', 'quiz-radio-row');
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('data-qid', q.id);
        btn.setAttribute('data-opt', String(optIdx));
        btn.setAttribute('aria-checked', answers[idx] === optIdx ? 'true' : 'false');

        // Etched dial glyph — the black dot is CSS-drawn (css/quiz.css).
        btn.appendChild(makeEl('span', 'quiz-radio-mark'));
        var badge = makeEl('span', 'quiz-letter-badge', LETTERS[optIdx]);
        var label = makeEl('span', 'quiz-option-text', q.options[optIdx].text);
        btn.appendChild(badge);
        btn.appendChild(label);

        btn.addEventListener('click', function() {
          onOptionClick(idx, optIdx);
        });

        // Arrow keys move between Options like a native radio group;
        // space/enter marks through the normal click path.
        btn.addEventListener('keydown', function(ev) {
          var k = ev.key;
          if (k !== 'ArrowDown' && k !== 'ArrowRight' &&
              k !== 'ArrowUp' && k !== 'ArrowLeft') return;
          ev.preventDefault();
          var step = (k === 'ArrowDown' || k === 'ArrowRight') ? 1 : -1;
          var n = (optIdx + step + q.options.length) % q.options.length;
          activeBtns[n].focus();
        });

        activeBtns.push(btn);
        optsWrap.appendChild(btn);
      })(i);
    }

    card.appendChild(optsWrap);

    // ── Wizard button row: [< Back] [Next >], [Finish] on the last card ──
    var navRow = makeEl('div', 'quiz-wizard-row');

    if (idx > 0) {
      var backBtn = makeEl('button', 'quiz-wizard-btn', t('wizard.back'));
      backBtn.type = 'button';
      backBtn.addEventListener('click', function() {
        gotoQuestion(app.WizardNav.prev(questions.length, idx).index);
      });
      navRow.appendChild(backBtn);
      backBtnEl = backBtn;
    } else {
      backBtnEl = null;
    }

    if (app.WizardNav.isLast(questions.length, idx)) {
      // [Finish] replaces [Next] and is enabled iff every Question has an
      // Option selected. It is the only path to Completion (ADR 0020).
      var finishBtn = makeEl('button', 'quiz-wizard-btn quiz-finish-btn', t('wizard.finish'));
      finishBtn.type = 'button';
      if (!app.WizardNav.canFinish(answers)) finishBtn.disabled = true;
      finishBtn.addEventListener('click', function() {
        finishQuiz();
      });
      navRow.appendChild(finishBtn);
      finishBtnEl = finishBtn;
    } else {
      var nextBtn = makeEl('button', 'quiz-wizard-btn', t('wizard.next'));
      nextBtn.type = 'button';
      nextBtn.addEventListener('click', function() {
        gotoQuestion(app.WizardNav.next(questions.length, idx).index);
      });
      navRow.appendChild(nextBtn);
      finishBtnEl = null;
    }

    card.appendChild(navRow);

    view.appendChild(card);
    currentCard = card;

    // Client-area wipe-in (ADR 0020); instant under reduced motion.
    if (!reducedMotion()) {
      card.classList.add('card-wipe-in');
    }

    // Scroll so the card is visible; instant behavior under reduced motion
    // — the media query alone does not cover scrolling.
    card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });

    // Keyboard continuity: the fresh card takes focus (the dotted focus
    // rectangle only paints for :focus-visible, so pointer users never see
    // it), so the next Tab/Enter lands on an Option, not the page body.
    if (activeBtns.length > 0) activeBtns[0].focus();
  }

  /* ── Card swap: the client-area wipe (ADR 0020) ───────────────────── */

  function gotoQuestion(idx) {
    if (swapPending) return;

    var target = idx < 0 ? 0 : idx;
    if (target > questions.length - 1) target = questions.length - 1;
    if (target === currentIdx) return;

    if (reducedMotion() || !currentCard) {
      renderQuestion(target);
      return;
    }

    swapPending = true;
    currentCard.classList.add('card-wipe-out');
    setTimeout(function() {
      // renderQuestion removes the old card and clears swapPending.
      renderQuestion(target);
    }, WIPE_MS);
  }

  /* ── Mirror answers into the radio rows ───────────────────────────── */

  function syncOptionRows(optIdx) {
    for (var i = 0; i < activeBtns.length; i++) {
      activeBtns[i].setAttribute('aria-checked', i === optIdx ? 'true' : 'false');
    }
  }

  /* ── Option tap → record + advance (first time), re-mark (revisit) ── */

  function onOptionClick(qIdx, optIdx) {
    // Ignore taps while a beat is running
    if (advancing) return;

    // Same pick re-tapped: nothing to record, nothing to move
    if (answers[qIdx] === optIdx) return;

    var decision = app.WizardNav.tapOption(answers, qIdx, optIdx);

    // Record the pick — one Option per Question, overwritten in place
    // (ADR 0017); the Session save stays silent.
    answers[qIdx] = decision.answer;
    persist();
    updateChrome();
    syncOptionRows(decision.answer);

    // System sound (ticket #41): a mark is a mark — first fill and
    // re-mark on a revisit both tick; a same-pick re-tap returned above.
    if (app.Sound) app.Sound.play('click');

    if (decision.action === 'stay') {
      // Re-mark on a revisit, or the first fill of the last Question.
      // Either way the card does not move — picks are free until commit.
      if (decision.finishReady) {
        // The Progress Fill just hit 100%: enable [Finish], hold the
        // designed beat, then focus it. Completion stays the click.
        if (finishBtnEl) {
          finishBtnEl.disabled = false;
          advancing = true;
          var finishBtn = finishBtnEl;
          setTimeout(function() {
            advancing = false;
            // Identity guard: the Participant may have moved on already.
            if (finishBtn === finishBtnEl) finishBtn.focus();
          }, reducedMotion() ? 0 : FINISH_BEAT_MS);
        }
      }
      return;
    }

    // First answer: the designed beat, then the client-area wipe.
    advancing = true;
    setTimeout(function() {
      gotoQuestion(app.WizardNav.next(questions.length, qIdx).index);
    }, reducedMotion() ? 0 : ADVANCE_BEAT_MS);
  }

  /* ── Persistence wrapper ─────────────────────────────────────────── */

  function persist() {
    if (!bank) return;
    app.SessionStore.save(bank, answers);
  }

  /* ── Quiz completion ─────────────────────────────────────────────── */

  function finishQuiz() {
    // The single Completion path: the [Finish] click, gated once per
    // Session so a double click cannot score or hand off twice (ADR 0020).
    var verdict = commitGate.fire(answers);
    if (!verdict.ok) return;

    var result = app.Scoring.computeScores(bank, answers);
    if (!result || !result.ok) {
      // Nothing to hand off — unlock the gate so the Participant can retry.
      commitGate.reset();
      return;
    }

    global.Analytics.track(verdict.event); // 'quiz_completed'

    // The Progress Fill holds at 100% for the designed beat before the
    // hand-off — the "it really ended" signal (spec #36).
    setTimeout(function() {
      // Hand off to results view (App.renderResults, defined by results.js)
      if (app.renderResults) {
        app.renderResults(bank, result.report);
      }
    }, reducedMotion() ? 0 : FINISH_BEAT_MS);
  }

  /* ── Non-blocking notice ─────────────────────────────────────────── */

  function showNotice(text) {
    var view = byId('quiz-view');
    if (!view) return;

    var n = makeEl('div', 'quiz-notice', text);
    view.appendChild(n);

    // System sound (ticket #41): the low buzz marks the banner's arrival.
    if (app.Sound) app.Sound.play('buzz');
    setTimeout(function() {
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 4000);
  }

  /* ── The Quiz Chrome: progress + counter + phase chip ─────────────── */

  /* Built in place inside the given view — shared by the fresh run
     (renderQuiz) and the in-place re-render (rerenderQuiz) so both paint
     the identical chrome structure. */
  function buildChrome(view) {
    // ── Sticky chrome bar: progress + counter + phase chip ──
    var chrome = makeEl('div', 'quiz-chrome');

    // Progress track + fill
    var track = makeEl('div', 'quiz-chrome-track');
    chromeFill = makeEl('div', 'quiz-chrome-fill');
    track.appendChild(chromeFill);
    chrome.appendChild(track);

    // Counter: "N / 20"
    chromeCounter = makeEl('span', 'quiz-chrome-counter');
    chrome.appendChild(chromeCounter);

    // Phase chip: "Phase 1 · Should I Install This?"
    chromeChip = makeEl('span', 'quiz-chrome-chip');
    chrome.appendChild(chromeChip);

    view.appendChild(chrome);
  }

  /* ── renderQuiz (public) ─────────────────────────────────────────── */

  function renderQuiz(b) {
    bank      = b;
    questions = bank.questions;
    phases    = bank.phases;
    answers   = [];
    activeBtns = [];
    currentCard = null;
    advancing   = false;
    swapPending = false;
    backBtnEl   = null;
    finishBtnEl = null;
    commitGate.reset();   // a new run is a new commit opportunity
    chromeFill = null;
    chromeCounter = null;
    chromeChip = null;

    var view = byId('quiz-view');
    if (!view) return;
    view.innerHTML = '';

    buildChrome(view);

    // Session resume — one Session per Participant, shared by every Bank
    // Variant, so a Participant who switches language mid-assessment returns
    // to their answers intact.
    var session = app.SessionStore.load(bank);
    if (session.ok) {
      answers = session.answers.slice();
    } else {
      for (var i = 0; i < questions.length; i++) answers.push(null);
      if (session.reason === 'stale') {
        showNotice(t('quiz.bankChanged'));
        app.SessionStore.clear();
      }
    }

    // Resume at the first unanswered Question; a fully answered Session
    // resumes on the last Question with [Finish] live — Completion is the
    // Participant's commit, never automatic (ADR 0020).
    var startIdx = 0;
    for (var j = 0; j < answers.length; j++) {
      if (answers[j] === null) { startIdx = j; break; }
      if (j === answers.length - 1) startIdx = answers.length - 1;
    }

    renderQuestion(startIdx);
  }

  /* ── renderLanding (public) ──────────────────────────────────────── */

  function renderLanding(b) {
    var meta = b && b.meta;
    var landing = byId('landing-view');
    if (!landing) return;
    landing.innerHTML = '';

    // A Participant who arrived in a language they may not read gets one
    // dismissible offer of the other, ahead of everything else on the page.
    if (app.LangRouting && typeof app.LangRouting.offerInto === 'function') {
      app.LangRouting.offerInto(landing);
    }

    landing.appendChild(makeEl('h1', null, meta.title || t('landing.titleFallback')));
    landing.appendChild(makeEl('p', 'subtitle', meta.subtitle || t('landing.subtitleFallback')));
    landing.appendChild(makeEl('p', 'meta', t('landing.meta', {
      count: meta.total_questions || t('landing.metaCountFallback'),
      time: meta.time_estimate || t('landing.timeFallback')
    })));

    var btn = makeEl('button', 'btn-primary', t('landing.start'));
    btn.id = 'start-btn';
    btn.addEventListener('click', function() {
      global.Analytics.track('quiz_started');
      app.showView('quiz-view');
      renderQuiz(b);
    });
    landing.appendChild(btn);
  }


  /* ── re-render seam (issue #48) ───────────────────────────────────── */

  /**
   * Snapshot of the answering view's live state: the Question Bank it is
   * rendering from, the Question being viewed, and every recorded answer.
   * A caller that wants to rebuild this view in place (a Bank Variant
   * swap, a locale change) hands these three back to rerenderQuiz
   * untouched. Returns null before the quiz has rendered at all.
   */
  function quizState() {
    if (!bank) return null;
    return { bank: bank, currentIdx: currentIdx, answers: answers.slice() };
  }

  /**
   * Re-render the answering view from explicit state — the in-place
   * rebuild seam (issue #48). The current Question and every recorded
   * answer come back exactly as passed: no Session reload, no
   * "first unanswered" search, and no commit-gate reset — a re-render is
   * not a new run, and the recorded answers were already persisted pick
   * by pick. Chrome Strings re-resolve at render time, so the same call
   * rebuilds the screen in another language (ADR 0015).
   */
  function rerenderQuiz(b, qIndex, recordedAnswers) {
    bank      = b;
    questions = bank.questions;
    phases    = bank.phases;
    activeBtns = [];
    currentCard = null;
    advancing   = false;
    swapPending = false;
    backBtnEl   = null;
    finishBtnEl = null;
    chromeFill = null;
    chromeCounter = null;
    chromeChip = null;
    answers = Array.isArray(recordedAnswers) ? recordedAnswers.slice() : [];

    var view = byId('quiz-view');
    if (!view) return;
    view.innerHTML = '';

    buildChrome(view);
    // Bounds are WizardNav's contract — the same clamp renderQuestion uses.
    renderQuestion(qIndex);
  }

  /* ── Exports ─────────────────────────────────────────────────────── */

  app.renderQuiz    = renderQuiz;
  app.renderLanding = renderLanding;
  app.rerenderQuiz  = rerenderQuiz;
  app.quizState     = quizState;

})(globalThis);
