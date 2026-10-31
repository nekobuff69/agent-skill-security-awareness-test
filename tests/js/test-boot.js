exports.name = 'Boot';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  /**
   * A sessionStorage stub: records every set so "written exactly once"
   * is assertable, and can be armed to throw on any access like a
   * private-mode storage denial.
   */
  function fakeStorage(initial) {
    var store = initial || {};
    var stub = {
      setCalls: 0,
      store: store,
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function(k, v) { stub.setCalls++; store[k] = String(v); },
      removeItem: function(k) { delete store[k]; }
    };
    return stub;
  }

  /** Every access throws, the way private browsing denies storage. */
  function throwingStorage() {
    function deny() { throw new Error('SecurityError: storage denied'); }
    return { getItem: deny, setItem: deny, removeItem: deny };
  }

  /**
   * Re-require js/boot.js with a clean module cache so the exactly-once
   * flag guard and App.Boot registration are fresh for each scenario —
   * run-tests.js loads every test file into one process, so the cache
   * must be busted rather than the module state poked at.
   */
  function freshBoot() {
    var resolved = require.resolve('../../js/boot.js');
    delete require.cache[resolved];
    return require(resolved);
  }

  // ── decide() matrix (pure) ──────────────────────────────────────────
  var Boot = freshBoot();

  check('fresh landing → splash',
    Boot.decide(true, false, false) === 'splash',
    Boot.decide(true, false, false));
  check('flagged tab → instant',
    Boot.decide(true, true, false) === 'instant',
    Boot.decide(true, true, false));
  check('reduced motion → instant',
    Boot.decide(true, false, true) === 'instant',
    Boot.decide(true, false, true));
  check('mid-quiz/review restore (not landing) → instant',
    Boot.decide(false, false, false) === 'instant',
    Boot.decide(false, false, false));
  check('flagged + restore + reduced motion → instant',
    Boot.decide(false, true, true) === 'instant',
    Boot.decide(false, true, true));
  check('FLAG_KEY is namespaced quiz-os-booted',
    Boot.FLAG_KEY === 'quiz-os-booted', Boot.FLAG_KEY);

  // ── init() runtime against storage stubs ────────────────────────────
  // App.SessionStore may have been registered by an earlier test file in
  // this shared process; stub it per row and restore afterwards so the
  // "initial view is landing vs restore" input is deterministic.
  globalThis.App = globalThis.App || {};
  var origSessionStore = globalThis.App.SessionStore;
  var origSessionStorage = globalThis.sessionStorage;
  var origMatchMedia = globalThis.matchMedia;

  function setSession(exists) {
    globalThis.App.SessionStore = {
      hashBank: function() { return 'h'; },
      load: function() { return null; },
      save: function() {},
      clear: function() {},
      exists: function() { return exists; }
    };
  }

  try {
    // 1. Fresh landing: splash plays, flag written.
    var store1 = fakeStorage();
    globalThis.sessionStorage = store1;
    setSession(false);
    Boot = freshBoot();
    var state1 = Boot.init();
    check('init on fresh landing decides splash',
      state1 === 'splash', state1);
    check('init writes booted flag on first landing',
      store1.getItem(Boot.FLAG_KEY) === '1',
      'flag=' + String(store1.getItem(Boot.FLAG_KEY)));

    // 2. Same tab, second load: flag suppresses the splash, and the
    //    write is not repeated (exactly once per tab).
    var state2 = Boot.init();
    check('second init in same tab → instant',
      state2 === 'instant', state2);
    check('flag write happens exactly once (double init, one setItem)',
      store1.setCalls === 1, 'setCalls=' + store1.setCalls);

    // 3. A tab whose storage already carries the flag boots instantly.
    var store2 = fakeStorage({ 'quiz-os-booted': '1' });
    globalThis.sessionStorage = store2;
    Boot = freshBoot();
    var state3 = Boot.init();
    check('pre-flagged tab → instant', state3 === 'instant', state3);
    check('pre-flagged tab does not rewrite the flag',
      store2.setCalls === 0, 'setCalls=' + store2.setCalls);

    // 4. Mid-quiz refresh: a Session to restore means the initial view is
    //    not the landing, so the splash is suppressed.
    var store4 = fakeStorage();
    globalThis.sessionStorage = store4;
    setSession(true);
    Boot = freshBoot();
    var state4 = Boot.init();
    check('mid-quiz restore → instant', state4 === 'instant', state4);

    // 5. prefers-reduced-motion: instant, but the flag is still written
    //    so every later load in this tab stays instant by flag too.
    var store5 = fakeStorage();
    globalThis.sessionStorage = store5;
    setSession(false);
    globalThis.matchMedia = function() { return { matches: true }; };
    Boot = freshBoot();
    var state5 = Boot.init();
    check('reduced motion → instant (splash bypassed)',
      state5 === 'instant', state5);
    check('reduced-motion instant still writes the flag once',
      store5.getItem(Boot.FLAG_KEY) === '1' && store5.setCalls === 1,
      'setCalls=' + store5.setCalls + ' flag=' +
      String(store5.getItem(Boot.FLAG_KEY)));

    // 6. Storage unavailable (private mode): fail open — no splash is
    //    attempted, no key is touched, and init must not throw.
    globalThis.sessionStorage = throwingStorage();
    setSession(false);
    Boot = freshBoot();
    var state6 = null;
    var threw = null;
    try {
      state6 = Boot.init();
    } catch (err) {
      threw = err;
    }
    check('throwing storage → no crash, instant boot',
      state6 === 'instant' && !threw,
      'state=' + String(state6) + ' threw=' + String(threw));

    // 7. Storage entirely absent (no sessionStorage at all): same
    //    fail-open behaviour.
    globalThis.sessionStorage = undefined;
    Boot = freshBoot();
    var state7 = Boot.init();
    check('missing sessionStorage → instant fail-open',
      state7 === 'instant', state7);
  } finally {
    if (origSessionStore === undefined) delete globalThis.App.SessionStore;
    else globalThis.App.SessionStore = origSessionStore;
    if (origSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = origSessionStorage;
    if (origMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = origMatchMedia;
  }

  return results;
};
