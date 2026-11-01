(function(global) {
  'use strict';

  var app = global.App || (global.App = {});

  /**
   * Desktop store (ticket #63) — the per-tab desktop Record, separate from
   * the Participant's Session.
   *
   * The Session (js/session-store.js, ADR 0017) lives in localStorage and is
   * written pick by pick. The desktop Record lives in sessionStorage under
   * its OWN key, `quiz-desktop` — never inside `quiz-session`, never in
   * localStorage — because the desktop stage is this tab's, not the
   * Participant's: a second page (or a swap to another language's URL within
   * the tab) restores the same desktop, a new tab starts clean.
   *
   * One write, one event. The Record is written ONLY at the Finish Commit
   * (js/quiz.js, the single Completion path) — never on load, never for an
   * uncommitted Session. It captures the structural bank hash, the answers,
   * the language, and each program window's mode/geometry/lastGeometry/z
   * plus the active program, exactly the state the desktop core's snapshot()
   * holds at that moment.
   *
   * On load, js/main.js asks restore(bank): a Record whose hash matches the
   * current bank and whose answers are complete restores the desktop before
   * first paint — the report is recomputed from the stored answers through
   * App.Scoring under the page's Bank Variant, and the results view renders
   * directly (the landing never flashes). restore() re-renders; it fires no
   * quiz_completed event and starts NO Action Plan request: on a restored
   * render the plan assembles on the Deterministic Fallback locally (no
   * fetch, no Analytics) through the results.js hold seam, and the persisted
   * plan content itself belongs to a later ticket — the hold around
   * renderResults inside restore() is the documented hook to replace.
   *
   * Invalidation: a stale hash, incomplete answers, or an unparsable payload
   * is discarded quietly — no notice, no throw; the page boots exactly as
   * without the Record. Unavailable storage degrades to today's behaviour:
   * no restore. Discarding removes the key, so a corpus of garbage never
   * accumulates across reloads.
   */

  var KEY = 'quiz-desktop';
  var V = 1;

  /** The desktop stage a restored desktop returns to is always the results
   *  stage: the Record is born at the Finish Commit, and the Review is a
   *  flow view the Record never captures. */
  var RESTORED_VIEW = 'results-view';

  /* ── Storage: sessionStorage only, every access guarded ─────────────── */

  function storage() {
    try {
      // getitem probe: a throw-stub (private mode) fails here and nowhere.
      var s = global.sessionStorage;
      if (!s || typeof s.getItem !== 'function') return null;
      s.getItem(KEY);
      return s;
    } catch (e) {
      return null;
    }
  }

  /** Whether any desktop Record exists at all, without parsing it.
   *  The boot gate and the load path read this before the bank has
   *  loaded; validity there is the restore's business. */
  function exists() {
    try {
      var s = storage();
      return !!s && s.getItem(KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * The stored Record, already shape-checked (not bank-checked — that
   * needs the bank). Returns null on any unreadable shape; never throws.
   */
  function load() {
    try {
      var s = storage();
      if (!s) return null;
      var raw = s.getItem(KEY);
      if (raw === null) return null;
      var rec = JSON.parse(raw);
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
      if (rec.v !== V) return null;
      if (typeof rec.hash !== 'string') return null;
      if (!Array.isArray(rec.answers)) return null;
      if (typeof rec.view !== 'string' || !rec.view) return null;
      if (!rec.windows || typeof rec.windows !== 'object' || Array.isArray(rec.windows)) return null;
      return rec;
    } catch (e) {
      return null;
    }
  }

  function save(record) {
    try {
      var s = storage();
      if (!s) return false;
      s.setItem(KEY, JSON.stringify(record));
      return true;
    } catch (e) {
      // unavailable or over quota — swallow silently
      return false;
    }
  }

  /** Discard the Record quietly (invalidation, or a fresh start). */
  function clear() {
    try {
      var s = storage();
      if (s) s.removeItem(KEY);
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  /* ── Validation against the bank ────────────────────────────────────── */

  /**
   * Shape-check an answers array against the bank — the SAME rules
   * js/session-store.js applies to a stored Session (integer, 0 ≤ v <
   * options.length), plus completeness: every Question must carry an
   * answer, because only the Finish Commit can have produced the Record.
   * Returns a defensive copy, or null when the array cannot be trusted.
   */
  function validCompleteAnswers(arr, bank) {
    if (!Array.isArray(arr) || !bank || !Array.isArray(bank.questions)) return null;
    var qs = bank.questions;
    if (arr.length !== qs.length) return null;
    var out = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 0) return null;
      var options = Array.isArray(qs[i].options) ? qs[i].options : [];
      if (v >= options.length) return null;
      out[i] = v;
    }
    return out;
  }

  /* ── Capture: the one write — the Finish Commit ──────────────────────── */

  /**
   * Write the desktop Record at the Finish Commit. Called by js/quiz.js
   * from inside the hand-off beat, right after the results render landed:
   * the Quiz window carries its last arrangement, the Deep-Dive Prompt
   * has just arrived minimized, and the Action Plan — if it settles later —
   * re-arrives through the core's own arrival rule on restore.
   *
   * @returns true when a Record was written.
   */
  function captureAtCommit(bank, answers) {
    if (!bank || !Array.isArray(bank.questions)) return false;
    if (!Array.isArray(answers)) return false;
    if (typeof app.SessionStore !== 'object' ||
        typeof app.SessionStore.hashBank !== 'function') return false;

    // The Record describes a completed assessment; the commit gate in the
    // caller guarantees it, and the validation restates it locally.
    var storedAnswers = validCompleteAnswers(answers, bank);
    if (!storedAnswers) return false;

    var snap = null;
    var ctrl = (app.Windows && app.Windows.controller) || null;
    if (ctrl && typeof ctrl.snapshot === 'function') {
      try { snap = ctrl.snapshot(); } catch (e) { snap = null; }
    }

    return save({
      v: V,
      hash: app.SessionStore.hashBank(bank),
      lang: (app.I18n && app.I18n.locale) || null,
      answers: storedAnswers,
      active: snap ? snap.active : null,
      zCounter: snap ? snap.zCounter : 0,
      view: RESTORED_VIEW,
      windows: snap ? snap.windows : {}
    });
  }

  /* ── Restore: the desktop before first paint ─────────────────────────── */

  /**
   * Restore a valid Record under the given (page's) Bank Variant.
   *
   * On success: the dictionary follows the stored language when it differs,
   * the window Records are written back into the running Windows controller
   * before any render, the report is recomputed through App.Scoring, and
   * renderResults() draws the desktop directly. quiz_completed is NOT
   * tracked and Action Plan generation runs on the Deterministic Fallback
   * for exactly this one render (the later-ticket hook, see the header).
   *
   * On any invalid Record, missing bank match, or runtime hole, the Record
   * is discarded quietly and false is returned — never a throw, never a
   * notice.
   */
  function restore(bank) {
    var rec = null;
    var answers = null;
    try {
      if (!exists()) return false;
      rec = load();
      if (!rec) {
        // A payload that exists but cannot be read is invalidation too:
        // discarded quietly, the same as a stale hash.
        clear();
        return false;
      }
      if (!app.SessionStore || typeof app.SessionStore.hashBank !== 'function') {
        return false;
      }
      answers = validCompleteAnswers(rec.answers, bank);
      if (!answers || rec.hash !== app.SessionStore.hashBank(bank)) {
        clear();
        return false;
      }
    } catch (e) {
      return false;
    }

    try {
      // The language the desktop was committed in — the page's own
      // dictionary stays put unless the Record says the desktop was
      // committed under the other locale (in-tab switches swap the URL,
      // so on a same-page reload this almost always matches already).
      if (rec.lang && app.I18n && typeof app.I18n.use === 'function' &&
          typeof app.I18n.baseLocale === 'function' &&
          app.I18n.baseLocale(app.I18n.locale) !== app.I18n.baseLocale(rec.lang)) {
        app.I18n.use(rec.lang);
      }
    } catch (e) {
      // A stuck dictionary must not cost the desktop; the page's own
      // locale is already armed by main.js.
    }

    try {
      // Window Records back into the core BEFORE anything renders, so the
      // first paint already shows the committed arrangement — and so the
      // render's own arrivals (results.js calls deepDiveCommitted() at the
      // end of every render) are no-ops on a Record the window already has.
      var ctrl = (app.Windows && app.Windows.controller) || null;
      if (rec.windows && rec.windows['quiz'] &&
          ctrl && typeof ctrl.restoreSnapshot === 'function') {
        if (!ctrl.restoreSnapshot({
          active: rec.active,
          zCounter: rec.zCounter,
          view: rec.view,
          confirmOpen: false,
          windows: rec.windows
        })) {
          clear();
          return false;
        }
      }

      var result = (app.Scoring && app.Scoring.computeScores(bank, answers)) || null;
      if (!result || !result.ok) {
        clear();
        return false;
      }

      // The restore render issues NO Action Plan request (the persisted
      // plan content belongs to a later ticket): the hold scopes the
      // Deterministic-Fallback-only assembly to this one renderResults
      // call and is released right after, whatever it decides.
      if (typeof app.holdActionPlanRequest === 'function') {
        app.holdActionPlanRequest(true);
        try {
          if (typeof app.renderResults === 'function') {
            app.renderResults(bank, result.report);
          }
        } finally {
          app.holdActionPlanRequest(false);
        }
      } else if (typeof app.renderResults === 'function') {
        app.renderResults(bank, result.report);
      }

      return true;
    } catch (err) {
      // Anything unexpected: silently degrade to the standard boot.
      try { clear(); } catch (e2) { /* storage unavailable */ }
      return false;
    }
  }

  app.DesktopStore = {
    KEY: KEY,
    exists: exists,
    load: load,
    save: save,
    clear: clear,
    captureAtCommit: captureAtCommit,
    restore: restore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app.DesktopStore;
  }

})(globalThis);
