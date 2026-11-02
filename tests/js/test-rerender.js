exports.name = 'Re-render seam (issue #48): bank swap + in-place view rebuild';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── globals this test owns; snapshotted, restored before resolve ──────
  var prev = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    Analytics: globalThis.Analytics,
    Bank: globalThis.Bank,
    Scoring: (globalThis.App && globalThis.App.Scoring),
    ActionPlan: (globalThis.App && globalThis.App.ActionPlan),
    PromptBuilder: (globalThis.App && globalThis.App.PromptBuilder)
  };

  function restoreGlobals() {
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window;
    else globalThis.window = prev.window;
    if (prev.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev.localStorage;
    if (prev.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prev.fetch;
    globalThis.setTimeout = prev.setTimeout;
    globalThis.clearTimeout = prev.clearTimeout;
    if (prev.Analytics === undefined) delete globalThis.Analytics;
    else globalThis.Analytics = prev.Analytics;
    if (prev.Bank === undefined) delete globalThis.Bank;
    else globalThis.Bank = prev.Bank;
    if (prev.Scoring === undefined) delete globalThis.App.Scoring;
    else globalThis.App.Scoring = prev.Scoring;
    if (prev.ActionPlan === undefined) delete globalThis.App.ActionPlan;
    else globalThis.App.ActionPlan = prev.ActionPlan;
    if (prev.PromptBuilder === undefined) delete globalThis.App.PromptBuilder;
    else globalThis.App.PromptBuilder = prev.PromptBuilder;
  }

  // ── queued timers: beats stay deterministic and synchronous ───────────
  // The quiz schedules its tap/finish beats; queueing instead of firing
  // keeps this test synchronous (flush is explicit).
  var timerQueue = [];
  globalThis.setTimeout = function(fn, ms) {
    timerQueue.push({ fn: fn, ms: ms || 0 });
    return timerQueue.length;
  };
  globalThis.clearTimeout = function(id) {
    if (timerQueue[id - 1]) timerQueue[id - 1].fn = null;
  };
  function flushTimers() {
    var q = timerQueue.slice();
    timerQueue.length = 0;
    for (var i = 0; i < q.length; i++) if (q[i].fn) q[i].fn();
  }

  // ── fake DOM (pattern from test-results-retro.js / test-shell.js) ────
  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '', download: '',
      disabled: false, hidden: false, id: '',
      attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(c) { el.children.push(c); c.parentNode = el; return c; },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
        c.parentNode = null;
        return c;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; },
      scrollIntoView: function() {},
      // Class-only selector, deep search — enough for populateReview's
      // header.querySelector('.results-review-back-btn').
      querySelector: function(sel) {
        var cls = String(sel).replace(/^\./, '');
        var stack = el.children.slice();
        while (stack.length) {
          var n = stack.shift();
          if (!n || typeof n !== 'object') continue;
          if (String(n.className || '').split(/\s+/).indexOf(cls) >= 0) return n;
          if (n.children) stack = stack.concat(n.children);
        }
        return null;
      }
    };
    // innerHTML = '' is how every view clears itself — it must really
    // empty the children, or re-render assertions see stale trees.
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return ''; },
      set: function(v) { if (v === '') el.children = []; }
    });
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    return el;
  }

  var sections = [
    fakeEl('section'), fakeEl('section'), fakeEl('section'), fakeEl('section')
  ];
  sections[0].id = 'landing-view';  sections[0].hidden = false;
  sections[1].id = 'quiz-view';     sections[1].hidden = true;
  sections[2].id = 'results-view';  sections[2].hidden = true;
  sections[3].id = 'review-view';   sections[3].hidden = true;
  var byIdMap = {};
  sections.forEach(function(s) { byIdMap[s.id] = s; });

  var fakeDoc = {
    createElement: function(tag) { return fakeEl(tag); },
    createElementNS: function(ns, tag) { return fakeEl(tag); },
    createTextNode: function(text) { return { nodeType: 3, textContent: String(text) }; },
    createDocumentFragment: function() { return fakeEl('#fragment'); },
    getElementById: function(id) {
      return Object.prototype.hasOwnProperty.call(byIdMap, id) ? byIdMap[id] : null;
    },
    querySelectorAll: function(sel) {
      // showView's only query: '#app > section'
      return sel === '#app > section' ? sections.slice() : [];
    },
    addEventListener: function() {},
    documentElement: (function() {
      var html = fakeEl('html');
      html.setAttribute('data-bank', 'questions.json');
      html.setAttribute('data-corpus', 'docs/owasp-ast-full.md');
      return html;
    })(),
    body: fakeEl('body')
  };
  globalThis.document = fakeDoc;

  // reduced motion → every beat path runs "instantly" (sync or queued 0ms)
  globalThis.window = {
    matchMedia: function() { return { matches: true }; }
  };

  var store = {};
  globalThis.localStorage = {
    get length() { return Object.keys(store).length; },
    key: function(i) { return Object.keys(store)[i]; },
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  };

  var analyticsEvents = [];
  globalThis.Analytics = { track: function(ev) { analyticsEvents.push(ev); } };

  // ── module load (in dependency order; document must exist first) ──────
  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  require('../../js/session-store.js');
  require('../../js/wizard-nav.js');
  require('../../js/ast.js');

  var App = globalThis.App;
  var I18n = App.I18n;
  I18n.use('en');

  require('../../js/quiz.js');
  require('../../js/results.js');
  require('../../js/main.js');
  // Ticket #66: Retake is the destructive path — it ends the run, so the
  // per-tab desktop Record goes with it. The Windows namespace supplies
  // the system dialog this page asks its confirmation on, and the Record
  // store is the real one on an in-memory sessionStorage.
  var Windows66 = require('../../js/windows.js');
  var DesktopStore66 = require('../../js/desktop-store.js');
  var sessionData66 = {};
  globalThis.sessionStorage = {
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(sessionData66, k) ? sessionData66[k] : null;
    },
    setItem: function(k, v) { sessionData66[k] = String(v); },
    removeItem: function(k) { delete sessionData66[k]; }
  };
  var desktopResets = 0;
  Windows66.controller = {
    resetPrograms: function() { desktopResets++; return true; }
  };

  // Seam seams only, not the behaviours under test: the re-render contract
  // owns view rebuilding, not scoring maths or the Action Plan path
  // decision (their own suites cover those).
  var scoringCalls = [];
  App.Scoring = {
    computeScores: function(bank, answers) {
      scoringCalls.push({ bank: bank, answers: answers.slice() });
      return { ok: true, report: makeReport() };
    }
  };
  App.ActionPlan = {
    assemble: function() {
      return Promise.resolve({ narrative: 'Narrative.', actions: [] });
    }
  };
  App.PromptBuilder = {
    build: function(report) { return 'DD ' + report.percentage; }
  };

  // ── helpers ───────────────────────────────────────────────────────────
  function walk(node, tag, out) {
    out = out || [];
    if (!node || !node.children) return out;
    for (var c = 0; c < node.children.length; c++) {
      var child = node.children[c];
      if (child && child.tagName && tag && child.tagName === tag.toUpperCase()) out.push(child);
      walk(child, tag, out);
    }
    return out;
  }
  function allText(node, out) {
    out = out || [];
    if (node == null) return out;
    if (typeof node === 'object' && node.nodeType === 3) { out.push(node.textContent); return out; }
    if (typeof node.textContent === 'string' && node.nodeType !== 3) out.push(node.textContent);
    if (node.children) {
      for (var c = 0; c < node.children.length; c++) allText(node.children[c], out);
    }
    return out;
  }
  function viewText(id) { return allText(byIdMap[id]).join(' '); }
  function findButtonByText(text) {
    var btns = walk(byIdMap['quiz-view'], 'button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === text) return btns[i];
    }
    return null;
  }
  function currentCard() {
    var divs = walk(byIdMap['quiz-view'], 'div');
    for (var i = 0; i < divs.length; i++) {
      var cls = String(divs[i].className || '');
      if (cls.indexOf('quiz-card') >= 0 && divs[i].getAttribute('data-qid')) return divs[i];
    }
    return null;
  }
  function optionRow(qid, optIdx) {
    var rows = walk(byIdMap['quiz-view'], 'button');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-qid') === qid &&
          rows[i].getAttribute('data-opt') === String(optIdx)) return rows[i];
    }
    return null;
  }
  function fillWidth() {
    var divs = walk(byIdMap['quiz-view'], 'div');
    for (var i = 0; i < divs.length; i++) {
      if (divs[i].style && typeof divs[i].style.width === 'string') return divs[i].style.width;
    }
    return null;
  }

  // ── Bank Variants: structurally identical, authored text only (ADR 0015) ──
  var PRESETS = {
    en:  { title: 'EN title',     subtitle: 'EN subtitle',     scenario: 'Scenario',      question: 'Question?',       option: 'Option',    phase: 'Phase One' },
    zh:  { title: '中文标题',      subtitle: '中文副标题',      scenario: '情景',           question: '问题?',            option: '选项',       phase: '第一阶段' },
    en2: { title: 'EN2 title',    subtitle: 'EN2 subtitle',    scenario: 'ScenarioTwo',   question: 'QuestionTwo?',    option: 'OptionTwo', phase: 'Phase Two' }
  };

  function makeBank(preset) {
    var p = PRESETS[preset];
    function q(id, weight) {
      return {
        id: id, phase: 'p1', severity_weight: weight, ast_risks: ['AST01'],
        scenario: p.scenario + ' ' + id,
        question: p.question + ' ' + id,
        best_practice: 'Do the safe thing.',
        ast_source_url: 'https://owasp.github.io/example',
        options: [0, 1, 2, 3].map(function(i) {
          return { text: p.option + ' ' + id + i, score: i, feedback: 'Why ' + i + '.' };
        })
      };
    }
    return {
      meta: {
        title: p.title, subtitle: p.subtitle,
        total_questions: 3, time_estimate: '2 min',
        scoring: {
          severity_values: { critical: 3, high: 2, medium: 1 },
          titles: [
            { threshold: 0,  name: 'Newcomer',  emoji: 'N' },
            { threshold: 50, name: 'Sentinel',  emoji: 'S' }
          ]
        }
      },
      phases: [{ id: 'p1', title: p.phase, question_ids: ['q1', 'q2', 'q3'] }],
      questions: [q('q1', 3), q('q2', 2), q('q3', 1)]
    };
  }
  var bankEn = makeBank('en');
  var bankZh = makeBank('zh');
  var bankEn2 = makeBank('en2');
  var bankStructuralChange = makeBank('en');
  bankStructuralChange.questions[2].severity_weight = 3; // not an identical structure

  function makeReport() {
    var astScores = {}, astRanked = [];
    var pcts = [33, 50, 62, 70, 74, 81, 88, 92, 96, 100];
    var AST = App.AST;
    for (var i = 0; i < AST.ids.length; i++) {
      astScores[AST.ids[i]] = { percentage: pcts[i] };
      astRanked.push({ id: AST.ids[i], percentage: pcts[i], earned: pcts[i], possible: 100 });
    }
    return {
      percentage: 62,
      title: { emoji: 'S', name: 'Sentinel' },
      astScores: astScores,
      astRanked: astRanked,
      weakestQuestions: []
    };
  }

  // ══ 1. Splash: activateBank re-renders the landing view in place ══════

  check('activateBank on the landing view rebuilds it from the new bank',
    App.activateBank(bankEn) === 'landing-view' &&
    viewText('landing-view').indexOf('EN title') >= 0);

  check('splash re-render swaps in the new Bank Variant without a reload',
    App.activateBank(bankZh) === 'landing-view' &&
    App.currentView() === 'landing-view' &&
    viewText('landing-view').indexOf('中文标题') >= 0 &&
    viewText('landing-view').indexOf('EN title') < 0);

  // ══ 2. Answering: re-render keeps the Question and every answer ═══════

  var startBtn = (function() {
    var btns = walk(byIdMap['landing-view'], 'button');
    for (var i = 0; i < btns.length; i++) if (btns[i].id === 'start-btn') return btns[i];
    return null;
  })();
  check('Start exists after the landing re-render', !!startBtn);
  startBtn.click();
  check('Start opens the quiz on Q1 (start behaviour unchanged)',
    App.currentView() === 'quiz-view' &&
    currentCard() && currentCard().getAttribute('data-qid') === 'q1' &&
    analyticsEvents.indexOf('quiz_started') >= 0);

  // Mark Option 3 on Q1 (in-flight tap beat: the advance timer is queued).
  optionRow('q1', 2).click();
  var snap = App.quizState();
  check('an Option tap records the pick in place',
    snap.currentIdx === 0 && JSON.stringify(snap.answers) === '[2,null,null]');

  check('activateBank mid-quiz re-renders the answering view at the SAME Question',
    App.activateBank(bankZh) === 'quiz-view' &&
    App.currentView() === 'quiz-view' &&
    currentCard() && currentCard().getAttribute('data-qid') === 'q1');

  snap = App.quizState();
  check('the re-rendered answering view keeps every recorded answer',
    JSON.stringify(snap.answers) === '[2,null,null]' &&
    snap.bank === bankZh &&
    optionRow('q1', 2).getAttribute('aria-checked') === 'true' &&
    optionRow('q1', 0).getAttribute('aria-checked') === 'false',
    JSON.stringify(snap.answers));

  check('the Quiz Chrome keeps the viewed counter',
    viewText('quiz-view').indexOf('1 / 3') >= 0);
  check('the answered fill survived the re-render',
    fillWidth() === String((1 / 3) * 100) + '%', fillWidth());
  check('the Phase Chip shows the NEW Bank Variant text (Chrome re-resolves)',
    viewText('quiz-view').indexOf(I18n.t('quiz.phaseChip', { number: 1, title: '第一阶段' })) >= 0);

  var nextBtn = findButtonByText(I18n.t('wizard.next'));
  nextBtn.click();
  check('wizard Next keeps working after a re-render',
    viewText('quiz-view').indexOf('2 / 3') >= 0 &&
    currentCard().getAttribute('data-qid') === 'q2');
  var backBtn = findButtonByText(I18n.t('wizard.back'));
  backBtn.click();
  check('wizard Back keeps working after a re-render',
    viewText('quiz-view').indexOf('1 / 3') >= 0 &&
    currentCard().getAttribute('data-qid') === 'q1');

  // Structural drift cannot re-attribute stored answers → fresh Session path
  check('a STRUCTURALLY different bank falls back to the Session-aware fresh render',
    App.activateBank(bankStructuralChange) === 'quiz-view' &&
    currentCard().getAttribute('data-qid') === 'q1' &&
    JSON.stringify(App.quizState().answers) === '[null,null,null]' &&
    viewText('quiz-view').indexOf(I18n.t('quiz.bankChanged')) >= 0);

  // Drop the queued beats of the superseded run — deterministic from here.
  timerQueue.length = 0;

  // ══ 3. Explicit-state seam, a real run through Finish ═════════════════

  // The seam contract in isolation: the caller's index is honoured
  // verbatim — not the "first unanswered" position (which for this
  // answers array would be 3/3, not 2/3).
  App.rerenderQuiz(bankEn, 1, [0, 1, 2]);
  check('rerenderQuiz renders exactly the given Question position',
    App.currentView() === 'quiz-view' &&
    currentCard().getAttribute('data-qid') === 'q2' &&
    viewText('quiz-view').indexOf('2 / 3') >= 0);
  check('rerenderQuiz restores every recorded answer verbatim',
    JSON.stringify(App.quizState().answers) === '[0,1,2]' &&
    App.quizState().currentIdx === 1 &&
    optionRow('q2', 1).getAttribute('aria-checked') === 'true' &&
    optionRow('q2', 2).getAttribute('aria-checked') === 'false');

  // Setup for the Finish flow: a fresh run (the structural-drift test
  // above cleared the Session, so renderQuiz starts at Q1 with no picks).
  timerQueue.length = 0;
  App.renderQuiz(bankEn);

  // Answer all three Questions through the UI — each pick reaches the
  // Session exactly as it would pick-by-pick (the re-render seam never
  // writes answers itself).
  optionRow('q1', 2).click(); flushTimers(); // first pick auto-advances
  optionRow('q2', 1).click(); flushTimers();
  optionRow('q3', 2).click(); flushTimers(); // last card: the 100% beat arms Finish
  check('a full run through the answering view records every pick',
    JSON.stringify(App.quizState().answers) === '[2,1,2]');

  // The headless proof for the issue: re-render the live run in place and
  // check the position and every answer come back.
  var keptIdx = App.quizState().currentIdx;
  var keptAnswers = App.quizState().answers;
  App.rerenderQuiz(bankEn, keptIdx, keptAnswers);
  check('question position and answers survive a re-render (issue #48)',
    App.quizState().currentIdx === keptIdx &&
    JSON.stringify(App.quizState().answers) === '[2,1,2]' &&
    currentCard().getAttribute('data-qid') === 'q3' &&
    viewText('quiz-view').indexOf('3 / 3') >= 0 &&
    optionRow('q3', 2).getAttribute('aria-checked') === 'true');

  var finishBtn = findButtonByText(I18n.t('wizard.finish'));
  check('Finish is live on the last card after a re-render', finishBtn && !finishBtn.disabled);
  finishBtn.click();
  check('Finish commits exactly once (ADR 0020), with the re-rendered answers',
    analyticsEvents.filter(function(e) { return e === 'quiz_completed'; }).length === 1 &&
    scoringCalls.length === 1 &&
    JSON.stringify(scoringCalls[0].answers) === '[2,1,2]');

  flushTimers(); // the designed FINISH beat → results hand-off

  var reportRef = App.resultsState() && App.resultsState().report;
  check('the results hand-off renders the score report',
    App.currentView() === 'results-view' &&
    !!reportRef && reportRef.percentage === 62 &&
    viewText('results-view').indexOf('62%') >= 0);

  // ══ 4. Results / Review re-render from the SAME report ════════════════

  check('activateBank on the results view re-renders the SAME report in the new Variant',
    App.activateBank(bankZh) === 'results-view' &&
    App.resultsState().report === reportRef &&
    App.resultsState().bank === bankZh &&
    viewText('results-view').indexOf('62%') >= 0);
  check('rerenderResults rebuilds the cached report verbatim (never recomputed)',
    App.rerenderResults() === true &&
    App.resultsState().report === reportRef &&
    viewText('results-view').indexOf('62%') >= 0);

  var reviewBtn = walk(byIdMap['results-view'], 'button').filter(function(b) {
    return String(b.className || '').indexOf('results-review-btn') >= 0;
  })[0];
  check('the Review control exists after a results re-render', !!reviewBtn);
  reviewBtn.click();
  check('Review opens on the active Bank Variant with the recorded picks',
    App.currentView() === 'review-view' &&
    viewText('review-view').indexOf('情景 q1') >= 0 &&
    viewText('review-view').indexOf('选项 q10') >= 0 &&
    (function() {
      var divs = walk(byIdMap['review-view'], 'div');
      return divs.some(function(d) {
        return String(d.className || '').indexOf('results-review-option-selected') >= 0;
      });
    })());
  check('the Review screen still carries no scores (ADR 0005)',
    viewText('review-view').indexOf('%') < 0);

  App.renderReview(bankEn, reportRef);
  check('renderReview swapped the authored text and kept the picks',
    App.currentView() === 'review-view' &&
    App.resultsState().report === reportRef &&
    viewText('review-view').indexOf('Scenario q1') >= 0 &&
    viewText('review-view').indexOf('情景 q1') < 0 &&
    (function() {
      var divs = walk(byIdMap['review-view'], 'div');
      return divs.some(function(d) {
        return String(d.className || '').indexOf('results-review-option-selected') >= 0;
      });
    })());
  check('rerenderReview rebuilds from the cached state',
    App.rerenderReview() === true && App.currentView() === 'review-view');

  // ══ 5. Retake + fetch seam (async tail) ═══════════════════════════════

  var retakeBtn = walk(byIdMap['results-view'], 'button').filter(function(b) {
    return String(b.className || '').indexOf('results-retake-btn') >= 0;
  })[0];
  check('the Retake control exists on the re-rendered results view', !!retakeBtn);

  // Ticket #66: Retake ends the run, so it asks on the system dialog tier
  // first, and only the confirmed answer runs the tail. The committed run
  // is persisted on BOTH records before the gesture.
  function retakeAsk() {
    var stack = fakeDoc.body.children.slice();
    while (stack.length) {
      var n = stack.shift();
      if (n && n.attrs && n.attrs.role === 'dialog' &&
        allText(n).join(' ').indexOf(I18n.t('windows.retakeMessage')) >= 0) return n;
      if (n && n.children) stack = stack.concat(n.children);
    }
    return null;
  }
  function buttonLabeled(root, label) {
    var stack = [root];
    while (stack.length) {
      var n = stack.shift();
      if (n && n.tagName === 'BUTTON' && n.textContent === label) return n;
      if (n && n.children) stack = stack.concat(n.children);
    }
    return null;
  }
  check('the finished run is persisted as a Session AND a desktop Record',
    globalThis.localStorage.getItem('quiz-session') !== null &&
    DesktopStore66.exists() === true);

  var viewBeforeRetake = App.currentView();
  retakeBtn.click();
  var ask = retakeAsk();
  check('Retake asks for confirmation instead of destroying on the click',
    !!ask && Windows66.isDialogOpen() === true &&
    globalThis.localStorage.getItem('quiz-session') !== null &&
    DesktopStore66.exists() === true && desktopResets === 0 &&
    App.currentView() === viewBeforeRetake, 'ask=' + !!ask);

  buttonLabeled(ask, I18n.t('windows.no')).click();
  check('the cancelled Retake leaves the run exactly as it was',
    Windows66.isDialogOpen() === false &&
    globalThis.localStorage.getItem('quiz-session') !== null &&
    DesktopStore66.exists() === true && desktopResets === 0 &&
    App.currentView() === viewBeforeRetake);

  retakeBtn.click();
  var ask2 = retakeAsk();
  ask2.handlers.keydown({
    key: 'Escape', preventDefault: function() {}, stopPropagation: function() {}
  });
  check('Escape cancels the Retake question — never confirms a destroy',
    Windows66.isDialogOpen() === false &&
    globalThis.localStorage.getItem('quiz-session') !== null &&
    DesktopStore66.exists() === true && desktopResets === 0);

  retakeBtn.click();
  buttonLabeled(retakeAsk(), I18n.t('windows.yes')).click();
  check('Retake clears the Session and returns to the landing view (unchanged)',
    App.currentView() === 'landing-view' &&
    globalThis.localStorage.getItem('quiz-session') === null);
  check('the confirmed Retake clears the desktop Record and takes the desktop down',
    DesktopStore66.exists() === false && desktopResets === 1 &&
    Windows66.isDialogOpen() === false);
  check('a reload after the confirmed Retake restores nothing',
    DesktopStore66.restore(bankEn) === false);
  delete Windows66.controller;

  // Real timers for the promise tail; queued beats above are dropped.
  timerQueue.length = 0;
  globalThis.setTimeout = prev.setTimeout;
  globalThis.clearTimeout = prev.clearTimeout;

  var fetchedUrls = [];
  globalThis.fetch = function(url) {
    fetchedUrls.push(url);
    if (String(url).indexOf('missing') === 0) {
      return Promise.resolve({
        ok: false, status: 404,
        json: function() { return Promise.resolve({}); }
      });
    }
    return Promise.resolve({
      ok: true,
      json: function() { return Promise.resolve(bankEn2); }
    });
  };

  return new Promise(function(resolve) {
    App.loadBankFrom('en-variant.json', function(bank, viewId) {
      check('loadBankFrom fetches the caller-supplied bank URL',
        fetchedUrls[0] === 'en-variant.json', fetchedUrls.join(','));
      check('loadBankFrom swaps the active bank and re-renders the active view in place',
        bank === bankEn2 && App.Bank === bankEn2 && globalThis.Bank === bankEn2 &&
        viewId === 'landing-view' && App.currentView() === 'landing-view' &&
        viewText('landing-view').indexOf('EN2 title') >= 0);

      App.fetchBank('missing.json', function() {
        check('fetchBank surfaces HTTP failures to the caller', false, 'onReady ran on 404');
        settle();
      }, function(err) {
        check('fetchBank surfaces HTTP failures to the caller',
          !!err && err.message === 'HTTP 404', err && err.message);
        settle();
      });
    });

    function settle() {
      restoreGlobals();
      resolve(results);
    }
  });
};
