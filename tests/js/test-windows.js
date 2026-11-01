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

  // Confirm from quiz → landing gating re-rendered.
  ctl.setView('results-view');
  ctl.requestClose();
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
