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
   * Desktop regime (ticket #60): on the results and review stages the Quiz
   * program IS a positioned window — the frame moves and sizes with the
   * core's Geometry, drags by its title bar and resizes from a bottom-right
   * corner grip. Landing and quiz keep the layout-flow regime (the desktop
   * does not exist before the Finish Commit). Every geometry write goes
   * through the core's applyGeometry, which refuses maximized windows; the
   * controller adds the two refusals the viewport-blind core must never
   * model: the mobile layout (≤768px, ticket #46) and clamping — a minimum
   * size that keeps the score header readable, and a title bar that can
   * never be dragged fully under the taskbar. Close on this stage is the
   * core's hide(): the window leaves the screen, the bare desktop and the
   * taskbar stay, and the program button brings it back (hidden and
   * minimized alike) — no End Program dialog for a gesture that only puts
   * the window away. Flow stages keep the dialog exactly as ticket #43
   * built it.
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
      /** The Record's current Geometry — a fresh copy (ticket #60: the
       *  controller paints and clamps it, the core owns it). */
      geometry: function() { return core.windowSnapshot(core.soleId).geometry; },
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

  // ── Desktop regime (ticket #60) ──────────────────────────────────────

  /**
   * The windowed views (spec #58): the Quiz program's finished work. On
   * these the frame is positioned by the core's Geometry and can be
   * dragged and resized; the landing and quiz views keep the layout-flow
   * regime — the desktop does not exist before the Finish Commit.
   */
  var WINDOWED_VIEWS = { 'results-view': true, 'review-view': true };

  /**
   * Chrome metrics the clamping mirrors from css/shell.css: the taskbar
   * and title-bar heights are those tokens' DESKTOP values (the ≤768px
   * mobile values never reach the clamp — the controller refuses geometry
   * on that layout, and the core itself stays viewport-blind).
   */
  var TASKBAR_H = 36;      // --os-taskbar-height
  var TITLEBAR_H = 30;     // --os-titlebar-height

  /**
   * Minimum window size: the merged header panel (Progression Title +
   * Overall Percentage) plus one section heading must stay readable — the
   * 360×320 floor keeps the score header and its caption on screen at the
   * skin's body sizes. A window can never be resized below this.
   */
  var MIN_W = 360;
  var MIN_H = 320;

  /**
   * Reachability rule: a strip of the title bar (the drag handle) must
   * always stay on the desktop — horizontally at least this much of it,
   * vertically its whole height above the taskbar.
   */
  var TITLE_REACH = 60;

  function isWindowedView(view) {
    return !!WINDOWED_VIEWS[view];
  }

  /**
   * Clamp a Geometry to the desktop: the size floor and ceiling, the
   * title-bar reachability, and the ban on dragging the window fully
   * under the taskbar. Pure — the controller owns the viewport reading
   * (the core must never learn about it, desktop-core header).
   */
  function clampGeometry(g, vp) {
    var desktopH = vp.height - vp.taskbar;
    var w = Math.max(MIN_W, Math.min(g.w, vp.width));
    var h = Math.max(MIN_H, Math.min(g.h, desktopH));
    return {
      x: Math.max(TITLE_REACH - w, Math.min(g.x, vp.width - TITLE_REACH)),
      y: Math.max(0, Math.min(g.y, desktopH - TITLEBAR_H)),
      w: w,
      h: h
    };
  }

  // ── Controller: core + rendering ─────────────────────────────────────

  /**
   * deps:
   *   doc       document (or fake) used to sync the visible view from the
   *             DOM before rendering; optional in pure-state tests
   *   schedule  fn(fn, ms) — injected so headless tests run traces
   *             synchronously; defaults to setTimeout
   *   viewport  fn() → { width, height, taskbar } — the desktop metrics
   *             the drag/resize clamp reads (ticket #60); defaults to the
   *             live window.innerWidth/innerHeight with the CSS taskbar
   *             height, and headless tests inject their own
   * attach(refs) supplies the built shell DOM:
   *   windowEl, titleBar, resizeGrip, programBtn,
   *   buttons {minimize, maximize, close}
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

    /**
     * Viewport metrics for the clamp: the desktop area the window lives
     * in. Injected through deps.viewport for headless tests; live pages
     * read window.innerWidth/innerHeight. Absent metrics (headless with no
     * injection) fall back to no clamp ceiling — the min-size floor and
     * the title-bar reach still apply against the fallback viewport.
     */
    function viewport() {
      if (typeof deps.viewport === 'function') return deps.viewport();
      var w = typeof global.innerWidth === 'number' ? global.innerWidth : 1024;
      var h = typeof global.innerHeight === 'number' ? global.innerHeight : 768;
      return { width: w, height: h, taskbar: TASKBAR_H };
    }

    /** The windowed regime: results/review at a desktop viewport. */
    function isWindowed() {
      return isWindowedView(machine.getState().view) && !mobileMaximized();
    }

    /**
     * Paint the frame from the core's Geometry (ticket #60). The class is
     * the layout-regime switch (css/shell.css positions the frame only
     * with .is-windowed); the inline styles carry the numbers. Flow views
     * and the mobile layout keep the frame exactly as tickets #52/#53/#46
     * draw it — no inline geometry at all.
     */
    function paintGeometry(state) {
      if (!dom || !dom.windowEl || !dom.windowEl.style) return;
      var win = dom.windowEl;
      if (state.mode === 'hidden') win.classList.add('is-hidden');
      else win.classList.remove('is-hidden');
      var positioned = isWindowed() && state.mode === 'normal';
      if (!positioned) {
        win.classList.remove('is-windowed');
        win.style.left = '';
        win.style.top = '';
        win.style.width = '';
        win.style.height = '';
        return;
      }
      win.classList.add('is-windowed');
      var g = clampGeometry(machine.geometry(), viewport());
      win.style.left = g.x + 'px';
      win.style.top = g.y + 'px';
      win.style.width = g.w + 'px';
      win.style.height = g.h + 'px';
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
          paintGeometry(state);
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

    /**
     * Close on the desktop stage (ticket #60): the core's hide() — the
     * window leaves the screen, the bare desktop and taskbar stay, and the
     * arrangement is exactly what restore() comes back to. No dialog: the
     * gesture puts the window away, it never ends the program's work.
     */
    function hide() {
      if (!machine.hide()) return false;
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

    /**
     * The [×] decision, in ONE place: 'hidden' when the windowed stage put
     * the window away, 'dialog' when a flow stage asked for the End Program
     * confirmation, false when the gesture was refused (the disabled
     * button never reaches this). js/shell.js opens the dialog on 'dialog'.
     */
    function close() {
      syncView();   // the decision follows what is actually on screen
      if (isWindowedView(machine.getState().view)) {
        return hide() ? 'hidden' : false;
      }
      return requestClose() ? 'dialog' : false;
    }

    // ── Geometry writes + pointer drag/resize (ticket #60) ─────────────

    /**
     * The controller's geometry write: refuse the mobile layout (the
     * viewport-blind core never models it — ticket #46's rule), clamp to
     * the desktop, then hand the clamped Geometry to the core, which
     * refuses maximized/minimized/hidden windows and a dialog that owns
     * the desktop. Paint only on a successful write.
     */
    function applyGeometry(geometry) {
      if (!isWindowed()) return false;
      var clamped = clampGeometry(geometry, viewport());
      if (!machine.applyGeometry(clamped)) return false;
      render();
      return true;
    }

    /** The Geometry the core holds — fresh copy. */
    function geometry() {
      return machine.geometry();
    }

    /**
     * One live gesture: 'move' (title bar) or 'resize' (corner grip), with
     * the pointer id and the Geometry the gesture started from — deltas
     * are always measured against that origin, never against a clamped
     * intermediate, so dragging into a wall and back stays true.
     */
    var drag = null;

    function beginDrag(kind, ev, handle) {
      if (!isWindowed()) return false;
      // A secondary pointer (the second finger of a pinch) never hijacks a
      // live gesture; a new primary gesture replaces a stale one, which is
      // what a dropped pointerup leaves behind when pointer capture is
      // unavailable.
      if (drag && ev && ev.isPrimary === false) return false;
      if (!ev || (ev.button != null && ev.button !== 0)) return false;
      if (machine.getState().mode !== 'normal') return false;
      drag = {
        kind: kind,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        origin: machine.geometry()
      };
      // Capture keeps the move/up stream on the handle even when the
      // pointer runs off the title bar or the window edge.
      if (handle && ev.pointerId !== undefined &&
          typeof handle.setPointerCapture === 'function') {
        try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* no capture */ }
      }
      if (dom && dom.windowEl && dom.windowEl.classList) {
        dom.windowEl.classList.add(kind === 'move' ? 'is-dragging' : 'is-resizing');
      }
      return true;
    }

    function moveDrag(ev) {
      if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) {
        return false;
      }
      var dx = ev.clientX - drag.startX;
      var dy = ev.clientY - drag.startY;
      var o = drag.origin;
      var next = drag.kind === 'move'
        ? { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }
        : { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      return applyGeometry(next);
    }

    function endDrag(ev) {
      if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) {
        return false;
      }
      drag = null;
      if (dom && dom.windowEl && dom.windowEl.classList) {
        dom.windowEl.classList.remove('is-dragging');
        dom.windowEl.classList.remove('is-resizing');
      }
      return true;
    }

    /** A control button inside the title bar is not a drag handle. */
    function isTitleBarControl(ev) {
      var t = ev && ev.target;
      return !!(t && typeof t.closest === 'function' && t.closest('.os-titlebar-btn'));
    }

    /** Wire one gesture source: down starts, move drags, up/cancel ends. */
    function wireDragHandle(el, kind) {
      if (!el) return;
      on(el, 'pointerdown', function(ev) {
        if (isTitleBarControl(ev)) return;
        if (beginDrag(kind, ev, el) && ev && typeof ev.preventDefault === 'function') {
          ev.preventDefault();
        }
      });
      on(el, 'pointermove', moveDrag);
      on(el, 'pointerup', endDrag);
      on(el, 'pointercancel', endDrag);
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
      hide: hide,
      close: close,
      // The desktop regime (ticket #60): geometry through the core, plus
      // the controller's view/viewport decision.
      applyGeometry: applyGeometry,
      geometry: geometry,
      isWindowed: isWindowed,
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
          // The program button is the way back: it restores a minimized
          // window (the era's taskbar path, ticket #43) AND a hidden one
          // (ticket #60 — close on the desktop stage is hide(), so this is
          // the gesture that brings the window back). Not visible = exactly
          // those two modes; the core's restore() refuses every other, so
          // a click on a visible window stays a no-op refocus.
          on(dom.programBtn, 'click', function() {
            if (!machine.isVisible()) controller.restore();
          });
        }
        // Desktop regime (ticket #60): the title bar drags the window and
        // the corner grip resizes it, both through applyGeometry → the
        // core. On the flow views and the mobile layout beginDrag refuses;
        // while maximized the core itself refuses the write.
        wireDragHandle(dom && dom.titleBar, 'move');
        wireDragHandle(dom && dom.resizeGrip, 'resize');
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
    TRACE_MS: TRACE_MS,
    // Desktop regime (ticket #60): the clamp and the view set, exposed for
    // the headless tests (the controller drives them through the core).
    WINDOWED_VIEWS: WINDOWED_VIEWS,
    isWindowedView: isWindowedView,
    clampGeometry: clampGeometry,
    MIN_W: MIN_W,
    MIN_H: MIN_H,
    TITLEBAR_H: TITLEBAR_H,
    TASKBAR_H: TASKBAR_H,
    TITLE_REACH: TITLE_REACH
  };

  if (typeof module !== 'undefined') module.exports = app.Windows;

})(globalThis);
