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
  var currentCard = null; // current visible question card DOM element
  var advancing   = false; // true during the 180ms post-answer delay
  var backBtnEl   = null; // current back button DOM ref (null on first card)

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
      chromeChip.textContent = 'Phase ' + chipNum + ' \u00b7 ' + data.title;
    }
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
    var numChip = makeEl('span', 'quiz-number-chip', 'Q' + (idx + 1));
    cardHeader.appendChild(numChip);
    card.appendChild(cardHeader);

    // ── Scenario block with micro-label ──
    if (q.scenario) {
      card.appendChild(makeEl('span', 'quiz-label', 'Scenario'));
      card.appendChild(makeEl('p', 'quiz-scenario', q.scenario));
    }

    // ── Question block with micro-label ──
    card.appendChild(makeEl('span', 'quiz-label', 'Question'));
    card.appendChild(makeEl('p', 'quiz-question', q.question));

    // ── Option buttons with letter badges ──
    var optsWrap = makeEl('div', 'quiz-options');
    activeBtns = [];
    var LETTERS = 'ABCD';

    for (var i = 0; i < q.options.length; i++) {
      /* jshint loopfunc:true */
      (function(optIdx) {
        var btn = makeEl('button', 'quiz-option-btn');
        btn.setAttribute('data-qid', q.id);
        btn.setAttribute('data-opt', String(optIdx));

        var badge = makeEl('span', 'quiz-letter-badge', LETTERS[optIdx]);
        var label = makeEl('span', 'quiz-option-text', q.options[optIdx].text);
        btn.appendChild(badge);
        btn.appendChild(label);

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

    // ── Back button (hidden on first card) ──
    if (idx > 0) {
      var backBtn = makeEl('button', 'quiz-back-btn', '\u2190 Previous');
      backBtn.addEventListener('click', function() {
        renderQuestion(idx - 1);
      });
      card.appendChild(backBtn);
      backBtnEl = backBtn;
    } else {
      backBtnEl = null;
    }

    view.appendChild(card);
    currentCard = card;

    // Enter animation: slide-up + fade
    var reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reducedMotion) {
      card.classList.add('card-enter');
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          card.classList.remove('card-enter');
        });
      });
    }

    // Smooth scroll so the card is visible
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Option click → save + auto-advance ──────────────────────────── */

  function onOptionClick(qIdx, optIdx) {
    // Ignore clicks while advancing
    if (advancing) return;

    // If already answered with the same option, no-op
    if (answers[qIdx] === optIdx) return;

    // Allow re-answer: update answer and re-advance
    answers[qIdx] = optIdx;
    persist();
    advancing = true;
    updateChrome();

    // Highlight selection, de-highlight others
    for (var i = 0; i < activeBtns.length; i++) {
      if (i === optIdx) {
        activeBtns[i].classList.add('selected');
      } else {
        activeBtns[i].classList.remove('selected');
      }
    }

    // Exit animation: fade + slide up
    var reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var card = currentCard;
    var nextIdx = qIdx + 1;
    var delay = (nextIdx >= questions.length) ? 400 : 200;

    function doAdvance() {
      renderQuestion(nextIdx);
    }

    if (reducedMotion || !card) {
      doAdvance();
    } else {
      card.classList.add('card-exit');
      setTimeout(function() {
        card.classList.remove('card-exit');
        doAdvance();
      }, delay);
    }
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
    activeBtns = [];
    currentCard = null;
    advancing   = false;
    backBtnEl   = null;
    chromeFill = null;
    chromeCounter = null;
    chromeChip = null;

    var view = byId('quiz-view');
    if (!view) return;
    view.innerHTML = '';

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
