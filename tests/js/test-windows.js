exports.name = 'Windows manager + system dialog (ticket #43)';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── fakeEl DOM stub (pattern from test-lang-routing.js) ────────────────

  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '', id: '',
      disabled: false,
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
      insertBefore: function(node, ref) {
        if (!ref) { el.children.push(node); }
        else {
          var i = el.children.indexOf(ref);
          el.children.splice(i < 0 ? el.children.length : i, 0, node);
        }
        node.parentNode = el;
        return node;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; }
    };
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    return el;
  }

  function fakeDoc() {
    return {
      body: fakeEl('body'),
      activeElement: null,
      createElement: function(tag) { return fakeEl(tag); }
      // no querySelector: the view-sync step stays dormant headless
    };
  }

  // ── Load the module (no document → wiring stays dormant) ──────────────
  var Windows = require('../../js/windows.js');

  check('module loads headless and exposes the seams',
    Windows && typeof Windows.create === 'function' &&
    typeof Windows.createMachine === 'function' &&
    typeof Windows.openSystemDialog === 'function');

  // ── Pure state machine: initial + landing rule ────────────────────────

  var m = Windows.createMachine();
  var s0 = m.getState();
  check('initial state is normal/landing/not-confirming',
    s0.mode === 'normal' && s0.view === 'landing-view' && s0.confirmOpen === false);

  check('landing: close and maximize are disabled (era: app that cannot close itself)',
    m.canClose() === false && m.canMaximize() === false);
  check('landing: minimize stays live (documented era choice — Notepad-with-no-file rule)',
    m.canMinimize() === true);
  check('landing: requestClose is refused',
    m.requestClose() === false && m.getState().confirmOpen === false);
  check('landing: toggleMaximize is refused',
    m.toggleMaximize() === false && m.getState().mode === 'normal');
  check('landing: minimize works and restore returns to normal',
    m.minimize() === true && m.getState().mode === 'minimized' &&
    m.restore() === true && m.getState().mode === 'normal');
  check('restore is refused when not minimized',
    m.restore() === false && m.getState().mode === 'normal');

  // ── Quiz/results/review: all three controls live ──────────────────────

  ['quiz-view', 'results-view', 'review-view'].forEach(function(view) {
    var mm = Windows.createMachine();
    mm.setView(view);
    check(view + ': close, maximize and minimize all enabled',
      mm.canClose() && mm.canMaximize() && mm.canMinimize());
  });

  // ── Maximize toggle ───────────────────────────────────────────────────

  var mx = Windows.createMachine();
  mx.setView('quiz-view');
  check('maximize toggles normal → maximized → normal',
    mx.toggleMaximize() === true && mx.getState().mode === 'maximized' &&
    mx.toggleMaximize() === true && mx.getState().mode === 'normal');

  // ── Minimize/restore keeps the maximized mode ─────────────────────────

  mx.toggleMaximize();                       // maximized
  check('minimize from maximized', mx.minimize() === true &&
    mx.getState().mode === 'minimized');
  check('restore from maximized-minimized returns to maximized (Win95 rule)',
    mx.restore() === true && mx.getState().mode === 'maximized');

  // ── requestClose / confirmClose / cancelClose ─────────────────────────

  var mc = Windows.createMachine();
  mc.setView('quiz-view');
  check('requestClose from quiz sets confirmOpen',
    mc.requestClose() === true && mc.getState().confirmOpen === true);

  // Dialog-open blocks every other transition.
  check('confirmOpen blocks minimize', mc.minimize() === false &&
    mc.getState().mode === 'normal');
  check('confirmOpen blocks restore', mc.restore() === false);
  check('confirmOpen blocks toggleMaximize', mc.toggleMaximize() === false &&
    mc.getState().mode === 'normal');
  check('confirmOpen blocks a second requestClose', mc.requestClose() === false);

  check('confirmClose lands on the landing view, un-maximized, dialog closed',
    mc.confirmClose() === true && mc.getState().view === 'landing-view' &&
    mc.getState().mode === 'normal' && mc.getState().confirmOpen === false);

  var mcancel = Windows.createMachine();
  mcancel.setView('quiz-view');
  mcancel.toggleMaximize();
  mcancel.requestClose();
  check('cancelClose keeps view, mode and dialog state (Session-equivalent UI preserved)',
    mcancel.cancelClose() === true && mcancel.getState().view === 'quiz-view' &&
    mcancel.getState().mode === 'maximized' && mcancel.getState().confirmOpen === false);
  check('confirmClose/cancelClose are refused when no dialog is open',
    mcancel.confirmClose() === false && mcancel.cancelClose() === false);

  // ── Controller: rendering onto attached DOM ───────────────────────────

  var doc = fakeDoc();
  var pending = [];
  var ctl = Windows.create({
    doc: doc,
    schedule: function(fn) { pending.push(fn); }   // traces run on demand
  });
  var refs = {
    windowEl: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  ctl.attach(refs);

  check('landing render: [×][□] disabled, [—] enabled, program button pressed',
    refs.buttons.close.disabled === true && refs.buttons.maximize.disabled === true &&
    refs.buttons.minimize.disabled === false &&
    refs.programBtn.getAttribute('aria-pressed') === 'true');
  check('attach makes the window frame focusable for restore()',
    refs.windowEl.getAttribute('tabindex') === '-1');

  ctl.setView('quiz-view');
  check('quiz render: all three title buttons enabled',
    refs.buttons.close.disabled === false && refs.buttons.maximize.disabled === false &&
    refs.buttons.minimize.disabled === false);

  // Minimize trace: is-minimizing now, is-minimized after the scheduled swap.
  ctl.minimize();
  var st = ctl.getState();
  check('minimize: mode minimized, program button unpressed, trace class on',
    st.mode === 'minimized' && refs.programBtn.getAttribute('aria-pressed') === 'false' &&
    refs.windowEl.classList.contains('is-minimizing'));
  while (pending.length) pending.shift()();
  check('minimized trace settles: window hidden via is-minimized',
    !refs.windowEl.classList.contains('is-minimizing') &&
    refs.windowEl.classList.contains('is-minimized'));
  check('minimized: minimize button disabled', refs.buttons.minimize.disabled === true);

  // Restore trace back + focus returns to the window.
  ctl.restore();
  check('restore: trace-back class on, focus returns to the window frame',
    refs.windowEl.classList.contains('is-restoring') &&
    refs.windowEl.focused === true &&
    refs.programBtn.getAttribute('aria-pressed') === 'true');
  while (pending.length) pending.shift()();
  check('restore trace settles clean', !refs.windowEl.classList.contains('is-restoring') &&
    !refs.windowEl.classList.contains('is-minimized'));

  // Program button is the restore path.
  ctl.minimize();
  while (pending.length) pending.shift()();
  refs.programBtn.click();
  check('clicking the program button restores a minimized window',
    ctl.getState().mode === 'normal' && refs.programBtn.getAttribute('aria-pressed') === 'true');
  while (pending.length) pending.shift()();

  // Rapid minimize→restore inside the trace window: the stale minimize
  // callback must not re-hide the restored window.
  ctl.minimize();                              // trace scheduled, not flushed
  ctl.restore();                               // supersedes it
  while (pending.length) pending.shift()();   // flush both callbacks
  check('a stale minimize trace cannot re-hide a restored window',
    !refs.windowEl.classList.contains('is-minimized') &&
    !refs.windowEl.classList.contains('is-minimizing') &&
    !refs.windowEl.classList.contains('is-restoring') &&
    ctl.getState().mode === 'normal');

  // Maximize class.
  ctl.toggleMaximize();
  check('toggleMaximize paints the is-maximized class',
    ctl.getState().mode === 'maximized' && refs.windowEl.classList.contains('is-maximized'));
  ctl.toggleMaximize();
  check('toggleMaximize again removes it',
    ctl.getState().mode === 'normal' && !refs.windowEl.classList.contains('is-maximized'));

  // The End Program dialog path belongs to a FLOW stage (ticket #60 took it
  // off results/review, where [×] puts the window away): confirm from quiz →
  // landing gating re-rendered.
  ctl.setView('quiz-view');
  check('close on a flow stage routes to the End Program dialog',
    ctl.close() === 'dialog' && ctl.getState().confirmOpen === true);
  check('requestClose renders every button disabled while the dialog owns the desktop',
    refs.buttons.minimize.disabled === true && refs.buttons.maximize.disabled === true &&
    refs.buttons.close.disabled === true);
  ctl.confirmClose();
  check('confirmClose re-renders the landing gating',
    refs.buttons.close.disabled === true && refs.buttons.maximize.disabled === true &&
    refs.buttons.minimize.disabled === false);

  // ── Mobile rule (ticket #46): [□] gated at ≤768px ────────────────────
  // The media query itself is CSS's job; this asserts the JS side: the
  // controller reads the same query, the live change listener re-renders,
  // and [—]/[×] are untouched by the gate.

  var savedMM = globalThis.matchMedia;
  var mediaState = { mobile: false, changeHandler: null };
  globalThis.matchMedia = function(query) {
    var matches = query.indexOf('max-width') >= 0 ? mediaState.mobile : false;
    return {
      matches: matches,
      addEventListener: function(evt, fn) {
        if (evt === 'change') mediaState.changeHandler = fn;
      },
      addListener: function(fn) { mediaState.changeHandler = fn; }
    };
  };

  var mdoc = fakeDoc();
  var mpending = [];
  var mctl = Windows.create({
    doc: mdoc,
    schedule: function(fn) { mpending.push(fn); }
  });
  var mrefs = {
    windowEl: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  mctl.attach(mrefs);
  mctl.setView('quiz-view');
  check('desktop viewport: [□] renders enabled and toggles normally',
    mrefs.buttons.maximize.disabled === false &&
    mctl.toggleMaximize() === true &&
    mctl.getState().mode === 'maximized' &&
    mrefs.windowEl.classList.contains('is-maximized'));

  // Crossing the 768px boundary: the live media listener re-renders.
  mediaState.mobile = true;
  check('attach registered the live 768px change listener',
    typeof mediaState.changeHandler === 'function');
  mediaState.changeHandler();
  check('mobile viewport: [□] renders disabled after the media change',
    mrefs.buttons.maximize.disabled === true);
  check('mobile viewport: toggleMaximize is a no-op — mode and class stand',
    mctl.toggleMaximize() === false &&
    mctl.getState().mode === 'maximized' &&
    mrefs.windowEl.classList.contains('is-maximized'));
  check('mobile viewport: [—] still minimizes (gate touches maximize only)',
    mctl.minimize() === true && mctl.getState().mode === 'minimized' &&
    mrefs.buttons.minimize.disabled === true);
  while (mpending.length) mpending.shift()();
  mctl.restore();
  check('mobile viewport: program-button restore returns to the pre-minimize mode',
    mctl.getState().mode === 'maximized' &&
    mrefs.programBtn.getAttribute('aria-pressed') === 'true');
  while (mpending.length) mpending.shift()();

  // Crossing back to desktop: [□] re-enables and toggles again.
  mediaState.mobile = false;
  mediaState.changeHandler();
  check('desktop again: [□] re-enabled and toggles out of maximized',
    mrefs.buttons.maximize.disabled === false &&
    mctl.toggleMaximize() === true &&
    mctl.getState().mode === 'normal' &&
    !mrefs.windowEl.classList.contains('is-maximized'));
  if (typeof savedMM === 'undefined') delete globalThis.matchMedia;
  else globalThis.matchMedia = savedMM;

  // ── Desktop regime (ticket #60): positioned window, drag, resize, close ─
  // The controller paints the core's Geometry onto the frame and moves it
  // through applyGeometry — the ONE write point the core owns (spec #58).
  // The viewport is injected so the clamp is deterministic headless.

  var VP = { width: 1280, height: 800, taskbar: 36 };
  var ddoc = fakeDoc();
  var dpending = [];
  var dctl = Windows.create({
    doc: ddoc,
    schedule: function(fn) { dpending.push(fn); },
    viewport: function() { return VP; }
  });
  var drefs = {
    windowEl: fakeEl('div'),
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  dctl.attach(drefs);
  var g0 = dctl.geometry();

  function pointer(el, type, x, y) {
    el.handlers[type]({
      pointerId: 1, clientX: x, clientY: y, button: 0, target: el,
      preventDefault: function() {}
    });
  }

  check('the landing frame stays in layout flow: no regime class, no inline box',
    !drefs.windowEl.classList.contains('is-windowed') &&
    drefs.windowEl.style.left === '' && drefs.windowEl.style.width === '');

  dctl.setView('results-view');
  check('the results stage positions the frame at the core Geometry',
    drefs.windowEl.classList.contains('is-windowed') &&
    drefs.windowEl.style.left === g0.x + 'px' &&
    drefs.windowEl.style.top === g0.y + 'px' &&
    drefs.windowEl.style.width === g0.w + 'px' &&
    drefs.windowEl.style.height === g0.h + 'px',
    JSON.stringify(dctl.geometry()));

  dctl.setView('quiz-view');
  check('the quiz stage returns the frame to layout flow',
    !drefs.windowEl.classList.contains('is-windowed') &&
    drefs.windowEl.style.left === '');
  dctl.setView('review-view');
  check('the review stage is the same program: windowed too',
    drefs.windowEl.classList.contains('is-windowed'));
  dctl.setView('results-view');

  // Drag by the title bar: origin + delta, written through the core.
  pointer(drefs.titleBar, 'pointerdown', 300, 100);
  pointer(drefs.titleBar, 'pointermove', 340, 150);
  pointer(drefs.titleBar, 'pointerup', 340, 150);
  var g1 = dctl.geometry();
  check('a title-bar drag writes the moved Geometry through the core',
    g1.x === g0.x + 40 && g1.y === g0.y + 50 && g1.w === g0.w && g1.h === g0.h &&
    drefs.windowEl.style.left === g1.x + 'px', JSON.stringify(g1));
  check('the frame is not left wearing a drag class after pointerup',
    !drefs.windowEl.classList.contains('is-dragging') &&
    !drefs.windowEl.classList.contains('is-resizing'));

  // One continuous gesture: into the walls and back — the clamp bites, the
  // origin stays true, so releasing at the start point restores the box.
  pointer(drefs.titleBar, 'pointerdown', 300, 100);
  pointer(drefs.titleBar, 'pointermove', 9000, 9000);
  var gWall = dctl.geometry();
  check('dragging past the walls clamps: title bar never reaches the taskbar',
    gWall.x === VP.width - Windows.TITLE_REACH &&
    gWall.y === VP.height - VP.taskbar - Windows.TITLEBAR_H &&
    gWall.y + Windows.TITLEBAR_H <= VP.height - VP.taskbar,
    JSON.stringify(gWall));
  pointer(drefs.titleBar, 'pointermove', 300, 100);
  pointer(drefs.titleBar, 'pointerup', 300, 100);
  check('the same gesture back restores the origin Geometry',
    dctl.geometry().x === g1.x && dctl.geometry().y === g1.y,
    JSON.stringify(dctl.geometry()));

  // Resize from the corner grip, with the minimum-size floor.
  var gBeforeResize = dctl.geometry();
  pointer(drefs.resizeGrip, 'pointerdown', 700, 600);
  pointer(drefs.resizeGrip, 'pointermove', 760, 640);
  pointer(drefs.resizeGrip, 'pointerup', 760, 640);
  var g2 = dctl.geometry();
  check('the corner grip resizes through the core',
    g2.w === gBeforeResize.w + 60 && g2.h === gBeforeResize.h + 40 &&
    g2.x === gBeforeResize.x && g2.y === gBeforeResize.y, JSON.stringify(g2));
  pointer(drefs.resizeGrip, 'pointerdown', 700, 600);
  pointer(drefs.resizeGrip, 'pointermove', 10, 10);
  pointer(drefs.resizeGrip, 'pointerup', 10, 10);
  var g3 = dctl.geometry();
  check('the floor keeps the score header readable (min size enforced)',
    g3.w === Windows.MIN_W && g3.h === Windows.MIN_H, JSON.stringify(g3));

  // Maximized: the core refuses the write and the CSS owns the box.
  dctl.toggleMaximize();
  check('a maximized window refuses geometry writes (core rule)',
    dctl.applyGeometry({ x: 0, y: 0, w: 600, h: 400 }) === false &&
    dctl.geometry().w === g3.w);
  check('maximized drops the inline box so .is-maximized draws it',
    !drefs.windowEl.classList.contains('is-windowed') &&
    drefs.windowEl.style.width === '' &&
    drefs.windowEl.classList.contains('is-maximized'));
  pointer(drefs.titleBar, 'pointerdown', 100, 100);
  pointer(drefs.titleBar, 'pointermove', 500, 500);
  pointer(drefs.titleBar, 'pointermove', 100, 100);
  check('a drag started while maximized writes nothing',
    dctl.geometry().w === g3.w && dctl.geometry().x === g3.x);
  dctl.toggleMaximize();

  // Flow stages have no desktop yet — the regime starts at the Finish Commit.
  dctl.setView('quiz-view');
  check('flow stages refuse geometry writes and ignore the drag handles',
    dctl.applyGeometry({ x: 5, y: 5, w: 700, h: 500 }) === false);
  pointer(drefs.titleBar, 'pointerdown', 100, 100);
  pointer(drefs.titleBar, 'pointermove', 400, 400);
  check('a title-bar drag on the quiz stage writes nothing',
    dctl.geometry().x === g3.x && dctl.geometry().w === g3.w);
  dctl.setView('results-view');

  // Close on the desktop stage: the window goes away, no dialog.
  var gClose = dctl.geometry();
  check('close on the results stage puts the window away (core hide, no dialog)',
    dctl.close() === 'hidden' && dctl.getState().mode === 'hidden' &&
    dctl.getState().confirmOpen === false &&
    drefs.windowEl.classList.contains('is-hidden') &&
    !drefs.windowEl.classList.contains('is-windowed'));
  check('a hidden window has nothing to close: [×] renders disabled',
    drefs.buttons.close.disabled === true && dctl.canClose() === false);
  drefs.programBtn.click();
  while (dpending.length) dpending.shift()();
  var gBack = dctl.geometry();
  check('the taskbar program button restores a hidden window to its arrangement',
    dctl.getState().mode === 'normal' &&
    !drefs.windowEl.classList.contains('is-hidden') &&
    drefs.windowEl.classList.contains('is-windowed') &&
    gBack.x === gClose.x && gBack.w === gClose.w &&
    drefs.windowEl.style.left === gClose.x + 'px', JSON.stringify(gBack));

  // Minimized restore still routes through the same program button.
  dctl.minimize();
  while (dpending.length) dpending.shift()();
  drefs.programBtn.click();
  while (dpending.length) dpending.shift()();
  check('the program button still restores a minimized window',
    dctl.getState().mode === 'normal' &&
    !drefs.windowEl.classList.contains('is-minimized'));

  // Flow stages keep the End Program dialog.
  dctl.setView('quiz-view');
  check('close on a flow stage still asks for the End Program dialog',
    dctl.close() === 'dialog' && dctl.getState().confirmOpen === true);
  dctl.cancelClose();

  // Mobile layout (≤768px): the controller refuses geometry; the stylesheet
  // keeps presenting the maximized form. The core stays viewport-blind.
  globalThis.matchMedia = function(query) {
    return {
      matches: query.indexOf('max-width') >= 0,
      addEventListener: function() {}, addListener: function() {}
    };
  };
  check('the mobile layout drops the positioned regime',
    dctl.setView('results-view') &&
    !drefs.windowEl.classList.contains('is-windowed') &&
    drefs.windowEl.style.width === '');
  var gMobile = dctl.geometry();
  check('the mobile layout refuses geometry writes',
    dctl.applyGeometry({ x: 200, y: 200, w: 700, h: 500 }) === false &&
    dctl.geometry().x === gMobile.x);
  pointer(drefs.titleBar, 'pointerdown', 100, 100);
  pointer(drefs.titleBar, 'pointermove', 400, 400);
  pointer(drefs.resizeGrip, 'pointerdown', 400, 400);
  pointer(drefs.resizeGrip, 'pointermove', 600, 600);
  check('mobile ignores the drag and resize handles',
    dctl.geometry().x === gMobile.x && dctl.geometry().w === gMobile.w);
  // Close on mobile keeps working — hide() is a mode, not a geometry.
  check('close still puts the window away on the mobile layout',
    dctl.close() === 'hidden' && dctl.getState().mode === 'hidden');
  drefs.programBtn.click();
  while (dpending.length) dpending.shift()();
  delete globalThis.matchMedia;

  // Pure clamp contract (the controller's viewport-blind maths, exported).
  var clamped = Windows.clampGeometry(
    { x: -10000, y: -10, w: 40, h: 40 }, { width: 1280, height: 800, taskbar: 36 });
  check('clampGeometry floors the size and keeps the title bar reachable',
    clamped.w === Windows.MIN_W && clamped.h === Windows.MIN_H &&
    clamped.x === Windows.TITLE_REACH - Windows.MIN_W && clamped.y === 0,
    JSON.stringify(clamped));

  // ── Three programs on the desktop (ticket #61) ────────────────────────
  // One Quiz frame plus the Action Plan and the Deep-Dive Prompt frames.
  // The assertions are behaviour: what the taskbar lists, which window is
  // active, where a newcomer stacks, what a click does, and what arrival
  // must NOT do (focus, raise, scroll).

  var VP61 = { width: 1440, height: 900, taskbar: 36 };

  function programFrame() {
    return {
      windowEl: fakeEl('div'),
      titleBar: fakeEl('div'),
      bodyEl: fakeEl('div'),
      resizeGrip: fakeEl('div'),
      taskbarBtn: fakeEl('button'),
      buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
    };
  }

  var pdoc = fakeDoc();
  var ppending = [];
  var pctl = Windows.create({
    doc: pdoc,
    schedule: function(fn) { ppending.push(fn); },
    viewport: function() { return VP61; }
  });
  var prefs = {
    windowEl: fakeEl('div'),
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  var planRefs = programFrame();
  var ddRefs = programFrame();
  pctl.attach(prefs);
  pctl.attachProgram('action-plan', planRefs);
  pctl.attachProgram('deep-dive', ddRefs);
  pctl.setView('landing-view');

  check('before the Finish Commit no program window exists',
    pctl.hasWindow('action-plan') === false && pctl.hasWindow('deep-dive') === false &&
    pctl.runningPrograms().join(',') === 'quiz' &&
    pctl.isVisible('quiz') === true);
  check('an unarrived program frame is painted away, its taskbar button is gone',
    planRefs.windowEl.classList.contains('is-hidden') &&
    planRefs.taskbarBtn.hidden === true &&
    ddRefs.taskbarBtn.hidden === true);

  // ── The Deep-Dive Prompt arrives MINIMIZED at the Finish Commit ───────
  pctl.setView('results-view');
  var quizG0 = pctl.geometry();
  check('the results stage positions the Quiz frame',
    prefs.windowEl.classList.contains('is-windowed') &&
    prefs.windowEl.style.left === quizG0.x + 'px');

  check('the Deep-Dive Prompt arrives minimized: a taskbar button only',
    pctl.deepDiveArrived() === true &&
    pctl.getState('deep-dive').mode === 'minimized' &&
    pctl.isVisible('deep-dive') === false && pctl.inTaskbar('deep-dive') === true &&
    ddRefs.windowEl.classList.contains('is-minimized') &&
    ddRefs.taskbarBtn.hidden === false &&
    ddRefs.taskbarBtn.getAttribute('aria-pressed') === 'false');
  check('the taskbar lists the running windows in the stable program order',
    pctl.runningPrograms().join(',') === 'quiz,deep-dive');
  check('the Quiz window is still the active one and the frame is still focused',
    pctl.snapshot().active === 'quiz' && pctl.canFocus('quiz') === true &&
    prefs.windowEl.classList.contains('is-active'));
  while (ppending.length) ppending.shift()();
  ddRefs.taskbarBtn.click();
  check('its taskbar button restores it to the cascaded geometry and focuses it',
    pctl.getState('deep-dive').mode === 'normal' &&
    pctl.snapshot().active === 'deep-dive' &&
    ddRefs.windowEl.classList.contains('is-windowed') &&
    ddRefs.windowEl.style.left === (quizG0.x + 24) + 'px' &&
    ddRefs.windowEl.style.top === (quizG0.y + 24) + 'px' &&
    ddRefs.taskbarBtn.getAttribute('aria-pressed') === 'true' &&
    prefs.windowEl.classList.contains('is-active') === false);
  while (ppending.length) ppending.shift()();

  // ── The Action Plan arrives below the window being read ───────────────
  pctl.activateProgram('quiz');
  var quizGBefore = pctl.geometry('quiz');
  var quizZBefore = pctl.snapshot().windows.quiz.z;
  var focusCalls = 0;
  prefs.windowEl.focus = function() { focusCalls++; };

  check('the Action Plan is not running before its content settles',
    pctl.hasWindow('action-plan') === false &&
    planRefs.taskbarBtn.hidden === true);
  check('the settle opens the Action Plan window',
    pctl.actionPlanArrived() === true && pctl.inTaskbar('action-plan') === true);
  check('the Action Plan arrives cascaded from the focused window',
    planRefs.windowEl.style.left === (quizGBefore.x + 24) + 'px' &&
    planRefs.windowEl.style.top === (quizGBefore.y + 24) + 'px',
    planRefs.windowEl.style.left + ',' + planRefs.windowEl.style.top);
  check('it lands BELOW the active window, which stays active and unmoved',
    pctl.snapshot().active === 'quiz' &&
    pctl.snapshot().windows['action-plan'].z < pctl.snapshot().windows.quiz.z &&
    pctl.geometry('quiz').x === quizGBefore.x &&
    pctl.geometry('quiz').y === quizGBefore.y &&
    pctl.getState('quiz').mode === 'normal' &&
    focusCalls === 0 &&
    planRefs.taskbarBtn.getAttribute('aria-pressed') === 'false');
  check('the taskbar now lists all three programs in order',
    pctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive');

  // A pointer interaction inside a frame raises it and makes it active.
  planRefs.windowEl.handlers.pointerdown({
    target: planRefs.bodyEl, preventDefault: function() {}, pointerId: 9,
    clientX: 400, clientY: 400, button: 0, isPrimary: true
  });
  check('a pointer interaction inside the Action Plan frame raises and focuses it',
    pctl.snapshot().active === 'action-plan' &&
    pctl.snapshot().windows['action-plan'].z > pctl.snapshot().windows.quiz.z &&
    planRefs.windowEl.classList.contains('is-active') === true &&
    prefs.windowEl.classList.contains('is-active') === false &&
    planRefs.taskbarBtn.getAttribute('aria-pressed') === 'true' &&
    prefs.programBtn.getAttribute('aria-pressed') === 'true');
  pctl.activateProgram('quiz');
  check('clicking the Quiz program button focuses it back',
    pctl.snapshot().active === 'quiz' &&
    pctl.snapshot().windows.quiz.z > pctl.snapshot().windows['action-plan'].z);

  // Minimize a program: it leaves the screen, stays in the taskbar.
  pctl.minimize('action-plan');
  while (ppending.length) ppending.shift()();
  check('minimizing a program keeps its button in the taskbar and unpressed',
    pctl.inTaskbar('action-plan') === true && pctl.isVisible('action-plan') === false &&
    planRefs.taskbarBtn.hidden === false &&
    planRefs.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
    pctl.getState('quiz').mode === 'normal');
  planRefs.taskbarBtn.click();
  while (ppending.length) ppending.shift()();
  check('its button restores and focuses the minimized window',
    pctl.getState('action-plan').mode === 'normal' &&
    pctl.snapshot().active === 'action-plan');

  // Put-away on the desktop stage: hide(), and the button leaves the bar.
  var quizModeBefore = pctl.getState('quiz').mode;
  pctl.closeProgram('action-plan');
  check("a program's [×] puts it away without a dialog",
    pctl.getState('action-plan').mode === 'hidden' &&
    pctl.getState('quiz').mode === quizModeBefore &&
    pctl.getState().confirmOpen === false &&
    planRefs.taskbarBtn.hidden === true &&
    planRefs.windowEl.classList.contains('is-hidden'));
  check('the put-away hands the desktop to the window under it',
    pctl.snapshot().active !== 'action-plan' &&
    pctl.getState('action-plan').mode === 'hidden');
  check('a frame that is not running is inert: no raise, no focus',
    pctl.focusWindow('action-plan') === false &&
    pctl.snapshot().active !== 'action-plan');

  // Leaving the desktop stage puts every program window away: the flow
  // views have no desktop to stand one on.
  pctl.setView('quiz-view');
  check('the flow stage leaves no program window running',
    pctl.runningPrograms().join(',') === 'quiz' &&
    pctl.getState('action-plan').mode === 'hidden' &&
    pctl.getState('deep-dive').mode === 'hidden' &&
    ddRefs.windowEl.classList.contains('is-hidden'));
  pctl.setView('results-view');
  check('back on the desktop the settled content arrives again',
    pctl.actionPlanArrived() === true && pctl.deepDiveArrived() === true &&
    pctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive');

  // Drag and resize address the frame that owns the handle, never another.
  var quizBeforeDrag = pctl.geometry('quiz');
  var planBeforeDrag = pctl.geometry('action-plan');
  function p61(el, type, x, y) {
    el.handlers[type]({ pointerId: 3, clientX: x, clientY: y, button: 0,
      target: el, isPrimary: true, preventDefault: function() {} });
  }
  pctl.activateProgram('quiz');
  p61(planRefs.titleBar, 'pointerdown', 500, 300);
  p61(planRefs.titleBar, 'pointermove', 560, 340);
  p61(planRefs.titleBar, 'pointerup', 560, 340);
  var planAfter = pctl.geometry('action-plan');
  check('a program frame drags its own window and no other',
    planAfter.x === planBeforeDrag.x + 60 &&
    planAfter.y === planBeforeDrag.y + 40 &&
    pctl.geometry('quiz').x === quizBeforeDrag.x &&
    pctl.geometry('quiz').y === quizBeforeDrag.y,
    JSON.stringify(planAfter) + ' vs ' + JSON.stringify(planBeforeDrag));
  p61(planRefs.resizeGrip, 'pointerdown', 800, 700);
  p61(planRefs.resizeGrip, 'pointermove', 900, 780);
  p61(planRefs.resizeGrip, 'pointerup', 900, 780);
  check('the corner grip resizes that program frame through the core',
    pctl.geometry('action-plan').w === planAfter.w + 100 &&
    pctl.geometry('action-plan').h === planAfter.h + 80 &&
    pctl.geometry('quiz').w === quizBeforeDrag.w);

  // Maximize follows the same gate for every frame.
  pctl.activateProgram('deep-dive');
  pctl.toggleMaximize('deep-dive');
  check('a program frame maximizes on its own Record',
    pctl.getState('deep-dive').mode === 'maximized' &&
    ddRefs.windowEl.classList.contains('is-maximized') &&
    pctl.getState('quiz').mode === 'normal');
  pctl.toggleMaximize('deep-dive');

  // The Quiz window's flow-stage dialog is untouched by the new frames.
  pctl.setView('quiz-view');
  check('the flow stage still routes the Quiz [×] to the End Program dialog',
    pctl.close() === 'dialog' && pctl.getState().confirmOpen === true);
  pctl.cancelClose();

  // ── System dialog primitive contract ──────────────────────────────────

  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  var I18n = globalThis.App.I18n;
  I18n.use('en');

  var Shell = require('../../js/shell.js');
  var shellCtl = Shell.build({
    doc: doc,
    appEl: (function() { var a = fakeEl('div'); doc.body.appendChild(a); return a; })(),
    strings: Shell.resolveStrings(I18n, Shell.STRING_IDS)
  });

  function freshDoc() {
    var d = fakeDoc();
    var opener = fakeEl('button');
    d.activeElement = opener;
    return { doc: d, opener: opener };
  }

  function openDialog(d, extra) {
    var opts = {
      doc: d.doc,
      i18n: I18n,
      icon: 'warn',
      titleId: 'windows.endProgramTitle',
      messageId: 'windows.endProgramMessage',
      dangerous: true,
      onOk: function() { opts._ok++; },
      onCancel: function() { opts._cancel++; }
    };
    opts._ok = 0;
    opts._cancel = 0;
    Object.keys(extra || {}).forEach(function(k) { opts[k] = extra[k]; });
    return { ctl: Windows.openSystemDialog(opts), opts: opts };
  }

  var env = freshDoc();
  var open1 = openDialog(env);
  var dlg = open1.ctl;
  check('dialog opens, is tracked as the active dialog',
    dlg && dlg.isOpen() && Windows.isDialogOpen() === true);
  check('dialog builds onto the document: one backdrop + dialog window',
    env.doc.body.children.length === 1 &&
    dlg.backdropEl.classList.contains('open'));
  check('dialog resolves the End Program Chrome Strings (en)',
    dlg.dialogEl.children[1].children[1].textContent ===
      'Are you sure you want to end this program?' &&
    dlg.dialogEl.children[0].children[0].textContent ===
      'End Program - Agent Security Awareness Quiz');
  check('dialog command buttons read Yes/No',
    dlg.okBtn.textContent === 'Yes' && dlg.cancelBtn.textContent === 'No');
  check('dangerous dialog: initial focus lands on [No] (default is No)',
    dlg.cancelBtn.focused === true);

  // Escape → cancel, never onOk, opener regains focus.
  var escPrevented = 0, escStopped = 0;
  dlg.handleKey({ key: 'Escape', preventDefault: function() { escPrevented++; },
    stopPropagation: function() { escStopped++; } });
  check('Escape cancels the dialog (destructive default: never confirms)',
    open1.opts._cancel === 1 && open1.opts._ok === 0 &&
    escPrevented === 1 && escStopped === 1);
  check('dialog closes: removed from the DOM, opener regains focus',
    dlg.isOpen() === false && env.doc.body.children.length === 0 &&
    env.opener.focused === true && Windows.isDialogOpen() === false);

  // Enter on a dangerous dialog ALSO cancels.
  var env2 = freshDoc();
  var open2 = openDialog(env2);
  open2.ctl.handleKey({ key: 'Enter', preventDefault: function() {} });
  check('Enter on a destructive dialog maps to [No], never onOk',
    open2.opts._cancel === 1 && open2.opts._ok === 0);

  // Enter on a declared-safe dialog is the affirmative.
  var env3 = freshDoc();
  var open3 = openDialog(env3, { dangerous: false });
  check('safe dialog: initial focus lands on the affirmative',
    open3.ctl.okBtn.focused === true);
  open3.ctl.handleKey({ key: 'Enter', preventDefault: function() {} });
  check('Enter on a declared-safe dialog runs onOk once',
    open3.opts._ok === 1 && open3.opts._cancel === 0);

  // Tab cycles inside the dialog (focus trap).
  var env4 = freshDoc();
  var open4 = openDialog(env4);
  var trap = open4.ctl;
  open4.ctl.handleKey({ key: 'Tab', preventDefault: function() {} });
  check('Tab from [No] moves to [Yes]', trap.okBtn.focused === true);
  open4.ctl.handleKey({ key: 'Tab', preventDefault: function() {}, shiftKey: true });
  check('Shift+Tab from [Yes] wraps back to [No]', trap.cancelBtn.focused === true);
  open4.ctl.handleKey({ key: 'Tab', preventDefault: function() {}, shiftKey: true });
  check('Shift+Tab from [No] wraps forward to [Yes]', trap.okBtn.focused === true);

  // Mouse [No] cancels; [Yes] confirms.
  trap.okBtn.click();
  check('clicking [Yes] confirms (explicit affirmative gesture)',
    open4.opts._ok === 1 && open4.opts._cancel === 0);
  var env5 = freshDoc();
  var open5 = openDialog(env5);
  open5.ctl.cancelBtn.click();
  check('clicking [No] cancels', open5.opts._cancel === 1 && open5.opts._ok === 0);

  // One dialog at a time.
  var env6 = freshDoc();
  var open6 = openDialog(env6);
  check('a second openSystemDialog is refused while one is open',
    open6.ctl !== null &&
    openDialog(freshDoc()).ctl === null);
  open6.ctl.close('cancel');

  // Explicit opener wins over doc.activeElement (the [×] flow disables its
  // own button before the dialog reads focus — opts.opener must be used).
  var envOp = freshDoc();
  var explicitOpener = fakeEl('button');
  var openOp = openDialog(envOp, { opener: explicitOpener });
  openOp.ctl.close('cancel');
  check('opts.opener receives focus on close even when activeElement moved',
    explicitOpener.focused === true);

  // No document → null (headless safety).
  check('openSystemDialog returns null without a document',
    Windows.openSystemDialog({ messageId: 'windows.endProgramMessage',
      doc: {}, i18n: I18n }) === null);

  // ── Shell Escape guard: the dialog owns Escape while open ─────────────

  shellCtl.openMenu();
  shellCtl.handleKeydown('Escape');
  check('without a dialog, Escape still closes the Start menu',
    shellCtl.isMenuOpen() === false);

  var env7 = freshDoc();
  var open7 = openDialog(env7);
  shellCtl.openMenu();
  shellCtl.handleKeydown('Escape');
  check('with a dialog open, the shell menu handler stands aside',
    shellCtl.isMenuOpen() === true && open7.ctl.isOpen() === true);
  open7.ctl.handleKey({ key: 'Escape', preventDefault: function() {} });

  // zh dictionary parity for the dialog ids.
  I18n.use('zh');
  check('dialog Chrome Strings resolve in zh too',
    I18n.t('windows.endProgramTitle') === '结束程序 - 智能体安全意识测评' &&
    I18n.t('windows.endProgramMessage') === '确定要结束这个程序吗？' &&
    I18n.t('windows.yes') === '是' && I18n.t('windows.no') === '否');
  I18n.use('en');

  return results;
};
