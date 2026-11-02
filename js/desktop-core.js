/**
 * Desktop core (ticket #59) — the DOM-free window state every later desktop
 * ticket builds on (parent spec #58). The repo's second pure decision core,
 * modelled on js/wizard-nav.js: no DOM, no timers, no storage. State plus
 * transitions plus derived queries, fully headless-testable through the
 * module seam.
 *
 * One state model. The single-window transition table that lived in
 * js/windows.js (ticket #43) moved HERE and is generalized per window
 * Record; js/windows.js keeps only its rendering role and reads state and
 * the derived flags out of this module. Nothing else may keep a parallel
 * copy of window state.
 *
 * A window Record:
 *   mode         'normal' | 'maximized' | 'minimized' | 'hidden'
 *   geometry     { x, y, w, h }  — desktop coordinates, taskbar excluded
 *   lastGeometry { x, y, w, h }  — what a restore returns to
 *   lastMode     'normal' | 'maximized' — the pre-minimize/pre-hide mode
 *   z            stacking order
 *
 * Mode semantics are the contract. Everything the shell needs is DERIVED
 * from the mode and never tracked separately:
 *
 *   | mode      | visible | in taskbar | participates in focus     |
 *   | normal    | yes     | yes        | when the window is active |
 *   | maximized | yes     | yes        | when the window is active |
 *   | minimized | no      | yes        | when the window is active |
 *   | hidden    | no      | no         | never                     |
 *
 * restore() returns to lastMode AND lastGeometry, so minimizing a maximized
 * window restores it maximized, and a hidden window keeps its arrangement
 * for the shortcut that brings it back. There is no 'closed' mode and no
 * way to delete a program: closing puts a window away, it never destroys
 * anything.
 *
 * Activation (ticket #75) is DERIVED too: the active Id names ONE visible
 * Window, or no Window at all. minimize() hands activation to the topmost
 * Window still visible through the same leaderId() query hide() uses, and
 * with nothing left visible the desktop simply has no active Window (the Id
 * is null, every focus query answers false); a restore() onto such a desktop
 * takes activation back because there is nothing to displace. The
 * controller renders every consequence of the hand-off — the navy title bar
 * and the keyboard floor, the pressed Program Switch — from this one Id and
 * keeps no copy of it, so the switch is also where it puts focus back when
 * the Put Away leaves the desktop with nothing to be active.
 *
 * Impossible moves are refused by the transitions themselves: minimize from
 * hidden; maximize from hidden or minimized; geometry writes while the
 * window is maximized or while the End Program dialog owns the desktop.
 *
 * Desktop-level gates (they belong to the desktop, not to a Record):
 *   view        the visible view id — the landing view gates close/maximize
 *               (the era rule: an application that cannot close itself;
 *               minimize STAYS live on the landing view, ticket #43)
 *   confirmOpen true while the End Program dialog (or any system dialog
 *               driving confirmClose) owns the desktop — every other
 *               transition is blocked while it is true
 *
 * Ticket #59 wired exactly ONE window (the Quiz window); ticket #61 (spec
 * #58) runs the desktop as THREE programs — Quiz, Action Plan, Deep-Dive
 * Prompt — all on this one Record map, keyed by Id: per-window transitions,
 * per-program designed defaults, a 24px down-right cascade on arrival, and
 * a taskbar that lists exactly the running windows in program order. An
 * absent Record is NOT a mode: the Action Plan does not exist at all until
 * its content settles, and open() is the only way a Record comes to be.
 * The mobile rule (ticket #46: [□] disabled at ≤768px) stays a
 * controller/stylesheet consequence — the core is viewport-blind and never
 * models a mode the stylesheet can silently override.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  app.DesktopCore = app.DesktopCore || {};

  var VIEW_LANDING = 'landing-view';

  var MODE_NORMAL = 'normal';
  var MODE_MAXIMIZED = 'maximized';
  var MODE_MINIMIZED = 'minimized';
  var MODE_HIDDEN = 'hidden';

  /** The three programs (ticket #61, parent spec #58): the Quiz program
   *  plus the two windows that moved out of its body — the Action Plan and
   *  the Deep-Dive Prompt. The order is the STABLE TASKBAR ORDER. */
  var QUIZ_ID = 'quiz';
  var ACTION_PLAN_ID = 'action-plan';
  var DEEP_DIVE_ID = 'deep-dive';
  var PROGRAM_IDS = [QUIZ_ID, ACTION_PLAN_ID, DEEP_DIVE_ID];

  /** Designed default geometry per program (desktop coordinates, taskbar
   *  excluded). The Quiz default is the ticket #60 arrangement: at
   *  1024×768 the score header, Risk Radar and Blind-Spot Bars stay
   *  readable without internal scrolling (768 − 36 taskbar = 732 desktop
   *  height; 16 + 704 = 720 clears it) and clear of the 104px desktop
   *  shortcut column (120 > 104) so its labels never sit on window
   *  content. The two adjunct programs are tuned to sit inside the same
   *  desktop when they arrive beside it. Nothing in the core renders
   *  these. */
  var DESIGN_DEFAULTS = {
    'quiz': { x: 120, y: 16, w: 888, h: 704 },
    'action-plan': { x: 152, y: 64, w: 640, h: 480 },
    'deep-dive': { x: 152, y: 88, w: 620, h: 440 }
  };

  /** The cascade step: a window born (or re-opened) while another window
   *  is focused shifts 24px down and right off its designed default. */
  var CASCADE = 24;

  /** Fresh copy — a Record never aliases a caller's object, and a
   *  snapshot never aliases the Record. */
  function copyGeometry(g) {
    return { x: g.x, y: g.y, w: g.w, h: g.h };
  }

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function hasValidGeometry(g) {
    return !!g && isFiniteNumber(g.x) && isFiniteNumber(g.y) &&
      isFiniteNumber(g.w) && isFiniteNumber(g.h);
  }

  /** The modes a window can be drawn in (and therefore dragged, resized,
   *  raised or clicked into). */
  function isDeskMode(mode) {
    return mode === MODE_NORMAL || mode === MODE_MAXIMIZED;
  }

  /**
   * Build the desktop. opts:
   *   id        Id of the window wired at boot (default 'quiz')
   *   geometry  designed default geometry for that window (optional)
   *
   * Ticket #61 (spec #58): the record map is keyed by program Id and starts
   * with the sole wired window only. The Action Plan and the Deep-Dive
   * Prompt are BORN LATER through open() — "the Action Plan window does not
   * exist until its content settles" — so an absent record is not the same
   * thing as a hidden one: nothing renders it, nothing lists it.
   */
  function createCore(opts) {
    opts = opts || {};
    var soleId = opts.id || QUIZ_ID;

    var desktop = {
      active: soleId,
      zCounter: 0,
      view: VIEW_LANDING,
      confirmOpen: false,
      windows: {}
    };

    var start = hasValidGeometry(opts.geometry)
      ? copyGeometry(opts.geometry)
      : copyGeometry(DESIGN_DEFAULTS[soleId] || DESIGN_DEFAULTS[QUIZ_ID]);

    desktop.windows[soleId] = {
      mode: MODE_NORMAL,
      geometry: copyGeometry(start),
      lastGeometry: copyGeometry(start),
      lastMode: MODE_NORMAL,
      z: 0
    };

    /** No Id addresses the active window; a named Id with no Record (a
     *  program that has not arrived yet) addresses NOTHING — the queries
     *  below answer false for it. Ticket #61: the Action Plan and the
     *  Deep-Dive Prompt have no Record until open() settles them. */
    function target(id) {
      if (id === undefined || id === null) return desktop.active;
      return desktop.windows[id] ? id : null;
    }

    /** True when the program has a Record at all (open() has run). */
    function hasWindow(id) {
      return !!desktop.windows[id];
    }

    function record(id) {
      var rid = target(id);
      return rid === null ? null : desktop.windows[rid];
    }

    function isActive(id) {
      var rid = target(id);
      return rid !== null && desktop.active === rid;
    }

    // ── Derived queries: consequences of the mode, never stored ────────

    /** normal/maximized show on the desktop; minimized/hidden do not. */
    function isVisible(id) {
      var r = record(id);
      return !!r && isDeskMode(r.mode);
    }

    /** Running programs live in the taskbar; a hidden one has no button,
     *  and its shortcut is the way back. An unopened program has no
     *  button either — it is not running yet. */
    function inTaskbar(id) {
      var r = record(id);
      return !!r && r.mode !== MODE_HIDDEN;
    }

    /** The taskbar list: EXACTLY the running windows (every Record that is
     *  not hidden) in the stable program order. */
    function taskbarList() {
      var list = [];
      PROGRAM_IDS.forEach(function(pid) {
        if (desktop.windows[pid] && desktop.windows[pid].mode !== MODE_HIDDEN) {
          list.push(pid);
        }
      });
      return list;
    }

    /** Focus participation follows the table: hidden never, anything else
     *  only while it is the active window. */
    function canFocus(id) {
      var r = record(id);
      return !!r && r.mode !== MODE_HIDDEN && isActive(id);
    }

    /** [—] is live on every view (era rule, ticket #43) but never twice:
     *  an already minimized or hidden window has nothing to shrink. The
     *  dialog owns the desktop while it is open. */
    function canMinimize(id) {
      var r = record(id);
      return !desktop.confirmOpen && !!r && isDeskMode(r.mode);
    }

    /** [□] is gated off on the landing view (no maximized work to reveal)
     *  and while the dialog owns the desktop. Mode impossibility
     *  (minimized/hidden) is refused by toggleMaximize itself. */
    function canMaximize(id) {
      var r = record(id);
      return !desktop.confirmOpen && desktop.view !== VIEW_LANDING &&
        !!r && r.mode !== MODE_HIDDEN;
    }

    /** [×] follows the same era gate as [□]; a hidden window has nothing
     *  on the desktop to close. */
    function canClose(id) {
      var r = record(id);
      return !desktop.confirmOpen && desktop.view !== VIEW_LANDING &&
        !!r && r.mode !== MODE_HIDDEN;
    }

    function isConfirmOpen() {
      return desktop.confirmOpen;
    }

    function getView() {
      return desktop.view;
    }

    /** The active Window's Id, or null: ticket #75's desktop with no
     *  Window visible has NO active Window. */
    function activeId() {
      return desktop.active;
    }

    // ── Arrival (ticket #61) ───────────────────────────────────────────

    /** The geometry a program is designed to open with. */
    function designedGeometry(id) {
      return DESIGN_DEFAULTS[id] ? copyGeometry(DESIGN_DEFAULTS[id]) : null;
    }

    /** A focused window to cascade from: the active Record, when it is a
     *  different program and it is on the desktop (normal/maximized). */
    function focusedGeometry(exceptId) {
      var w = desktop.windows[desktop.active];
      if (!w || desktop.active === exceptId || !isDeskMode(w.mode)) return null;
      return w.geometry;
    }

    /**
     * open(id, opts) — the ONLY way a Record comes into existence.
     * opts:
     *   geometry  caller-supplied designed geometry (validated)
     *   minimized birth mode: the window arrives in the taskbar only
     *           (the Deep-Dive Prompt at the Finish Commit)
     *   noCascade skip the 24px cascade even though a window is focused
     *   below     stack the newcomer directly BELOW the active window
     *           instead of on top (the Action Plan arrival: it must never
     *           cover the window the Participant is reading)
     *
     * Arrival NEVER activates: the active Id, every other window's mode
     * and geometry, and the active window's place on top are untouched —
     * only the relative order of the windows UNDER the active one shifts
     * to make room, which is invisible to the Participant.
     *
     * Re-arriving a program whose Record exists but was PUT AWAY (hidden —
     * which is also where leaving the desktop stage leaves it: the flow
     * stages have no desktop to stand a program window on) ARRIVES IT
     * AGAIN: settled content is an arrival, and the window comes back with
     * a fresh designed arrangement. A program already on the desktop or
     * minimized in the taskbar is left exactly where it is — the Presenter
     * re-renders into the frame that is already there.
     */
    function open(id, opts) {
      opts = opts || {};
      if (!DESIGN_DEFAULTS[id]) return false;
      var existing = desktop.windows[id];
      if (existing && existing.mode !== MODE_HIDDEN) return false;

      var geometry = hasValidGeometry(opts.geometry)
        ? copyGeometry(opts.geometry) : designedGeometry(id);
      var cascade = focusedGeometry(id);
      if (cascade && !opts.noCascade) {
        geometry.x = cascade.x + CASCADE;
        geometry.y = cascade.y + CASCADE;
      }
      var mode = opts.minimized ? MODE_MINIMIZED : MODE_NORMAL;
      var rec = existing || (desktop.windows[id] = {});
      rec.mode = mode;
      rec.geometry = geometry;
      rec.lastGeometry = copyGeometry(geometry);
      rec.lastMode = MODE_NORMAL;
      rec.z = rec.z || 0;
      placeInStack(id, opts.below);
      return true;
    }

    /** Ids ordered bottom → top by z. */
    function stackOrder() {
      return Object.keys(desktop.windows).sort(function(a, b) {
        return desktop.windows[a].z - desktop.windows[b].z;
      });
    }

    /** Insert the newcomer into the stack and renumber bottom → top. With
     *  `below` it lands directly under the active window; otherwise on
     *  top. zCounter follows the compacted order so the next raise still
     *  wins. */
    function placeInStack(id, below) {
      var order = stackOrder();
      var mine = order.indexOf(id);
      if (mine >= 0) order.splice(mine, 1);       // a re-born Record re-arrives
      var topId = desktop.windows[desktop.active] ? desktop.active : null;
      var at = order.length;
      if (below && topId && topId !== id) {
        var ti = order.indexOf(topId);
        if (ti >= 0) at = ti;
      }
      order.splice(at, 0, id);
      order.forEach(function(pid, i) {
        desktop.windows[pid].z = i;
      });
      desktop.zCounter = order.length - 1;
    }

    // ── Transitions ────────────────────────────────────────────────────

    /** Minimize records what restore must come back to: the mode AND the
     *  arrangement. Ticket #75: putting the ACTIVE window away hands
     *  activation to the topmost window still on the desktop; with none
     *  left there is no active Window — nothing participates in focus
     *  until a restore or a raise puts a window back on the screen. */
    function minimize(id) {
      if (!canMinimize(id)) return false;
      var rid = target(id);
      var r = record(id);
      r.lastMode = r.mode;
      r.lastGeometry = copyGeometry(r.geometry);
      r.mode = MODE_MINIMIZED;
      if (desktop.active === rid) desktop.active = leaderId();
      return true;
    }

    /** Restore lands on lastMode with lastGeometry — the Win95 rule that a
     *  window minimized while maximized comes back maximized, and the
     *  spec's rule that a shortcut brings a hidden window back exactly as
     *  it was left. Ticket #75's counterpart to the minimize hand-off: a
     *  restored Window takes activation only when the desktop has no
     *  VISIBLE active Window to keep it (all Put Away); a desktop someone
     *  is reading is never stolen. The arrangement itself is untouched —
     *  restore lands where the window was left, exactly as the era says. */
    function restore(id) {
      if (desktop.confirmOpen) return false;
      var rid = target(id);
      var r = record(id);
      if (!r || (r.mode !== MODE_MINIMIZED && r.mode !== MODE_HIDDEN)) return false;
      r.mode = r.lastMode;
      r.geometry = copyGeometry(r.lastGeometry);
      var cur = desktop.windows[desktop.active];
      if (!cur || !isDeskMode(cur.mode)) desktop.active = rid;
      return true;
    }

    /** Maximize from minimized or hidden is an impossible move; the
     *  landing view and an open dialog gate the button itself. */
    function toggleMaximize(id) {
      if (!canMaximize(id)) return false;
      var r = record(id);
      if (!isDeskMode(r.mode)) return false;
      r.lastMode = r.mode === MODE_MAXIMIZED ? MODE_NORMAL : MODE_MAXIMIZED;
      r.mode = r.lastMode;
      return true;
    }

    /** hidden: off the desktop and out of the taskbar, arrangement intact.
     *  From minimized the pre-minimize mode is kept, so one restore still
     *  lands where the Participant was. */
    function hide(id) {
      if (desktop.confirmOpen) return false;
      var rid = target(id);
      var r = record(id);
      if (!r || r.mode === MODE_HIDDEN) return false;
      if (r.mode !== MODE_MINIMIZED) {
        r.lastMode = r.mode;
        r.lastGeometry = copyGeometry(r.geometry);
      }
      r.mode = MODE_HIDDEN;
      // Putting away the ACTIVE window hands the desktop to the topmost
      // window still on it (ticket #61). With none left the active Id
      // stays where it was — hidden windows simply cannot take focus.
      if (desktop.active === rid) {
        var next = leaderId();
        if (next) desktop.active = next;
      }
      return true;
    }

    /** Id of the topmost Record still on the desktop, or null. */
    function leaderId() {
      var leader = null;
      var top = -Infinity;
      PROGRAM_IDS.forEach(function(pid) {
        var w = desktop.windows[pid];
        if (!w || !isDeskMode(w.mode) || w.z <= top) return;
        top = w.z;
        leader = pid;
      });
      return leader;
    }

    // ── The End Program gate ───────────────────────────────────────────

    function requestClose(id) {
      if (!canClose(id)) return false;
      desktop.confirmOpen = true;
      return true;
    }

    /** Yes in the dialog: back to the landing view, window un-maximized —
     *  exactly today's behaviour. Session data is never touched here;
     *  js/session-store.js owns persistence. */
    function confirmClose(id) {
      if (!desktop.confirmOpen) return false;
      desktop.confirmOpen = false;
      desktop.view = VIEW_LANDING;
      var r = record(id);
      if (!r) return true;
      r.mode = MODE_NORMAL;
      r.lastMode = MODE_NORMAL;
      r.lastGeometry = copyGeometry(r.geometry);
      return true;
    }

    /** No/Escape: the dialog goes away and everything else is exactly as
     *  it was — view, mode, geometry and arrangement all preserved. */
    function cancelClose() {
      if (!desktop.confirmOpen) return false;
      desktop.confirmOpen = false;
      return true;
    }

    /**
     * resetPrograms() — the additive teardown hook (ticket #66). The
     * destructive paths (the Start-menu quit and the Quiz menu bar's
     * Retake) END the run, so the desktop they leave behind is the one
     * the page was BORN with: the sole Quiz Record at its designed
     * arrangement, no program arrivals, the active Id back on the Quiz,
     * the z-counter rewound, and no dialog gate. Records are destroyed,
     * never hidden — a put-away window is still a running program, and
     * an ended run has nothing that may come back. The view is not
     * touched: the caller shows the landing page first, and the
     * controller re-syncs the stage from the DOM on its next render.
     */
    function resetPrograms() {
      desktop.windows = {};
      desktop.windows[soleId] = {
        mode: MODE_NORMAL,
        geometry: copyGeometry(start),
        lastGeometry: copyGeometry(start),
        lastMode: MODE_NORMAL,
        z: 0
      };
      desktop.active = soleId;
      desktop.zCounter = 0;
      desktop.confirmOpen = false;
      return true;
    }

    // ── Geometry ───────────────────────────────────────────────────────

    /** The drag/resize write point. Refused while maximized (a maximized
     *  window IS the desktop), while a minimized or hidden window cannot
     *  be grabbed, and while the End Program dialog owns the desktop. A
     *  successful write moves the arrangement AND the restore target. */
    function applyGeometry(geometry, id) {
      if (!hasValidGeometry(geometry)) return false;
      if (desktop.confirmOpen) return false;
      var r = record(id);
      if (!r || r.mode !== MODE_NORMAL) return false;
      r.geometry = copyGeometry(geometry);
      r.lastGeometry = copyGeometry(geometry);
      return true;
    }

    // ── Views, focus, stacking ─────────────────────────────────────────

    function setView(view) {
      if (typeof view === 'string' && view !== '') desktop.view = view;
      return desktop.view;
    }

    /** Mark a window active WITHOUT raising it — the programmatic arrival
     *  path (an Action Plan landing behind the window being read). */
    function setActive(id) {
      if (!desktop.windows[id]) return false;
      if (desktop.windows[id].mode === MODE_HIDDEN) return false;
      desktop.active = id;
      return true;
    }

    /** Raise-on-interaction: z becomes ++zCounter and the window becomes
     *  the active one. Only a window on the desktop can be interacted
     *  with, and not while a dialog owns the desktop. */
    function raise(id) {
      if (desktop.confirmOpen) return false;
      var rid = target(id);
      if (rid === null) return false;
      if (!isDeskMode(desktop.windows[rid].mode)) return false;
      desktop.windows[rid].z = ++desktop.zCounter;
      desktop.active = rid;
      return true;
    }

    // ── Snapshots: fresh copies, never aliases ─────────────────────────

    /** null for a program that has no Record yet (it has not arrived). */
    function windowSnapshot(id) {
      var r = record(id);
      if (!r) return null;
      return {
        mode: r.mode,
        geometry: copyGeometry(r.geometry),
        lastGeometry: copyGeometry(r.lastGeometry),
        lastMode: r.lastMode,
        z: r.z
      };
    }

    function snapshot() {
      var windows = {};
      Object.keys(desktop.windows).forEach(function(wid) {
        windows[wid] = windowSnapshot(wid);
      });
      return {
        active: desktop.active,
        zCounter: desktop.zCounter,
        view: desktop.view,
        confirmOpen: desktop.confirmOpen,
        windows: windows
      };
    }

    /**
     * loadSnapshot(snap) — the additive restore hook (ticket #63), the
     * inverse of snapshot(): js/desktop-store.js writes the committed
     * desktop back into the ONE state model before the first paint, so the
     * Records — never a parallel copy — carry the restored arrangement.
     *
     * All-or-nothing, and never a throw: every key must name a program,
     * every Record must carry a legal mode, a lastMode that can be a desk
     * mode, valid Geometry in BOTH geometry and lastGeometry, and a finite
     * z; the active Id must address a loaded Record or be null (ticket #75:
     * with every window Put Away the desktop has NO active Window); the view
     * must be a non-empty string. A snapshot that fails any of it changes
     * NOTHING — there is no partial restore. confirmOpen is never restored:
     * the End Program dialog is not a persisted state, and a snapshot
     * carrying it open is refused outright.
     *
     * A program missing from the snapshot keeps NO Record — absence is not
     * a mode (the Action Plan that had not settled at the commit is born by
     * its own arrival later), so the map is replaced, not merged.
     */
    function loadSnapshot(snap) {
      if (!snap || typeof snap !== 'object') return false;
      if (snap.confirmOpen !== false) return false;
      if (typeof snap.view !== 'string' || snap.view === '') return false;
      if (!isFiniteNumber(snap.zCounter) || snap.zCounter < 0) return false;
      if (!snap.windows || typeof snap.windows !== 'object' ||
          Array.isArray(snap.windows)) return false;

      var ids = Object.keys(snap.windows);
      if (ids.length === 0) return false;

      var next = {};
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (PROGRAM_IDS.indexOf(id) === -1) return false;
        var r = snap.windows[id];
        if (!r || typeof r !== 'object') return false;
        if (r.mode !== MODE_NORMAL && r.mode !== MODE_MAXIMIZED &&
            r.mode !== MODE_MINIMIZED && r.mode !== MODE_HIDDEN) return false;
        if (r.lastMode !== MODE_NORMAL && r.lastMode !== MODE_MAXIMIZED) return false;
        if (!hasValidGeometry(r.geometry) || !hasValidGeometry(r.lastGeometry)) return false;
        if (!isFiniteNumber(r.z) || r.z < 0) return false;
        next[id] = {
          mode: r.mode,
          geometry: copyGeometry(r.geometry),
          lastGeometry: copyGeometry(r.lastGeometry),
          lastMode: r.lastMode,
          z: r.z
        };
      }

      // The active Id addresses a loaded Record — or null, the ticket #75
      // desktop with nothing visible to be active.
      if (snap.active !== null &&
          (typeof snap.active !== 'string' || !next[snap.active])) return false;

      desktop.windows = next;
      desktop.active = snap.active;
      desktop.zCounter = snap.zCounter;
      desktop.view = snap.view;
      desktop.confirmOpen = false;
      return true;
    }

    return {
      soleId: soleId,
      hasWindow: hasWindow,
      open: open,
      designedGeometry: designedGeometry,
      taskbarList: taskbarList,
      isVisible: isVisible,
      inTaskbar: inTaskbar,
      canFocus: canFocus,
      canMinimize: canMinimize,
      canMaximize: canMaximize,
      canClose: canClose,
      isConfirmOpen: isConfirmOpen,
      getView: getView,
      activeId: activeId,
      minimize: minimize,
      restore: restore,
      toggleMaximize: toggleMaximize,
      hide: hide,
      requestClose: requestClose,
      confirmClose: confirmClose,
      cancelClose: cancelClose,
      resetPrograms: resetPrograms,
      applyGeometry: applyGeometry,
      setView: setView,
      setActive: setActive,
      raise: raise,
      windowSnapshot: windowSnapshot,
      snapshot: snapshot,
      loadSnapshot: loadSnapshot
    };
  }

  app.DesktopCore.createCore = createCore;
  app.DesktopCore.VIEW_LANDING = VIEW_LANDING;
  app.DesktopCore.PROGRAM_IDS = PROGRAM_IDS;
  app.DesktopCore.QUIZ_ID = QUIZ_ID;
  app.DesktopCore.ACTION_PLAN_ID = ACTION_PLAN_ID;
  app.DesktopCore.DEEP_DIVE_ID = DEEP_DIVE_ID;
  app.DesktopCore.DESIGN_DEFAULTS = DESIGN_DEFAULTS;
  app.DesktopCore.CASCADE = CASCADE;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
