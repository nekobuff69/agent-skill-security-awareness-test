(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Window manager (ticket #43): a pure state machine for the title-bar
   * controls plus the reusable system-dialog primitive that tickets #44
   * (language offer) and #47 (404) will adopt.
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
   * Layering: createMachine() is the pure transition table (no DOM, fully
   * headless-testable). create() wraps it with the DOM rendering (button
   * disabled states, trace classes, program-button bevel) behind a deps
   * object so tests drive it with fakeEl stubs. openSystemDialog() builds
   * the system dialog on a document passed in (or the live one).
   */

  var VIEW_LANDING = 'landing-view';

  /** Trace duration; the wireframe view-trace idiom in the skin uses 200ms. */
  var TRACE_MS = 200;

  // ── Pure state machine ────────────────────────────────────────────────

  /**
   * The transition table. State:
   *   mode        'normal' | 'minimized' | 'maximized'
   *   confirmOpen true while the End Program dialog (or any system dialog
   *               driving confirmClose) owns the desktop — every other
   *               transition is blocked while it is true
   *   view        the visible view id; landing gates close/maximize
   */
  function createMachine() {
    var state = { mode: 'normal', confirmOpen: false, view: VIEW_LANDING };
    var prevMode = 'normal';   // what minimize will restore to

    function canMinimize() {
      return !state.confirmOpen && state.mode !== 'minimized';
    }
    function canMaximize() {
      return !state.confirmOpen && state.view !== VIEW_LANDING;
    }
    function canClose() {
      return !state.confirmOpen && state.view !== VIEW_LANDING;
    }

    function minimize() {
      if (!canMinimize()) return false;
      prevMode = state.mode === 'maximized' ? 'maximized' : 'normal';
      state.mode = 'minimized';
      return true;
    }

    /** Restore lands on the pre-minimize mode (Win95 restores to maximized
     *  when the window was maximized before it shrank). */
    function restore() {
      if (state.mode !== 'minimized') return false;
      state.mode = prevMode;
      return true;
    }

    function toggleMaximize() {
      if (!canMaximize() || state.mode === 'minimized') return false;
      state.mode = state.mode === 'maximized' ? 'normal' : 'maximized';
      return true;
    }

    function requestClose() {
      if (!canClose()) return false;
      state.confirmOpen = true;
      return true;
    }

    /** Yes in the End Program dialog: back to landing, window un-maximized.
     *  Session data is deliberately not touched (see header). */
    function confirmClose() {
      if (!state.confirmOpen) return false;
      state.confirmOpen = false;
      state.view = VIEW_LANDING;
      state.mode = 'normal';
      prevMode = 'normal';
      return true;
    }

    /** No/Escape: the dialog goes away, everything else is exactly as it
     *  was — view, mode and Session all preserved. */
    function cancelClose() {
      if (!state.confirmOpen) return false;
      state.confirmOpen = false;
      return true;
    }

    function setView(view) {
      if (typeof view === 'string' && view !== '') state.view = view;
      return state.view;
    }

    function getState() {
      return { mode: state.mode, confirmOpen: state.confirmOpen, view: state.view };
    }

    return {
      getState: getState,
      canMinimize: canMinimize,
      canMaximize: canMaximize,
      canClose: canClose,
      minimize: minimize,
      restore: restore,
      toggleMaximize: toggleMaximize,
      requestClose: requestClose,
      confirmClose: confirmClose,
      cancelClose: cancelClose,
      setView: setView
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

  // ── Controller: machine + rendering ──────────────────────────────────

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
          dom.buttons.maximize.disabled = !machine.canMaximize();
          dom.buttons.close.disabled = !machine.canClose();
        }
        if (dom.windowEl) {
          if (state.mode === 'maximized') dom.windowEl.classList.add('is-maximized');
          else dom.windowEl.classList.remove('is-maximized');
        }
        if (dom.programBtn) {
          dom.programBtn.setAttribute('aria-pressed',
            state.mode === 'minimized' ? 'false' : 'true');
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
          on(dom.programBtn, 'click', function() {
            if (machine.getState().mode === 'minimized') controller.restore();
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
