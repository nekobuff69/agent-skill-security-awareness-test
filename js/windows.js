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
   *   and the close gesture never calls it, so answers always survive the
   *   gesture. The ONE exception is the destructive tail endRun() (ticket
   *   #66): Quit and Retake clear the Session and the desktop Record on
   *   purpose, and only after the Participant confirmed.
   *
   * Mobile rule (ticket #46, re-modeled by ticket #68): at viewport widths
   *   ≤ 768px the stylesheet (css/shell.css media block) presents the window
   * maximized by DEFAULT — full-bleed above the slim taskbar. Because that
   * maximization is pure CSS, the desktop core stays viewport-blind: it
   * never models a mode the viewport can silently override. The controller
   * layer carries the consequences instead, behind the same 768px media
   * query:
   *   - [□] NEVER toggles and always renders disabled (mobileMaximized());
   *     the stylesheet already shows the maximized form, so the button is
   *     a lie on this viewport.
   *   - [—] renders disabled as well (#68): nothing traces down on this
   *     layout, where the stylesheet already maximizes every frame — the
   *     control would be dead chrome, and the mobile taskbar switch entry
   *     is the one restore gesture.
   *   - [×] puts the window away on the windowed stage (results/review),
   *     exactly as on the desktop ticket #60 drew it. #62 had grayed a
   *     program frame's [×] at these widths because a hidden window left
   *     the running-windows-only taskbar with no way back and no shortcut
   *     column; ticket #68 gives this layout the PERMANENT switcher — the
   *     taskbar lists all three programs whether they are opened, running
   *     or put-away — so the switch is the route back and the put-away is
   *     never a stranding gesture. The report is preserved: hide() is a
   *     mode change, the Record and its content stay in the core.
   *   - Flow stages (landing/quiz) keep the End Program dialog for [×]:
   *     on those there is no desktop in play yet.
   * Crossing the 768px boundary re-renders the controls via a matchMedia
   * change listener, so [□] re-enables at desktop widths. The same rule
   * applies to the two program frames added by ticket #61: on the mobile
   * layout every frame is full-screen and only the ACTIVE one paints, so
   * the taskbar switcher is the way between programs.
   *
   * Desktop regime (ticket #60, generalized by #61, re-modeled on the
   * mobile layout by #68): on the results and review stages each frame is a
   * positioned window — Geometry inline, title-bar drag, corner-grip resize,
   * clamp. Landing and quiz keep the layout-flow regime (the desktop does
   * not exist before the Finish Commit); a program frame whose Record does
   * not exist yet is not painted at all. Close on this stage is the core's
   * hide(): the window leaves the screen, the bare desktop and the taskbar
   * stay, and the window comes back minimized from its taskbar button or
   * hidden from its desktop shortcut (ticket #62) — no End Program dialog
   * for a gesture that only puts the window away. On the ≤768px layout the
   * same close decision stands, with ONE change: the shortcut column does
   * not exist, so the way back is the taskbar's permanent switch entry for
   * that program (#68). Flow stages keep the dialog
   * exactly as ticket #43 built it.
   *
   * Arrival (ticket #61, spec #58; slots #76): a program window is BORN
   * when its content settles, never before — the Action Plan opens in its
   * fixed right-anchored upper slot and lands BELOW the focused window in
   * the stacking order, without a focus call, a raise or a scroll; the
   * Deep-Dive Prompt opens minimized in its lower-right slot at the Finish
   * Commit and shows as a taskbar button only. The 24px cascade off the
   * focused window is retired: an Opening always lands in its own slot.
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
   * Participant came through; on the ≤768px layout (#68) that shortcut
   * column does not exist, so the tier hands focus to the program's
   * permanent switch entry instead. No aria-modal on a window, no Alt+Tab
   * interception, no focus trap: the desktop stays one Tab order.
   *
   * The activation hand-off (ticket #75) is a CORE transition: minimize()
   * moves activation to the topmost Window still visible, and with nothing
   * left visible the desktop has no active Window at all. render() paints
   * the consequences from the core's Id — the navy title bar and the
   * keyboard floor on the newly active frame, the grey gradient and the
   * inert floor on the Put Away one, the pressed Program Switch — and
   * focusProgramSwitch() returns focus to the switch that was pressed when
   * the hand-off leaves no Window to be active. The same ticket moves the
   * Desktop Shortcut column to the desktop's base layer: every Window
   * paints from WINDOW_Z_BASE upward, so the stacking numbers can never
   * drop a Window behind the column.
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
    if (!app.DesktopCore && typeof require === 'function') {
      require('./desktop-core.js');   // Node seam; the page loads it by tag
    }
    return app.DesktopCore || null;
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
      resetPrograms: core.resetPrograms,
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

  /**
   * The Window stack's base rung — the z-index floor js/windows.js paints,
   * mirroring `.os-window`'s rung in css/shell.css (ticket #75). The core's
   * stack numbers are a RELATIVE order (0 upward, compacted by every
   * arrival and every renumbering), so the shell adds this base: a Window
   * can never be dropped behind the Desktop Shortcut column's rung
   * (.os-shortcuts: 100) however the stack renumbers. The column belongs to
   * the desktop surface: every Window covers it, minimizing or moving a
   * Window reveals it again.
   */
  var WINDOW_Z_BASE = 200;

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

    /**
     * The mobile switcher regime (ticket #68): results/review at ≤768px.
     * One program fills the screen above the slim taskbar, the shortcut
     * column does not exist, and the taskbar's three entries are the
     * permanent way between the programs — membership, the pressed state
     * and the meaning of a switch click all follow this flag instead of
     * the desktop's running-windows rule.
     */
    function mobileSwitcher() {
      return mobileMaximized() && isWindowedView(machine.getState().view);
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
      // Ticket #75's floor: the core's number is the relative order, the
      // painted rung is WINDOW_Z_BASE + that order, so no arrival or
      // renumbering can ever stack a Window behind the shortcut column.
      win.style.zIndex = exists
        ? String(WINDOW_Z_BASE + Math.max(0, snap.z)) : '';
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
      // Mobile rule (#68): the chrome reduces to close. [—] would trace a
      // window down to a taskbar the switcher already owns on this layout,
      // and [□] is a lie the stylesheet has already drawn — both render
      // disabled (and css/shell.css hides them at the same breakpoint).
      refs.buttons.minimize.disabled =
        !machine.canMinimize(id) || mobileMaximized();
      refs.buttons.maximize.disabled =
        !machine.canMaximize(id) || mobileMaximized();
      // [×] puts the window away on both layouts. Ticket #62 grayed a
      // program frame's [×] at ≤768px because a hidden window left the
      // running-windows-only bar with nothing to bring it back; ticket
      // #68 paints the taskbar as the permanent three-program switcher
      // on this layout, so the switch is the route back and the put-away
      // strands nothing. The Quiz frame's [×] is the End Program dialog
      // on the flow stages (see close()).
      refs.buttons.close.disabled = !machine.canClose(id);
    }

    /**
     * The taskbar (ticket #61, spec #58; ticket #62 makes the rule
     * complete; ticket #68 re-models the mobile layout):
     *
     *   - On the DESKTOP layout: EXACTLY the running windows, for every
     *     program — Quiz included. The Quiz program button is the app's
     *     own button, exactly as tickets #43/#60 drew it, pressed while
     *     the Quiz window is on the desktop; while the window is HIDDEN
     *     it leaves the bar like every other program does (the #60 bridge
     *     that kept it alive for the put-away window is gone now that
     *     desktop shortcuts exist). A minimized Quiz window keeps its
     *     button — the era's taskbar path (ticket #43, mobile #46) still
     *     restores it — and its shortcut restores the hidden one at its
     *     last mode and geometry.
     *   - One button per program window, in the stable program order, and
     *     EXACTLY the running ones: no Record (the Action Plan has not
     *     settled, the Deep-Dive Prompt has not been committed) means no
     *     button, and a hidden window leaves the bar. The button is pressed
     *     while its window is the ACTIVE window.
     *   - On the MOBILE desktop stage (ticket #68) the bar is the PERMANENT
     *     switcher: all three programs are listed whatever their mode —
     *     running, put away, or not arrived yet — because the shortcut
     *     column does not fit on this layout and the bar is the only route
     *     between programs. Pressed marks the program filling the screen
     *     (the core's active one); a switch click runs the ONE launch
     *     gesture, so closing a window never strands it.
     */
    function paintTaskbar() {
      var switcher = mobileSwitcher();
      if (dom && dom.programBtn) {
        // Membership: the switcher lists Quiz permanently; the desktop
        // layout keeps the running-windows rule (no Record or hidden =
        // no button, ticket #62).
        dom.programBtn.hidden = !switcher &&
          !(machine.hasWindow(QUIZ) && machine.inTaskbar(QUIZ));
        // Pressed: on the switcher, the program on screen (active); on the
        // desktop layout, the window on the desktop — the mode the core
        // derives (minimized/hidden are the not-visible modes).
        dom.programBtn.setAttribute('aria-pressed',
          (switcher ? machine.canFocus(QUIZ) : machine.isVisible(QUIZ))
            ? 'true' : 'false');
      }
      machine.programIds.forEach(function(id) {
        if (id === QUIZ) return;
        var refs = frameOf(id);
        if (!refs || !refs.taskbarBtn) return;
        var running = machine.hasWindow(id) && machine.inTaskbar(id);
        refs.taskbarBtn.hidden = !switcher && !running;
        refs.taskbarBtn.setAttribute('aria-pressed',
          (switcher ? machine.canFocus(id)
                    : running && machine.canFocus(id)) ? 'true' : 'false');
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
     *  #43); every frame traces with its own token.
     *
     *  Ticket #68: on the ≤768px layout there is nothing to trace — the
     *  chrome reduces to close and the permanent taskbar switch already
     *  owns the switch-away/switch-back gesture, so the gesture is refused
     *  here as well as in the button painting (the mobile consequence the
     *  viewport-blind core never models).
     *
     *  Ticket #75's activation hand-off: the CORE moves activation to the
     *  topmost Window still on the desktop (the newly active frame's title
     *  bar turns navy, the keyboard floor and the pressed Program Switch
     *  follow it — all derived by render(), never patched here). With no
     *  Window left visible there is no active Window, so focus returns to
     *  this program's Program Switch: the control that was pressed when
     *  available, else the frame's own switch entry, else the Quiz program
     *  button. The core stays DOM-blind — it only reports the active Id. */
    function minimize(id) {
      id = id || QUIZ;
      if (mobileMaximized()) return false;
      if (!machine.minimize(id)) return false;
      render();
      if (!machine.activeId()) focusProgramSwitch(id);
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

    /**
     * Focus the Program Switch a Put Away Window comes back through
     * (ticket #75): the trigger the controller recorded for this program
     * (the taskbar switch pressed, or the control a keyboard route named
     * via recordTrigger()), else the frame's own switch entry, else the
     * Quiz program button — the taskbar's permanent control. Pure DOM
     * knowledge; the core never sees an element.
     */
    function focusProgramSwitch(id) {
      var trigger = lastTrigger[id] || null;
      if (focusableEl(trigger)) { trigger.focus(); return true; }
      var refs = frameOf(id);
      var own = refs && refs.taskbarBtn;
      if (focusableEl(own)) { own.focus(); return true; }
      if (dom && focusableEl(dom.programBtn)) { dom.programBtn.focus(); return true; }
      return false;
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
     * Tear the whole desktop down (ticket #66): the destructive paths —
     * the Start-menu quit and the Quiz menu bar's Retake — end the run,
     * so every program Record goes with it. The core rewinds to the born
     * desktop (the Quiz Record alone); render paints the absence — the
     * program frames go unpositioned and out of the taskbar, exactly as
     * they were before the Finish Commit ever arrived. This is NOT hide():
     * a put-away window is still a running program a shortcut can bring
     * back, and an ended run must leave nothing to bring back.
     */
    function resetPrograms() {
      if (!machine.resetPrograms()) return false;
      render();
      return true;
    }

    /**
     * The Quiz window's [×] decision, in ONE place (ticket #60): 'hidden'
     * when the windowed stage put the window away, 'dialog' when a flow
     * stage asked for the End Program confirmation, false when the gesture
     * was refused. js/shell.js opens the dialog on 'dialog'.
     *
     * Ticket #68 puts the mobile desktop stage back on the put-away branch:
     * hiding the Quiz window there only changes its mode — the Record, the
     * answers and the finished report stay in the core and the store — and
     * the taskbar's permanent Quiz switch (paintTaskbar above) is the way
     * back, so the gesture strands nothing on a layout that has no desktop
     * to stand a put-away window on. The flow stages never had a desktop:
     * their [×] keeps ticket #43's End Program question.
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
     *  gesture never ends anything; it hides the frame and its taskbar
     *  button with it on the desktop layout, where the program's desktop
     *  shortcut brings the window back at its Last Mode and Last Geometry
     *  (ticket #62). Ticket #68 extends the gesture to the ≤768px layout:
     *  the shortcut column does not exist there, but the taskbar lists all
     *  three programs PERMANENTLY, so the hidden frame keeps its switch
     *  entry and the window is one tap away. */
    function closeProgram(id) {
      return hide(id) ? 'hidden' : false;
    }

    // ── Arrival (tickets #61, #76) ─────────────────────────────────────

    /**
     * The right-anchored arrival slots (ticket #76). Each secondary
     * Program holds one fixed, distinct slot against the desktop's right
     * edge: the Action Plan UPPER-right, the Deep-Dive Prompt LOWER-right.
     * The margin from the right edge is constant at any desktop width —
     * the Window Manager, not the viewport-blind core, owns this maths.
     * `along` is the edge the slot is anchored to: 'top' pins it to the
     * desktop's top edge, 'bottom' to the edge above the taskbar.
     */
    var ARRIVAL_SLOTS = {
      'action-plan': { w: 520, h: 420, along: 'top' },
      'deep-dive': { w: 470, h: 380, along: 'bottom' }
    };

    /** The constant margin every arrival slot keeps from the desktop's
     *  right edge (and from the edge it is anchored to). */
    var ARRIVAL_MARGIN = 16;

    /**
     * The Geometry a Program arrives with at this desktop's width: null
     * for the Quiz, which keeps its Designed Default Geometry near the
     * left edge, and the computed right-anchored slot for the secondary
     * programs. The slot is never resized — only its origin moves — so
     * the two secondary slots stay distinct (different x, y, w and h) at
     * every width; partial overlap with the Quiz at 1024 is intended,
     * and the pair may overlap each other on a short desktop.
     */
    function arrivalGeometry(id) {
      var slot = ARRIVAL_SLOTS[id];
      if (!slot) return null;
      var vp = viewport();
      var desktopH = vp.height - vp.taskbar;
      return {
        x: Math.max(0, vp.width - slot.w - ARRIVAL_MARGIN),
        y: slot.along === 'bottom'
          ? Math.max(0, desktopH - slot.h - ARRIVAL_MARGIN)
          : ARRIVAL_MARGIN,
        w: slot.w,
        h: slot.h
      };
    }

    /**
     * The program arrives: its Record is born from the core at its
     * Arrival Geometry — the Quiz's Designed Default, or the computed
     * right-anchored slot (ticket #76; the cascade is retired, so
     * Opening always lands in the Program's own slot whatever was
     * focused). opts:
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
        geometry: opts.geometry || arrivalGeometry(id)
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
     * The taskbar button click (ticket #61; ticket #68 widens it to the
     * mobile switch): on the DESKTOP layout a running window becomes the
     * active one, and a minimized window is restored AND focused — hidden
     * windows have no button at all, so this never sees one. On the MOBILE
     * switcher the entry is permanent, so a click can also meet a put-away
     * window or a program that has not arrived yet, and it runs the SAME
     * one launch gesture as the desktop shortcut: restore (or open) the
     * Record, then raise and focus it. One entry, one Record — a switch
     * never opens a second window and never strands a hidden one.
     * Keyboard activation (Enter/Space on the button, ticket #67) runs the
     * same click — the window switches or restores, and the button is
     * recorded as where this window's focus came from.
     */
    function activateProgram(id) {
      if (mobileSwitcher()) return launchProgram(id);
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
      // The mobile switcher (ticket #68): the put-away program KEEPS its
      // permanent taskbar entry here, and the shortcut column does not
      // exist on this layout — the switch is where focus lands and the
      // route back, so it is asked before anything else.
      if (mobileSwitcher()) {
        var mrefs = frameOf(id);
        var mown = mrefs && mrefs.taskbarBtn;
        if (focusableEl(mown)) { mown.focus(); return true; }
        if (dom && focusableEl(dom.programBtn)) dom.programBtn.focus();
        return true;
      }
      // The window came through a taskbar button or a shortcut: hand focus
      // back to it when it is still reachable. A program window's OWN button
      // leaves the bar the moment it is hidden, so the stable fallback is
      // the Quiz program button — the taskbar control that is always there.
      if (focusableEl(trigger)) { trigger.focus(); return true; }
      // #62: a put-away window loses its taskbar button, so the program's
      // desktop shortcut — its permanent launcher — is the focus target.
      var sc = dom && dom.shortcuts && dom.shortcuts[id];
      if (focusableEl(sc)) { sc.focus(); return true; }
      var refs = frameOf(id);
      var own = refs && refs.taskbarBtn;
      if (own && focusableEl(own)) own.focus();
      else if (dom && focusableEl(dom.programBtn)) dom.programBtn.focus();
      return true;
    }

    /**
     * The desktop shortcut launch (ticket #62, spec #58): ONE gesture per
     * program, keyed by the Record's mode. An unopened program (no Record
     * — reachable only off the settled-content paths) arrives on top like
     * any launch; a minimized or hidden Record is restored to its
     * lastMode AND lastGeometry and then raised; a window already on the
     * desktop is only raised. The shortcut never opens a second window —
     * the one-Record model holds.
     */
    function launchProgram(id) {
      if (machine.programIds.indexOf(id) < 0) return false;
      if (!machine.hasWindow(id)) {
        if (!openProgram(id, { below: false })) return false;
        return focusWindow(id);
      }
      var mode = machine.windowSnapshot(id).mode;
      if (mode === 'minimized' || mode === 'hidden') {
        if (!restore(id)) return false;
        return focusWindow(id);
      }
      return focusWindow(id);
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
      resetPrograms: resetPrograms,
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
      launchProgram: launchProgram,

      /** Wire the built Quiz shell DOM (js/shell.js calls this after build()). */
      attach: function(refs) {
        dom = refs || null;
        if (dom && dom.windowEl) {
          // Makes restore()'s focus() land: a div needs a tabindex.
          dom.windowEl.setAttribute('tabindex', '-1');
          wireRaise(dom.windowEl, QUIZ);
        }
        if (dom && dom.programBtn) {
          // The Quiz taskbar button (ticket #43, refined by #62 and #68):
          // on the DESKTOP layout a MINIMIZED window is restored and
          // focused — the era's taskbar path — while a HIDDEN one leaves
          // the bar (the #60/#61 bridge is gone now that desktop shortcuts
          // exist), so this click never sees a hidden Record there; its
          // desktop shortcut is the way back. A visible window is refocused.
          // On the MOBILE switcher (ticket #68) the entry is permanent and
          // is the hidden Quiz window's route back, so the click runs the
          // one launch gesture: restore a put-away Record, focus a visible
          // one — never a second window.
          on(dom.programBtn, 'click', function() {
            lastTrigger[QUIZ] = dom.programBtn;   // #67: the Escape target
            if (mobileSwitcher()) {
              controller.launchProgram(QUIZ);
              return;
            }
            // Not visible = exactly the minimized mode once #62 removes a
            // hidden program's button; the core's restore() refuses every
            // other mode, so a click on a visible window stays a no-op
            // refocus. The restore ALWAYS ends in focus (#67).
            if (!machine.isVisible(QUIZ) && machine.inTaskbar(QUIZ)) {
              controller.restore(QUIZ);
            }
            if (machine.isVisible(QUIZ)) controller.focusWindow(QUIZ);
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

  /**
   * End the run — the ONE destructive tail ticket #66 added: the Start-menu
   * Quit and the Quiz menu bar's Retake both answer to it after their
   * confirmation. It is the declared opposite of the window [×] above: the
   * [×]/End Program flow NEVER touches persistence (js/session-store.js
   * owns the answers, and story #37 keeps a mid-quiz close free of cost),
   * while endRun() discards the run on purpose — the Session, the per-tab
   * desktop Record (cached plan included: the Record goes whole), and the
   * desktop itself, every program Record torn down so nothing remains to
   * restore. The landing page is shown FIRST: the controller re-syncs the
   * stage from the DOM on render, so the landing rules must already be on
   * screen when the desktop comes apart. Every step is guarded — a page
   * without one of the modules simply skips it, and nothing throws.
   *
   * Returns what went away, so a caller (or a test) can observe each part
   * of the tail without reading the stores.
   */
  function endRun() {
    var gone = { session: false, record: false, desktop: false, landing: false };
    if (app.SessionStore && typeof app.SessionStore.clear === 'function') {
      app.SessionStore.clear();
      gone.session = true;
    }
    if (app.DesktopStore && typeof app.DesktopStore.clear === 'function') {
      app.DesktopStore.clear();
      gone.record = true;
    }
    if (typeof app.showView === 'function') {
      app.showView(VIEW_LANDING);
      gone.landing = true;
    }
    var ctl = app.Windows ? app.Windows.controller : null;
    if (ctl && typeof ctl.resetPrograms === 'function') {
      ctl.resetPrograms();
      gone.desktop = true;
    }
    return gone;
  }

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
    endRun: endRun,
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
    TITLE_REACH: TITLE_REACH,
    // Ticket #75: the z-index floor every Window paints from, so the
    // stacking numbers can never drop a Window behind the shortcut column.
    WINDOW_Z_BASE: WINDOW_Z_BASE
  };

  if (typeof module !== 'undefined') module.exports = app.Windows;

})(globalThis);
