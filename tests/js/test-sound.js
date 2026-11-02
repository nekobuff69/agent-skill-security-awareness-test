exports.name = 'Sound';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── Load the module (headless: no document, no AudioContext) ─────────
  var Sound = require('../../js/sound.js');

  check('module loads headless without a document',
    Sound && typeof Sound.audible === 'function' && typeof Sound.play === 'function');

  check('play() is a silent no-op in Node (no AudioContext)',
    Sound.play('click') === false && Sound.play('open') === false && Sound.play('buzz') === false);

  // ── audible() matrix: viewport × pointer × muted × gesture × reduced ─

  var base = { pointerCoarse: false, viewportWidth: 1280, muted: false,
               gestureArmed: true, reducedMotion: false };

  function withOpts(overrides) {
    var o = {};
    Object.keys(base).forEach(function(k) { o[k] = base[k]; });
    Object.keys(overrides).forEach(function(k) { o[k] = overrides[k]; });
    return o;
  }

  var viewports = [{ label: 'desktop 1280', width: 1280 },
                   { label: 'mobile 375', width: 375 }];
  var booleans = [false, true];
  var cases = 0, mismatches = [];

  viewports.forEach(function(vp) {
    [false, true].forEach(function(coarse) {
      booleans.forEach(function(muted) {
        booleans.forEach(function(gesture) {
          booleans.forEach(function(reduced) {
            var opts = withOpts({ viewportWidth: vp.width, pointerCoarse: coarse,
                                  muted: muted, gestureArmed: gesture,
                                  reducedMotion: reduced });
            var got = Sound.audible(opts);
            // Independent expectation: silent when ANY single rule matches.
            var expected = !(vp.width <= 780 || coarse || !gesture || muted || reduced);
            cases++;
            if (got !== expected) {
              mismatches.push(JSON.stringify(opts) + ' → ' + got);
            }
          });
        });
      });
    });
  });

  check('audible() matrix: 32 desktop/mobile × coarse × muted × pre-gesture × reduced-motion cells',
    cases === 32 && mismatches.length === 0,
    mismatches.length ? mismatches.join(' | ') : cases + '/' + cases + ' cells');

  // ── Boundary + rule-specific spot checks (readable failures) ─────────

  check('desktop, armed, unmuted, no reduced motion → audible',
    Sound.audible(withOpts({})) === true);

  check('viewport 780 is still mobile-silent, 781 audible',
    Sound.audible(withOpts({ viewportWidth: 780 })) === false &&
    Sound.audible(withOpts({ viewportWidth: 781 })) === true,
    '780→' + Sound.audible(withOpts({ viewportWidth: 780 })) +
    ' 781→' + Sound.audible(withOpts({ viewportWidth: 781 })));

  check('coarse pointer silent even on a desktop-sized viewport',
    Sound.audible(withOpts({ pointerCoarse: true })) === false);

  check('pre-gesture silent even when unmuted and motion allowed',
    Sound.audible(withOpts({ gestureArmed: false })) === false);

  check('reduced motion silent REGARDLESS of the toggle (muted=false still silent)',
    Sound.audible(withOpts({ reducedMotion: true })) === false &&
    Sound.audible(withOpts({ reducedMotion: true, muted: false, gestureArmed: true })) === false);

  check('muted silent even after the gesture and without reduced motion',
    Sound.audible(withOpts({ muted: true })) === false);

  check('missing options object fails open to SILENT',
    Sound.audible() === false && Sound.audible(null) === false);

  check('non-numeric viewportWidth does not gate (desktop assumption)',
    Sound.audible(withOpts({ viewportWidth: undefined })) === true);

  // ── Voice table: the documented frequency mapping ────────────────────

  var V = Sound.VOICES;
  check('click = one 2000 Hz 40 ms square blip',
    V.click.length === 1 && V.click[0].freq === 2000 && V.click[0].ms === 40);
  check('buzz = one low 140 Hz 220 ms tone',
    V.buzz.length === 1 && V.buzz[0].freq === 140 && V.buzz[0].ms === 220);
  check('open = two-tone chime 880 Hz then 1320 Hz, second tone delayed',
    V.open.length === 2 && V.open[0].freq === 880 && V.open[1].freq === 1320 &&
    V.open[1].delay > 0);
  check('unknown voice names stay silent',
    Sound.play('no-such-voice') === false);

  // ── Gesture arm state (listener is document-only; arm() is the seam) ─

  check('gestureArmed starts false, armGesture() flips the state',
    Sound.isGestureArmed() === false && (Sound.armGesture(), Sound.isGestureArmed() === true));

  // ── Persistence round-trip with a localStorage stub ──────────────────

  var backing = {};
  var stub = {
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null;
    },
    setItem: function(k, v) { backing[k] = String(v); },
    removeItem: function(k) { delete backing[k]; }
  };
  var hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  var previousStorage = globalThis.localStorage;
  globalThis.localStorage = stub;

  try {
    // Seed a sibling field in the same record — the merge contract.
    backing['quiz-os-prefs'] = JSON.stringify({ otherPref: 'keep-me' });

    check('setMuted(true) persists under quiz-os-prefs.soundMuted',
      Sound.setMuted(true) === true && Sound.isMuted() === true);

    var stored = JSON.parse(backing['quiz-os-prefs']);
    check('write MERGES: sibling fields in the record survive the mute write',
      stored.soundMuted === true && stored.otherPref === 'keep-me',
      JSON.stringify(stored));

    check('muted state silences audible() on a fully-armed desktop',
      Sound.audible(withOpts({ muted: Sound.isMuted() })) === false);

    // Round-trip: a fresh read (another tab / a Retake reload reads fresh)
    // sees the persisted value — state is read at call time, never cached.
    check('isMuted() reads persisted state at call time (tab/reload round-trip)',
      Sound.isMuted() === true);

    // Cross-tab simulation: another tab rewrites the record directly.
    var other = JSON.parse(backing['quiz-os-prefs']);
    other.soundMuted = false;
    backing['quiz-os-prefs'] = JSON.stringify(other);
    check('external storage change (another tab) is visible immediately',
      Sound.isMuted() === false);

    check('toggleMuted() flips and persists the flipped value',
      Sound.toggleMuted() === true && Sound.isMuted() === true &&
      JSON.parse(backing['quiz-os-prefs']).soundMuted === true);

    check('toggleMuted() flips back and persists false',
      Sound.toggleMuted() === false &&
      JSON.parse(backing['quiz-os-prefs']).soundMuted === false);

    // Corrupt record: fail open to unmuted, and the next write repairs it.
    backing['quiz-os-prefs'] = '{not json';
    check('corrupt record fails open to unmuted (no throw)',
      Sound.isMuted() === false);
    check('a write after corruption repairs the record',
      Sound.setMuted(true) === true && JSON.parse(backing['quiz-os-prefs']).soundMuted === true);

    // Unrelated localStorage keys are never touched.
    backing['quiz-lang'] = JSON.stringify({ language: 'zh' });
    Sound.toggleMuted();
    check('unrelated localStorage keys (quiz-lang) are untouched by mute writes',
      backing['quiz-lang'] === JSON.stringify({ language: 'zh' }));
  } finally {
    if (hadStorage) globalThis.localStorage = previousStorage;
    else delete globalThis.localStorage;
  }

  // ── Chrome Strings for the Start-menu entry (both locales) ───────────

  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  var I18n = globalThis.App.I18n;
  I18n.use('en');
  var enLabel = I18n.t('sound.menuItem');
  I18n.use('zh');
  var zhLabel = I18n.t('sound.menuItem');
  check('sound.menuItem resolves in en ("Sound") and zh ("声音")',
    enLabel === 'Sound' && zhLabel === '声音',
    enLabel + '/' + zhLabel);
  I18n.use('en'); // leave the shared dictionary on the default locale

  return results;
};
