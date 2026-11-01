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
 * Ticket #59 wires exactly ONE window (the Quiz window); the record map is
 * keyed by Id so the later three-program desktop reuses this core without
 * reshaping it. The mobile rule (ticket #46: [□] disabled at ≤768px) stays
 * a controller/stylesheet consequence — the core is viewport-blind and
 * never models a mode the stylesheet can silently override.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  app.Desktop = app.Desktop || {};

  var VIEW_LANDING = 'landing-view';

  var MODE_NORMAL = 'normal';
  var MODE_MAXIMIZED = 'maximized';
  var MODE_MINIMIZED = 'minimized';
  var MODE_HIDDEN = 'hidden';

  /** The one window wired by ticket #59; #60+ add the other two Ids. */
  var QUIZ_ID = 'quiz';

  /** Designed default geometry for the Quiz window (desktop coordinates,
   *  taskbar excluded). Later tickets tune these per program; nothing in
   *  ticket #59 renders it. */
  var DEFAULT_GEOMETRY = { x: 48, y: 40, w: 928, h: 644 };

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
   *   id        Id of the single wired window (default 'quiz')
   *   geometry  designed default geometry for that window (optional)
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
      ? copyGeometry(opts.geometry) : copyGeometry(DEFAULT_GEOMETRY);

    desktop.windows[soleId] = {
      mode: MODE_NORMAL,
      geometry: copyGeometry(start),
      lastGeometry: copyGeometry(start),
      lastMode: MODE_NORMAL,
      z: 0
    };

    /** An absent or unknown Id addresses the active window. */
    function target(id) {
      return desktop.windows[id] ? id : desktop.active;
    }

    function record(id) {
      return desktop.windows[target(id)];
    }

    function isActive(id) {
      return desktop.active === target(id);
    }

    // ── Derived queries: consequences of the mode, never stored ────────

    /** normal/maximized show on the desktop; minimized/hidden do not. */
    function isVisible(id) {
      return isDeskMode(record(id).mode);
    }

    /** Running programs live in the taskbar; a hidden one has no button,
     *  and its shortcut is the way back. */
    function inTaskbar(id) {
      return record(id).mode !== MODE_HIDDEN;
    }

    /** Focus participation follows the table: hidden never, anything else
     *  only while it is the active window. */
    function canFocus(id) {
      return record(id).mode !== MODE_HIDDEN && isActive(id);
    }

    /** [—] is live on every view (era rule, ticket #43) but never twice:
     *  an already minimized or hidden window has nothing to shrink. The
     *  dialog owns the desktop while it is open. */
    function canMinimize(id) {
      return !desktop.confirmOpen && isDeskMode(record(id).mode);
    }

    /** [□] is gated off on the landing view (no maximized work to reveal)
     *  and while the dialog owns the desktop. Mode impossibility
     *  (minimized/hidden) is refused by toggleMaximize itself. */
    function canMaximize(id) {
      return !desktop.confirmOpen && desktop.view !== VIEW_LANDING &&
        record(id).mode !== MODE_HIDDEN;
    }

    /** [×] follows the same era gate as [□]; a hidden window has nothing
     *  on the desktop to close. */
    function canClose(id) {
      return !desktop.confirmOpen && desktop.view !== VIEW_LANDING &&
        record(id).mode !== MODE_HIDDEN;
    }

    function isConfirmOpen() {
      return desktop.confirmOpen;
    }

    function getView() {
      return desktop.view;
    }

    function activeId() {
      return desktop.active;
    }

    // ── Transitions ────────────────────────────────────────────────────

    /** Minimize records what restore must come back to: the mode AND the
     *  arrangement. */
    function minimize(id) {
      if (!canMinimize(id)) return false;
      var r = record(id);
      r.lastMode = r.mode;
      r.lastGeometry = copyGeometry(r.geometry);
      r.mode = MODE_MINIMIZED;
      return true;
    }

    /** Restore lands on lastMode with lastGeometry — the Win95 rule that a
     *  window minimized while maximized comes back maximized, and the
     *  spec's rule that a shortcut brings a hidden window back exactly as
     *  it was left. */
    function restore(id) {
      if (desktop.confirmOpen) return false;
      var r = record(id);
      if (r.mode !== MODE_MINIMIZED && r.mode !== MODE_HIDDEN) return false;
      r.mode = r.lastMode;
      r.geometry = copyGeometry(r.lastGeometry);
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
      var r = record(id);
      if (r.mode === MODE_HIDDEN) return false;
      if (r.mode !== MODE_MINIMIZED) {
        r.lastMode = r.mode;
        r.lastGeometry = copyGeometry(r.geometry);
      }
      r.mode = MODE_HIDDEN;
      return true;
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

    // ── Geometry ───────────────────────────────────────────────────────

    /** The drag/resize write point. Refused while maximized (a maximized
     *  window IS the desktop), while a minimized or hidden window cannot
     *  be grabbed, and while the End Program dialog owns the desktop. A
     *  successful write moves the arrangement AND the restore target. */
    function applyGeometry(geometry, id) {
      if (!hasValidGeometry(geometry)) return false;
      if (desktop.confirmOpen) return false;
      var r = record(id);
      if (r.mode !== MODE_NORMAL) return false;
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
      if (!isDeskMode(desktop.windows[rid].mode)) return false;
      desktop.windows[rid].z = ++desktop.zCounter;
      desktop.active = rid;
      return true;
    }

    // ── Snapshots: fresh copies, never aliases ─────────────────────────

    function windowSnapshot(id) {
      var r = record(id);
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

    return {
      soleId: soleId,
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
      applyGeometry: applyGeometry,
      setView: setView,
      setActive: setActive,
      raise: raise,
      windowSnapshot: windowSnapshot,
      snapshot: snapshot
    };
  }

  app.Desktop.createCore = createCore;
  app.Desktop.VIEW_LANDING = VIEW_LANDING;
  app.Desktop.QUIZ_ID = QUIZ_ID;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
