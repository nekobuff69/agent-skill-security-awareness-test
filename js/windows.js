(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Window manager (ticket #43): the controller and rendering for the
   * title-bar controls plus the reusable system-dialog primitive that
   * tickets #44 (language offer) and #47 (404) will adopt.
   *
   * Ticket #59 moved the state machine it used to own into js/desktop-core.js,
   * the DOM-free desktop core (spec #58). This module renders; the core
   * decides. The rules below are the core's rules restated where the
   * rendering depends on them.
   *
   * Landing-state rule — era: an application that cannot close itself.
   *   close and maximize are DISABLED while the landing view shows: no
   *   Session exists to end and no maximized work to reveal, so the buttons
   *   draw gray and inert exactly like a Win95 app with no document open
   *   (the existing disabled-drawing CSS in css/shell.css keeps applying).
   *   minimize STAYS LIVE on the landing view — era-correct, because real
   *   Win95 programs minimized fine from their initial window (Notepad with
   *   no file, Explorer): the window traces down to the taskbar and the
   *   program button restores it.
   *   On quiz/results/review all three controls are live.
   *
   *   Closing from any non-landing view opens the End Program dialog.
   *   confirmClose() returns to the landing view; the Session (localStorage
   *   `quiz-session`) is untouched — js/session-store.js owns persistence
   *   and is never called from here, so answers always survive the gesture.
   *
   * Mobile rule (ticket #46): at viewport widths ≤ 768px the stylesheet
   * (css/shell.css media block) presents the window maximized by DEFAULT —
   * full-bleed above the taskbar. Because that maximization is pure CSS,
   * the desktop core stays viewport-blind: it never models a mode the
   * viewport can silently override. The controller layer carries the
   * consequences instead, behind the same 768px media query:
   *   - [□] NEVER toggles and always renders disabled (mobileMaximized());
   *     the stylesheet already shows the maximized form, so the button is
   *     a lie on this viewport.
   *   - [—] stays live: minimize traces to the taskbar, restore happens
   *     via the program button, same as desktop.
   *   - [×] is unchanged (End Program dialog) once the landing rule allows.
   * Crossing the 768px boundary re-renders the controls via a matchMedia
   * change listener, so [□] re-enables at desktop widths.
   *
   * Layering: js/desktop-core.js is the pure transition table (no DOM, no
   * timers, fully headless-testable). create() wraps it with the DOM
   * rendering (button disabled states, trace classes, program-button bevel)
   * behind a deps object so tests drive it with fakeEl stubs, reading the
   * state and the derived flags out of the core. openSystemDialog() builds
   * the system dialog on a document passed in (or the live one).
   */

  var VIEW_LANDING = 'landing-view';

  /** Trace duration; the wireframe view-trace idiom in the skin uses 200ms. */
  var TRACE_MS = 200;

  // ── The state model lives in the desktop core ─────────────────────────

  /**
   * Ticket #59: the transition table moved OUT of this module into
   * js/desktop-core.js, the DOM-free desktop core (parent spec #58).
   * The codebase keeps exactly ONE state model — this module is a
   * controller: it renders what the core says and never keeps a copy of
   * window state.
   *
   * The core owns the window Record (mode, geometry, lastGeometry,
   * lastMode, z) and derives the consequences (visible, taskbar
   * membership, focus participation) from the mode. The desktop-level
   * gates it also owns: the landing view (close/maximize disabled — the
   * era's application that cannot close itself; minimize stays live) and
   * the confirmOpen gate (the End Program dialog owns the desktop and
   * blocks every other transition). The mobile rule (ticket #46) stays
   * here and in the stylesheet: [□] renders disabled at ≤768px, a
   * controller/stylesheet consequence the viewport-blind core never
   * models.
   */
  function coreModule() {
    if (!app.Desktop && typeof require === 'function') {
      require('./desktop-core.js');   // Node seam; the page loads it by tag
    }
    return app.Desktop || null;
  }

  /**
   * The single Quiz window's state, straight from the core. Exposed under
   * its old name so the controller and the existing tests keep driving
   * exactly one model: every method delegates — there is no local state.
   */
  function createMachine() {
    var Desktop = coreModule();
    if (!Desktop || typeof Desktop.createCore !== 'function') {
      throw new Error('js/windows.js needs the desktop core: load js/desktop-core.js first');
    }
    var core = Desktop.createCore({ id: Desktop.QUIZ_ID });

    function getState() {
      var snap = core.snapshot();
      return {
        mode: snap.windows[core.soleId].mode,
        confirmOpen: snap.confirmOpen,
        view: snap.view
      };
    }

    return {
      /** The core itself — the controller reads state and derived flags
       *  through it and renders. */
      core: core,
      getState: getState,
      isVisible: core.isVisible,
      inTaskbar: core.inTaskbar,
      canFocus: core.canFocus,
      canMinimize: core.canMinimize,
      canMaximize: core.canMaximize,
      canClose: core.canClose,
      minimize: core.minimize,
      restore: core.restore,
      toggleMaximize: core.toggleMaximize,
      hide: core.hide,
      requestClose: core.requestClose,
      confirmClose: core.confirmClose,
      cancelClose: core.cancelClose,
      applyGeometry: core.applyGeometry,
      setView: core.setView,
      setActive: core.setActive,
      raise: core.raise,
      snapshot: core.snapshot
    };
  }

  // ── DOM helpers (same shape as js/shell.js) ──────────────────────────

  function createEl(doc, tag, className, text) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function setAttrs(el, attrs) {
    Object.keys(attrs).forEach(function(name) {
      el.setAttribute(name, attrs[name]);
    });
  }

  function on(el, evt, fn) {
    el.addEventListener(evt, fn);
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /**
   * Mobile rule (ticket #46): the viewport question behind the [□] gate.
   * Same query the css/shell.css media block uses to maximize the window;
   * headless environments (no matchMedia) count as desktop. Kept next to
   * prefersReducedMotion() because it is the same access pattern.
   */
  var MOBILE_MAX_MEDIA = '(max-width: 768px)';

  function mobileMaximized() {
    try {
      return !!(global.matchMedia &&
        global.matchMedia(MOBILE_MAX_MEDIA).matches);
    } catch (e) {
      return false;
    }
  }

  // ── Controller: core + rendering ─────────────────────────────────────

  /**
   * deps:
   *   doc       document (or fake) used to sync the visible view from the
   *             DOM before rendering; optional in pure-state tests
   *   schedule  fn(fn, ms) — injected so headless tests run traces
   *             synchronously; defaults to setTimeout
   * attach(refs) supplies the built shell DOM:
   *   windowEl, programBtn, buttons {minimize, maximize, close}
   */
  function create(deps) {
    deps = deps || {};
    var doc = deps.doc || null;
    var machine = createMachine();
    var dom = null;
    var traceToken = 0;   // invalidates stale minimize/restore trace callbacks

    var schedule = typeof deps.schedule === 'function' ? deps.schedule :
      function(fn, ms) {
        if (typeof global.setTimeout === 'function') global.setTimeout(fn, ms);
      };

    function traceDelay() {
      // Reduced motion: no trace — the class lands in the next tick.
      return prefersReducedMotion() ? 0 : TRACE_MS;
    }

    /** Read the visible #app section so close/maximize gating always matches
     *  what is on screen (headless: no querySelector → machine view stands). */
    function syncView() {
      if (!doc || typeof doc.querySelector !== 'function') return;
      var visible = doc.querySelector('#app > section:not([hidden])');
      if (visible && visible.id) machine.setView(visible.id);
    }

    function render() {
      syncView();
      var state = machine.getState();
      if (dom) {
        if (dom.buttons) {
          dom.buttons.minimize.disabled = !machine.canMinimize();
          // Mobile rule (ticket #46): [□] also stays gray at ≤768px —
          // the stylesheet already shows the maximized form.
          dom.buttons.maximize.disabled =
            !machine.canMaximize() || mobileMaximized();
          dom.buttons.close.disabled = !machine.canClose();
        }
        if (dom.windowEl) {
          // The drawn form comes from the core's mode, never a local copy.
          if (state.mode === 'maximized') dom.windowEl.classList.add('is-maximized');
          else dom.windowEl.classList.remove('is-maximized');
        }
        if (dom.programBtn) {
          // Pressed = the window is on the desktop; the core derives that
          // from the mode (minimized/hidden are the not-visible modes).
          dom.programBtn.setAttribute('aria-pressed',
            machine.isVisible() ? 'true' : 'false');
        }
      }
      return state;
    }

    function minimize() {
      if (!machine.minimize()) return false;
      render();
      var win = dom && dom.windowEl;
      if (win) {
        var token = ++traceToken;   // supersede any pending trace callback
        win.classList.add('is-minimizing');
        schedule(function() {
          if (token !== traceToken) return;
          win.classList.remove('is-minimizing');
          win.classList.add('is-minimized');
        }, traceDelay());
      }
      return true;
    }

    function restore() {
      if (!machine.restore()) return false;
      var win = dom && dom.windowEl;
      if (win) {
        var token = ++traceToken;   // a stale minimize callback must not re-hide
        win.classList.remove('is-minimizing');
        win.classList.remove('is-minimized');
        win.classList.add('is-restoring');
        schedule(function() {
          if (token !== traceToken) return;
          win.classList.remove('is-restoring');
        }, traceDelay());
        if (typeof win.focus === 'function') win.focus();
      }
      render();
      return true;
    }

    function toggleMaximize() {
      // Mobile rule (ticket #46): at ≤768px there is nothing to toggle —
      // the CSS media query maximizes by default and un-maximizing is
      // meaningless on this viewport. The core stays viewport-blind.
      if (mobileMaximized()) return false;
      if (!machine.toggleMaximize()) return false;
      render();
      return true;
    }

    function requestClose() {
      if (!machine.requestClose()) return false;
      render();
      return true;
    }

    function confirmClose() {
      if (!machine.confirmClose()) return false;
      render();
      return true;
    }

    function cancelClose() {
      if (!machine.cancelClose()) return false;
      render();
      return true;
    }

    var controller = {
      getState: function() { return machine.getState(); },
      canMinimize: machine.canMinimize,
      canMaximize: machine.canMaximize,
      canClose: machine.canClose,
      // The mode consequences the shell renders from — derived by the core.
      isVisible: machine.isVisible,
      inTaskbar: machine.inTaskbar,
      canFocus: machine.canFocus,
      snapshot: machine.snapshot,
      minimize: minimize,
      restore: restore,
      toggleMaximize: toggleMaximize,
      requestClose: requestClose,
      confirmClose: confirmClose,
      cancelClose: cancelClose,
      setView: function(view) { machine.setView(view); return render(); },
      render: render,

      /** Wire the built shell DOM (js/shell.js calls this after build()). */
      attach: function(refs) {
        dom = refs || null;
        if (dom && dom.windowEl) {
          // Makes restore()'s focus() land: a div needs a tabindex.
          dom.windowEl.setAttribute('tabindex', '-1');
        }
        if (dom && dom.programBtn) {
          // Clicking the program button restores a minimized window (the
          // era's restore path); otherwise it just refocuses this window.
          // "In the taskbar but not on the desktop" is the core's derived
          // reading of minimized — no mode string compared here.
          on(dom.programBtn, 'click', function() {
            if (machine.inTaskbar() && !machine.isVisible()) controller.restore();
          });
        }
        // View changes (App.showView flips section[hidden]) re-render the
        // button gating: landing draws [×][□] gray, every other view live.
        // Observer, not a showView patch — js/main.js stays read-only.
        if (doc && typeof global.MutationObserver === 'function' &&
            typeof doc.getElementById === 'function') {
          var root = doc.getElementById('app');
          if (root) {
            new global.MutationObserver(function() { controller.render(); })
              .observe(root, { attributes: true, attributeFilter: ['hidden'], subtree: true });
          }
        }
        // Mobile rule (ticket #46): a live viewport crossing re-renders the
        // [□] gate (and every other control) — resize 768 → 769 re-enables
        // it, the other direction grays it out. Headless: no live media
        // query, no listener; the gate simply reads false forever.
        if (typeof global.matchMedia === 'function') {
          try {
            var mql = global.matchMedia(MOBILE_MAX_MEDIA);
            var onMediaChange = function() { controller.render(); };
            if (typeof mql.addEventListener === 'function') {
              mql.addEventListener('change', onMediaChange);
            } else if (typeof mql.addListener === 'function') {
              mql.addListener(onMediaChange);   // legacy Safari
            }
          } catch (e) { /* live media query unavailable → desktop gate */ }
        }
        return render();
      }
    };

    return controller;
  }

  // ── System dialog primitive ──────────────────────────────────────────

  /** One system dialog at a time (a modal owns the desktop). */
  var activeDialog = null;

  /**
   * Open a Win95-style system dialog over the desktop.
   *
   *   opts.icon        'warn' (default: red circle, white cross) | 'info'
   *   opts.titleId     Chrome String id for the title bar (optional)
   *   opts.messageId   Chrome String id for the message (required)
   *   opts.messageParams format vars for the message, when the id carries
   *                    {placeholders} (e.g. the language offer names the other
   *                    language)
   *   opts.okId        Chrome String id for the affirmative (default
   *                    'windows.yes')
   *   opts.cancelId    Chrome String id for the negative (default
   *                    'windows.no')
   *   opts.dangerous   when true (the DEFAULT — conservative) Enter maps to
   *                    cancel, never onOk; a safe dialog passes false and
   *                    Enter becomes the default affirmative
   *   opts.onOk        called on the affirmative path only
   *   opts.onCancel    called on No / Escape
   *   opts.opener      element focus returns to on close; defaults to
   *                    doc.activeElement — pass it explicitly when the
   *                    opener's own click disables it before this runs
   *                    (the [×] flow: requestClose renders all controls
   *                    disabled, which blurs the focused button)
   *   opts.doc         document to build on (defaults to the live one)
   *   opts.i18n        dictionary to resolve through (defaults to App.I18n)
   *
   * Keyboard contract: Escape always cancels (never confirms a destructive
   * action); Tab/Shift+Tab cycle between the two command buttons (focus
   * trap); focus starts on the safe button and returns to the opener on
   * close; the backdrop only dims — clicking it does nothing, as on a real
   * modal. Returns a controller, or null when no document/dictionary is
   * available or another dialog is already open.
   */
  function openSystemDialog(opts) {
    opts = opts || {};
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    var I18n = opts.i18n || app.I18n || null;
    if (!doc || typeof doc.createElement !== 'function' || !I18n) return null;
    if (activeDialog) return null;

    var dangerous = opts.dangerous !== false;
    var message = I18n.t(opts.messageId, opts.messageParams);
    var title = opts.titleId ? I18n.t(opts.titleId) : '';
    var okLabel = I18n.t(opts.okId || 'windows.yes');
    var cancelLabel = I18n.t(opts.cancelId || 'windows.no');
    var opener = opts.opener || doc.activeElement || null;
    var open = true;

    var backdrop = createEl(doc, 'div', 'os-dialog-backdrop');
    var dialog = createEl(doc, 'div', 'os-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    if (title) dialog.setAttribute('aria-labelledby', 'os-dialog-title');

    var titleBar = createEl(doc, 'div', 'os-titlebar');
    var titleText = createEl(doc, 'span', 'os-titlebar-title', title);
    titleText.id = 'os-dialog-title';
    titleBar.appendChild(titleText);
    dialog.appendChild(titleBar);

    var body = createEl(doc, 'div', 'os-dialog-body');
    var icon = createEl(doc, 'span', 'os-dialog-icon');
    setAttrs(icon, { 'data-icon': opts.icon || 'warn' });
    body.appendChild(icon);
    body.appendChild(createEl(doc, 'p', 'os-dialog-message', message));
    dialog.appendChild(body);

    var buttonRow = createEl(doc, 'div', 'os-dialog-buttons');
    var okBtn = createEl(doc, 'button', 'os-dialog-btn os-dialog-ok', okLabel);
    okBtn.type = 'button';
    var cancelBtn = createEl(doc, 'button', 'os-dialog-btn os-dialog-cancel', cancelLabel);
    cancelBtn.type = 'button';
    buttonRow.appendChild(okBtn);
    buttonRow.appendChild(cancelBtn);
    dialog.appendChild(buttonRow);

    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);
    backdrop.classList.add('open');

    function close(result) {
      if (!open) return false;
      open = false;
      activeDialog = null;
      // Callbacks first: they re-render the window controls (the dialog had
      // disabled them all), so the opener is focusable again by the time we
      // hand focus back.
      if (result === 'ok' && typeof opts.onOk === 'function') opts.onOk();
      else if (result === 'cancel' && typeof opts.onCancel === 'function') opts.onCancel();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (opener && typeof opener.focus === 'function' && opener.disabled !== true) {
        opener.focus();
      }
      return true;
    }

    /** Keyboard contract, exposed for headless tests (see header). */
    function handleKey(ev) {
      var key = ev && ev.key;
      if (!open) return false;
      if (key === 'Escape') {
        // Escape cancels — never confirms, regardless of `dangerous`.
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        close('cancel');
        return true;
      }
      if (key === 'Enter') {
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        if (dangerous) close('cancel');
        else close('ok');
        return true;
      }
      if (key === 'Tab') {
        // Focus trap: two command buttons, wrapping both directions.
        if (ev.preventDefault) ev.preventDefault();
        var active = doc.activeElement;
        var next;
        if (ev.shiftKey) next = (active === cancelBtn) ? okBtn : cancelBtn;
        else next = (active === okBtn) ? cancelBtn : okBtn;
        if (typeof next.focus === 'function') next.focus();
        return true;
      }
      return false;
    }

    on(dialog, 'keydown', handleKey);
    on(okBtn, 'click', function() { close('ok'); });
    on(cancelBtn, 'click', function() { close('cancel'); });

    // Initial focus lands on the safe button: cancel for a destructive
    // dialog (End Program defaults to No), OK when the caller declared the
    // action safe.
    var initial = dangerous ? cancelBtn : okBtn;
    if (typeof initial.focus === 'function') initial.focus();

    activeDialog = {
      isOpen: function() { return open; },
      handleKey: handleKey,
      close: close,
      dialogEl: dialog,
      backdropEl: backdrop,
      okBtn: okBtn,
      cancelBtn: cancelBtn
    };
    return activeDialog;
  }

  app.Windows = {
    create: create,
    createMachine: createMachine,
    openSystemDialog: openSystemDialog,
    isDialogOpen: function() { return activeDialog !== null; },
    VIEW_LANDING: VIEW_LANDING,
    TRACE_MS: TRACE_MS
  };

  if (typeof module !== 'undefined') module.exports = app.Windows;

})(globalThis);
