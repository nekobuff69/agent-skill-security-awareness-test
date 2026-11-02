/**
 * Wizard navigation — the state behind the Question Card's commit flow.
 * Ticket #40, ADR 0020: answering auto-advances only the FIRST time a
 * Question is answered; any later pick on the same Question re-marks the
 * radio and overwrites the stored answer without moving the card, and
 * Completion fires only when the Participant presses [Finish].
 *
 * Pure module: no DOM, no timers. Every function takes the current state
 * as arguments and returns a decision for the caller (js/quiz.js) to act
 * on — which is what makes it testable headless through the module seam.
 *
 * The answers array is the quiz's own (null | 0-3), passed by reference so
 * decisions can be computed against live state; this module never mutates
 * it — the caller writes `result.answer` into `answers[qIdx]` itself, so
 * the one-Option-per-Question invariant (ADR 0017) stays in one place.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /** Whether a Question still lacks a pick. */
  function wasAnswered(answers, qIdx) {
    return answers[qIdx] !== null && answers[qIdx] !== undefined;
  }

  /**
   * Decide what an Option tap means.
   *
   * Unanswered Question  → record + advance. On the last Question there is
   * no card left to advance to: the decision stays put and instead asks
   * the caller to run the 100% Progress Fill beat and then focus [Finish]
   * (`finishReady`). Completion itself never happens here — it is a
   * [Finish] click, nothing else.
   *
   * Answered Question    → re-mark and overwrite only. The card must not
   * move, so a Participant browsing with Back/Next can switch picks freely
   * until they commit.
   *
   * @param {Array}  answers - length = question count, null | 0-3
   * @param {number} qIdx    - Question being tapped
   * @param {number} optIdx  - Option tapped
   * @returns {{action:'advance'|'stay', answer:number, wasAnswered:boolean, finishReady:boolean}}
   */
  function tapOption(answers, qIdx, optIdx) {
    var answered = wasAnswered(answers, qIdx);
    var last = isLast(answers.length, qIdx);
    return {
      action: answered || last ? 'stay' : 'advance',
      answer: optIdx,
      wasAnswered: answered,
      // Focus [Finish] only on the first fill of the last Question; a
      // re-mark on a revisit leaves focus where the Participant put it.
      finishReady: !answered && last
    };
  }

  /** [Finish] is enabled iff every Question has an Option selected. */
  function canFinish(answers) {
    if (!Array.isArray(answers) || answers.length === 0) return false;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] === null || answers[i] === undefined) return false;
    }
    return true;
  }

  /** Whether qIdx is the final Question of the bank. */
  function isLast(count, qIdx) {
    return count > 0 && qIdx === count - 1;
  }

  /**
   * Next beyond the last Question does not exist — the caller shows
   * [Finish] instead. `indexChanged: false` says "stay".
   */
  function next(count, qIdx) {
    var atLast = isLast(count, qIdx);
    return {
      index: atLast ? qIdx : qIdx + 1,
      atLast: atLast,
      indexChanged: !atLast
    };
  }

  /** Back before the first Question does not exist — "stay". */
  function prev(count, qIdx) {
    var atFirst = qIdx <= 0;
    return {
      index: atFirst ? qIdx : qIdx - 1,
      atFirst: atFirst,
      indexChanged: !atFirst
    };
  }

  /**
   * Commit gate for [Finish]. Completion fires exactly once per session:
   * a second call is refused until `reset()` (Retake starts a new one).
   * The caller — the Finish handler in js/quiz.js — does the scoring,
   * Progress Fill beat and results hand-off; this gate only guards the
   * single-fire contract so the DOM and the state machine cannot drift.
   */
  function createCommitGate() {
    var fired = false;
    return {
      /** @returns {{ok:boolean, reason?:'incomplete'|'already-fired', event?:'quiz_completed'}} */
      fire: function(answers) {
        if (!canFinish(answers)) return { ok: false, reason: 'incomplete' };
        if (fired) return { ok: false, reason: 'already-fired' };
        fired = true;
        return { ok: true, event: 'quiz_completed' };
      },
      fired: function() { return fired; },
      reset: function() { fired = false; }
    };
  }

  app.WizardNav = {
    tapOption: tapOption,
    canFinish: canFinish,
    isLast: isLast,
    next: next,
    prev: prev,
    createCommitGate: createCommitGate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.App.WizardNav;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
