exports.name = 'DesktopStore (ticket #63): the per-tab desktop Record';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  /* ── globals this suite owns, snapshotted and restored ──────────────── */

  var App = globalThis.App || {};
  globalThis.App = App;
  var prevApp = {
    I18n: App.I18n,
    Scoring: App.Scoring,
    SessionStore: App.SessionStore,
    Desktop: App.Desktop,
    Windows: App.Windows,
    DesktopStore: App.DesktopStore,
    renderResults: App.renderResults,
    holdActionPlanRequest: App.holdActionPlanRequest,
    actionPlanRequestHeld: App.actionPlanRequestHeld
  };
  var prevGlobal = {
    Analytics: globalThis.Analytics,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage
  };

  /* ── storage stubs (pattern from test-boot.js / test-session-store.js) ─ */

  function fakeStorage(initial) {
    var store = initial || {};
    var stub = {
      setCalls: 0,
      removeCalls: 0,
      store: store,
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function(k, v) { stub.setCalls++; store[k] = String(v); },
      removeItem: function(k) { stub.removeCalls++; delete store[k]; }
    };
    return stub;
  }

  function throwingStorage() {
    function deny() { throw new Error('SecurityError: storage denied'); }
    return { getItem: deny, setItem: deny, removeItem: deny };
  }

  var page = { setCalls: 0 };

  /* ── fixture bank: 3 Questions × 4 Options, two Phases ───────────────── */

  function q(id, phase) {
    return {
      id: id, phase: phase, ast_risks: ['AST01'], severity_weight: 2,
      scenario: 'S', question: id + '?',
      options: [
        { text: 'a', score: 0 }, { text: 'b', score: 1 },
        { text: 'c', score: 2 }, { text: 'd', score: 3 }
      ]
    };
  }

  var bank = {
    meta: { title: 'Fixture', total_questions: 3, scoring: { severity_values: { high: 3 } } },
    phases: [{ id: 'p1', question_ids: ['q1', 'q2'] }, { id: 'p2', question_ids: ['q3'] }],
    questions: [q('q1', 'p1'), q('q2', 'p1'), q('q3', 'p2')]
  };
  var fullAnswers = [0, 1, 2];

  /* ── collaborator stubs ──────────────────────────────────────────────── */

  var i18nLog = [];
  App.I18n = {
    locale: 'en',
    baseLocale: function(l) { return String(l == null ? '' : l).split(/[-_]/)[0]; },
    use: function(l) { App.I18n.locale = l; i18nLog.push(l); return l; }
  };

  var computeCalls = [];
  var REPORT = { percentage: 61, title: { emoji: 'x', name: 'Tier' } };
  App.Scoring = {
    computeScores: function(b, a) {
      computeCalls.push({ bank: b, answers: a.slice() });
      return { ok: true, report: REPORT };
    }
  };

  var renders = [];
  var renderSeesHold = [];
  var holdLog = [];
  var held = false;
  App.renderResults = function(b, report) {
    renders.push({ bank: b, report: report });
    // The hold is what tells results.js NOT to start the Action Plan request
    // for this render: it must read armed inside the restore's render and
    // released again the moment the render is over.
    renderSeesHold.push(held);
  };
  App.holdActionPlanRequest = function(on) { held = !!on; holdLog.push(!!on); };
  App.actionPlanRequestHeld = function() { return held; };

  var tracked = [];
  globalThis.Analytics = { track: function(ev) { tracked.push(ev); } };

  function freshStore() {
    var resolved = require.resolve('../../js/desktop-store.js');
    delete require.cache[resolved];
    return require(resolved);
  }

  // The collaborators are loaded as plain requires: session-store and
  // desktop-core are state-free modules whose registrations the rest of the
  // suite already owns, and busting their cache here would strand the
  // module for every later test file (require() would hand back the cached
  // module without re-running its registration).
  require('../../js/session-store.js');
  require('../../js/desktop-core.js');

  App.SessionStore = globalThis.App.SessionStore;
  var Store = freshStore();

  function seedDesktop(active, windows) {
    // A fake Windows controller: snapshot() hands back the committed
    // arrangement, restoreSnapshot() records what the restore asked for.
    var applied = null;
    App.Windows = {
      controller: {
        snapshot: function() {
          return {
            active: active, zCounter: 3, view: 'results-view',
            confirmOpen: false, windows: windows
          };
        },
        restoreSnapshot: function(snap) { applied = snap; return true; },
        applied: function() { return applied; }
      }
    };
    return function() { return applied; };
  }

  var QUIZ_GEO = { x: 120, y: 64, w: 800, h: 600 };
  var DD_GEO = { x: 136, y: 96, w: 600, h: 440 };
  var windows = {
    quiz: {
      mode: 'normal', geometry: QUIZ_GEO, lastGeometry: QUIZ_GEO,
      lastMode: 'normal', z: 1
    },
    'deep-dive': {
      mode: 'minimized', geometry: DD_GEO, lastGeometry: DD_GEO,
      lastMode: 'normal', z: 0
    }
  };

  function recordOf(patch) {
    var rec = {
      v: 1, hash: App.SessionStore.hashBank(bank), lang: 'en',
      answers: fullAnswers.slice(), active: 'quiz', zCounter: 3,
      view: 'results-view', windows: JSON.parse(JSON.stringify(windows))
    };
    Object.keys(patch || {}).forEach(function(k) { rec[k] = patch[k]; });
    return rec;
  }

  function putRaw(value) {
    globalThis.sessionStorage.store[Store.KEY] =
      (typeof value === 'string') ? value : JSON.stringify(value);
  }

  function resetScenario(initial) {
    globalThis.sessionStorage = fakeStorage(initial);
    globalThis.localStorage = fakeStorage();   // must NEVER be written here
    renders.length = 0; renderSeesHold.length = 0; holdLog.length = 0;
    tracked.length = 0; computeCalls.length = 0; i18nLog.length = 0;
    held = false;
    Store = freshStore();
    return Store;
  }

  try {
    /* ── the key is its own, in sessionStorage ─────────────────────────── */

    resetScenario();
    check('the Record lives under its own key quiz-desktop',
      Store.KEY === 'quiz-desktop', Store.KEY);

    var appliedFor = seedDesktop('quiz', windows);
    var written = Store.captureAtCommit(bank, fullAnswers);
    check('the Finish Commit writes the Record',
      written === true && globalThis.sessionStorage.getItem(Store.KEY) !== null);
    check('the Record never touches localStorage',
      globalThis.localStorage.setCalls === 0 &&
      Object.keys(globalThis.localStorage.store).length === 0,
      'setCalls=' + globalThis.localStorage.setCalls);

    var rec = JSON.parse(globalThis.sessionStorage.getItem(Store.KEY));
    check('the Record carries the structural hash, answers and language',
      rec.hash === App.SessionStore.hashBank(bank) &&
      JSON.stringify(rec.answers) === JSON.stringify(fullAnswers) &&
      rec.lang === 'en',
      JSON.stringify({ hash: rec.hash, a: rec.answers, l: rec.lang }));
    check('the Record carries every window Record and the active program',
      rec.active === 'quiz' && rec.zCounter === 3 &&
      rec.windows.quiz.mode === 'normal' &&
      JSON.stringify(rec.windows.quiz.geometry) === JSON.stringify(QUIZ_GEO) &&
      JSON.stringify(rec.windows.quiz.lastGeometry) === JSON.stringify(QUIZ_GEO) &&
      rec.windows.quiz.lastMode === 'normal' && rec.windows.quiz.z === 1 &&
      rec.windows['deep-dive'].mode === 'minimized' &&
      rec.windows['deep-dive'].z === 0,
      JSON.stringify(rec.windows));

    /* ── capture refuses an uncommitted run ────────────────────────────── */

    resetScenario();
    seedDesktop('quiz', windows);
    var partial = [0, null, 2];
    check('an incomplete Session is never captured',
      Store.captureAtCommit(bank, partial) === false &&
      globalThis.sessionStorage.getItem(Store.KEY) === null);
    check('a non-array is never captured',
      Store.captureAtCommit(bank, null) === false &&
      Store.captureAtCommit(null, fullAnswers) === false);

    /* ── restore: the desktop, recomputed under this page's Variant ───── */

    resetScenario();
    appliedFor = seedDesktop('quiz', windows);
    Store.captureAtCommit(bank, fullAnswers);
    var setCallsAfterCommit = globalThis.sessionStorage.setCalls;
    var restored = Store.restore(bank);
    check('a valid Record restores the desktop',
      restored === true, String(restored));
    check('the restore recomputes the report through App.Scoring',
      computeCalls.length === 1 &&
      JSON.stringify(computeCalls[0].answers) === JSON.stringify(fullAnswers) &&
      computeCalls[0].bank === bank);
    check('the restored desktop renders exactly that report',
      renders.length === 1 && renders[0].report === REPORT && renders[0].bank === bank);
    check('restore is a re-render, not a completion: no quiz_completed',
      tracked.length === 0, JSON.stringify(tracked));
    check('restore fires NO Action Plan request (the hold covers the render)',
      renderSeesHold.length === 1 && renderSeesHold[0] === true &&
      App.actionPlanRequestHeld() === false &&
      holdLog.length === 2 && holdLog[0] === true && holdLog[1] === false,
      'during=' + renderSeesHold + ' after=' + App.actionPlanRequestHeld());
    check('the window Records go back before the render',
      appliedFor() && appliedFor().windows.quiz.mode === 'normal' &&
      appliedFor().active === 'quiz' && appliedFor().zCounter === 3 &&
      JSON.stringify(appliedFor().windows.quiz.geometry) === JSON.stringify(QUIZ_GEO) &&
      appliedFor().windows['deep-dive'].mode === 'minimized',
      JSON.stringify(appliedFor()));
    check('restore never rewrites the Record (read-only on load)',
      globalThis.sessionStorage.setCalls === setCallsAfterCommit,
      'setCalls=' + globalThis.sessionStorage.setCalls);

    /* ── language: the committed dictionary follows the Record ─────────── */

    resetScenario();
    seedDesktop('quiz', windows);
    putRaw(recordOf({ lang: 'zh' }));
    App.I18n.locale = 'en';
    Store.restore(bank);
    check('a Record committed in the other language selects that dictionary',
      i18nLog.length === 1 && i18nLog[0] === 'zh' && App.I18n.locale === 'zh',
      JSON.stringify(i18nLog));

    resetScenario();
    seedDesktop('quiz', windows);
    putRaw(recordOf({ lang: 'zh-Hans' }));
    App.I18n.locale = 'zh';
    i18nLog.length = 0;
    Store.restore(bank);
    check('the same language (base locale) does not re-select the dictionary',
      i18nLog.length === 0, JSON.stringify(i18nLog));

    /* ── invalidation: each kind discards quietly ──────────────────────── */

    var invalid = [
      ['stale hash', function() { return recordOf({ hash: 'deadbeef' }); }],
      ['incomplete answers', function() { return recordOf({ answers: [0, null, 2] }); }],
      ['wrong-length answers', function() { return recordOf({ answers: [0, 1] }); }],
      ['out-of-range answer', function() { return recordOf({ answers: [0, 1, 9] }); }],
      ['answers not an array', function() { return recordOf({ answers: '012' }); }],
      ['windows not an object', function() { return recordOf({ windows: null }); }],
      ['version not ours', function() { return recordOf({ v: 2 }); }]
    ];
    invalid.forEach(function(row) {
      resetScenario();
      seedDesktop('quiz', windows);
      putRaw(row[1]());
      var threw = null, ok = true;
      try { ok = Store.restore(bank); } catch (e) { threw = e; }
      check('invalid Record (' + row[0] + '): discarded quietly, no restore',
        ok === false && threw === null &&
        globalThis.sessionStorage.getItem(Store.KEY) === null &&
        renders.length === 0 && tracked.length === 0,
        'restored=' + ok + ' threw=' + threw);
    });

    resetScenario();
    seedDesktop('quiz', windows);
    putRaw('{ not json');
    var threwRaw = null, okRaw = true;
    try { okRaw = Store.restore(bank); } catch (e) { threwRaw = e; }
    check('an unparsable payload is discarded quietly',
      okRaw === false && threwRaw === null &&
      globalThis.sessionStorage.getItem(Store.KEY) === null &&
      renders.length === 0, String(okRaw) + '/' + threwRaw);

    /* ── storage unavailable: no restore, today's behaviour ────────────── */

    resetScenario();
    globalThis.sessionStorage = throwingStorage();
    var threwStore = null, captured = true;
    try { captured = Store.captureAtCommit(bank, fullAnswers); }
    catch (e) { threwStore = e; }
    var restoredDeny = null;
    try { restoredDeny = Store.restore(bank); } catch (e) { threwStore = threwStore || e; }
    check('storage that throws: capture false, restore false, no crash',
      captured === false && restoredDeny === false && threwStore === null,
      'cap=' + captured + ' res=' + restoredDeny + ' threw=' + threwStore);

    resetScenario();
    delete globalThis.sessionStorage;
    var noStoreErr = null, noStoreRes = null;
    try {
      noStoreRes = Store.restore(bank);
    } catch (e) { noStoreErr = e; }
    check('no sessionStorage at all: restore degrades to no restore',
      noStoreRes === false && noStoreErr === null && renders.length === 0,
      'res=' + noStoreRes + ' err=' + noStoreErr);
    check('exists() is false when storage is absent',
      Store.exists() === false);

    /* ── the real core: the Records round-trip through loadSnapshot ────── */

    var Desktop = App.Desktop;

    resetScenario();
    var live = Desktop.createCore({ id: Desktop.QUIZ_ID });
    live.setView('results-view');
    live.open('deep-dive', { minimized: true });
    live.applyGeometry({ x: 210, y: 70, w: 700, h: 520 }, 'quiz');
    live.raise('quiz');
    var committedSnap = live.snapshot();
    App.Windows = {
      controller: {
        snapshot: live.snapshot,
        restoreSnapshot: live.loadSnapshot
      }
    };
    Store.captureAtCommit(bank, fullAnswers);

    var fresh = Desktop.createCore({ id: Desktop.QUIZ_ID });
    App.Windows = {
      controller: {
        snapshot: fresh.snapshot,
        restoreSnapshot: fresh.loadSnapshot
      }
    };
    var restoredCore = Store.restore(bank);
    var arrivedSnap = fresh.snapshot();
    check('the desktop round-trips through the core itself',
      restoredCore === true &&
      JSON.stringify(arrivedSnap) === JSON.stringify(committedSnap),
      JSON.stringify(arrivedSnap));
    check('the restored Quiz window keeps the dragged Geometry, mode and z',
      JSON.stringify(arrivedSnap.windows.quiz.geometry) === JSON.stringify({ x: 210, y: 70, w: 700, h: 520 }) &&
      arrivedSnap.windows.quiz.mode === 'normal' &&
      arrivedSnap.windows['deep-dive'].mode === 'minimized' &&
      arrivedSnap.active === committedSnap.active &&
      arrivedSnap.zCounter === committedSnap.zCounter,
      JSON.stringify(arrivedSnap.windows));

    var halfBroken = {
      active: 'quiz', zCounter: 0, view: 'results-view', confirmOpen: false,
      windows: {
        quiz: {
          mode: 'normal', geometry: { x: 1, y: 1, w: 400, h: 400 },
          lastGeometry: { x: 1, y: 1, w: 400, h: 400 }, lastMode: 'normal', z: 0
        },
        'deep-dive': {
          mode: 'sideways', geometry: { x: 2, y: 2, w: 400, h: 400 },
          lastGeometry: { x: 2, y: 2, w: 400, h: 400 }, lastMode: 'normal', z: 1
        }
      }
    };
    var beforeCore = JSON.stringify(fresh.snapshot());
    check('loadSnapshot is all-or-nothing: one bad Record changes nothing',
      fresh.loadSnapshot(halfBroken) === false &&
      JSON.stringify(fresh.snapshot()) === beforeCore);
    check('loadSnapshot refuses a snapshot with the dialog left open',
      fresh.loadSnapshot({
        active: 'quiz', zCounter: 0, view: 'results-view', confirmOpen: true,
        windows: {
          quiz: {
            mode: 'normal', geometry: { x: 1, y: 1, w: 400, h: 400 },
            lastGeometry: { x: 1, y: 1, w: 400, h: 400 }, lastMode: 'normal', z: 0
          }
        }
      }) === false);
    check('the committed stage comes back as the desktop, not the landing',
      committedSnap.view === 'results-view' && arrivedSnap.view === 'results-view',
      arrivedSnap.view);

    /* ── Retake drops the Record with the Session ──────────────────────── */

    resetScenario();
    seedDesktop('quiz', windows);
    Store.captureAtCommit(bank, fullAnswers);
    check('clear() discards the Record quietly',
      Store.clear() === undefined &&
      globalThis.sessionStorage.getItem(Store.KEY) === null &&
      Store.exists() === false);
  } finally {
    // A key whose value this suite loaded from the real module (never a
    // stub) stays registered: a later suite require()ing the same file
    // reads the module cache, which does not re-run, and would otherwise
    // find the global gone. Stubs the suite installed are still removed.
    var KEEP = { SessionStore: true, Desktop: true, DesktopStore: true };
    Object.keys(prevApp).forEach(function(k) {
      if (prevApp[k] !== undefined) { App[k] = prevApp[k]; return; }
      if (!KEEP[k]) delete App[k];
    });
    Object.keys(prevGlobal).forEach(function(k) {
      if (prevGlobal[k] === undefined) delete globalThis[k];
      else globalThis[k] = prevGlobal[k];
    });
  }

  return results;
};
