exports.name = 'Desktop core + results section mounts (ticket #59)';

/**
 * Pure-core tests for js/desktop-core.js: the window Record transitions and
 * the mode-derived consequences are driven DIRECTLY (no DOM, no timers, no
 * storage), the way tests/js/test-wizard-nav.js drives the Wizard
 * Navigation core. Nothing here asserts markup or class names.
 *
 * The last block drives the results presenter's new per-section mount
 * points through the existing presenter seam, because "a mount point must
 * survive the in-place language-switch re-render" is behaviour, and the
 * only way to show it is to render, re-render and resolve the mounts again.
 */
exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  function geoEqual(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  var App = require('../../js/desktop-core.js');
  var Desktop = App.DesktopCore;

  check('the desktop core is exposed on the App.* seam',
    Desktop && typeof Desktop.createCore === 'function',
    Object.keys(Desktop || {}).join(','));

  /* ── Initial record and fresh-copy snapshots ───────────────────────── */

  var c = Desktop.createCore();
  var s0 = c.snapshot();
  check('one window record exists, wired as the Quiz window',
    c.soleId === 'quiz' && Object.keys(s0.windows).length === 1,
    Object.keys(s0.windows).join(','));
  check('the record starts normal, on the landing view, no dialog, z 0',
    s0.windows.quiz.mode === 'normal' && s0.windows.quiz.lastMode === 'normal' &&
    s0.windows.quiz.z === 0 && s0.view === 'landing-view' &&
    s0.confirmOpen === false && s0.active === 'quiz');
  check('a fresh record keeps its arrangement in lastGeometry too',
    geoEqual(s0.windows.quiz.geometry, s0.windows.quiz.lastGeometry),
    JSON.stringify(s0.windows.quiz.geometry));
  check('normal mode derives visible + taskbar + focusable',
    c.isVisible() === true && c.inTaskbar() === true && c.canFocus() === true);
  check('windowSnapshot returns a fresh copy, never the Record',
    c.windowSnapshot() !== c.windowSnapshot() &&
    c.windowSnapshot().geometry !== c.windowSnapshot().geometry);

  var tampered = c.snapshot();
  tampered.windows.quiz.mode = 'maximized';
  tampered.view = 'nowhere';
  tampered.confirmOpen = true;
  check('mutating a snapshot cannot write back into the state',
    c.snapshot().windows.quiz.mode === 'normal' &&
    c.getView() === 'landing-view' && c.isConfirmOpen() === false);

  /* ── Landing-view gating (the era rule, preserved by the core) ─────── */

  check('landing: close and maximize are gated off',
    c.canClose() === false && c.canMaximize() === false &&
    c.requestClose() === false && c.toggleMaximize() === false &&
    c.isConfirmOpen() === false && c.snapshot().windows.quiz.mode === 'normal');
  check('landing: minimize stays live and restores to normal',
    c.canMinimize() === true && c.minimize() === true &&
    c.snapshot().windows.quiz.mode === 'minimized' &&
    c.isVisible() === false && c.inTaskbar() === true &&
    c.restore() === true && c.snapshot().windows.quiz.mode === 'normal');
  check('restore is refused when the window is not minimized or hidden',
    c.restore() === false && c.snapshot().windows.quiz.mode === 'normal');
  check('setView ignores an empty or non-string view id',
    c.setView('') === 'landing-view' && c.setView(null) === 'landing-view');

  /* ── Maximize/minimize round trip keeps mode AND geometry ──────────── */

  var m = Desktop.createCore();
  m.setView('quiz-view');
  check('a live view enables maximize, minimize and close',
    m.canMaximize() === true && m.canMinimize() === true && m.canClose() === true);
  var moved = { x: 120, y: 80, w: 800, h: 600 };
  check('a normal window accepts a geometry write',
    m.applyGeometry(moved) === true && geoEqual(m.windowSnapshot().geometry, moved));
  var caller = { x: 1, y: 2, w: 3, h: 4 };
  m.applyGeometry(caller);
  caller.x = 999;
  check('the Record never aliases the caller geometry object',
    m.windowSnapshot().geometry.x === 1, String(m.windowSnapshot().geometry.x));
  check('a bad geometry write is refused',
    m.applyGeometry({ x: 0, y: 0, w: 10 }) === false &&
    m.applyGeometry(null) === false &&
    m.applyGeometry('nope') === false &&
    geoEqual(m.windowSnapshot().geometry, { x: 1, y: 2, w: 3, h: 4 }));

  m.applyGeometry(moved);
  m.toggleMaximize();
  check('maximize from normal records the mode it came from',
    m.snapshot().windows.quiz.mode === 'maximized' &&
    m.windowSnapshot().lastMode === 'maximized');
  check('geometry writes are refused while maximized',
    m.applyGeometry({ x: 5, y: 5, w: 5, h: 5 }) === false &&
    geoEqual(m.windowSnapshot().geometry, moved));
  check('minimizing a maximized window keeps its arrangement',
    m.minimize() === true && m.windowSnapshot().lastMode === 'maximized' &&
    geoEqual(m.windowSnapshot().lastGeometry, moved) &&
    m.isVisible() === false && m.inTaskbar() === true);
  check('maximize is refused from minimized',
    m.canMaximize() === true && m.toggleMaximize() === false &&
    m.snapshot().windows.quiz.mode === 'minimized');
  check('minimize is refused from minimized',
    m.canMinimize() === false && m.minimize() === false);
  check('restore returns to the pre-minimize mode and geometry together',
    m.restore() === true && m.snapshot().windows.quiz.mode === 'maximized' &&
    geoEqual(m.windowSnapshot().geometry, moved));
  check('un-maximizing lands back on normal',
    m.toggleMaximize() === true && m.snapshot().windows.quiz.mode === 'normal');

  /* ── The End Program gate owns the desktop ──────────────────────────── */

  var d = Desktop.createCore();
  d.setView('results-view');
  d.applyGeometry({ x: 30, y: 40, w: 700, h: 500 });
  var beforeDialog = JSON.stringify(d.snapshot());
  check('a live view opens the End Program gate',
    d.requestClose() === true && d.isConfirmOpen() === true);
  check('the gate blocks minimize', d.minimize() === false);
  check('the gate blocks restore', d.restore() === false);
  check('the gate blocks maximize', d.toggleMaximize() === false);
  check('the gate blocks hide', d.hide() === false);
  check('the gate blocks a geometry write',
    d.applyGeometry({ x: 1, y: 1, w: 1, h: 1 }) === false);
  check('the gate blocks raise', d.raise() === false);
  check('the gate blocks a second close request', d.requestClose() === false);
  check('the gate blocks the close queries',
    d.canClose() === false && d.canMinimize() === false && d.canMaximize() === false);
  check('cancelClose leaves the desktop exactly as it was',
    d.cancelClose() === true && d.isConfirmOpen() === false &&
    JSON.stringify(d.snapshot()) === beforeDialog);
  d.requestClose();
  check('confirmClose lands on the landing view, un-maximized, gate closed',
    d.confirmClose() === true && d.getView() === 'landing-view' &&
    d.snapshot().windows.quiz.mode === 'normal' && d.isConfirmOpen() === false);
  check('confirmClose/cancelClose are refused with no dialog open',
    d.confirmClose() === false && d.cancelClose() === false);

  /* ── hidden: off the desktop, out of the taskbar, never focusable ──── */

  var h = Desktop.createCore();
  h.setView('quiz-view');
  h.applyGeometry({ x: 200, y: 100, w: 640, h: 480 });
  var arrangement = h.windowSnapshot().geometry;
  h.toggleMaximize();                       // maximized, then hidden from it
  h.toggleMaximize();                       // back to normal
  check('hide takes the window off the desktop and out of the taskbar',
    h.hide() === true && h.isVisible() === false && h.inTaskbar() === false &&
    h.canFocus() === false);
  check('minimize is refused from hidden',
    h.canMinimize() === false && h.minimize() === false);
  check('maximize is refused from hidden',
    h.canMaximize() === false && h.toggleMaximize() === false);
  check('close is refused from hidden',
    h.canClose() === false && h.requestClose() === false);
  check('a hidden window is not a focus target',
    h.setActive('quiz') === false && h.canFocus() === false);
  check('hide is refused when already hidden', h.hide() === false);
  check('hidden keeps the arrangement it was put away with',
    geoEqual(h.windowSnapshot().lastGeometry, arrangement) &&
    h.windowSnapshot().lastMode === 'normal');
  check('restore brings a hidden window back to mode and arrangement',
    h.restore() === true && h.snapshot().windows.quiz.mode === 'normal' &&
    geoEqual(h.windowSnapshot().geometry, arrangement) &&
    h.isVisible() === true && h.inTaskbar() === true && h.canFocus() === true);
  h.minimize();
  check('hiding a minimized window still restores the pre-minimize mode',
    h.hide() === true && h.windowSnapshot().lastMode === 'normal' &&
    h.isVisible() === false && h.inTaskbar() === false);
  check('one restore brings it all the way back',
    h.restore() === true && h.snapshot().windows.quiz.mode === 'normal' &&
    h.isVisible() === true);

  /* ── Stacking and activation ────────────────────────────────────────── */

  var z = Desktop.createCore();
  z.setView('review-view');
  check('the first record starts at z 0 and the counter follows',
    z.windowSnapshot().z === 0 && z.snapshot().zCounter === 0);
  check('raise puts the window on top and makes it active',
    z.raise() === true && z.windowSnapshot().z === 1 &&
    z.snapshot().zCounter === 1 && z.activeId() === 'quiz');
  check('raise stacks monotonically',
    z.raise() === true && z.raise() === true &&
    z.windowSnapshot().z === 3 && z.snapshot().zCounter === 3);
  check('raise is refused from minimized',
    z.minimize() === true && z.raise() === false && z.snapshot().zCounter === 3);
  z.restore();
  check('setActive addresses a record that exists; an unknown one is refused',
    z.setActive('quiz') === true && z.setActive('plan') === false &&
    z.activeId() === 'quiz');

  /* ── Ticket #61: three programs on one desktop ─────────────────────── */

  var D = Desktop.DESIGN_DEFAULTS;
  var STEP = Desktop.CASCADE;

  function planCore() {
    var p = Desktop.createCore();
    p.setView('results-view');
    return p;
  }

  var a = planCore();
  check('only the Quiz program exists before anything arrives',
    Object.keys(a.snapshot().windows).length === 1 &&
    a.taskbarList().join(',') === 'quiz');
  check('an unarrived program answers every query false',
    a.hasWindow('action-plan') === false &&
    a.isVisible('action-plan') === false && a.inTaskbar('action-plan') === false &&
    a.canFocus('action-plan') === false && a.canMinimize('action-plan') === false &&
    a.canMaximize('action-plan') === false && a.canClose('action-plan') === false &&
    a.windowSnapshot('action-plan') === null);
  check('open() refuses an unknown program',
    a.open('spreadsheet', {}) === false && a.hasWindow('spreadsheet') === false);
  check('open() creates the Record, in the taskbar, visible',
    a.open('action-plan', {}) === true && a.hasWindow('action-plan') === true &&
    a.inTaskbar('action-plan') === true && a.isVisible('action-plan') === true);
  check('a second arrival of a running program is a no-op',
    a.open('action-plan', {}) === false);
  check('the taskbar lists the running windows in the stable program order',
    a.taskbarList().join(',') === 'quiz,action-plan');
  check('arrival NEVER takes the focus: the Quiz window stays the active one',
    a.activeId() === 'quiz' && a.canFocus('quiz') === true &&
    a.canFocus('action-plan') === false);

  var aBelow = planCore();
  aBelow.raise('quiz');                       // the Participant is reading the quiz
  aBelow.open('action-plan', { below: true });
  check('an arrival below the active window stacks under it, active stays on top',
    aBelow.windowSnapshot('action-plan').z < aBelow.windowSnapshot('quiz').z &&
    aBelow.windowSnapshot('quiz').z === Math.max.apply(null, aBelow.taskbarList().map(function(pid) {
      return aBelow.windowSnapshot(pid).z;
    })), JSON.stringify({
      plan: aBelow.windowSnapshot('action-plan').z,
      quiz: aBelow.windowSnapshot('quiz').z
    }));

  /* Cascade arithmetic: designed default, or 24px down-right from the
     window the Participant is reading. */
  var b = planCore();
  check('a window born while another is focused cascades 24px down-right',
    b.open('action-plan', { below: true }) === true &&
    geoEqual(b.windowSnapshot('action-plan').geometry, {
      x: D.quiz.x + STEP, y: D.quiz.y + STEP,
      w: D['action-plan'].w, h: D['action-plan'].h
    }), JSON.stringify(b.windowSnapshot('action-plan').geometry));
  var c2 = planCore();
  c2.minimize();                       // nothing focused on the desktop now
  check('with no window focused a program keeps its designed geometry',
    c2.open('action-plan', {}) === true &&
    geoEqual(c2.windowSnapshot('action-plan').geometry, D['action-plan']),
    JSON.stringify(c2.windowSnapshot('action-plan').geometry));
  check('the designed Quiz default still fits 1024×768 without internal scrolling',
    geoEqual(D.quiz, { x: 120, y: 16, w: 888, h: 704 }) &&
    D.quiz.x + D.quiz.w <= 1024 &&
    D.quiz.x > 104 &&   // clear of the desktop shortcut column
    D.quiz.y + D.quiz.h <= 768 - 36,
    JSON.stringify(D.quiz));

  /* The Deep-Dive Prompt arrives MINIMIZED at the Finish Commit. */
  var d2 = planCore();
  check('a minimized arrival is a taskbar button only',
    d2.open('deep-dive', { minimized: true }) === true &&
    d2.windowSnapshot('deep-dive').mode === 'minimized' &&
    d2.isVisible('deep-dive') === false && d2.inTaskbar('deep-dive') === true &&
    d2.canFocus('deep-dive') === false && d2.activeId() === 'quiz');
  check('a minimized arrival keeps the designed geometry for its restore',
    geoEqual(d2.windowSnapshot('deep-dive').lastGeometry,
      d2.windowSnapshot('deep-dive').geometry) &&
    d2.windowSnapshot('deep-dive').lastMode === 'normal');
  check('restoring the Deep-Dive Prompt lands on its designed geometry',
    d2.restore('deep-dive') === true &&
    d2.windowSnapshot('deep-dive').mode === 'normal' &&
    geoEqual(d2.windowSnapshot('deep-dive').geometry,
      { x: D.quiz.x + STEP, y: D.quiz.y + STEP, w: D['deep-dive'].w, h: D['deep-dive'].h }) &&
    d2.activeId() === 'quiz', JSON.stringify(d2.windowSnapshot('deep-dive').geometry));
  check('a minimized window can be minimized no further',
    d2.minimize('quiz') === true && d2.minimize('quiz') === false);

  /* Per-window transitions: one window's move is never another's. */
  var e = planCore();
  e.open('action-plan', {});
  e.open('deep-dive', { minimized: true });
  var quizBefore = e.windowSnapshot('quiz');
  e.minimize('action-plan');
  e.toggleMaximize('deep-dive');       // refused: maximized from minimized
  check('minimizing one program leaves the others alone',
    e.windowSnapshot('action-plan').mode === 'minimized' &&
    e.windowSnapshot('deep-dive').mode === 'minimized' &&
    JSON.stringify(e.windowSnapshot('quiz')) === JSON.stringify(quizBefore));
  check('geometry writes address one window only',
    e.applyGeometry({ x: 10, y: 10, w: 400, h: 400 }, 'quiz') === true &&
    geoEqual(e.windowSnapshot('quiz').geometry, { x: 10, y: 10, w: 400, h: 400 }) &&
    e.windowSnapshot('action-plan').geometry.x !== 10);
  check('an unarrived window refuses geometry writes',
    Desktop.createCore().applyGeometry({ x: 0, y: 0, w: 600, h: 600 }, 'deep-dive') === false);

  /* Focus and stacking across the desktop. */
  var f = planCore();
  f.open('action-plan', { below: true });
  check('a pointer interaction raises the window and makes it active',
    f.raise('action-plan') === true && f.activeId() === 'action-plan' &&
    f.windowSnapshot('action-plan').z > f.windowSnapshot('quiz').z &&
    f.canFocus('action-plan') === true && f.canFocus('quiz') === false);
  f.hide('action-plan');
  check('putting the active window away hands the desktop to the window under it',
    f.activeId() === 'quiz' && f.inTaskbar('action-plan') === false &&
    f.taskbarList().join(',') === 'quiz');
  check('a hidden window leaves the taskbar but is not destroyed',
    f.hasWindow('action-plan') === true && f.restore('action-plan') === true &&
    f.inTaskbar('action-plan') === true);
  var fQuiz = f.windowSnapshot('quiz').geometry;
  check('a settled re-arrival re-presents a put-away program with fresh geometry',
    f.hide('action-plan') === true && f.open('action-plan', { below: true }) === true &&
    f.windowSnapshot('action-plan').mode === 'normal' &&
    geoEqual(f.windowSnapshot('action-plan').geometry, {
      x: fQuiz.x + STEP, y: fQuiz.y + STEP, w: D['action-plan'].w, h: D['action-plan'].h
    }), JSON.stringify(f.windowSnapshot('action-plan').geometry));
  check('the dialog gate owns every window on the desktop',
    f.requestClose('quiz') === true &&
    f.minimize('action-plan') === false && f.raise('action-plan') === false &&
    f.hide('action-plan') === false && f.applyGeometry({ x: 1, y: 1, w: 1, h: 1 }, 'quiz') === false &&
    f.cancelClose() === true);

  var g2 = planCore();
  g2.open('action-plan', { below: true });
  g2.raise('action-plan');
  var zBefore = JSON.stringify(g2.snapshot().windows);
  g2.setActive('quiz');
  check('setActive marks a window active without raising it',
    g2.activeId() === 'quiz' &&
    g2.windowSnapshot('action-plan').z > g2.windowSnapshot('quiz').z &&
    JSON.stringify(g2.snapshot().windows) === zBefore);
  check('an active window that is not on top still owns the focus',
    g2.canFocus('quiz') === true && g2.canFocus('action-plan') === false);

  /* ── js/windows.js keeps no parallel copy of the state ─────────────── */

  var Windows = require('../../js/windows.js');
  var wm = Windows.createMachine();
  check('the window manager machine delegates to the desktop core',
    wm.core && typeof wm.core.snapshot === 'function' &&
    wm.core.isVisible === wm.isVisible && wm.core.canClose === wm.canClose);
  check('the machine reports the core record, not a local mode',
    wm.getState().mode === wm.snapshot().windows.quiz.mode &&
    wm.getState().view === wm.snapshot().view &&
    wm.getState().confirmOpen === wm.snapshot().confirmOpen);
  wm.setView('quiz-view');
  wm.applyGeometry({ x: 70, y: 60, w: 500, h: 400 });
  wm.toggleMaximize();
  wm.minimize();
  check('a machine transition is a core transition (one state model)',
    wm.snapshot().windows.quiz.mode === 'minimized' &&
    wm.snapshot().windows.quiz.lastMode === 'maximized' &&
    wm.getState().mode === 'minimized' && wm.isVisible() === false);
  wm.restore();
  check('machine restore reads back the core record — mode and geometry',
    wm.getState().mode === 'maximized' &&
    wm.snapshot().windows.quiz.geometry.x === 70 &&
    geoEqual(wm.snapshot().windows.quiz.geometry,
      wm.snapshot().windows.quiz.lastGeometry));
  wm.toggleMaximize();
  wm.requestClose();
  check('the End Program gate reaches the machine through the core',
    wm.getState().confirmOpen === true && wm.canMinimize() === false &&
    wm.cancelClose() === true && wm.getState().confirmOpen === false);

  /* ── Results presenter: per-section mount points survive a re-render ── */

  // Async because the Action Plan slot settles on a microtask: the suite
  // must flush it while its own fake document is still installed, or the
  // deferred render would run against a torn-down global.
  return mountPointChecks(check).then(function() {
    return results;
  });
};

/**
 * The mount-point block needs a document to render into, so it is kept
 * separate and cleans up after itself: fake DOM and module globals are
 * snapshotted, then restored (the pattern of test-rerender.js /
 * test-lang-switch.js). It asserts behaviour only — which section content
 * lands inside which mount, and that the mount still resolves after the
 * in-place language-switch re-render.
 */
function mountPointChecks(check) {
  var prev = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    showView: globalThis.App && globalThis.App.showView,
    actionPlan: globalThis.App && globalThis.App.ActionPlan,
    promptBuilder: globalThis.App && globalThis.App.PromptBuilder
  };
  var prevLocale = globalThis.App && globalThis.App.I18n && globalThis.App.I18n.locale;

  // ── fake DOM: the four views plus a live getElementById ─────────────
  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '', id: '',
      disabled: false, hidden: false, attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) { el.attrs[n] = String(v); },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(child) {
        el.children.push(child); if (child) child.parentNode = el; return child;
      },
      removeChild: function(child) {
        el.children = el.children.filter(function(x) { return x !== child; });
        if (child) child.parentNode = null; return child;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; }
    };
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return ''; },
      set: function(v) {
        if (v === '') {
          el.children.forEach(function(x) { if (x) x.parentNode = null; });
          el.children = [];
        }
      }
    });
    el.classList = {
      add: function(k) { el.classes[k] = true; },
      remove: function(k) { delete el.classes[k]; },
      contains: function(k) { return !!el.classes[k]; }
    };
    return el;
  }

  var views = {};
  ['landing-view', 'quiz-view', 'results-view', 'review-view'].forEach(function(id) {
    var sec = fakeEl('section');
    sec.id = id;
    views[id] = sec;
  });

  function findById(node, id) {
    if (!node) return null;
    var list = Array.isArray(node) ? node : [node];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n) continue;
      if (n.id === id) return n;
      var found = findById(n.children, id);
      if (found) return found;
    }
    return null;
  }

  var roots = [views['landing-view'], views['quiz-view'],
    views['results-view'], views['review-view']];

  globalThis.document = {
    body: fakeEl('body'),
    documentElement: fakeEl('html'),
    createElement: function(tag) { return fakeEl(tag); },
    createElementNS: function(ns, tag) { return fakeEl(tag); },
    createTextNode: function(text) { return { nodeType: 3, textContent: String(text) }; },
    createDocumentFragment: function() { return fakeEl('#fragment'); },
    getElementById: function(id) { return findById(roots, id) || findById(globalThis.document.body, id); }
  };
  globalThis.window = { APP_CONFIG: { proxyUrl: '' }, Corpus: {} };
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator) {
    try { globalThis.navigator = {}; } catch (e) { /* read-only host object */ }
  }

  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  require('../../js/ast.js');
  require('../../js/scoring.js');
  require('../../js/results.js');

  var App = globalThis.App;
  App.I18n.use('en');
  App.showView = function() {};
  App.ActionPlan = {
    assemble: function() {
      return Promise.resolve({ narrative: 'Narrative body.', actions: [] });
    }
  };
  var PROMPT_MARK = 'DEEP-DIVE-PROMPT-MARKER';
  App.PromptBuilder = { build: function() { return PROMPT_MARK; } };

  function textOf(node, out) {
    out = out || [];
    if (node == null) return out;
    if (node.nodeType === 3) { out.push(node.textContent); return out; }
    if (typeof node.textContent === 'string' && node.textContent !== '') {
      out.push(node.textContent);
    }
    (node.children || []).forEach(function(kid) { textOf(kid, out); });
    return out;
  }
  function mountText(name) {
    var host = App.resultsMount(name);
    return host ? textOf(host).join(' ') : null;
  }

  var t = function(id) { return App.I18n.t(id); };

  return (async function() {
    try {
      var bank = require('../../questions.json');
      var answers = bank.questions.map(function() { return 1; });
      var scored = App.Scoring.computeScores(bank, answers);
      check('the real Scoring Engine yields a report for the mount checks',
        scored.ok === true, scored.error);
      if (!scored.ok) return;

      App.renderResults(bank, scored.report);

      check('the presenter names one mount per movable section',
        !!App.resultsMountIds['action-plan'] && !!App.resultsMountIds['deep-dive'] &&
        App.resultsMountIds['action-plan'] !== App.resultsMountIds['deep-dive'],
        JSON.stringify(App.resultsMountIds));
      check('an unknown section name has no mount',
        App.resultsMount('radar') === null && App.resultsMount() === null);

      var planHost = App.resultsMount('action-plan');
      var ddHost = App.resultsMount('deep-dive');
      check('the Action Plan mounts in place under its own section host',
        planHost !== null && planHost !== ddHost &&
        mountText('action-plan').indexOf(t('results.actionPlanTitle')) >= 0,
        String(mountText('action-plan')).slice(0, 60));
      check('the Deep-Dive Prompt mounts in place under its own section host',
        ddHost !== null &&
        mountText('deep-dive').indexOf(t('results.deepDiveTitle')) >= 0 &&
        mountText('deep-dive').indexOf(PROMPT_MARK) >= 0,
        String(mountText('deep-dive')).slice(0, 60));

      // The stubbed assemble settles on a microtask; let it land (and write
      // its content through the same mount) before the re-render checks.
      await Promise.resolve();
      await Promise.resolve();

      // The in-place language switch (#56) re-renders the whole view: the
      // mount must resolve again afterwards, on the freshly built element.
      App.I18n.use('zh');
      check('the language-switch re-render path runs',
        App.rerenderResults() === true);
      check('the Action Plan mount survives the in-place re-render',
        App.resultsMount('action-plan') !== null &&
        App.resultsMount('action-plan') !== planHost &&
        mountText('action-plan').indexOf(t('results.actionPlanTitle')) >= 0,
        String(mountText('action-plan')).slice(0, 60));
      check('the Deep-Dive Prompt mount survives the in-place re-render',
        App.resultsMount('deep-dive') !== null &&
        App.resultsMount('deep-dive') !== ddHost &&
        mountText('deep-dive').indexOf(PROMPT_MARK) >= 0);

      App.I18n.use('en');
      App.rerenderResults();
      check('switching back re-mounts the English section copy',
        mountText('action-plan').indexOf(t('results.actionPlanTitle')) >= 0 &&
        mountText('deep-dive').indexOf(t('results.deepDiveHeading')) >= 0,
        String(mountText('deep-dive')).slice(0, 60));
    } catch (err) {
      check('mount-point block ran without throwing', false, err && err.stack || String(err));
    } finally {
      // leave the shared globals as this suite found them
      App.ActionPlan = prev.actionPlan;
      App.PromptBuilder = prev.promptBuilder;
      if (prev.showView === undefined) delete App.showView; else App.showView = prev.showView;
      if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
      if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
      if (prev.navigator === undefined) { try { delete globalThis.navigator; } catch (e) {} }
      else globalThis.navigator = prev.navigator;
      if (prevLocale) App.I18n.use(prevLocale);
    }
  })();
}
