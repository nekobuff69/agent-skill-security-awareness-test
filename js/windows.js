(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Window manager: the controller and rendering for the title-bar controls,
   * the program frames and the reusable system-dialog primitive.
   *
   * Ticket #59 moved the state machine it used to own into js/desktop-core.js,
   * the DOM-free desktop core (parent spec #58). This module renders; the core
   * decides. The rules below are the core's rules restated where the
   * rendering depends on them.
   *
   * Ticket #61 generalizes the controller from ONE frame to the THREE
   * desktop programs — Quiz, Action Plan, Deep-Dive Prompt — on the one
   * shared Core: every frame paints its own Record, the taskbar lists
   * exactly the running windows in program order, and pointer interaction
   * inside any frame raises it. There is still exactly ONE state model;
   * this module keeps no per-window copy of anything.
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
   * change listener, so [□] re-enables at desktop widths. The same rule
   * applies to the two program frames added by ticket #61: on the mobile
   * layout every frame is full-screen and only the ACTIVE one paints, so
   * the taskbar switcher is the way between programs.
   *
   * Desktop regime (ticket #60, generalized by #61): on the results and
   * review stages each frame is a positioned window — Geometry inline,
   * title-bar drag, corner-grip resize, clamp. Landing and quiz keep the
   * layout-flow regime (the desktop does not exist before the Finish
   * Commit); a program frame whose Record does not exist yet is not painted
   * at all. Close on this stage is the core's hide(): the window leaves the
   * screen, the bare desktop and the taskbar stay, and the program button
   * brings it back (hidden and minimized alike) — no End Program dialog for
   * a gesture that only puts the window away. Flow stages keep the dialog
   * exactly as ticket #43 built it.
   *
   * Arrival (ticket #61, spec #58): a program window is BORN when its
   * content settles, never before — the Action Plan opens cascaded from the
   * focused window and lands BELOW it in the stacking order, without a
   * focus call, a raise or a scroll; the Deep-Dive Prompt opens minimized
   * at the Finish Commit and shows as a taskbar button only.
   *
   * Keyboard floor (ticket #67): only the FOCUSED window answers the
   * keyboard. paintFrame puts the inert attribute on everything inside
   * every other window — the client area, the title-bar controls, and any
   * region a later ticket mounts into the frame — except its two pointer
   * handles. Tab therefore never lands inside a window the Participant is
   * not working in, while raise-on-interaction, the title-bar drag and the
   * corner-grip resize stay untouched: a press on an inert control
   * retargets to the live frame root, which raises the window and lifts
   * the floor before the pointer comes back up. Escape's window tier
   * (escapeFocused) puts the focused window away — hide(), never a dialog —
   * and hands focus back to the taskbar button or the shortcut the
   * Participant came through. No aria-modal on a window, no Alt+Tab
   * interception, no focus trap: the desktop stays one Tab order.
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
   * The desktop's state, straight from the core. The legacy no-argument
   * surface addresses the Quiz window (the controller and the existing
   * tests keep driving it by name); the ticket #61 methods take a program
   * Id. Every method delegates — there is no local state.
   */
  function createMachine() {
    var Desktop = coreModule();
    if (!Desktop || typeof Desktop.createCore !== 'function') {
      throw new Error('js/windows.js needs the desktop core: load js/desktop-core.js first');
    }
    var core = Desktop.createCore({ id: Desktop.QUIZ_ID });
    var quiz = Desktop.QUIZ_ID;

    function getState(id) {
      var wid = id || quiz;
      var snap = core.windowSnapshot(wid) || { mode: null };
      return {
        mode: snap.mode,
        confirmOpen: core.isConfirmOpen(),
        view: core.getView(),
        active: core.activeId(),
        z: snap.z
      };
    }

    return {
      /** The core itself — the controller reads state and derived flags
       *  through it and renders. */
      core: core,
      quizId: quiz,
      programIds: Desktop.PROGRAM_IDS,
      getState: getState,
      hasWindow: core.hasWindow,
      isVisible: core.isVisible,
      inTaskbar: core.inTaskbar,
      taskbarList: core.taskbarList,
      canFocus: core.canFocus,
      canMinimize: core.canMinimize,
      canMaximize: core.canMaximize,
      canClose: core.canClose,
      minimize: core.minimize,
      restore: core.restore,
      toggleMaximize: core.toggleMaximize,
      hide: core.hide,
      open: core.open,
      requestClose: core.requestClose,
      confirmClose: core.confirmClose,
      cancelClose: core.cancelClose,
      applyGeometry: core.applyGeometry,
      /** A Record's current Geometry — a fresh copy, or null when the
       *  program has not arrived (ticket #60: the controller paints and
       *  clamps it, the core owns it). */
      geometry: function(id) {
        var snap = core.windowSnapshot(id || quiz);
        return snap ? snap.geometry : null;
      },
      /** The Record's stacking order, or null for an absent program. */
      z: function(id) {
        var snap = core.windowSnapshot(id || quiz);
        return snap ? snap.z : null;
      },
      activeId: core.activeId,
      setView: core.setView,
      setActive: core.setActive,
      raise: core.raise,
      windowSnapshot: core.windowSnapshot,
      snapshot: core.snapshot,
      loadSnapshot: core.loadSnapshot,
      /** Put every program window except the Quiz away when the desktop
       *  goes off stage: flow views have no desktop to draw them on. */
      hidePrograms: function(exceptId) {
        var ids = [];
        Desktop.PROGRAM_IDS.forEach(function(pid) {
          if (pid !== exceptId && core.hasWindow(pid) && core.inTaskbar(pid)) {
            core.hide(pid);
            ids.push(pid);
          }
        });
        return ids;
      }
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
   * The windowed views (spec #58): the desktop the finished work lives on.
   * On these the frames are positioned by the core's Geometry and can be
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
   * attach(refs) supplies the built Quiz shell DOM:
   *   windowEl, titleBar, resizeGrip, programBtn,
   *   buttons {minimize, maximize, close}
   * attachProgram(id, refs) supplies one program frame's DOM (ticket #61):
   *   windowEl, bodyEl, titleBar, titleText, resizeGrip, taskbarBtn,
   *   buttons {minimize, maximize, close}
   * The keyboard floor (ticket #67) needs no new wiring: it paints the
   * inert attribute on every child of the frame except its pointer handles
   * (the title bar and the corner grip) plus the three title-bar buttons,
   * so a background window's controls — and any region a later ticket
   * mounts into it — stay out of the Tab order. `bodyEl` is named only so
   * a stub DOM that never assembles children still gets its client area
   * covered.
   */
  function create(deps) {
    deps = deps || {};
    var doc = deps.doc || null;
    var machine = createMachine();
    var QUIZ = machine.quizId;
    var dom = null;                   // the Quiz frame (tickets #52/#60 shape)
    var programs = {};                // id → its frame refs (ticket #61)
    var traceTokens = {};             // id → invalidates stale trace callbacks

    /**
     * Ticket #67: where keyboard focus came back from. When a taskbar
     * button (or a keyboard shortcut, via recordTrigger()) sends a window
     * away — Escape being the hiding gesture — focus returns to that
     * control. One entry per program id; the frame wiring writes it before
     * the transition, the Escape floor reads it after.
     */
    var lastTrigger = {};

    /** The inert floor (ticket #67): every control of a window that is NOT
     *  the active one wears the inert attribute, so Tab lands only inside
     *  the focused window's controls. The FLOOR IS PAINTED ON THE PARTS,
     *  never on the frame root, because the root has two pointer jobs the
     *  keyboard floor must not steal: it answers raise-on-interaction
     *  (wireRaise) and it carries the title bar drag and the corner-grip
     *  resize. A pointer press on an inert control retargets to its
     *  nearest non-inert ancestor — the live frame root — so pressing
     *  anywhere in a background window raises it exactly as it did before
     *  the floor existed, and by the time the pointer comes back up the
     *  window is focused, its controls are live again, and the click
     *  lands. paintFrame applies the floor on every render: it follows the
     *  core's active Id and is never a second copy of state here. The
     *  attribute (not the IDL property) is what the paint writes, so the
     *  headless fake DOMs read the same contract the browser does. */
    function setPartInert(el, inert) {
      if (!el || typeof el.setAttribute !== 'function') return;
      var has = typeof el.getAttribute === 'function' &&
        el.getAttribute('inert') !== null;
      if (inert) {
        if (!has) el.setAttribute('inert', '');
        return;
      }
      if (has && typeof el.removeAttribute === 'function') {
        el.removeAttribute('inert');
      }
    }

    function paintInertFloor(refs, active) {
      var inert = !active;
      // Everything the frame contains EXCEPT its pointer handles wears the
      // floor: the client area (a program frame's body, the Quiz frame's
      // #app) and anything else mounted into the frame — a later ticket's
      // menu bar or status bar is covered without new wiring. The title
      // bar and the corner grip stay live (they are the drag and resize
      // handles) and the frame root stays live, so the raised press of an
      // inert control lands on a listener that still answers.
      var targets = [];
      var win = refs.windowEl;
      if (win && win.children) {
        for (var i = 0; i < win.children.length; i++) {
          var kid = win.children[i];
          if (kid === refs.titleBar || kid === refs.resizeGrip) continue;
          targets.push(kid);
        }
      }
      var client = refs.bodyEl;
      if (client && targets.indexOf(client) < 0) targets.push(client);
      for (var t = 0; t < targets.length; t++) setPartInert(targets[t], inert);
      if (refs.buttons) {
        setPartInert(refs.buttons.minimize, inert);
        setPartInert(refs.buttons.maximize, inert);
        setPartInert(refs.buttons.close, inert);
      }
    }

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
      if (visible && visible.id) applyStage(visible.id);
    }

    /**
     * The one place the view changes. The desktop is a stage: leaving it
     * (landing/quiz) puts the program windows away — they have no desktop
     * to stand on — while the Quiz window keeps its flow frame. Entering
     * it again shows them back through the taskbar, exactly as they were
     * left (the hidden Record keeps its arrangement for restore()).
     */
    function applyStage(view) {
      machine.setView(view);
      if (!isWindowedView(view)) machine.hidePrograms(QUIZ);
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

    /** The frame element of a program, or the Quiz frame when unaddressed. */
    function frameOf(id) {
      if (!id || id === QUIZ) return dom;
      return programs[id] || null;
    }

    /** The clamped Geometry a frame should paint, or null (not positioned). */
    function paintedGeometry(id) {
      if (!machine.hasWindow(id) || !isWindowed()) return null;
      if (machine.windowSnapshot(id).mode !== 'normal') return null;
      return clampGeometry(machine.geometry(id), viewport());
    }

    // ── Paint ──────────────────────────────────────────────────────────

    /**
     * Paint one frame from its Record (ticket #60 for the Quiz window,
     * ticket #61 for the program frames). The classes are the layout-regime
     * switches (css/shell.css positions a frame only with .is-windowed);
     * the inline styles carry the numbers; z-index carries the stacking
     * order and a pressed-in title bar marks the active window.
     *
     * A program frame with no Record — not arrived yet, or hidden on the
     * flow stage — is UNPAINTED: display none, no geometry, nothing on the
     * taskbar. That is the core's absence, derived, never stored here.
     */
    function paintFrame(id) {
      var refs = frameOf(id);
      if (!refs || !refs.windowEl || !refs.windowEl.style) return;
      var win = refs.windowEl;
      var snap = machine.windowSnapshot(id);
      var exists = !!snap;
      var mode = exists ? snap.mode : null;

      if (!exists || mode === 'hidden') win.classList.add('is-hidden');
      else win.classList.remove('is-hidden');

      if (exists && mode === 'maximized') win.classList.add('is-maximized');
      else win.classList.remove('is-maximized');

      // A Record born minimized (the Deep-Dive Prompt at the Finish
      // Commit) is off the screen from the start; a window in the middle
      // of its minimize trace keeps tracing and takes the class when the
      // trace lands.
      if (mode === 'minimized' && !win.classList.contains('is-minimizing')) {
        win.classList.add('is-minimized');
      } else if (mode !== 'minimized') {
        win.classList.remove('is-minimized');
      }

      // The active window reads active: its title bar keeps the live navy,
      // every other frame draws the era's inactive gray gradient.
      var active = exists && machine.core.canFocus(id);
      if (active) win.classList.add('is-active');
      else win.classList.remove('is-active');
      // The keyboard floor (#67): Tab stops at the focused window.
      paintInertFloor(refs, active);
      if (refs.titleBar) {
        refs.titleBar.setAttribute('data-active', active ? 'true' : 'false');
      }

      var g = paintedGeometry(id);
      win.style.zIndex = exists ? String(snap.z) : '';
      if (!g) {
        win.classList.remove('is-windowed');
        win.style.left = '';
        win.style.top = '';
        win.style.width = '';
        win.style.height = '';
        return;
      }
      win.classList.add('is-windowed');
      win.style.left = g.x + 'px';
      win.style.top = g.y + 'px';
      win.style.width = g.w + 'px';
      win.style.height = g.h + 'px';
    }

    /** Title-bar control gating for one frame (the core's derived flags). */
    function paintButtons(id) {
      var refs = frameOf(id);
      if (!refs || !refs.buttons) return;
      refs.buttons.minimize.disabled = !machine.canMinimize(id);
      // Mobile rule (ticket #46): [□] also stays gray at ≤768px —
      // the stylesheet already shows the maximized form.
      refs.buttons.maximize.disabled =
        !machine.canMaximize(id) || mobileMaximized();
      refs.buttons.close.disabled = !machine.canClose(id);
    }

    /**
     * The taskbar (ticket #61, spec #58):
     *
     *   - The Quiz program button is the app's own button, exactly as
     *     tickets #43/#60 drew it: pressed while the Quiz window is on the
     *     desktop, and the way back for a Quiz window the Participant put
     *     away (close→puts-away STAYS reversible — an unreachable window is
     *     a regression, mobile included).
     *   - One button per program window, in the stable program order, and
     *     EXACTLY the running ones: no Record (the Action Plan has not
     *     settled, the Deep-Dive Prompt has not been committed) means no
     *     button, and a hidden window leaves the bar. The button is pressed
     *     while its window is the ACTIVE window.
     */
    function paintTaskbar() {
      if (dom && dom.programBtn) {
        // Pressed = the window is on the desktop; the core derives that
        // from the mode (minimized/hidden are the not-visible modes).
        dom.programBtn.setAttribute('aria-pressed',
          machine.isVisible(QUIZ) ? 'true' : 'false');
      }
      machine.programIds.forEach(function(id) {
        if (id === QUIZ) return;
        var refs = frameOf(id);
        if (!refs || !refs.taskbarBtn) return;
        var running = machine.hasWindow(id) && machine.inTaskbar(id);
        refs.taskbarBtn.hidden = !running;
        refs.taskbarBtn.setAttribute('aria-pressed',
          running && machine.canFocus(id) ? 'true' : 'false');
      });
    }

    function render() {
      syncView();
      var ids = machine.programIds;
      for (var i = 0; i < ids.length; i++) {
        paintButtons(ids[i]);
        paintFrame(ids[i]);
      }
      paintTaskbar();
      return machine.getState(QUIZ);
    }

    // ── Transitions, per frame ─────────────────────────────────────────

    /** The minimize trace: collapse toward the taskbar, then hide (ticket
     *  #43); every frame traces with its own token. */
    function minimize(id) {
      id = id || QUIZ;
      if (!machine.minimize(id)) return false;
      render();
      var refs = frameOf(id);
      var win = refs && refs.windowEl;
      if (win) {
        var token = (traceTokens[id] = (traceTokens[id] || 0) + 1);
        win.classList.add('is-minimizing');
        schedule(function() {
          if (token !== traceTokens[id]) return;
          win.classList.remove('is-minimizing');
          win.classList.add('is-minimized');
        }, traceDelay());
      }
      return true;
    }

    function restore(id) {
      id = id || QUIZ;
      if (!machine.restore(id)) return false;
      var refs = frameOf(id);
      var win = refs && refs.windowEl;
      if (win) {
        var token = (traceTokens[id] = (traceTokens[id] || 0) + 1);
        win.classList.remove('is-minimizing');
        win.classList.remove('is-minimized');
        win.classList.add('is-restoring');
        schedule(function() {
          if (token !== traceTokens[id]) return;
          win.classList.remove('is-restoring');
        }, traceDelay());
        if (typeof win.focus === 'function') win.focus();
      }
      render();
      return true;
    }

    function toggleMaximize(id) {
      id = id || QUIZ;
      // Mobile rule (ticket #46): at ≤768px there is nothing to toggle —
      // the CSS media query maximizes by default and un-maximizing is
      // meaningless on this viewport. The core stays viewport-blind.
      if (mobileMaximized()) return false;
      if (!machine.toggleMaximize(id)) return false;
      render();
      return true;
    }

    function requestClose(id) {
      id = id || QUIZ;
      if (!machine.requestClose(id)) return false;
      render();
      return true;
    }

    /**
     * Close on the desktop stage (ticket #60): the core's hide() — the
     * window leaves the screen, the bare desktop and taskbar stay, and the
     * arrangement is exactly what restore() comes back to. No dialog: the
     * gesture puts the window away, it never ends the program's work.
     */
    function hide(id) {
      id = id || QUIZ;
      if (!machine.hide(id)) return false;
      render();
      return true;
    }

    function confirmClose(id) {
      id = id || QUIZ;
      if (!machine.confirmClose(id)) return false;
      render();
      return true;
    }

    function cancelClose() {
      if (!machine.cancelClose()) return false;
      render();
      return true;
    }

    /**
     * The Quiz window's [×] decision, in ONE place (ticket #60): 'hidden'
     * when the windowed stage put the window away, 'dialog' when a flow
     * stage asked for the End Program confirmation, false when the gesture
     * was refused. js/shell.js opens the dialog on 'dialog'.
     */
    function close() {
      syncView();   // the decision follows what is actually on screen
      if (isWindowedView(machine.getState().view)) {
        return hide(QUIZ) ? 'hidden' : false;
      }
      return requestClose(QUIZ) ? 'dialog' : false;
    }

    /** A program frame's [×]: put it away (ticket #61). There is no End
     *  Program dialog for the Action Plan or the Deep-Dive Prompt — the
     *  gesture never ends anything; it hides the frame and the taskbar
     *  button (or the next ticket's shortcut) brings it back. */
    function closeProgram(id) {
      return hide(id) ? 'hidden' : false;
    }

    // ── Arrival (ticket #61) ───────────────────────────────────────────

    /**
     * The program arrives: its Record is born from the core (designed
     * Geometry, 24px cascade when another window is focused). opts:
     *   minimized  the window is born in the taskbar only (Deep-Dive
     *              Prompt at the Finish Commit)
     *   belowActive  it lands BELOW the active window in the stacking
     *              order and takes neither focus nor the pointer
     *
     * Arrival NEVER calls raise() or setActive() and NEVER scrolls: the
     * window the Participant is reading stays exactly as it was — same
     * mode, same Geometry, still active, still on top. It is the same
     * transition on the LLM Path and on the Deterministic Fallback,
     * including when the fallback settles inside the current tick.
     */
    function openProgram(id, opts) {
      opts = opts || {};
      if (!machine.open(id, {
        minimized: !!opts.minimized,
        below: opts.below !== false,
        noCascade: !!opts.noCascade,
        geometry: opts.geometry
      })) return false;
      render();
      return true;
    }

    /** The Action Plan's arrival shape: content settled, so the window
     *  appears beside (never over) the window being read. */
    function actionPlanArrived() {
      return openProgram('action-plan', { below: true });
    }

    /** The Deep-Dive Prompt's arrival shape: minimized at the Finish
     *  Commit, a taskbar button and nothing else. */
    function deepDiveArrived() {
      return openProgram('deep-dive', { minimized: true });
    }

    // ── Focus and stacking ─────────────────────────────────────────────

    /** Raise + focus: the answer to ANY pointer interaction inside a
     *  frame (ticket #61) and to a taskbar click on a visible window. */
    function focusWindow(id) {
      if (!machine.raise(id)) return false;
      render();
      return true;
    }

    /**
     * The taskbar button click (ticket #61): a running window becomes the
     * active one; a minimized window is restored AND focused. Hidden
     * windows have no button at all, so this never sees one. Keyboard
     * activation (Enter/Space on the button, ticket #67) runs the same
     * click — the window switches or restores, and the button is recorded
     * as where this window's focus came from.
     */
    function activateProgram(id) {
      if (!machine.hasWindow(id)) return false;
      var mode = machine.windowSnapshot(id).mode;
      if (mode === 'minimized') {
        restore(id);
        return focusWindow(id);
      }
      return focusWindow(id);
    }

    /** True while an element can take focus back (fake DOMs agree). */
    function focusableEl(el) {
      return !!el && typeof el.focus === 'function' &&
        el.disabled !== true && el.hidden !== true;
    }

    /**
     * Escape's window tier (ticket #67), the FLOOR of the Escape stack:
     * the system dialog, About and the Start menu all own Escape above it
     * (js/shell.js handleKeydown asks them first). It hides the window
     * with focus — the core's hide(), the same put-away [×] draws on the
     * desktop stage — and hands focus back to the taskbar button or
     * shortcut the Participant came through. A hidden program has no
     * button left in the bar, so the fallback is the Quiz program button,
     * the taskbar's permanent control: focus never lands on nothing, and
     * the window comes back through exactly the path that opens it.
     * Refused off the desktop stage (the flow views put no window away —
     * their [×] is the End Program dialog), while a dialog owns the
     * desktop, and when the focused window is already minimized or hidden.
     */
    function escapeFocused() {
      // The window tier answers on the DESKTOP stage (results/review),
      // mobile included: hide() is a mode change the core accepts on both
      // regimes, so Escape puts the focused window away exactly as [×]
      // does. The flow views (landing/quiz) have no desktop to hide from.
      if (!isWindowedView(machine.getState().view)) return false;
      var id = machine.activeId();
      if (!id || !machine.hasWindow(id)) return false;
      if (machine.getState(id).confirmOpen) return false;
      var snap = machine.windowSnapshot(id);
      if (!snap || (snap.mode !== 'normal' && snap.mode !== 'maximized')) {
        return false;
      }
      var trigger = lastTrigger[id] || null;
      if (!hide(id)) return false;
      // The window came through a taskbar button or a shortcut: hand focus
      // back to it when it is still reachable. A program window's OWN button
      // leaves the bar the moment it is hidden, so the stable fallback is
      // the Quiz program button — the taskbar control that is always there.
      if (focusableEl(trigger)) { trigger.focus(); return true; }
      var refs = frameOf(id);
      var own = refs && refs.taskbarBtn;
      if (own && focusableEl(own)) own.focus();
      else if (dom && focusableEl(dom.programBtn)) dom.programBtn.focus();
      return true;
    }

    // ── Geometry writes + pointer drag/resize (ticket #60) ─────────────

    /**
     * The controller's geometry write: refuse the mobile layout (the
     * viewport-blind core never models it — ticket #46's rule), clamp to
     * the desktop, then hand the clamped Geometry to the core, which
     * refuses maximized/minimized/hidden windows and a dialog that owns
     * the desktop. Paint only on a successful write.
     */
    function applyGeometry(geometry, id) {
      id = id || QUIZ;
      if (!isWindowed()) return false;
      var clamped = clampGeometry(geometry, viewport());
      if (!machine.applyGeometry(clamped, id)) return false;
      render();
      return true;
    }

    /** The Geometry the core holds for a frame — fresh copy, or null. */
    function geometry(id) {
      return machine.geometry(id || QUIZ);
    }

    /**
     * One live gesture: 'move' (title bar) or 'resize' (corner grip), on
     * ONE frame, with the pointer id and the Geometry the gesture started
     * from — deltas are always measured against that origin, never against
     * a clamped intermediate, so dragging into a wall and back stays true.
     */
    var drag = null;

    function beginDrag(kind, ev, handle, id) {
      id = id || QUIZ;
      if (!isWindowed()) return false;
      // A secondary pointer (the second finger of a pinch) never hijacks a
      // live gesture; a new primary gesture replaces a stale one, which is
      // what a dropped pointerup leaves behind when pointer capture is
      // unavailable.
      if (drag && ev && ev.isPrimary === false) return false;
      if (!ev || (ev.button != null && ev.button !== 0)) return false;
      if (!machine.hasWindow(id) || machine.windowSnapshot(id).mode !== 'normal') {
        return false;
      }
      // Grabbing a frame's handle IS a pointer interaction inside it.
      machine.raise(id);
      drag = {
        id: id,
        kind: kind,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        origin: machine.geometry(id)
      };
      // Capture keeps the move/up stream on the handle even when the
      // pointer runs off the title bar or the window edge.
      if (handle && ev.pointerId !== undefined &&
          typeof handle.setPointerCapture === 'function') {
        try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* no capture */ }
      }
      var refs = frameOf(id);
      if (refs && refs.windowEl && refs.windowEl.classList) {
        refs.windowEl.classList.add(kind === 'move' ? 'is-dragging' : 'is-resizing');
      }
      render();
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
      return applyGeometry(next, drag.id);
    }

    function endDrag(ev) {
      if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) {
        return false;
      }
      var refs = frameOf(drag.id);
      drag = null;
      if (refs && refs.windowEl && refs.windowEl.classList) {
        refs.windowEl.classList.remove('is-dragging');
        refs.windowEl.classList.remove('is-resizing');
      }
      return true;
    }

    /** A control button inside the title bar is not a drag handle. */
    function isTitleBarControl(ev) {
      var t = ev && ev.target;
      return !!(t && typeof t.closest === 'function' && t.closest('.os-titlebar-btn'));
    }

    /** Wire one gesture source of one frame: down starts, move drags,
     *  up/cancel ends. */
    function wireDragHandle(el, kind, id) {
      if (!el) return;
      on(el, 'pointerdown', function(ev) {
        if (isTitleBarControl(ev)) return;
        if (beginDrag(kind, ev, el, id) && ev && typeof ev.preventDefault === 'function') {
          ev.preventDefault();
        }
      });
      on(el, 'pointermove', moveDrag);
      on(el, 'pointerup', endDrag);
      on(el, 'pointercancel', endDrag);
    }

    /**
     * Raise-on-interaction (ticket #61, spec #58): ANY pointer interaction
     * inside a frame raises it and makes it active. The title-bar handles
     * already raise through beginDrag; this covers clicks and drags inside
     * the body. A frame whose window is minimized or hidden cannot be
     * interacted with — the core refuses, exactly as raise() says.
     */
    function wireRaise(el, id) {
      if (!el) return;
      on(el, 'pointerdown', function(ev) {
        if (isTitleBarControl(ev)) return;      // the button paints its own state
        focusWindow(id);
      });
    }

    /** The taskbar button for one frame: focus, or restore when minimized. */
    function wireTaskbarBtn(btn, id) {
      if (!btn) return;
      on(btn, 'click', function() {
        lastTrigger[id] = btn;     // the keyboard route back is this button
        controller.activateProgram(id);
      });
    }

    var controller = {
      getState: function(id) { return machine.getState(id || QUIZ); },
      activeId: machine.activeId,
      programIds: machine.programIds,
      runningPrograms: machine.taskbarList,
      hasWindow: machine.hasWindow,
      canMinimize: function(id) { return machine.canMinimize(id || QUIZ); },
      canMaximize: function(id) { return machine.canMaximize(id || QUIZ); },
      canClose: function(id) { return machine.canClose(id || QUIZ); },
      // The mode consequences the shell renders from — derived by the core.
      // A call without an Id addresses the Quiz window: that is what the
      // tickets #43/#60 surface always meant, and the desktop now has more
      // than one window to be ambiguous about.
      isVisible: function(id) { return machine.isVisible(id || QUIZ); },
      inTaskbar: function(id) { return machine.inTaskbar(id || QUIZ); },
      canFocus: function(id) { return machine.canFocus(id || QUIZ); },
      snapshot: machine.snapshot,
      /** Ticket #63 (js/desktop-store.js): write the committed desktop's
       *  Records back into the core BEFORE the restored render. No render()
       *  here on purpose: the visible section is still the landing until
       *  renderResults flips it, and an early syncView would read the
       *  landing and put the arriving programs away. The MutationObserver
       *  wired in attach() paints the Records as soon as the desktop shows. */
      restoreSnapshot: function(snap) { return machine.loadSnapshot(snap); },
      minimize: minimize,
      restore: restore,
      toggleMaximize: toggleMaximize,
      requestClose: requestClose,
      confirmClose: confirmClose,
      cancelClose: cancelClose,
      hide: hide,
      close: close,
      closeProgram: closeProgram,
      // The desktop regime (ticket #60): geometry through the core, plus
      // the controller's view/viewport decision.
      applyGeometry: applyGeometry,
      geometry: geometry,
      isWindowed: isWindowed,
      setView: function(view) { applyStage(view); return render(); },
      render: render,
      // The three-program desktop (ticket #61).
      openProgram: openProgram,
      actionPlanArrived: actionPlanArrived,
      deepDiveArrived: deepDiveArrived,
      focusWindow: focusWindow,
      activateProgram: activateProgram,
      // The keyboard floor (ticket #67): Escape's window tier — hides the
      // focused window and returns focus to its taskbar button or the
      // shortcut that opened it — plus the shortcut seam: whatever control
      // opens a window records itself here so the tier can hand focus back.
      escapeFocused: escapeFocused,
      recordTrigger: function(id, el) {
        lastTrigger[id || QUIZ] = el || null;
      },

      /** Wire the built Quiz shell DOM (js/shell.js calls this after build()). */
      attach: function(refs) {
        dom = refs || null;
        if (dom && dom.windowEl) {
          // Makes restore()'s focus() land: a div needs a tabindex.
          dom.windowEl.setAttribute('tabindex', '-1');
          wireRaise(dom.windowEl, QUIZ);
        }
        if (dom && dom.programBtn) {
          // The program button is the way back: it restores a minimized
          // window (the era's taskbar path, ticket #43) AND a hidden one
          // (ticket #60 — close on the desktop stage is hide(), so this is
          // the gesture that brings the window back). Not visible = exactly
          // those two modes; the core's restore() refuses every other, so
          // a click on a visible window stays a no-op refocus.
          on(dom.programBtn, 'click', function() {
            lastTrigger[QUIZ] = dom.programBtn;   // #67: the Escape target
            // Not visible = exactly the minimized and hidden modes; the
            // core's restore() refuses every other, so a click on a
            // visible window stays a no-op refocus. The restore ALWAYS
            // ends in focus (#67): putting a window back on the desktop
            // without the floor moving with it would leave a window the
            // Participant can see but cannot Tab into.
            if (!machine.isVisible(QUIZ)) controller.restore(QUIZ);
            controller.focusWindow(QUIZ);
          });
        }
        // Desktop regime (ticket #60): the title bar drags the window and
        // the corner grip resizes it, both through applyGeometry → the
        // core. On the flow views and on the mobile layout beginDrag refuses;
        // while maximized the core itself refuses the write.
        wireDragHandle(dom && dom.titleBar, 'move', QUIZ);
        wireDragHandle(dom && dom.resizeGrip, 'resize', QUIZ);
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
      },

      /**
       * Wire one program frame (ticket #61). Same controls, same handles,
       * same raise-on-interaction rule as the Quiz window — the frames
       * differ only in what is mounted inside them.
       */
      attachProgram: function(id, refs) {
        if (!refs) return false;
        programs[id] = refs;
        if (refs.windowEl) {
          refs.windowEl.setAttribute('tabindex', '-1');
          wireRaise(refs.windowEl, id);
        }
        wireDragHandle(refs.titleBar, 'move', id);
        wireDragHandle(refs.resizeGrip, 'resize', id);
        wireTaskbarBtn(refs.taskbarBtn, id);
        render();
        return true;
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
