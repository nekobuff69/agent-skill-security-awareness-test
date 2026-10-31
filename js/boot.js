(function(global) {
  'use strict';

  var app = global.App || (global.App = {});

  /**
   * sessionStorage key marking that this browser tab has already booted.
   * Namespaced `quiz-os-booted` to sit beside the existing `quiz-session`
   * Session key (ADR 0017). sessionStorage is per-tab and per-origin, so
   * the en and zh pages of one tab share it automatically while a new tab
   * starts clean — exactly the once-per-tab gating issue #39 asks for.
   */
  var FLAG_KEY = 'quiz-os-booted';

  /**
   * Length of the splash progress animation, kept in sync with the
   * `boot-fill` rule in css/boot.css (steps(12) over 1.35s). The overlay
   * is removed this long after it is shown — the fade-out is the last
   * 0.2s of that window.
   */
  var SPLASH_MS = 1350;
  var FADE_MS = 200;

  /**
   * Pure boot decision — the headless-testable core of issue #39.
   *
   * @param {boolean} landedFirst - this load renders the landing view as
   *   its initial view (no live Session to restore, no Results/Review to
   *   reopen). false for mid-quiz/review refreshes, which never replay.
   * @param {boolean} hasFlag - the per-tab booted flag is already present
   *   (retakes, refreshes, en↔zh switches within one tab).
   * @param {boolean} reducedMotion - prefers-reduced-motion: reduce is set.
   * @returns {'splash'|'instant'}
   */
  function decide(landedFirst, hasFlag, reducedMotion) {
    if (reducedMotion) return 'instant';
    if (hasFlag) return 'instant';
    if (!landedFirst) return 'instant';
    return 'splash';
  }

  /** Whether the tab booted flag is present. Fail-open: false on any storage error. */
  function readFlag() {
    try {
      if (!global.sessionStorage) return false;
      return global.sessionStorage.getItem(FLAG_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  /**
   * Whether sessionStorage is usable at all (private-mode throw-stubs).
   * When it is not, boot fails open to an instant load: no splash can be
   * reliably gated, so none is attempted and no key is touched.
   */
  function storageAvailable() {
    try {
      if (!global.sessionStorage) return false;
      global.sessionStorage.getItem(FLAG_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Exactly-once guard: even if init() is somehow invoked twice in a tab,
  // the flag is written at most once.
  var flagWritten = false;

  /**
   * Write the booted flag. Called on the first arming of a tab regardless
   * of whether the splash animated — an instant boot (reduced motion)
   * counts as booted, so later loads in the same tab stay instant too.
   * @returns {boolean} true when this call performed the write.
   */
  function writeFlag() {
    if (flagWritten) return false;
    flagWritten = true;
    try {
      global.sessionStorage.setItem(FLAG_KEY, '1');
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Resolve a Chrome String with graceful fallbacks: the splash renders
   * before App.I18n may have been `use()`d, and a headless run may have
   * no dictionary at all, so a failed lookup falls back to the literal
   * en/zh strings for the current document language.
   */
  function chromeString(id, enFallback, zhFallback) {
    try {
      if (app.I18n && typeof app.I18n.t === 'function') {
        var s = app.I18n.t(id);
        if (typeof s === 'string' && s) return s;
      }
    } catch (err) { /* fall through to literal fallback */ }
    var doc = global.document;
    var lang = doc && doc.documentElement
      ? String(doc.documentElement.lang || '').trim().toLowerCase() : '';
    return lang.indexOf('zh') === 0 ? zhFallback : enFallback;
  }

  /**
   * Build and show the splash overlay synchronously — this runs while the
   * boot script tag executes, before any later script (shell, quiz,
   * results) has touched the page, so no content is ever visible above it.
   * The overlay only masks: content fetches kicked off by main.js proceed
   * unblocked. It deliberately does not depend on App.Shell — the splash
   * stands alone as a plain overlay.
   */
  function playSplash() {
    var doc = global.document;
    if (!doc || !doc.body) return; // headless or pre-body: nothing to mask

    var overlay = doc.createElement('div');
    overlay.className = 'boot-overlay';
    overlay.setAttribute('role', 'progressbar');
    overlay.setAttribute('aria-valuemin', '0');
    overlay.setAttribute('aria-valuemax', '100');

    var panel = doc.createElement('div');
    panel.className = 'boot-panel';

    var title = doc.createElement('h1');
    title.className = 'boot-title';
    title.textContent = chromeString(
      'landing.titleFallback',
      'Agent Security Awareness Quiz',
      '智能体安全意识测评'
    );

    var groove = doc.createElement('div');
    groove.className = 'boot-groove';
    var fill = doc.createElement('div');
    fill.className = 'boot-fill';
    groove.appendChild(fill);

    var status = doc.createElement('p');
    status.className = 'boot-status';
    status.textContent = chromeString(
      'boot.status',
      'Starting application…',
      '正在启动程序……'
    );

    panel.appendChild(title);
    panel.appendChild(groove);
    panel.appendChild(status);
    overlay.appendChild(panel);
    doc.body.insertBefore(overlay, doc.body.firstChild);

    global.setTimeout(function() {
      overlay.classList.add('boot-leaving');
      global.setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, FADE_MS);
    }, SPLASH_MS);
  }

  /**
   * Arm the boot for this page load. Reads storage, consults the live
   * Session (its presence means the initial view is a mid-quiz/review
   * restore, not a landing), decides, writes the flag exactly once, and
   * only then — if splashing — builds the overlay.
   *
   * @returns {'splash'|'instant'} the decision taken.
   */
  function init() {
    // Storage unusable (private mode etc.): fail open to an instant boot.
    // No splash is attempted, no key is touched, nothing throws.
    if (!storageAvailable()) return 'instant';

    var hasFlag = readFlag();

    // The initial view is not a landing when a Session to restore or a
    // Results/Review record already exists — those views never replay.
    var restoring = false;
    try {
      if (app.SessionStore && typeof app.SessionStore.exists === 'function') {
        restoring = !!app.SessionStore.exists();
      }
    } catch (err) {
      restoring = false;
    }

    var reducedMotion = false;
    try {
      reducedMotion = !!(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      reducedMotion = false;
    }

    var state = decide(!restoring, hasFlag, reducedMotion);

    // The flag is written on the first arming of this tab whether or not
    // the splash animated (instant counts as booted) — and only then: a
    // tab that already carries the flag never rewrites it.
    if (!hasFlag) writeFlag();

    if (state === 'splash') playSplash();
    return state;
  }

  app.Boot = {
    decide: decide,
    init: init,
    FLAG_KEY: FLAG_KEY,
    _writeFlag: writeFlag,
    _readFlag: readFlag
  };

  if (typeof module !== 'undefined') {
    module.exports = global.App.Boot;
  }

  // Browser entry: the script tag sits at the end of <body>, so the DOM is
  // there and the overlay lands before the first paint. In headless runs
  // (no document) nothing arms automatically — tests call Boot.init().
  if (global.document && global.document.body) {
    init();
  }
})(globalThis);
