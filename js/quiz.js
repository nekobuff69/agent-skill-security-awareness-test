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

  // The single-fire commit gate: the [Finish] click is the ONLY path to
  // Completion (ADR 0020) — the wizard-navigation module owns the guard.
  var commitGate  = app.WizardNav.createCommitGate();

  // Pinned quiz-view DOM refs (built once per renderQuiz, ticket #52):
  // the scroll body, the footer's three wizard buttons, and the status
  // bar's three panes.
  var quizBody      = null;
  var footerBack    = null;
  var footerNext    = null;
  var footerFinish  = null;
  var statusFill    = null;
  var statusCounter = null;
  var statusPhase   = null;

  /* ── Status bar: phase + Progress Fill + Question Counter ───────────── */

  function updateStatusBar() {
    if (!statusFill || !statusCounter || !statusPhase) return;

    // Fill: answered / total (never position).
    var answered = 0;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] !== null) answered++;
    }
    var pct = (answered / questions.length) * 100;
    statusFill.style.width = pct + '%';

    // Counter: 1-indexed question currently being viewed.
    statusCounter.textContent = (currentIdx + 1) + ' / ' + questions.length;

    // Phase: swap text in place — never append.
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
      statusPhase.textContent = t('quiz.phaseChip', { number: chipNum, title: data.title });
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
    if (!view || !quizBody) return;

    updateStatusBar();

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

    // ── Pinned window footer (ticket #52): the wizard actions live in
    //    .quiz-footer, built once per run (buildView); only their state
    //    changes per card — Back disabled on the first Question, [Next]
    //    hidden on the last, [Finish] enabled only when every Question
    //    has an Option selected (the single path to Completion, ADR 0020).
    footerBack.disabled = (idx === 0);
    footerNext.hidden = app.WizardNav.isLast(questions.length, idx);
    footerFinish.disabled = !(app.WizardNav.isLast(questions.length, idx) &&
                              app.WizardNav.canFinish(answers));

    quizBody.appendChild(card);
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
    updateStatusBar();
    syncOptionRows(decision.answer);

    // System sound (ticket #41): a mark is a mark — first fill and
    // re-mark on a revisit both tick; a same-pick re-tap returned above.
    if (app.Sound) app.Sound.play('click');

    if (decision.action === 'stay') {
      // Re-mark on a revisit, or the first fill of the last Question.
      // Either way the card does not move — picks are free until commit.
      if (decision.finishReady) {
        // The Progress Fill just hit 100%: enable [Finish] iff every
        // Question now has an Option selected (ADR 0020), hold the
        // designed beat, then focus it. Completion stays the click.
        if (footerFinish) {
          footerFinish.disabled = !app.WizardNav.canFinish(answers);
          if (!footerFinish.disabled) {
            advancing = true;
            setTimeout(function() {
              advancing = false;
              footerFinish.focus();
            }, reducedMotion() ? 0 : FINISH_BEAT_MS);
          }
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
    // Inside the scroll body, above the card (ticket #52).
    if (quizBody) quizBody.insertBefore(n, quizBody.firstChild);
    else view.appendChild(n);

    // System sound (ticket #41): the low buzz marks the banner's arrival.
    if (app.Sound) app.Sound.play('buzz');
    setTimeout(function() {
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 4000);
  }

  /* ── View scaffolding (ticket #52) ────────────────────────────────────

     Built once per renderQuiz and reused across every card swap: a
     scrollable .quiz-body, a pinned .quiz-footer carrying the three
     wizard actions, and a .quiz-statusbar whose panes update in place
     (phase left; segmented fill + counter right). The status bar lives
     inside #quiz-view, so it exists only while the answering screen is
     shown. */

  function buildView(view) {
    quizBody = makeEl('div', 'quiz-body');
    view.appendChild(quizBody);

    var footer = makeEl('div', 'quiz-footer');

    footerBack = makeEl('button', 'quiz-wizard-btn', t('wizard.back'));
    footerBack.type = 'button';
    footerBack.disabled = true;   // until renderQuestion proves otherwise
    footerBack.addEventListener('click', function() {
      gotoQuestion(app.WizardNav.prev(questions.length, currentIdx).index);
    });
    footer.appendChild(footerBack);

    footerNext = makeEl('button', 'quiz-wizard-btn', t('wizard.next'));
    footerNext.type = 'button';
    footerNext.addEventListener('click', function() {
      gotoQuestion(app.WizardNav.next(questions.length, currentIdx).index);
    });
    footer.appendChild(footerNext);

    footerFinish = makeEl('button', 'quiz-wizard-btn quiz-finish-btn', t('wizard.finish'));
    footerFinish.type = 'button';
    footerFinish.disabled = true;
    footerFinish.addEventListener('click', function() {
      finishQuiz();
    });
    footer.appendChild(footerFinish);

    view.appendChild(footer);

    var statusbar = makeEl('div', 'quiz-statusbar');

    statusPhase = makeEl('div', 'quiz-status-field quiz-status-phase');
    statusbar.appendChild(statusPhase);

    var progress = makeEl('div', 'quiz-status-field quiz-status-progress');
    var track = makeEl('div', 'quiz-status-track');
    statusFill = makeEl('div', 'quiz-status-fill');
    track.appendChild(statusFill);
    progress.appendChild(track);

    statusCounter = makeEl('span', 'quiz-status-counter');
    progress.appendChild(statusCounter);
    statusbar.appendChild(progress);

    view.appendChild(statusbar);
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
    commitGate.reset();   // a new run is a new commit opportunity
    quizBody      = null;
    footerBack    = null;
    footerNext    = null;
    footerFinish  = null;
    statusFill    = null;
    statusCounter = null;
    statusPhase   = null;

    var view = byId('quiz-view');
    if (!view) return;
    view.innerHTML = '';

    // ── Pinned view: body + footer + status bar (ticket #52) ──
    buildView(view);

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


  /* ── Exports ─────────────────────────────────────────────────────── */

  app.renderQuiz    = renderQuiz;
  app.renderLanding = renderLanding;

})(globalThis);
