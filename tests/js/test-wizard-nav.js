exports.name = 'WizardNav';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  /**
   * A Node DOM node good enough to assert against: records children,
   * attributes and click handlers (same shape as test-lang-routing.js),
   * used here for the wizard chrome the decisions drive.
   */
  function fakeEl() {
    var el = {
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '',
      attrs: {}, handlers: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      appendChild: function(c) { el.children.push(c); return c; },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
      }
    };
    return el;
  }

  var WN = require('../../js/wizard-nav.js');

  function blank(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(null);
    return a;
  }

  /* ── Unanswered tap: records the pick and advances ── */

  var answers = blank(20);
  var d = WN.tapOption(answers, 0, 2);
  check('unanswered tap advances the card',
    d.action === 'advance', d.action);
  check('unanswered tap returns the tapped Option for recording',
    d.answer === 2, String(d.answer));
  check('unanswered tap reports the Question was previously unanswered',
    d.wasAnswered === false && d.finishReady === false);
  check('tapOption never mutates the answers array (caller records)',
    answers[0] === null && answers.length === 20);
  // The caller side of the contract, exactly as js/quiz.js does it:
  answers[0] = d.answer;
  check('recorded answer is exactly one Option for the Question (ADR 0017)',
    answers[0] === 2 && answers.filter(function(x) { return x !== null; }).length === 1,
    JSON.stringify(answers[0]));

  /* ── Answered revisit tap: overwrite + re-mark, NO advance ── */

  var revisit = WN.tapOption(answers, 0, 1);
  check('answered revisit tap stays put (no advance)',
    revisit.action === 'stay', revisit.action);
  check('answered revisit tap overwrites the stored pick',
    revisit.answer === 1 && revisit.wasAnswered === true, String(revisit.answer));
  check('answered revisit tap does not ask for the Finish beat',
    revisit.finishReady === false);

  /* ── Last-Question first tap: stay + finish beat, never completion ── */

  var lastFirst = WN.tapOption(answers, 19, 0);
  check('first tap on the last Question stays put',
    lastFirst.action === 'stay', lastFirst.action);
  check('first tap on the last Question asks for the 100% beat + Finish focus',
    lastFirst.finishReady === true && lastFirst.wasAnswered === false);
  check('tap decisions carry no completion event of their own',
    !('event' in lastFirst) && !('ok' in lastFirst));
  answers[19] = lastFirst.answer;   // caller records, as js/quiz.js does

  var lastRemark = WN.tapOption(answers, 19, 3);
  check('re-mark on the last Question leaves the card put without the beat',
    lastRemark.action === 'stay' && lastRemark.finishReady === false &&
    lastRemark.answer === 3);

  /* ── canFinish: false → true at 20/20 ── */

  check('canFinish false while any Question is unanswered (2/20)',
    WN.canFinish(answers) === false);
  check('canFinish false on an all-empty bank',
    WN.canFinish(blank(20)) === false);
  check('canFinish false on a non-array bank',
    WN.canFinish(null) === false && WN.canFinish([]) === false);
  for (var f = 1; f <= 17; f++) answers[f] = 0;
  check('canFinish still false at 19/20',
    WN.canFinish(answers) === false);
  answers[18] = 1;
  check('canFinish true at 20/20',
    WN.canFinish(answers) === true);

  /* ── prev/next bounds ── */

  var atFirst = WN.prev(20, 0);
  check('prev at the first Question stays (no back beyond Q1)',
    atFirst.index === 0 && atFirst.atFirst === true &&
    atFirst.indexChanged === false, JSON.stringify(atFirst));

  var mid = WN.prev(20, 7);
  check('prev moves one Question back',
    mid.index === 6 && mid.atFirst === false && mid.indexChanged === true,
    JSON.stringify(mid));

  var midNext = WN.next(20, 7);
  check('next moves one Question forward',
    midNext.index === 8 && midNext.atLast === false &&
    midNext.indexChanged === true, JSON.stringify(midNext));

  var atLast = WN.next(20, 19);
  check('next at the last Question stays (no card after the last)',
    atLast.index === 19 && atLast.atLast === true &&
    atLast.indexChanged === false, JSON.stringify(atLast));

  /* ── Last card: Finish, not Next ── */

  check('isLast true only on the final Question',
    WN.isLast(20, 19) === true &&
    WN.isLast(20, 0) === false && WN.isLast(20, 18) === false &&
    WN.isLast(0, 0) === false);
  check('the last card shows [Finish]: next() reports atLast so js/quiz.js swaps the control',
    WN.next(20, 19).atLast === true && WN.isLast(20, 19) === true);
  check('non-last cards show [Next]: neither next().atLast nor isLast',
    WN.next(20, 5).atLast === false && WN.isLast(20, 5) === false);

  /* ── Commit gate: [Finish] click is the single Completion trigger ── */

  var gate = WN.createCommitGate();
  check('gate refuses an incomplete bank',
    gate.fire(blank(20)).ok === false && gate.fire(blank(20)).reason === 'incomplete');
  check('gate has not fired while incomplete',
    gate.fired() === false);
  var ok = gate.fire(answers);
  check('gate fires exactly once on a complete bank with the analytics event',
    ok.ok === true && ok.event === 'quiz_completed', JSON.stringify(ok));
  check('gate refuses a double commit',
    gate.fire(answers).ok === false && gate.fire(answers).reason === 'already-fired');
  check('fired() reports the single commit',
    gate.fired() === true);
  gate.reset();
  check('reset (Retake) opens a new commit opportunity',
    gate.fired() === false && gate.fire(answers).ok === true);

  /* ── One-Option-per-Question invariant across a whole run ── */

  var run = blank(20);
  for (var i = 0; i < 20; i++) {
    var pick = WN.tapOption(run, i, i % 4);
    run[i] = pick.answer;   // caller records, one Option per Question
  }
  check('a full 20-Question run records exactly one Option per Question',
    run.every(function(x) { return x !== null; }) &&
    run.length === 20 && WN.canFinish(run) === true);
  check('every Question in the run holds a single 0-3 Option index',
    run.every(function(x, idx) { return x === idx % 4; }),
    JSON.stringify(run));
  // Re-running every Question as a revisit changes nothing but the picks:
  var stayCount = 0;
  for (var j = 0; j < 20; j++) {
    if (WN.tapOption(run, j, (j % 4 + 1) % 4).action === 'stay') stayCount++;
  }
  check('revisit taps on all 20 Questions never advance',
    stayCount === 20, 'stayed=' + stayCount);

  return results;
};
