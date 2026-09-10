(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function byId(id) { return document.getElementById(id); }

  function makeEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /* ── Quiz state ──────────────────────────────────────────────────── */

  var bank       = null;
  var questions  = [];   // bank.questions (flat)
  var phases     = [];   // bank.phases
  var answers    = [];   // length = questions.length, null | 0-3
  var currentIdx = 0;
  var activeBtns = [];   // DOM refs for current question's option buttons
  var lastPhase  = '';   // tracks last-rendered phase header id
  var currentCard = null; // current visible question card DOM element
  var advancing   = false; // true during the 180ms post-answer delay

  /* ── Progress indicator ──────────────────────────────────────────── */

  function updateProgress() {
    var prog = byId('quiz-progress');
    if (!prog) return;
    var n = 0;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] !== null) n++;
    }
    prog.textContent = n + ' / ' + questions.length;
  }

  /* ── Phase header ────────────────────────────────────────────────── */

  function ensurePhaseHeader(phaseId, container) {
    if (phaseId === lastPhase) return;
    lastPhase = phaseId;

    var data = null;
    for (var i = 0; i < phases.length; i++) {
      if (phases[i].id === phaseId) { data = phases[i]; break; }
    }
    if (!data) return;

    var hdr = makeEl('div', 'quiz-phase-header');
    hdr.appendChild(makeEl('h2', 'quiz-phase-title', data.title));
    hdr.appendChild(makeEl('p',  'quiz-phase-desc',  data.description));
    container.appendChild(hdr);
  }

  /* ── Render one question card ────────────────────────────────────── */

  function renderQuestion(idx) {
    // All questions answered → finish
    if (idx >= questions.length) {
      finishQuiz();
      return;
    }

    currentIdx = idx;
    advancing = false;
    var q = questions[idx];
    var view = byId('quiz-view');
    if (!view) return;

    updateProgress();
    ensurePhaseHeader(q.phase, view);

    // Remove previous card (keep phase headers and progress bar)
    if (currentCard && currentCard.parentNode) {
      currentCard.parentNode.removeChild(currentCard);
    }

    // Card container
    var card = makeEl('div', 'quiz-card');
    card.setAttribute('data-qid', q.id);

    // Scenario text
    if (q.scenario) {
      card.appendChild(makeEl('p', 'quiz-scenario', q.scenario));
    }

    // Question prompt
    card.appendChild(makeEl('p', 'quiz-question', q.question));

    // Option buttons
    var optsWrap = makeEl('div', 'quiz-options');
    activeBtns = [];

    for (var i = 0; i < q.options.length; i++) {
      /* jshint loopfunc:true */
      (function(optIdx) {
        var btn = makeEl('button', 'quiz-option-btn', q.options[optIdx].text);
        btn.setAttribute('data-qid', q.id);
        btn.setAttribute('data-opt', String(optIdx));

        if (answers[idx] === optIdx) {
          btn.classList.add('selected');
        }

        btn.addEventListener('click', function() {
          onOptionClick(idx, optIdx);
        });

        activeBtns.push(btn);
        optsWrap.appendChild(btn);
      })(i);
    }

    card.appendChild(optsWrap);
    view.appendChild(card);
    currentCard = card;

    // Smooth scroll so the card is visible
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Option click → save + auto-advance ──────────────────────────── */

  function onOptionClick(qIdx, optIdx) {
    // Ignore clicks while advancing or on an already-answered question
    if (advancing || answers[qIdx] !== null) return;
    advancing = true;

    answers[qIdx] = optIdx;
    persist();

    // Highlight selection, de-highlight others
    for (var i = 0; i < activeBtns.length; i++) {
      if (i === optIdx) {
        activeBtns[i].classList.add('selected');
      } else {
        activeBtns[i].classList.remove('selected');
      }
    }

    // Brief pause so the tap registers visually, then advance
    setTimeout(function() {
      renderQuestion(qIdx + 1);
    }, 180);
  }

  /* ── Persistence wrapper ─────────────────────────────────────────── */

  function persist() {
    if (!bank) return;
    app.SessionStore.save(bank, answers);
  }

  /* ── Quiz completion ─────────────────────────────────────────────── */

  function finishQuiz() {
    var result = app.Scoring.computeScores(bank, answers);
    if (!result || !result.ok) return;

    global.Analytics.track('quiz_completed');

    // Hand off to results view (App.renderResults, defined by results.js)
    if (app.renderResults) {
      app.renderResults(bank, result.report);
    }
  }

  /* ── Non-blocking notice ─────────────────────────────────────────── */

  function showNotice(text) {
    var view = byId('quiz-view');
    if (!view) return;

    var n = makeEl('div', 'quiz-notice', text);
    view.appendChild(n);
    setTimeout(function() {
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 4000);
  }

  /* ── renderQuiz (public) ─────────────────────────────────────────── */

  function renderQuiz(b) {
    bank      = b;
    questions = bank.questions;
    phases    = bank.phases;
    answers   = [];
    lastPhase = '';
    activeBtns = [];
    currentCard = null;
    advancing   = false;

    var view = byId('quiz-view');
    if (!view) return;
    view.innerHTML = '';

    // Progress bar at top
    var prog = makeEl('div', 'quiz-progress', '');
    prog.id = 'quiz-progress';
    view.appendChild(prog);

    // Session resume
    var session = app.SessionStore.load(bank);
    if (session.ok) {
      answers = session.answers.slice();
    } else {
      for (var i = 0; i < questions.length; i++) answers.push(null);
      if (session.reason === 'stale') {
        showNotice('The question bank has changed. Starting fresh.');
        app.SessionStore.clear();
      }
    }

    updateProgress();

    // Find first unanswered question
    var startIdx = 0;
    for (var j = 0; j < answers.length; j++) {
      if (answers[j] === null) { startIdx = j; break; }
      if (j === answers.length - 1) {
        // All answered — startIdx stays 0; finishQuiz fires on first renderQuestion call
        startIdx = answers.length;
      }
    }

    renderQuestion(startIdx);
  }

  /* ── renderLanding (public) ──────────────────────────────────────── */

  function renderLanding(b) {
    var meta = b && b.meta;
    var landing = byId('landing-view');
    if (!landing) return;
    landing.innerHTML = '';

    landing.appendChild(makeEl('h1', null, meta.title || 'Agent Security Awareness Quiz'));
    landing.appendChild(makeEl('p', 'subtitle', meta.subtitle || ''));
    landing.appendChild(makeEl('p', 'meta', (meta.total_questions || 20) + ' questions, ' + (meta.time_estimate || '8-12 minutes')));

    var btn = makeEl('button', 'btn-primary', 'Start Assessment');
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
