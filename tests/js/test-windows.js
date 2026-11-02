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
      removeAttribute: function(n) { delete el.attrs[n]; },
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
    // #75: putting the only Window away leaves no active Window, so the
    // transition names the Quiz Record exactly as the controller does.
    m.minimize('quiz') === true && m.getState().mode === 'minimized' &&
    m.activeId() === null &&
    m.restore('quiz') === true && m.getState().mode === 'normal');
  check('restore is refused when not minimized',
    m.restore('quiz') === false && m.getState().mode === 'normal');

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
  check('minimize from maximized', mx.minimize('quiz') === true &&
    mx.getState().mode === 'minimized' && mx.activeId() === null);
  check('restore from maximized-minimized returns to maximized (Win95 rule)',
    mx.restore('quiz') === true && mx.getState().mode === 'maximized');

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

  // ── Mobile rule (tickets #46, #68): [□]/[—] gated at ≤768px ──────────
  // The media query itself is CSS's job; this asserts the JS side: the
  // controller reads the same query, the live change listener re-renders,
  // and ticket #68 reduces the mobile chrome to close — [—] and [□] are
  // dead controls at these widths, and the crossing restores them.

  var savedMM = globalThis.matchMedia;
  var mediaState = { mobile: false, reduced: false, changeHandler: null };
  globalThis.matchMedia = function(query) {
    var matches = false;
    if (query.indexOf('max-width') >= 0) matches = mediaState.mobile;
    else if (query.indexOf('prefers-reduced-motion') >= 0) matches = mediaState.reduced;
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
    mrefs.buttons.minimize.disabled === false &&
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
  check('mobile viewport: the chrome reduces to close — [—] renders disabled',
    mrefs.buttons.minimize.disabled === true);
  check('mobile viewport: minimize is refused — the Record keeps its mode',
    mctl.minimize() === false && mctl.getState().mode === 'maximized');
  check('mobile viewport: the program switch stays live (pressed window on screen)',
    mrefs.programBtn.hidden === false &&
    mrefs.programBtn.getAttribute('aria-pressed') === 'true');

  // Crossing back to desktop: [—]/[□] re-enable and work again.
  mediaState.mobile = false;
  mediaState.changeHandler();
  check('desktop again: [□] re-enabled and toggles out of maximized',
    mrefs.buttons.maximize.disabled === false &&
    mctl.toggleMaximize() === true &&
    mctl.getState().mode === 'normal' &&
    !mrefs.windowEl.classList.contains('is-maximized'));
  check('desktop again: [—] re-enabled and traces the window down',
    mrefs.buttons.minimize.disabled === false &&
    mctl.minimize() === true && mctl.getState().mode === 'minimized');
  while (mpending.length) mpending.shift()();
  mrefs.programBtn.click();
  while (mpending.length) mpending.shift()();
  check('the desktop taskbar button still restores a minimized window',
    mctl.getState().mode === 'normal' &&
    !mrefs.windowEl.classList.contains('is-minimized'));
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
  // ── The put-away Quiz window leaves the taskbar (ticket #62) ──────────
  // The #61 bridge — the Quiz button kept alive for a hidden window — is
  // gone: the running-windows-only rule now covers all three programs, and
  // the desktop shortcut is the way back.
  check('a hidden Quiz window has no taskbar button either',
    drefs.programBtn.hidden === true &&
    dctl.inTaskbar('quiz') === false &&
    dctl.runningPrograms().join(',') === '');
  drefs.programBtn.click();
  while (dpending.length) dpending.shift()();
  check('the taskbar button no longer resurrects a hidden window',
    dctl.getState().mode === 'hidden' && drefs.programBtn.hidden === true);
  var gBack = dctl.geometry();
  check('launchProgram brings the put-away window back at its arrangement',
    dctl.launchProgram('quiz') === true &&
    dctl.getState().mode === 'normal' &&
    !drefs.windowEl.classList.contains('is-hidden') &&
    drefs.windowEl.classList.contains('is-windowed') &&
    gBack.x === gClose.x && gBack.w === gClose.w &&
    drefs.windowEl.style.left === gClose.x + 'px' &&
    drefs.programBtn.hidden === false &&
    drefs.programBtn.getAttribute('aria-pressed') === 'true',
    JSON.stringify(gBack));
  while (dpending.length) dpending.shift()();

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
  // Close on mobile (ticket #68): the windowed stage puts the window away
  // on this layout too — the mode change keeps the Record, the answers and
  // the finished report — and the taskbar's PERMANENT Quiz switch is the way
  // back, so nothing is stranded by the absence of the shortcut column.
  check('the mobile Quiz [×] puts the window away (no dialog, report intact)',
    dctl.close() === 'hidden' && dctl.getState().mode === 'hidden' &&
    dctl.getState().confirmOpen === false &&
    drefs.windowEl.classList.contains('is-hidden'));
  check('the mobile Quiz keeps its switch entry while put away',
    drefs.programBtn.hidden === false &&
    drefs.programBtn.getAttribute('aria-pressed') === 'false');
  var gPutAway = dctl.geometry();
  drefs.programBtn.click();
  while (dpending.length) dpending.shift()();
  check('its switch entry brings the Quiz window back at its arrangement',
    dctl.getState().mode === 'normal' &&
    !drefs.windowEl.classList.contains('is-hidden') &&
    dctl.geometry().x === gPutAway.x && dctl.geometry().w === gPutAway.w &&
    drefs.programBtn.getAttribute('aria-pressed') === 'true');
  while (dpending.length) dpending.shift()();
  dctl.setView('quiz-view');
  check('the mobile FLOW stage still routes the Quiz [×] to the End Program dialog',
    dctl.close() === 'dialog' && dctl.getState().confirmOpen === true);
  dctl.cancelClose();
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
  check('its taskbar button restores it to its right-anchored slot and focuses it',
    pctl.getState('deep-dive').mode === 'normal' &&
    pctl.snapshot().active === 'deep-dive' &&
    ddRefs.windowEl.classList.contains('is-windowed') &&
    ddRefs.windowEl.style.left === (VP61.width - 470 - 16) + 'px' &&
    ddRefs.windowEl.style.top === (VP61.height - VP61.taskbar - 380 - 16) + 'px' &&
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
  check('the Action Plan arrives in its upper-right slot, never offset off the focused window',
    planRefs.windowEl.style.left === (VP61.width - 520 - 16) + 'px' &&
    planRefs.windowEl.style.top === 16 + 'px' &&
    planRefs.windowEl.style.left !== (quizGBefore.x + 24) + 'px' &&
    planRefs.windowEl.style.top !== (quizGBefore.y + 24) + 'px',
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

  /* ── Ticket #76: right-anchored arrival slots at any desktop width ───
     Placement is driven directly with an injected viewport: one desktop
     per width, the same arrivals, the same constant margin from the
     right edge. */
  function arrivalDesktop(vp) {
    var sdoc = fakeDoc();
    var sc = Windows.create({
      doc: sdoc,
      schedule: function(fn) { fn(); },
      viewport: function() { return vp; }
    });
    sc.attach({
      windowEl: fakeEl('div'), titleBar: fakeEl('div'), resizeGrip: fakeEl('div'),
      programBtn: fakeEl('button'),
      buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
    });
    sc.attachProgram('action-plan', programFrame());
    sc.attachProgram('deep-dive', programFrame());
    sc.setView('results-view');
    return sc;
  }
  var MARGIN76 = 16;
  var WIDTHS76 = [
    { width: 1024, height: 768, taskbar: 36 },
    { width: 1440, height: 900, taskbar: 36 }
  ];
  WIDTHS76.forEach(function(vp) {
    var actl = arrivalDesktop(vp);
    check('the Quiz starts near the left edge at ' + vp.width + ' and is never shrunk',
      actl.geometry('quiz').x === 24 &&
      actl.geometry('quiz').y === 16 &&
      actl.geometry('quiz').w === 888 && actl.geometry('quiz').h === 704,
      JSON.stringify(actl.geometry('quiz')));
    actl.actionPlanArrived();
    actl.deepDiveArrived();
    var plan76 = actl.geometry('action-plan');
    var dive76 = actl.geometry('deep-dive');
    check('the Action Plan holds the constant right margin at ' + vp.width +
      ' and arrives unfocused below the active Window',
      vp.width - (plan76.x + plan76.w) === MARGIN76 &&
      plan76.y === MARGIN76 && plan76.w === 520 && plan76.h === 420 &&
      actl.snapshot().active === 'quiz' &&
      actl.getState('action-plan').mode === 'normal' &&
      actl.snapshot().windows['action-plan'].z < actl.snapshot().windows.quiz.z,
      JSON.stringify(plan76));
    check('the Deep-Dive Prompt holds the same right margin and the bottom margin at ' +
      vp.width + ' and arrives Minimized',
      vp.width - (dive76.x + dive76.w) === MARGIN76 &&
      dive76.y + dive76.h === vp.height - vp.taskbar - MARGIN76 &&
      dive76.w === 470 && dive76.h === 380 &&
      actl.getState('deep-dive').mode === 'minimized' &&
      actl.isVisible('deep-dive') === false && actl.inTaskbar('deep-dive') === true,
      JSON.stringify(dive76));
    check('the two secondary slots stay distinct at ' + vp.width +
      ' — different origin and different size',
      plan76.x !== dive76.x && plan76.y !== dive76.y &&
      (plan76.w !== dive76.w || plan76.h !== dive76.h));
    // Focusing another window must not shift the next arrival by 24px.
    actl.focusWindow('action-plan');
    actl.closeProgram('action-plan');                   // put it away...
    actl.actionPlanArrived();                            // ...and let it re-arrive
    check('re-arrival lands back in the same slot after another Window was focused — no cascade',
      actl.geometry('action-plan').x === plan76.x &&
      actl.geometry('action-plan').y === plan76.y &&
      actl.geometry('action-plan').x !== dive76.x + 24 &&
      actl.geometry('action-plan').y !== dive76.y + 24,
      JSON.stringify(actl.geometry('action-plan')));
  });

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

  // ── Desktop shortcut launches (ticket #62) ────────────────────────────
  // One gesture per shortcut: a visible window raises, a minimized or
  // put-away window comes back at its LAST mode and Geometry, and no
  // launch ever duplicates a window. The assertions are behaviour: which
  // mode the launch lands in, which arrangement it wears, what the taskbar
  // lists, and how many Records exist.
  pctl.setView('results-view');
  pctl.actionPlanArrived();
  pctl.deepDiveArrived();            // both records reborn on the desktop
  pctl.activateProgram('action-plan');
  var planMoved = { x: 300, y: 200, w: 500, h: 400 };
  check('a program window takes a moved arrangement',
    pctl.applyGeometry(planMoved, 'action-plan') === true &&
    pctl.geometry('action-plan').x === 300 &&
    pctl.geometry('action-plan').w === 500);
  pctl.toggleMaximize('action-plan');
  pctl.closeProgram('action-plan');        // put away WHILE maximized
  check('a hidden program leaves the taskbar: the bar lists the running two',
    pctl.getState('action-plan').mode === 'hidden' &&
    planRefs.taskbarBtn.hidden === true &&
    pctl.runningPrograms().join(',') === 'quiz,deep-dive' &&
    planRefs.windowEl.classList.contains('is-hidden'));
  var recordsBefore = Object.keys(pctl.snapshot().windows).length;
  pctl.activateProgram('quiz');
  check('the shortcut brings a hidden window back at its LAST mode',
    pctl.launchProgram('action-plan') === true &&
    pctl.getState('action-plan').mode === 'maximized' &&
    planRefs.windowEl.classList.contains('is-maximized') &&
    planRefs.windowEl.classList.contains('is-hidden') === false &&
    planRefs.taskbarBtn.hidden === false &&
    pctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive');
  check('and at its LAST geometry, not a fresh designed arrangement',
    pctl.geometry('action-plan').x === planMoved.x &&
    pctl.geometry('action-plan').w === planMoved.w);
  check('launching a running program never opens a second window',
    Object.keys(pctl.snapshot().windows).length === recordsBefore);
  var quizZBefore = pctl.snapshot().windows['quiz'].z;
  check('a launch on a visible program raises it and makes it active',
    pctl.launchProgram('action-plan') === true &&
    pctl.snapshot().active === 'action-plan' &&
    pctl.snapshot().windows['action-plan'].z > quizZBefore &&
    planRefs.windowEl.classList.contains('is-active') === true &&
    Object.keys(pctl.snapshot().windows).length === recordsBefore);
  while (ppending.length) ppending.shift()();

  // ── Ticket #75: the activation hand-off and the layering floor ────────
  // Minimize hands activation to the topmost Window still visible; with
  // none left there is NO active Window and focus returns to the Program
  // Switch. The consequences are the painted ones — the navy/grey title
  // bar, the keyboard floor (Tab/Enter) and the pressed switch all follow
  // the core's active Id — and every Window paints above the Desktop
  // Shortcut column's rung, before and after any renumbering.
  function frame75(id) {
    return id === 'quiz' ? prefs :
      (id === 'action-plan' ? planRefs : ddRefs);
  }
  check('every Window paints its stack number above the shortcut column',
    (function() {
      return ['quiz', 'action-plan', 'deep-dive'].every(function(id) {
        var painted = Number(frame75(id).windowEl.style.zIndex);
        return painted >= Windows.WINDOW_Z_BASE && painted < 1000 &&
          painted === Windows.WINDOW_Z_BASE + pctl.snapshot().windows[id].z;
      });
    })(),
    [prefs, planRefs, ddRefs].map(function(f) {
      return f.windowEl.style.zIndex;
    }).join(','));

  // The Action Plan is active and on top; the Quiz and the Deep-Dive
  // Prompt are the windows under it, in that order.
  pctl.minimize('action-plan');
  while (ppending.length) ppending.shift()();
  check('minimizing the ACTIVE Window hands activation to the topmost visible one',
    pctl.getState('action-plan').mode === 'minimized' &&
    pctl.snapshot().active === 'quiz' &&
    pctl.canFocus('quiz') === true && pctl.canFocus('action-plan') === false);
  check('the newly active title bar is the live navy, the Put Away one is grey',
    prefs.windowEl.classList.contains('is-active') === true &&
    prefs.titleBar.getAttribute('data-active') === 'true' &&
    planRefs.windowEl.classList.contains('is-active') === false &&
    planRefs.titleBar.getAttribute('data-active') === 'false');
  check('the keyboard floor follows the hand-off: Tab reaches only the active frame',
    planRefs.buttons.minimize.getAttribute('inert') === '' &&
    planRefs.buttons.close.getAttribute('inert') === '' &&
    planRefs.bodyEl.getAttribute('inert') === '' &&
    prefs.buttons.minimize.getAttribute('inert') === null &&
    prefs.titleBar.getAttribute('inert') === null);
  check('the pressed Program Switch follows the hand-off',
    prefs.programBtn.getAttribute('aria-pressed') === 'true' &&
    planRefs.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
    ddRefs.taskbarBtn.getAttribute('aria-pressed') === 'false');

  // The Deep-Dive Prompt was born minimized in the taskbar: pressing its
  // Program Switch brings it back, and it takes the activation the Quiz was
  // holding — from here the walk-down puts every Window away in turn.
  ddRefs.taskbarBtn.click();
  while (ppending.length) ppending.shift()();
  check('pressing a Program Switch restores its Window and takes activation',
    pctl.getState('deep-dive').mode === 'normal' &&
    pctl.snapshot().active === 'deep-dive' &&
    ddRefs.windowEl.classList.contains('is-active') === true &&
    ddRefs.taskbarBtn.getAttribute('aria-pressed') === 'true');
  pctl.minimize('deep-dive');
  while (ppending.length) ppending.shift()();
  check('the hand-off walks down the stack to the Window still visible',
    pctl.snapshot().active === 'quiz' &&
    prefs.windowEl.classList.contains('is-active') === true &&
    ddRefs.windowEl.classList.contains('is-active') === false);

  // The Quiz Program Switch is the control the Participant presses; once
  // its Window goes, nothing is visible and the desktop has no active
  // Window at all.
  prefs.programBtn.focused = false;
  prefs.programBtn.click();
  pctl.minimize('quiz');
  while (ppending.length) ppending.shift()();
  check('with no Window visible the desktop has no active Window',
    pctl.snapshot().active === null &&
    pctl.canFocus('action-plan') === false &&
    pctl.canFocus('quiz') === false && pctl.canFocus('deep-dive') === false);
  check('focus returns to the Program Switch that was pressed',
    prefs.programBtn.focused === true &&
    prefs.windowEl.classList.contains('is-minimized') === true);
  check('with no active Window no switch is pressed and no frame answers Tab',
    ['quiz', 'action-plan', 'deep-dive'].every(function(id) {
      var f = frame75(id);
      var btn = id === 'quiz' ? f.programBtn : f.taskbarBtn;
      return btn.getAttribute('aria-pressed') === 'false' &&
        f.buttons.minimize.getAttribute('inert') === '' &&
        f.buttons.close.getAttribute('inert') === '';
    }));

  // Leaving the desktop and settling the content again renumbers the whole
  // stack bottom → top: no Window may fall behind the shortcut column.
  pctl.setView('quiz-view');
  pctl.setView('results-view');
  pctl.actionPlanArrived();
  pctl.deepDiveArrived();
  while (ppending.length) ppending.shift()();
  check('renumbering after the Put Away never drops a Window behind the column',
    ['quiz', 'action-plan', 'deep-dive'].every(function(id) {
      var painted = Number(frame75(id).windowEl.style.zIndex);
      return painted >= Windows.WINDOW_Z_BASE && painted < 1000 &&
        painted === Windows.WINDOW_Z_BASE + pctl.snapshot().windows[id].z;
    }) && pctl.getState('action-plan').mode === 'normal',
    [prefs, planRefs, ddRefs].map(function(f) {
      return f.windowEl.style.zIndex;
    }).join(','));
  // A minimized program is running: it keeps its button, and the shortcut
  // restores it (the same launch gesture, the core's restore).
  pctl.minimize('deep-dive');
  while (ppending.length) ppending.shift()();
  check('a minimized program stays in the taskbar',
    ddRefs.taskbarBtn.hidden === false && pctl.inTaskbar('deep-dive') === true);
  check('the shortcut restores and focuses the minimized window',
    pctl.launchProgram('deep-dive') === true &&
    pctl.getState('deep-dive').mode === 'normal' &&
    pctl.snapshot().active === 'deep-dive' &&
    ddRefs.windowEl.classList.contains('is-windowed') &&
    ddRefs.taskbarBtn.getAttribute('aria-pressed') === 'true');
  while (ppending.length) ppending.shift()();

  // An unarrived program has no Record yet — the shortcut exists anyway
  // and opens it ONCE, on the desktop, focused.
  var ldoc = fakeDoc();
  var lpending = [];
  var lctl = Windows.create({
    doc: ldoc,
    schedule: function(fn) { lpending.push(fn); },
    viewport: function() { return VP61; }
  });
  var lrefs = {
    windowEl: fakeEl('div'),
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  var lplan = programFrame();
  lctl.attach(lrefs);
  lctl.attachProgram('action-plan', lplan);
  lctl.setView('results-view');
  check('the shortcut opens a program that has not arrived yet',
    lctl.hasWindow('action-plan') === false &&
    lctl.launchProgram('action-plan') === true &&
    lctl.hasWindow('action-plan') === true &&
    lctl.getState('action-plan').mode === 'normal' &&
    lctl.snapshot().active === 'action-plan' &&
    lplan.windowEl.classList.contains('is-windowed') &&
    lplan.taskbarBtn.hidden === false);
  lctl.launchProgram('action-plan');
  check('a second launch raises the SAME window — one Record per program',
    Object.keys(lctl.snapshot().windows).length === 2 &&
    lctl.snapshot().active === 'action-plan');
  check('an unknown program Id launches nothing',
    lctl.launchProgram('no-such-program') === false &&
    lctl.hasWindow('no-such-program') === false);
  lctl.launchProgram('quiz');
  check('launching Quiz through its shortcut raises the app window and keeps its button',
    lctl.getState('quiz').mode === 'normal' &&
    lctl.snapshot().active === 'quiz' &&
    lrefs.programBtn.hidden === false &&
    lrefs.programBtn.getAttribute('aria-pressed') === 'true');
  while (lpending.length) lpending.shift()();

  // ── The ≤768px single-program desktop (ticket #68) ───────────────────
  // The shortcut column does not fit on this layout, so the taskbar's
  // THREE entries are permanent — the only route between the programs —
  // the chrome reduces to close, and crossing the boundary re-lays the
  // desktop without touching a Record. The assertions are behaviour: what
  // the bar lists for every mode, what a switch click does, which gestures
  // the layout refuses, and what a crossing preserves.

  var crossState = { mobile: true, reduced: false, handler: null };
  globalThis.matchMedia = function(query) {
    var matches = false;
    if (query.indexOf('max-width') >= 0) matches = crossState.mobile;
    else if (query.indexOf('prefers-reduced-motion') >= 0) matches = crossState.reduced;
    return {
      matches: matches,
      addEventListener: function(evt, fn) {
        if (evt === 'change') crossState.handler = fn;
      },
      addListener: function(fn) { crossState.handler = fn; }
    };
  };

  var xdoc = fakeDoc();
  var xpending = [];
  var xtraces = [];                       // the delay each trace was scheduled with
  var xctl = Windows.create({
    doc: xdoc,
    schedule: function(fn, ms) { xtraces.push(ms); xpending.push(fn); },
    viewport: function() { return VP61; }
  });
  var xrefs = {
    windowEl: fakeEl('div'),
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  };
  var xplan = programFrame();
  var xdd = programFrame();
  xctl.attach(xrefs);                     // registers the live crossing handler
  xctl.attachProgram('action-plan', xplan);
  xctl.attachProgram('deep-dive', xdd);
  xctl.setView('results-view');
  while (xpending.length) xpending.shift()();

  check('the mobile bar lists all three programs from the first desktop render',
    xrefs.programBtn.hidden === false &&
    xplan.taskbarBtn.hidden === false &&
    xdd.taskbarBtn.hidden === false &&
    xctl.hasWindow('action-plan') === false);
  check('exactly one switch reads pressed while only the Quiz window runs',
    xrefs.programBtn.getAttribute('aria-pressed') === 'true' &&
    xplan.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
    xdd.taskbarBtn.getAttribute('aria-pressed') === 'false');

  xplan.taskbarBtn.click();
  while (xpending.length) xpending.shift()();
  check('a switch entry opens the program that has not arrived — one Record',
    xctl.hasWindow('action-plan') === true &&
    xctl.getState('action-plan').mode === 'normal' &&
    xctl.snapshot().active === 'action-plan' &&
    Object.keys(xctl.snapshot().windows).length === 2);
  check('the pressed entry moves to the program filling the screen',
    xplan.taskbarBtn.getAttribute('aria-pressed') === 'true' &&
    xrefs.programBtn.getAttribute('aria-pressed') === 'false');
  xplan.taskbarBtn.click();
  while (xpending.length) xpending.shift()();
  check('a second switch click raises the SAME window (one Record per program)',
    Object.keys(xctl.snapshot().windows).length === 2 &&
    xctl.snapshot().active === 'action-plan');

  xrefs.programBtn.click();
  while (xpending.length) xpending.shift()();
  check('the Quiz switch raises the Quiz program back',
    xctl.snapshot().active === 'quiz' &&
    xrefs.programBtn.getAttribute('aria-pressed') === 'true' &&
    xplan.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
    xctl.getState('action-plan').mode === 'normal');

  check('the mobile chrome offers only close, on every frame',
    xrefs.buttons.close.disabled === false &&
    xrefs.buttons.minimize.disabled === true &&
    xrefs.buttons.maximize.disabled === true &&
    xplan.buttons.minimize.disabled === true &&
    xplan.buttons.maximize.disabled === true &&
    xplan.buttons.close.disabled === false);

  var xplanG = xctl.geometry('action-plan');
  p61(xplan.titleBar, 'pointerdown', 500, 300);
  p61(xplan.titleBar, 'pointermove', 560, 340);
  p61(xplan.titleBar, 'pointerup', 560, 340);
  p61(xplan.resizeGrip, 'pointerdown', 800, 700);
  p61(xplan.resizeGrip, 'pointermove', 900, 780);
  p61(xplan.resizeGrip, 'pointerup', 900, 780);
  check('the mobile layout ignores the drag and resize handles of a program frame',
    xctl.geometry('action-plan').x === xplanG.x &&
    xctl.geometry('action-plan').w === xplanG.w &&
    xctl.applyGeometry({ x: 1, y: 1, w: 400, h: 400 }, 'action-plan') === false);
  check('the mobile layout refuses maximize and minimize',
    xctl.toggleMaximize('action-plan') === false &&
    xctl.minimize('action-plan') === false &&
    xctl.getState('action-plan').mode === 'normal');

  check("a program's [×] puts it away and the bar keeps its switch",
    xctl.closeProgram('action-plan') === 'hidden' &&
    xctl.getState('action-plan').mode === 'hidden' &&
    xplan.windowEl.classList.contains('is-hidden') &&
    xplan.taskbarBtn.hidden === false &&
    xplan.taskbarBtn.getAttribute('aria-pressed') === 'false');
  check('the put-away hands the screen to the program still on it',
    xctl.snapshot().active === 'quiz' &&
    xrefs.programBtn.getAttribute('aria-pressed') === 'true');
  xplan.taskbarBtn.click();
  while (xpending.length) xpending.shift()();
  check('the switch entry is the route back: the window returns at its arrangement',
    xctl.getState('action-plan').mode === 'normal' &&
    !xplan.windowEl.classList.contains('is-hidden') &&
    xctl.snapshot().active === 'action-plan' &&
    xctl.geometry('action-plan').x === xplanG.x &&
    xctl.geometry('action-plan').w === xplanG.w);

  check('the Quiz [×] hides too on this stage — the switch keeps the report live',
    xctl.close() === 'hidden' && xctl.getState().mode === 'hidden' &&
    xctl.getState().confirmOpen === false &&
    xrefs.programBtn.hidden === false);
  xrefs.programBtn.click();
  while (xpending.length) xpending.shift()();
  check('and the Quiz switch brings the report back',
    xctl.getState().mode === 'normal' &&
    xctl.snapshot().active === 'quiz' &&
    xrefs.programBtn.getAttribute('aria-pressed') === 'true');

  check("Escape puts the Quiz away onto its own switch entry (hide's sibling)",
    xctl.escapeFocused() === true && xctl.getState().mode === 'hidden' &&
    xrefs.programBtn.hidden === false && xrefs.programBtn.focused === true);
  xrefs.programBtn.click();
  while (xpending.length) xpending.shift()();
  check('the switch entry restores it again — one Record, no second window',
    xctl.getState().mode === 'normal' &&
    Object.keys(xctl.snapshot().windows).length === 2);

  xctl.setView('review-view');
  check('the review stage is the same switcher: three permanent entries',
    xrefs.programBtn.hidden === false &&
    xplan.taskbarBtn.hidden === false &&
    xdd.taskbarBtn.hidden === false);
  xctl.setView('results-view');

  check('the Deep-Dive Prompt arrives minimized behind a permanent switch',
    xctl.deepDiveArrived() === true &&
    xctl.getState('deep-dive').mode === 'minimized' &&
    xdd.taskbarBtn.hidden === false &&
    xdd.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
    xdd.windowEl.classList.contains('is-minimized'));
  xdd.taskbarBtn.click();
  while (xpending.length) xpending.shift()();
  check('its switch restores and focuses it — one program fills the screen',
    xctl.getState('deep-dive').mode === 'normal' &&
    xctl.snapshot().active === 'deep-dive' &&
    xdd.taskbarBtn.getAttribute('aria-pressed') === 'true' &&
    xrefs.programBtn.getAttribute('aria-pressed') === 'false');
  check('live motion: every window transition traced at the era delay',
    xtraces.length > 0 && xtraces.every(function(ms) {
      return ms === Windows.TRACE_MS;
    }), 'delays=' + JSON.stringify(xtraces));

  check("Escape puts the focused window away onto its switch entry",
    xctl.escapeFocused() === true &&
    xctl.getState('deep-dive').mode === 'hidden' &&
    xdd.taskbarBtn.hidden === false &&
    xdd.taskbarBtn.focused === true);

  // Reduced motion: no transition on this viewport carries a trace delay.
  var traceBefore = xtraces.length;
  crossState.reduced = true;
  xdd.taskbarBtn.click();
  while (xpending.length) xpending.shift()();
  check('reduced motion: the switch restore lands with no trace delay',
    xctl.getState('deep-dive').mode === 'normal' &&
    xtraces.length > traceBefore &&
    xtraces.slice(traceBefore).every(function(ms) { return ms === 0; }),
    JSON.stringify(xtraces.slice(traceBefore)));
  crossState.reduced = false;

  // Crossing the boundary keeps the desktop: records, modes, arrangements.
  xctl.closeProgram('deep-dive');
  var xSnapHidden = JSON.stringify(xctl.snapshot());
  check('on the desktop layout a put-away program leaves the bar again',
    (function() {
      crossState.mobile = false;
      crossState.handler();
      return xctl.getState('deep-dive').mode === 'hidden' &&
        xdd.taskbarBtn.hidden === true &&
        xrefs.programBtn.hidden === false &&
        xdd.windowEl.classList.contains('is-hidden');
    })());
  check('crossing to the desktop re-lays the frames at their Geometry',
    xplan.windowEl.classList.contains('is-windowed') &&
    xplan.windowEl.style.width === xctl.geometry('action-plan').w + 'px' &&
    xrefs.windowEl.classList.contains('is-windowed') &&
    JSON.stringify(xctl.snapshot()) === xSnapHidden);
  check('crossing back to mobile keeps every Record and re-lists them permanently',
    (function() {
      crossState.mobile = true;
      crossState.handler();
      return xdd.taskbarBtn.hidden === false &&
        xdd.taskbarBtn.getAttribute('aria-pressed') === 'false' &&
        xctl.getState('deep-dive').mode === 'hidden' &&
        xctl.geometry('action-plan').w === xplanG.w &&
        JSON.stringify(xctl.snapshot()) === xSnapHidden;
    })());
  check('the mobile frames wear no positioned box',
    !xplan.windowEl.classList.contains('is-windowed') &&
    xplan.windowEl.style.width === '' &&
    !xrefs.windowEl.classList.contains('is-windowed'));

  // The switcher belongs to the desktop stage: the flow views have no
  // desktop to switch programs on.
  xctl.setView('quiz-view');
  check('the mobile flow stage is not the switcher: unrunning entries stand aside',
    xplan.taskbarBtn.hidden === true &&
    xdd.taskbarBtn.hidden === true &&
    xrefs.programBtn.hidden === false);
  xctl.setView('results-view');
  check('back on the mobile desktop the three switches are permanent again',
    xplan.taskbarBtn.hidden === false &&
    xdd.taskbarBtn.hidden === false &&
    xrefs.programBtn.hidden === false);

  delete globalThis.matchMedia;
  lctl.render();
  while (lpending.length) lpending.shift()();
  while (ppending.length) ppending.shift()();

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

  // ── Keyboard floor (ticket #67) ───────────────────────────────────────
  // Behaviour, not markup: which window's controls wear the inert
  // attribute as the active window moves, what the taskbar buttons do from
  // the keyboard, what Escape hides and where focus lands afterwards, and
  // that the pointer gesture (raise, drag, resize) survives a window the
  // keyboard cannot enter.

  function floorParts(refs) {
    return [refs.buttons.minimize, refs.buttons.maximize,
      refs.buttons.close, refs.bodyEl];
  }
  function floorClear(refs) {
    // The frame root stays live to the pointer by design: it answers
    // raise-on-interaction and carries the drag and resize handles.
    return refs.windowEl.getAttribute('inert') === null &&
      floorParts(refs).every(function(el) {
        return el.getAttribute('inert') === null;
      });
  }
  function floorDown(refs) {
    return refs.windowEl.getAttribute('inert') === null &&
      floorParts(refs).every(function(el) {
        return el.getAttribute('inert') === '';
      });
  }

  var kdoc = fakeDoc();
  var kpend = [];
  var kctl = Windows.create({
    doc: kdoc,
    schedule: function(fn) { kpend.push(fn); },
    viewport: function() { return VP61; }
  });
  var krefs = programFrame();
  var kshortcuts = {
    quiz: fakeEl('button'),
    'action-plan': fakeEl('button'),
    'deep-dive': fakeEl('button')
  };
  krefs.shortcuts = kshortcuts;
  krefs.programBtn = fakeEl('button');      // the Quiz frame's taskbar button
  var plan67 = programFrame();
  var dd67 = programFrame();
  kctl.attach(krefs);
  kctl.attachProgram('action-plan', plan67);
  kctl.attachProgram('deep-dive', dd67);
  kctl.setView('results-view');
  kctl.actionPlanArrived();
  kctl.deepDiveArrived();
  while (kpend.length) kpend.shift()();

  check('the focused window is the only one whose controls Tab can reach',
    floorClear(krefs) && floorDown(plan67) && floorDown(dd67));

  // The taskbar switch moves the floor with the active window. A keyboard
  // Enter/Space on the button runs the same click as a pointer does.
  plan67.taskbarBtn.click();
  check('switching windows moves the floor: the focused window is live again',
    kctl.snapshot().active === 'action-plan' &&
    floorClear(plan67) && floorDown(krefs) && floorDown(dd67));

  // A window born minimized is restored from the keyboard through the
  // same button — and takes the floor as it comes back.
  dd67.taskbarBtn.click();
  while (kpend.length) kpend.shift()();
  check('the taskbar button restores a minimized window and focuses it',
    kctl.getState('deep-dive').mode === 'normal' &&
    kctl.snapshot().active === 'deep-dive' &&
    dd67.windowEl.focused === true &&
    floorClear(dd67) && floorDown(plan67) && floorDown(krefs));

  // Escape, window tier: the focused window goes away and focus lands on
  // the taskbar. The program's own button leaves the bar with it, so the
  // Quiz program button — the taskbar's permanent control — takes focus.
  krefs.programBtn.focused = false;
  check('Escape hides the focused window',
    kctl.escapeFocused() === true &&
    kctl.getState('deep-dive').mode === 'hidden' &&
    dd67.taskbarBtn.hidden === true);
  check('focus returns to the desktop, not to the void (#62: the shortcut)',
    kshortcuts['deep-dive'].focused === true);

  krefs.programBtn.click();
  while (kpend.length) kpend.shift()();
  krefs.programBtn.focused = false;
  check('Escape hides the Quiz window too and returns focus to its shortcut',
    kctl.escapeFocused() === true && kctl.getState().mode === 'hidden' &&
    kshortcuts.quiz.focused === true);
  kctl.launchProgram('quiz');
  while (kpend.length) kpend.shift()();
  check('the shortcut brings the Quiz window back, floor and all',
    kctl.getState().mode === 'normal' &&
    kctl.snapshot().active === 'quiz' && floorClear(krefs));

  // The tiers above the window tier are untouched: the flow views have no
  // desktop to put a window away from, and a dialog owns Escape outright.
  kctl.setView('quiz-view');
  krefs.programBtn.focused = false;
  check('the flow stage has no window to put away: the tier refuses',
    kctl.escapeFocused() === false && kctl.getState().mode === 'normal' &&
    krefs.programBtn.focused === false && floorClear(krefs));

  kctl.setView('results-view');
  kctl.actionPlanArrived();
  kctl.deepDiveArrived();
  kctl.requestClose();                       // the End Program dialog owns the desktop
  check('while a system dialog owns the desktop the window tier stands aside',
    kctl.getState().confirmOpen === true &&
    kctl.escapeFocused() === false &&
    kctl.getState().mode === 'normal' &&
    kctl.getState('action-plan').mode === 'normal');
  kctl.cancelClose();

  // The shortcut seam: whatever control opened a window records itself,
  // and Escape hands focus back to it (ticket #62 wires the shortcuts).
  var shortcut67 = fakeEl('button');
  kctl.recordTrigger('action-plan', shortcut67);
  kctl.activateProgram('action-plan');
  check('Escape hands focus back to the shortcut that opened the window',
    kctl.escapeFocused() === true && shortcut67.focused === true &&
    kctl.getState('action-plan').mode === 'hidden' &&
    kctl.snapshot().active === 'quiz');

  // The pointer contract: a window whose controls are inert still raises,
  // drags and resizes, because the floor never covers the frame root or
  // its handles. The Action Plan re-arrives below the focused Quiz window.
  kctl.actionPlanArrived();
  var planG67 = kctl.geometry('action-plan');
  p61(plan67.titleBar, 'pointerdown', 500, 300);
  p61(plan67.titleBar, 'pointermove', 560, 340);
  p61(plan67.titleBar, 'pointerup', 560, 340);
  var planMoved = kctl.geometry('action-plan');
  check('a background window drags from its title bar and takes the floor',
    planMoved.x === planG67.x + 60 && planMoved.y === planG67.y + 40 &&
    kctl.snapshot().active === 'action-plan' &&
    floorClear(plan67) && floorDown(krefs),
    JSON.stringify(planMoved) + ' vs ' + JSON.stringify(planG67));

  // The corner grip resizes the window the keyboard had left behind.
  var quizBeforeGrip = kctl.geometry('quiz');
  kctl.activateProgram('quiz');
  var planSized = kctl.geometry('action-plan');
  p61(plan67.resizeGrip, 'pointerdown', 800, 700);
  p61(plan67.resizeGrip, 'pointermove', 900, 780);
  p61(plan67.resizeGrip, 'pointerup', 900, 780);
  check('the corner grip resizes a background window through the core',
    kctl.geometry('action-plan').w === planSized.w + 100 &&
    kctl.geometry('action-plan').h === planSized.h + 80 &&
    kctl.geometry('action-plan').x === planSized.x &&
    kctl.geometry('quiz').x === quizBeforeGrip.x &&
    kctl.snapshot().active === 'action-plan');

  // A press anywhere in the body retargets to the live frame root, which
  // is what wireRaise listens on: the window raises and its controls come
  // back live for the rest of the gesture.
  kctl.activateProgram('quiz');
  var planAfterGrip = kctl.geometry('action-plan');
  plan67.windowEl.handlers.pointerdown({
    target: plan67.windowEl, pointerId: 11, clientX: 640, clientY: 520,
    button: 0, isPrimary: true, preventDefault: function() {}
  });
  check('a press on an inert control retargets to the live root and raises',
    kctl.snapshot().active === 'action-plan' &&
    floorClear(plan67) && floorDown(krefs) &&
    kctl.geometry('action-plan').x === planAfterGrip.x &&
    kctl.geometry('action-plan').w === planAfterGrip.w &&
    kctl.geometry('quiz').x === quizBeforeGrip.x);

  // The floor walks the FRAME, so any region the frame assembles — the
  // client area today, a menu bar or a status bar tomorrow — is covered
  // without new wiring, while the two pointer handles stay live.
  var wdoc = fakeDoc();
  var wctl = Windows.create({
    doc: wdoc,
    schedule: function(fn) { fn(); },
    viewport: function() { return VP61; }
  });
  var wbase = programFrame();
  wbase.programBtn = fakeEl('button');
  var wframe = programFrame();
  wframe.windowEl.appendChild(wframe.titleBar);
  var extraRegion = fakeEl('div');          // a region the frame owns
  wframe.windowEl.appendChild(extraRegion);
  wframe.windowEl.appendChild(wframe.bodyEl);
  wframe.windowEl.appendChild(wframe.resizeGrip);
  wctl.attach(wbase);
  wctl.attachProgram('action-plan', wframe);
  wctl.setView('results-view');
  wctl.actionPlanArrived();
  check('the floor covers every region of a background window, handles excepted',
    extraRegion.getAttribute('inert') === '' &&
    wframe.bodyEl.getAttribute('inert') === '' &&
    wframe.buttons.minimize.getAttribute('inert') === '' &&
    wframe.buttons.maximize.getAttribute('inert') === '' &&
    wframe.buttons.close.getAttribute('inert') === '' &&
    wframe.titleBar.getAttribute('inert') === null &&
    wframe.resizeGrip.getAttribute('inert') === null &&
    wframe.windowEl.getAttribute('inert') === null);
  wctl.activateProgram('action-plan');
  check('focusing the window lifts the floor off every region it covers',
    [extraRegion, wframe.bodyEl, wframe.buttons.minimize,
      wframe.buttons.maximize, wframe.buttons.close].every(function(el) {
      return el.getAttribute('inert') === null;
    }) && wctl.snapshot().active === 'action-plan');

  // ── The destructive tail: endRun + resetPrograms (ticket #66) ─────────
  // Quit and Retake END the run: the Session and the per-tab desktop
  // Record go with it, and every program window is destroyed — not put
  // away — so a reload finds nothing to restore. The stores here are the
  // REAL modules on in-memory storage; the controller is a live desktop
  // with all three programs arrived.
  var prevTail = {
    controller: Windows.controller,
    showView: globalThis.App.showView,
    sessionStore: globalThis.App.SessionStore,
    desktopStore: globalThis.App.DesktopStore,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage
  };
  function memStorage() {
    var data = {};
    return {
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem: function(k, v) { data[k] = String(v); },
      removeItem: function(k) { delete data[k]; }
    };
  }
  globalThis.localStorage = memStorage();
  globalThis.sessionStorage = memStorage();
  // Requiring is not enough in a shared batch: a sibling suite may have
  // handed App.SessionStore / App.DesktopStore back (deleting the seam)
  // while the cached module no longer re-registers them. Bind the seams
  // to the modules' own functions, and restore what this suite found.
  var SS66 = require('../../js/session-store.js');
  var DS66 = require('../../js/desktop-store.js');
  globalThis.App.SessionStore = SS66;
  globalThis.App.DesktopStore = DS66;
  var bank66 = require('../../questions.json');
  var answers66 = bank66.questions.map(function() { return 1; });

  var tdoc = fakeDoc();
  var tctl = Windows.create({
    doc: tdoc,
    schedule: function(fn) { fn(); },
    viewport: function() { return VP61; }
  });
  var trefs = {
    windowEl: fakeEl('div'),
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: {
      minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button')
    }
  };
  var tplan = programFrame();
  var tdd = programFrame();
  tctl.attach(trefs);
  tctl.attachProgram('action-plan', tplan);
  tctl.attachProgram('deep-dive', tdd);
  tctl.setView('results-view');
  tctl.actionPlanArrived();
  tctl.deepDiveArrived();
  Windows.controller = tctl;

  SS66.save(bank66, answers66);
  DS66.captureAtCommit(bank66, answers66);
  check('the completed run is persisted on both records',
    SS66.load(bank66).ok === true && DS66.exists() === true);
  check('the committed desktop runs all three programs',
    tctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive' &&
    tctl.hasWindow('action-plan') === true && tctl.hasWindow('deep-dive') === true);

  // The Participant moves work around before the exit: the teardown has
  // to rewind the arrangement, not merely drop the extra windows.
  tctl.applyGeometry({ x: 300, y: 220, w: 700, h: 500 });
  var movedQuiz = tctl.geometry('quiz');
  var views66 = [];
  globalThis.App.showView = function(id) { views66.push(id); };

  var gone = Windows.endRun();
  check('endRun reports every part of the tail it ran',
    gone.session === true && gone.record === true &&
    gone.landing === true && gone.desktop === true,
    JSON.stringify(gone));
  check('the Session and the desktop Record are gone, so a reload restores nothing',
    SS66.load(bank66).ok === false && DS66.exists() === false &&
    globalThis.localStorage.getItem('quiz-session') === null &&
    globalThis.sessionStorage.getItem('quiz-desktop') === null &&
    DS66.restore(bank66) === false);
  check('the landing page is what the tail shows',
    views66.join(',') === 'landing-view', views66.join(','));
  check('every program window is destroyed, not put away',
    tctl.hasWindow('action-plan') === false &&
    tctl.hasWindow('deep-dive') === false &&
    tctl.runningPrograms().join(',') === 'quiz' &&
    tplan.taskbarBtn.hidden === true && tdd.taskbarBtn.hidden === true);
  check('the Quiz window is back at the arrangement it was born with',
    movedQuiz.x === 300 &&
    JSON.stringify(tctl.geometry('quiz')) ===
      JSON.stringify(globalThis.App.DesktopCore.DESIGN_DEFAULTS.quiz));
  check('the torn-down desktop hosts the next run: a program arrives fresh in its slot',
    tctl.deepDiveArrived() === true &&
    tctl.hasWindow('deep-dive') === true &&
    (function() {
      var g = tctl.geometry('deep-dive');
      // #76: the newcomer lands in its own right-anchored slot — the
      // Window Manager computes it from the desktop width; there is no
      // cascade off the born Quiz window any more.
      return g.x === VP61.width - g.w - 16 && g.w === 470 && g.h === 380 &&
        g.y === VP61.height - VP61.taskbar - g.h - 16;
    })(),
    JSON.stringify(tctl.geometry('deep-dive')));
  check('endRun is quiet about a desktop with nothing to remove',
    tctl.resetPrograms() === true && tctl.resetPrograms() === true &&
    tctl.runningPrograms().join(',') === 'quiz');

  // The machine-level rule behind the controller: resetPrograms closes
  // the End Program gate too — the destructive tail never waits on it.
  var g66 = Windows.createMachine();
  g66.setView('results-view');
  g66.open('action-plan');
  g66.requestClose();
  check('resetPrograms clears a pending confirm and destroys the arrivals',
    g66.getState().confirmOpen === true &&
    g66.resetPrograms() === true &&
    g66.getState().confirmOpen === false &&
    g66.hasWindow('action-plan') === false &&
    g66.taskbarList().join(',') === 'quiz');

  // Hand the shared globals back exactly as this suite found them.
  if (prevTail.controller === undefined) delete Windows.controller;
  else Windows.controller = prevTail.controller;
  if (prevTail.showView === undefined) delete globalThis.App.showView;
  else globalThis.App.showView = prevTail.showView;
  ['SessionStore', 'DesktopStore'].forEach(function(key) {
    if (prevTail[key] === undefined) delete globalThis.App[key];
    else globalThis.App[key] = prevTail[key];
  });
  ['localStorage', 'sessionStorage'].forEach(function(key) {
    if (prevTail[key] === undefined) delete globalThis[key];
    else globalThis[key] = prevTail[key];
  });

  return results;
};
