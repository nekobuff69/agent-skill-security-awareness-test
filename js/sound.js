/**
 * System sounds (ticket #41): synthesized UI voices for the retro OS shell.
 *
 * Zero audio files — every voice is a square-wave WebAudio sequence built
 * at play time. Nothing synthesizes until ALL gates pass (see audible());
 * the module is inert in Node (no document/AudioContext), so tests and
 * headless requires stay silent.
 *
 * ── Voice table (square waves; the evidence harness maps by frequency) ──
 *   name   | sequence                          | where it fires
 *   -------|-----------------------------------|------------------------------
 *   click  | 2000 Hz, 40 ms                    | an Option is marked in the
 *          |                                   | Quiz (first mark AND re-mark;
 *          |                                   | same-pick re-tap is a no-op
 *          |                                   | and stays silent)
 *   open   | 880 Hz 90 ms + 1320 Hz 150 ms     | a view opens — landing →
 *          | (second tone delayed 110 ms)      | quiz → results → review, seen
 *          |                                   | as a `hidden` flip on #app
 *          |                                   | sections (MutationObserver —
 *          |                                   | js/main.js owns showView and
 *          |                                   | is read-only for this ticket)
 *   buzz   | 140 Hz, 220 ms                    | the .quiz-notice banner is
 *          |                                   | shown (js/quiz.js hook)
 *
 * ── Gates — audible(opts) is the single pure predicate, checked FIRST ──
 * Silent when ANY of:
 *   - prefers-reduced-motion (regardless of the Start-menu toggle state)
 *   - muted (persisted preference, see prefs below)
 *   - before the first user gesture (the AudioContext can only arm on a
 *     gesture — one document-level listener attaches once at init)
 *   - coarse pointer (touch device)
 *   - viewportWidth <= 780 (phone-sized viewport)
 *
 * ── Persistence ──
 * The mute state is a Preference like the Language Preference: one JSON
 * record under the localStorage key `quiz-os-prefs`, field `soundMuted`.
 * Reads happen at call time and writes merge into the existing record, so
 * the preference survives Retake, reloads and other tabs, and never
 * clobbers sibling fields in the same record.
 *
 * ── Open detection ──
 * App.showView (js/main.js, read-only here) flips the `hidden` attribute
 * of `#app > section`. A MutationObserver on #app (attributeFilter
 * `hidden`, subtree) reports the newly visible section once per mutation
 * batch; the boot state is snapshotted at attach time so the initial view
 * never plays. js/main.js stays untouched.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── Preferences (localStorage, read at call time) ─────────────────── */

  var PREFS_KEY = 'quiz-os-prefs';
  var SOUND_MUTED_FIELD = 'soundMuted';

  function readPrefs() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {}; // storage unavailable or corrupt — fail open to defaults
    }
  }

  function writeMuted(value) {
    try {
      if (!global.localStorage) return false;
      var prefs = readPrefs(); // merge: sibling fields survive
      prefs[SOUND_MUTED_FIELD] = !!value;
      global.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ── Voice table ───────────────────────────────────────────────────── */

  var VOICES = {
    click: [
      { freq: 2000, ms: 40, delay: 0, gain: 0.12 }
    ],
    buzz: [
      { freq: 140, ms: 220, delay: 0, gain: 0.15 }
    ],
    open: [
      { freq: 880,  ms: 90,  delay: 0,   gain: 0.12 },
      { freq: 1320, ms: 150, delay: 110, gain: 0.12 }
    ]
  };

  var MOBILE_BREAKPOINT = 780;

  /** The four views whose opening plays the chime. */
  var OPEN_VIEWS = ['landing-view', 'quiz-view', 'results-view', 'review-view'];

  /* ── Pure gating predicate (headless-testable; no DOM reads) ───────── */

  /**
   * The single source of truth for "may a voice sound right now".
   * Silent when ANY rule matches; false for a missing options object
   * (silent by default).
   *
   * @param {object} opts
   * @param {boolean} opts.pointerCoarse    - coarse (touch) pointer present
   * @param {number}  [opts.viewportWidth]  - live viewport width in px
   * @param {boolean} opts.muted            - persisted mute preference
   * @param {boolean} opts.gestureArmed     - a user gesture has happened
   * @param {boolean} opts.reducedMotion    - prefers-reduced-motion: reduce
   * @returns {boolean} true when a voice may sound
   */
  function audible(opts) {
    if (!opts) return false;
    if (opts.reducedMotion) return false; // outranks the toggle, always
    if (opts.muted) return false;
    if (!opts.gestureArmed) return false;
    if (opts.pointerCoarse) return false;
    if (typeof opts.viewportWidth === 'number' &&
        isFinite(opts.viewportWidth) &&
        opts.viewportWidth <= MOBILE_BREAKPOINT) {
      return false;
    }
    return true;
  }

  /* ── Live environment readers (browser only, never cached) ─────────── */

  function mediaMatches(query) {
    try {
      if (global.matchMedia) return !!global.matchMedia(query).matches;
    } catch (e) { /* fall through */ }
    return false;
  }

  function pointerIsCoarse() { return mediaMatches('(pointer: coarse)'); }
  function prefersReducedMotion() { return mediaMatches('(prefers-reduced-motion: reduce)'); }

  function viewportWidth() {
    return (global.innerWidth != null) ? global.innerWidth : undefined;
  }

  /* ── Gesture arm (once, lazily attached) ───────────────────────────── */

  var gestureArmed = false;
  var gestureAttached = false;

  function armGesture() { gestureArmed = true; }

  /**
   * Attach the first-gesture listener exactly once. The context itself is
   * created lazily inside play() — only when a voice actually sounds — so
   * an untouched page never even constructs an AudioContext.
   */
  function attachGestureArm() {
    var doc = global.document;
    if (gestureAttached || !doc || !doc.addEventListener) return;
    gestureAttached = true;
    ['pointerdown', 'keydown', 'touchstart'].forEach(function(evt) {
      doc.addEventListener(evt, function onFirstGesture() {
        armGesture();
      }, { once: true });
    });
  }

  function isGestureArmed() { return gestureArmed; }

  /* ── Synthesis (WebAudio, guarded) ─────────────────────────────────── */

  var audioCtx = null;

  function ensureContext() {
    if (audioCtx) return audioCtx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function schedule(seq, ctx) {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (e) { /* stay silent */ }
    }
    var start = ctx.currentTime;
    seq.forEach(function(step) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var t0 = start + (step.delay / 1000);
      var dur = step.ms / 1000;
      osc.type = 'square';
      if (osc.frequency) osc.frequency.value = step.freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(step.gain, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    });
  }

  /* ── Open detection (MutationObserver; js/main.js untouched) ───────── */

  var observerAttached = false;
  var lastViewId = null;

  function currentViewId() {
    var doc = global.document;
    if (!doc || !doc.querySelectorAll) return null;
    var sections = doc.querySelectorAll('#app > section');
    for (var i = 0; i < sections.length; i++) {
      if (!sections[i].hidden) return sections[i].id;
    }
    return null;
  }

  function handleViewMutation() {
    var id = currentViewId();
    if (!id || id === lastViewId) return;
    lastViewId = id;
    if (OPEN_VIEWS.indexOf(id) !== -1) play('open');
  }

  function attachOpenObserver() {
    var doc = global.document;
    var root = (doc && doc.getElementById) ? doc.getElementById('app') : null;
    if (observerAttached || !root || typeof global.MutationObserver !== 'function') return;
    observerAttached = true;
    lastViewId = currentViewId(); // boot snapshot: the initial view never plays
    new global.MutationObserver(handleViewMutation).observe(root, {
      attributes: true,
      attributeFilter: ['hidden'],
      subtree: true
    });
  }

  /* ── Public state snapshot (evidence + diagnostics) ────────────────── */

  function options() {
    return {
      pointerCoarse: pointerIsCoarse(),
      viewportWidth: viewportWidth(),
      muted: readPrefs()[SOUND_MUTED_FIELD] === true,
      gestureArmed: gestureArmed,
      reducedMotion: prefersReducedMotion()
    };
  }

  /* ── Play ──────────────────────────────────────────────────────────── */

  /**
   * Fire one voice by name. Gate first (audible), synthesize second.
   * Every step is guarded: no AudioContext, no gesture, headless Node —
   * all silent no-ops, never throws into a caller's event handler.
   *
   * @param {'click'|'open'|'buzz'} name
   * @returns {boolean} true when the voice was scheduled
   */
  function play(name) {
    try {
      var seq = VOICES[name];
      if (!seq) return false;
      if (!audible(options())) return false;
      var ctx = ensureContext();
      if (!ctx) return false;
      schedule(seq, ctx);
      return true;
    } catch (e) {
      return false; // synthesis is decoration — never break the UI with it
    }
  }

  /* ── Mute preference (persisted like the Language Preference) ──────── */

  function isMuted() { return readPrefs()[SOUND_MUTED_FIELD] === true; }

  /** @returns {boolean} the resulting muted state. */
  function setMuted(value) {
    writeMuted(value);
    return isMuted();
  }

  /** @returns {boolean} the resulting muted state after flipping. */
  function toggleMuted() {
    return setMuted(!isMuted());
  }

  /* ── Init (browser only; dormant in Node) ──────────────────────────── */

  function init() {
    attachGestureArm();
    attachOpenObserver();
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  var sound = {
    audible: audible,
    play: play,
    options: options,
    VOICES: VOICES,
    OPEN_VIEWS: OPEN_VIEWS,
    MOBILE_BREAKPOINT: MOBILE_BREAKPOINT,
    PREFS_KEY: PREFS_KEY,
    isMuted: isMuted,
    setMuted: setMuted,
    toggleMuted: toggleMuted,
    isGestureArmed: isGestureArmed,
    armGesture: armGesture,
    attachGestureArm: attachGestureArm,
    attachOpenObserver: attachOpenObserver,
    init: init
  };

  app.Sound = sound;

  if (typeof module !== 'undefined') module.exports = app.Sound;

})(globalThis);
