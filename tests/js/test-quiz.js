exports.name = 'QuizView';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var fs = require('fs');
  var path = require('path');
  var repo = path.join(__dirname, '..', '..');

  function read(rel) {
    return fs.readFileSync(path.join(repo, rel), 'utf8');
  }

  /* ── fake DOM (pattern from test-shell.js / test-lang-routing.js) ──── */

  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', type: '', href: '',
      disabled: false, hidden: false,
      attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(c) { el.children.push(c); c.parentNode = el; return c; },
      insertBefore: function(node, ref) {
        if (!ref) { el.children.push(node); }
        else {
          var i = el.children.indexOf(ref);
          el.children.splice(i < 0 ? el.children.length : i, 0, node);
        }
        node.parentNode = el;
        return node;
      },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return c !== x; });
        c.parentNode = null;
        return c;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;               // disabled buttons don't fire
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; },
      scrollIntoView: function() {}
    };
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    Object.defineProperty(el, 'textContent', {
      get: function() { return el._text || ''; },
      set: function(v) { el._text = String(v); }
    });
    Object.defineProperty(el, 'firstChild', {
      get: function() { return el.children.length ? el.children[0] : null; }
    });
    // innerHTML = '' is the module's view reset: it must really clear the
    // children. A non-empty value is only ever the splash's inline eye
    // glyph — an <svg> string kept verbatim, never parsed into children
    // (same pattern as the shell's title-bar glyphs).
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return el._html || ''; },
      set: function(v) {
        el._html = String(v);
        if (v !== '') return;
        el.children.forEach(function(c) { c.parentNode = null; });
        el.children = [];
      }
    });
    return el;
  }

  function walk(el, fn) {
    fn(el);
    el.children.forEach(function(c) { walk(c, fn); });
  }

  function byClass(root, cls) {
    var found = [];
    walk(root, function(el) {
      if (String(el.className || '').split(/\s+/).indexOf(cls) !== -1) found.push(el);
    });
    return found;
  }

  /* ── Install page globals, then load the module ─────────────────────── */

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

  var views = {
    'landing-view': fakeEl('section'),
    'quiz-view': fakeEl('section'),
    'results-view': fakeEl('section'),
    'review-view': fakeEl('section')
  };
  globalThis.document = {
    getElementById: function(id) { return views[id] || null; },
    createElement: function(tag) { return fakeEl(tag); }
  };

  // prefers-reduced-motion: TRUE — every beat collapses to a 0ms timer,
  // and the test swaps setTimeout for a synchronous rung below.
  globalThis.window = globalThis;
  globalThis.matchMedia = function() { return { matches: true }; };

  var realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = function(fn) { fn(); return 0; };

  var tracked = [];
  globalThis.Analytics = { track: function(ev) { tracked.push(ev); } };

  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../js/wizard-nav.js');
  require('../../js/session-store.js');
  require('../../js/quiz.js');

  var App = globalThis.App;
  App.I18n.use('en');
  // Stubs for this test — the originals are restored at the end (module
  // globals are shared across the suite's files).
  var realScoring = App.Scoring;
  var realRenderResults = App.renderResults;
  var realAnalytics = globalThis.Analytics;
  App.Scoring = {
    computeScores: function() { return { ok: true, report: { stub: true } }; }
  };
  var handedOff = [];
  var finishSeq = [];
  App.renderResults = function(bank, report) {
    handedOff.push({ bank: bank, report: report });
    finishSeq.push('render');
  };

  // Ticket #63 seam: the suite records the capture calls the Finish Commit
  // makes; the real js/desktop-store.js is not loaded here, so nothing
  // touches storage — the contract under test is WHEN quiz.js asks for the
  // Record (the Finish Commit, once, after the desktop arrived) and that
  // answering or loading never does.
  var desktopCaptures = [];
  var realDesktopStore = App.DesktopStore;
  App.DesktopStore = {
    exists: function() { return false; },
    captureAtCommit: function(b, a) {
      desktopCaptures.push({ bank: b, answers: a.slice() });
      finishSeq.push('capture');
      return true;
    }
  };

  /* ── Fixture: 3 Questions, two Phases ───────────────────────────────── */

  function q(id, phase) {
    return {
      id: id, phase: phase,
      scenario: 'Scenario for ' + id,
      question: 'Question text for ' + id + '?',
      options: ['a', 'b', 'c', 'd'].map(function(l) {
        return { text: id + ' option ' + l };
      })
    };
  }

  var bank = {
    meta: { title: 'Fixture', total_questions: 3 },
    phases: [
      { id: 'p1', title: 'Phase One' },
      { id: 'p2', title: 'Phase Two' }
    ],
    questions: [q('q1', 'p1'), q('q2', 'p1'), q('q3', 'p2')]
  };

  /* ── Welcome splash: structure, copy, single action (ticket #53) ────── */

  // The first-visit language offer must no longer be wired into the
  // landing renderer. Both entry points are stubbed with call counters so
  // a regression that offers again fails loudly here.
  var offerCalls = { into: 0, should: 0 };
  App.LangRouting = {
    offerInto: function() { offerCalls.into++; return false; },
    shouldOffer: function() { offerCalls.should++; return true; }
  };

  App.renderLanding(bank);

  var landing = views['landing-view'];

  check('landing view carries no status bar or footer',
    byClass(landing, 'quiz-statusbar').length === 0 &&
    byClass(landing, 'quiz-footer').length === 0);

  check('the first-visit language offer is not rendered on the landing view',
    offerCalls.into === 0 && offerCalls.should === 0,
    JSON.stringify(offerCalls));

  var head = landing.children[0];
  var icon = head.children[0];
  var title = head.children[1];
  var sub = head.children[2];
  var rule = landing.children[1];
  var bodyLine = landing.children[2];
  var metaLine = landing.children[3];
  var actions = landing.children[4];

  check('splash: head (icon + headline + subtitle), rule, body, meta, actions — in order',
    landing.children.length === 5 &&
    String(head.className).indexOf('wizard-head') >= 0 &&
    String(icon.className).indexOf('wizard-icon') >= 0 &&
    title.tagName === 'H1' &&
    String(title.className).indexOf('wizard-title') >= 0 &&
    String(sub.className).indexOf('wizard-sub') >= 0 &&
    rule.tagName === 'HR' &&
    String(rule.className).indexOf('wizard-rule') >= 0 &&
    String(bodyLine.className).indexOf('wizard-body') >= 0 &&
    String(metaLine.className).indexOf('wizard-meta') >= 0 &&
    String(actions.className).indexOf('wizard-actions') >= 0,
    'children=' + landing.children.length);

  check('splash: 64px eye glyph — almond outline, navy iris, black pupil, white glint',
    icon.innerHTML.indexOf('<svg') === 0 &&
    icon.innerHTML.indexOf('width="64"') >= 0 &&
    icon.innerHTML.indexOf('stroke="#000000"') >= 0 &&
    icon.innerHTML.indexOf('fill="#000080"') >= 0 &&
    icon.innerHTML.indexOf('fill="#000000"') >= 0 &&
    icon.innerHTML.indexOf('fill="#FFFFFF"') >= 0,
    icon.innerHTML.slice(0, 40));

  check('splash: the catchphrase headline is two dictionary lines',
    title.children.length === 2 &&
    title.children[0].textContent === App.I18n.t('landing.headline1') &&
    title.children[0].textContent === 'Be Informed.' &&
    title.children[1].textContent === App.I18n.t('landing.headline2') &&
    title.children[1].textContent === 'Be Aware.',
    title.children.map(function(c) { return c.textContent; }).join(' / '));

  check('splash: the Bank Variant title is the subtitle',
    sub.textContent === 'Fixture' && sub.textContent === bank.meta.title,
    sub.textContent);

  check('splash: one body line with the count, then the time estimate',
    bodyLine.textContent.indexOf('3 questions about the skills') === 0 &&
    metaLine.textContent === '3 questions · 8-12 minutes',
    bodyLine.textContent + ' / ' + metaLine.textContent);

  /* ── Single primary action ─────────────────────────────────────────── */

  function landingButtons() {
    var found = [];
    walk(landing, function(el) { if (el.tagName === 'BUTTON') found.push(el); });
    return found;
  }

  var splashBtns = landingButtons();
  check('splash: exactly one action — the default [Start] button',
    splashBtns.length === 1 &&
    splashBtns[0].id === 'start-btn' &&
    splashBtns[0].textContent === 'Start' &&
    String(splashBtns[0].className).indexOf('wizard-btn-default') >= 0,
    splashBtns.length + '/' + (splashBtns[0] && splashBtns[0].textContent));

  /* ── Start path: analytics event + show quiz + render ──────────────── */

  var shownViews = [];
  var realShowView = App.showView;
  App.showView = function(id) { shownViews.push(id); };
  tracked.length = 0;

  splashBtns[0].click();

  check('Start fires quiz_started, shows the quiz view and renders it',
    tracked.length === 1 && tracked[0] === 'quiz_started' &&
    shownViews.length === 1 && shownViews[0] === 'quiz-view' &&
    views['quiz-view'].children.length === 3 &&
    byClass(views['quiz-view'], 'quiz-statusbar').length === 1,
    JSON.stringify(tracked) + '/' + JSON.stringify(shownViews));

  if (realShowView === undefined) delete App.showView;
  else App.showView = realShowView;
  tracked.length = 0;   // later suites count Finish's event from zero

  /* ── Same structure in Simplified Chinese (both locales, structurally) ─ */

  require('../../i18n/zh.js');
  App.I18n.use('zh');
  App.renderLanding(bank);

  var zhTitle = byClass(landing, 'wizard-title')[0];
  var zhMeta = byClass(landing, 'wizard-meta')[0];
  var zhStart = null;
  walk(landing, function(el) { if (el.id === 'start-btn') zhStart = el; });

  check('splash structure and copy hold in the zh dictionary',
    landing.children.length === 5 &&
    zhTitle.children[0].textContent === '了解风险' &&
    zhTitle.children[1].textContent === '保持警觉' &&
    zhMeta.textContent === '3 道问题 · 8-12 分钟' &&
    !!zhStart && zhStart.textContent === '开始测评' &&
    byClass(landing, 'wizard-icon').length === 1,
    zhMeta.textContent + '/' + (zhStart && zhStart.textContent));

  App.I18n.use('en');
  delete App.LangRouting;   // restore: the landing renderer owns no offer

  /* ── Scaffolding: body + footer + status bar, in order ──────────────── */

  App.renderQuiz(bank);
  var quiz = views['quiz-view'];
  var body = quiz.children[0];
  var footer = quiz.children[1];
  var statusbar = quiz.children[2];

  check('quiz view is [body, footer, statusbar] — pinned panes, one scroll body',
    quiz.children.length === 3 &&
    String(body.className) === 'quiz-body' &&
    String(footer.className) === 'quiz-footer' &&
    String(statusbar.className) === 'quiz-statusbar',
    quiz.children.map(function(c) { return c.className; }).join(' | '));

  check('renderQuiz rebuilds cleanly: exactly one status bar per run',
    byClass(quiz, 'quiz-statusbar').length === 1);

  App.renderQuiz(bank);
  quiz = views['quiz-view'];
  body = quiz.children[0];
  footer = quiz.children[1];
  statusbar = quiz.children[2];
  check('a second renderQuiz leaves exactly one status bar (no accumulation)',
    byClass(views['quiz-view'], 'quiz-statusbar').length === 1 &&
    views['quiz-view'].children.length === 3);

  check('the load path never asks for a desktop Record (#63)',
    desktopCaptures.length === 0 && finishSeq.length === 0,
    JSON.stringify(finishSeq));

  check('the sticky Quiz Chrome bar is gone from the DOM',
    byClass(quiz, 'quiz-chrome').length === 0);

  var phasePane = byClass(statusbar, 'quiz-status-phase')[0];
  var progressPane = byClass(statusbar, 'quiz-status-progress')[0];
  var track = byClass(statusbar, 'quiz-status-track')[0];
  var fill = byClass(statusbar, 'quiz-status-fill')[0];
  var counter = byClass(statusbar, 'quiz-status-counter')[0];

  check('status bar: left phase pane, right pane = track > fill + counter',
    !!phasePane && !!progressPane && !!track && !!fill && !!counter &&
    statusbar.children[0] === phasePane &&
    statusbar.children[1] === progressPane &&
    progressPane.children[0] === track &&
    track.children[0] === fill &&
    progressPane.children[1] === counter);

  var back = footer.children[0];
  var next = footer.children[1];
  var finish = footer.children[2];

  check('footer carries Back / Next / Finish, built once',
    footer.children.length === 3 &&
    back.textContent === App.I18n.t('wizard.back') &&
    next.textContent === App.I18n.t('wizard.next') &&
    finish.textContent === App.I18n.t('wizard.finish'));

  /* ── Initial state (Question 1) ─────────────────────────────────────── */

  function card() {
    return byClass(body, 'quiz-card')[0];
  }

  function optionRow(i) {
    return byClass(card(), 'quiz-radio-row')[i];
  }

  check('initial counter is the position: 1 / 3',
    counter.textContent === '1 / 3', counter.textContent);
  check('initial fill is answered/total: 0%',
    fill.style.width === '0%', fill.style.width);
  check('phase pane shows the current phase name',
    phasePane.textContent === 'Phase 1 · Phase One', phasePane.textContent);
  check('Back disabled on the first Question; Finish disabled until 3/3',
    back.disabled === true && finish.disabled === true);
  check('Next is present between cards',
    next.hidden === false);

  /* ── Answer Q1 → auto-advance; fill counts answered, counter moves ─── */

  var q1card = card();               // captured: the beat swaps the card
  optionRow(0).click();

  check('first answer advances to Question 2 (counter 2 / 3)',
    counter.textContent === '2 / 3', counter.textContent);
  check('fill = answered/total (1 of 3), not position',
    Math.abs(parseFloat(fill.style.width) - 100 / 3) < 0.001 &&
    fill.style.width.slice(-1) === '%', fill.style.width);
  check('Back enabled from Question 2 onward', back.disabled === false);
  check('one Option per Question mirrored in aria-checked (ADR 0017)',
    byClass(q1card, 'quiz-radio-row')[0].getAttribute('aria-checked') === 'true');

  /* ── Back to Q1: counter follows position, fill does not regress ───── */

  back.click();
  check('Back returns to Question 1 (counter 1 / 3)',
    counter.textContent === '1 / 3', counter.textContent);
  check('fill still counts answered (1 of 3) while viewing Question 1',
    Math.abs(parseFloat(fill.style.width) - 100 / 3) < 0.001, fill.style.width);

  next.click();
  check('Next returns to Question 2 (counter 2 / 3)',
    counter.textContent === '2 / 3', counter.textContent);

  /* ── Last card: Next hides, Finish gates on canFinish ──────────────── */

  next.click();
  check('counter reaches 3 / 3 on the last card',
    counter.textContent === '3 / 3', counter.textContent);
  check('phase pane swaps to the second phase',
    phasePane.textContent === 'Phase 2 · Phase Two', phasePane.textContent);
  check('Next hidden on the last card (Finish takes its place)',
    next.hidden === true);
  check('Finish stays disabled while any Question is unanswered',
    finish.disabled === true);

  finish.click();
  check('a disabled Finish commits nothing',
    tracked.length === 0 && handedOff.length === 0);

  // Fill the last Question first: Q2 is still empty, so Finish must stay
  // disabled (ADR 0020: enabled only when every Question is answered).
  optionRow(1).click();
  check('fill counts answered (2 of 3) even on the last card',
    Math.abs(parseFloat(fill.style.width) - 200 / 3) < 0.001, fill.style.width);
  check('…and Finish stays disabled with gaps elsewhere',
    finish.disabled === true);

  back.click();                       // → Q2
  optionRow(2).click();               // answer Q2 → auto-advance → Q3
  check('answering Q2 lands on the last card again (3 / 3)',
    counter.textContent === '3 / 3', counter.textContent);
  check('Finish enabled once every Question has an Option selected',
    finish.disabled === false);

  /* ── Re-answer in place: one Option per Question, no card move ─────── */

  while (back.disabled === false) back.click();      // walk back to Q1
  check('walking back reaches Question 1 (counter 1 / 3)',
    counter.textContent === '1 / 3', counter.textContent);
  optionRow(2).click();               // re-mark Q1 with a different Option
  check('re-answer overwrites in place: card stays on Question 1',
    counter.textContent === '1 / 3', counter.textContent);
  check('the new Option is checked, the old one released',
    optionRow(2).getAttribute('aria-checked') === 'true' &&
    optionRow(0).getAttribute('aria-checked') === 'false');
  check('fill unaffected by a re-answer (still 100%)',
    fill.style.width === '100%', fill.style.width);

  /* ── Finish Commit fires exactly once, from the footer ─────────────── */

  while (next.hidden === false) next.click();        // walk forward to Q3
  check('forward walk reaches the last card (3 / 3)',
    counter.textContent === '3 / 3' && next.hidden === true);

  finish.click();
  check('Finish Commit fires quiz_completed and hands off to results',
    tracked.length === 1 && tracked[0] === 'quiz_completed' &&
    handedOff.length === 1 && handedOff[0].report && handedOff[0].report.stub,
    JSON.stringify(tracked) + '/' + handedOff.length);

  finish.click();
  check('the commit gate refuses a second Finish click',
    tracked.length === 1 && handedOff.length === 1);
  check('the Record is captured exactly once, after the desktop arrived (#63)',
    desktopCaptures.length === 1 &&
    JSON.stringify(finishSeq) === JSON.stringify(['render', 'capture']) &&
    desktopCaptures[0].bank === bank &&
    desktopCaptures[0].answers.length === 3 &&
    desktopCaptures[0].answers.indexOf(null) === -1,
    JSON.stringify(finishSeq) + '/' + JSON.stringify(desktopCaptures.map(function(c) { return c.answers; })));

  /* ── A fully answered but UNCOMMITTED Session still resumes (#63) ───── */

  // The Record is the commit's, never the answers': a Session that is
  // complete but uncommitted resumes exactly as ADR 0020 designed it — the
  // last Question, [Finish] live — and writes nothing to the desktop store.
  var uncommitted = [1, 2, 3];
  App.SessionStore.clear();
  App.SessionStore.save(bank, uncommitted);
  var capturesBefore = desktopCaptures.length;
  App.renderQuiz(bank);

  quiz = views['quiz-view'];
  body = quiz.children[0];
  footer = quiz.children[1];
  statusbar = quiz.children[2];
  back = footer.children[0];
  next = footer.children[1];
  finish = footer.children[2];
  counter = byClass(statusbar, 'quiz-status-counter')[0];

  check('a complete uncommitted Session resumes on the last Question with Finish live',
    counter.textContent === '3 / 3' && next.hidden === true &&
    finish.disabled === false && back.disabled === false,
    counter.textContent + '/' + next.hidden + '/' + finish.disabled);
  check('the resume path never captures a desktop Record (#63)',
    desktopCaptures.length === capturesBefore &&
    tracked.length === 1 && handedOff.length === 1 &&
    JSON.stringify(App.quizState().answers) === JSON.stringify(uncommitted),
    'captures=' + desktopCaptures.length + ' state=' +
    JSON.stringify(App.quizState().answers));

  App.SessionStore.clear();

  /* ── Layout contracts in the stylesheets (ticket #52) ──────────────── */

  var quizCss = read('css/quiz.css');
  var shellCss = read('css/shell.css');

  check('quiz.css: no sticky chrome left behind',
    !/position:\s*sticky/.test(quizCss));
  check('quiz.css: only .quiz-body scrolls (footer/statusbar pinned flex:none)',
    /\.quiz-body\s*\{[^}]*overflow-y:\s*auto/.test(quizCss) &&
    /\.quiz-footer\s*\{[^}]*flex:\s*none/.test(quizCss) &&
    /\.quiz-statusbar\s*\{[^}]*flex:\s*none/.test(quizCss));
  check('quiz.css: footer is separated by a 1px rule',
    /\.quiz-footer\s*\{[^}]*border-top:\s*1px/.test(quizCss));
  check('quiz.css: status bar is a readable 32px band (#73)',
    /\.quiz-statusbar\s*\{[^}]*height:\s*32px/.test(quizCss));
  check('quiz.css: progress track is 150×14 with the segmented fill at 100% (#73)',
    /\.quiz-status-track\s*\{[^}]*width:\s*150px/.test(quizCss) &&
    /\.quiz-status-track\s*\{[^}]*height:\s*14px/.test(quizCss) &&
    /\.quiz-status-fill\s*\{[^}]*height:\s*100%/.test(quizCss));

  check('shell.css: window is fixed height above the taskbar',
    /\.os-window\s*\{[^}]*height:\s*calc\(100vh - var\(--os-taskbar-height\)\)/.test(shellCss));
  check('shell.css: the page itself never scrolls',
    /body\s*\{[^}]*overflow:\s*hidden/.test(shellCss));
  check('shell.css: every view scrolls internally except the quiz',
    /:not\(#quiz-view\)/.test(shellCss) &&
    /\.os-window\s+#app\s*>\s*section:not\(\[hidden\]\):not\(#quiz-view\)\s*\{[^}]*overflow-y:\s*auto/.test(shellCss));

  /* ── Splash window + welcome card contracts (ticket #53) ───────────── */

  var stylesCss = read('styles.css');

  check('shell.css: splash state is derived from section[hidden], no controller',
    /body:has\(#app > #landing-view:not\(\[hidden\]\)\)\s*\{[^}]*display:\s*flex/.test(shellCss));

  check('shell.css: splash window is ~560px content-sized, centred above the taskbar',
    /body:has\(#app > #landing-view:not\(\[hidden\]\)\)\s+\.os-window\s*\{[^}]*width:\s*min\(560px/.test(shellCss) &&
    /body:has\(#app > #landing-view:not\(\[hidden\]\)\)\s+\.os-window\s*\{[^}]*height:\s*auto/.test(shellCss) &&
    /body:has\(#app > #landing-view:not\(\[hidden\]\)\)\s*\{[^}]*height:\s*calc\(100vh - var\(--os-taskbar-height\)\)/.test(shellCss));

  check('styles.css: welcome card on the wizard classes, no editorial banner',
    /#landing-view\.wizard\s*\{/.test(stylesCss) &&
    !/#landing-view\s*\{\s*display:\s*flex[^}]*align-items:\s*flex-start/.test(stylesCss));

  check('styles.css: catchphrase on the pixel grids — Silkscreen 32px, CJK 36px',
    /#landing-view \.wizard-title\s*\{[^}]*font-family:\s*'Silkscreen'/.test(stylesCss) &&
    /#landing-view \.wizard-title\s*\{[^}]*font-size:\s*32px/.test(stylesCss) &&
    /html\[lang\^="zh"\] #landing-view \.wizard-title\s*\{[^}]*font-size:\s*36px/.test(stylesCss));

  check('styles.css: the old 64px editorial headline is gone',
    !/#landing-view h1\s*\{[^}]*font-size:\s*64px/.test(stylesCss));

  check('pages: the landing section is the wizard card in both locales',
    read('index.html').indexOf('<section id="landing-view" class="wizard">') !== -1 &&
    read('zh/index.html').indexOf('<section id="landing-view" class="wizard">') !== -1);

  check('quiz.js: the landing renderer no longer wires the language offer',
    read('js/quiz.js').indexOf('offerInto') === -1);

  // Ticket #63: the Record has exactly ONE writer in the answering view.
  // A second write site (a load, an answer, a notice) is the regression.
  var quizSrc = read('js/quiz.js');
  check('quiz.js: the Finish Commit is the only desktop-Record writer',
    (quizSrc.match(/captureAtCommit\s*\(/g) || []).length === 1 &&
    quizSrc.indexOf('DesktopStore') !== -1,
    'writers=' + (quizSrc.match(/captureAtCommit\s*\(/g) || []).length);

  check('the load path has no desktop-Record write (persist stays Session-only)',
    read('js/session-store.js').split('quiz-desktop').length - 1 === 0);

  check('pages: both locales load js/desktop-store.js',
    read('index.html').indexOf('js/desktop-store.js') !== -1 &&
    read('zh/index.html').indexOf('js/desktop-store.js') !== -1);

  /* ── Restore globals for the rest of the suite ─────────────────────── */

  globalThis.setTimeout = realSetTimeout;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.matchMedia;
  App.Scoring = realScoring;              // scoring.js owns the global
  App.renderResults = realRenderResults;
  if (realDesktopStore === undefined) delete App.DesktopStore;
  else App.DesktopStore = realDesktopStore;
  globalThis.Analytics = realAnalytics;

  return results;
};
