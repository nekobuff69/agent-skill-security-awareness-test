(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  /**
   * Compute scores for a quiz session.
   *
   * The report carries no tier or grade for presentation: `percentage`
   * and the score numbers are internal anchors (blind-spot thresholds,
   * the tutor prompts), while the user-facing identity of a result is
   * `type` — one of six attention types derived from the SHAPE of the
   * three-axis profile, never its level.
   *
   * @param {object} bank      - Parsed questions.json (questions[], phases[], meta.scoring)
   * @param {Array}  selections - Array of 20 option indices (0-3), one per question in bank.questions order.
   *                               null → resolve to highest-score option (ties → lowest index)
   * @returns {{ ok: true, report: object } | { ok: false, error: string }}
   */
  function computeScores(bank, selections) {
    // --- Input validation ---
    if (!Array.isArray(selections) || selections.length === 0) {
      return { ok: false, error: 'Selections must be a non-empty array.' };
    }
    if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) {
      return { ok: false, error: 'Bank must have a non-empty questions array.' };
    }
    if (selections.length < bank.questions.length) {
      return { ok: false, error: 'Selections array is too short: expected ' + bank.questions.length + ', got ' + selections.length + '.' };
    }

    var questions = bank.questions;
    var severityValues = bank.meta.scoring.severity_values;

    for (var i = 0; i < selections.length; i++) {
      var sel = selections[i];
      if (sel !== null) {
        if (typeof sel !== 'number' || Math.floor(sel) !== sel) {
          return { ok: false, error: 'Selection at index ' + i + ' must be an integer or null, got ' + sel + '.' };
        }
        if (sel < 0 || sel >= questions[i].options.length) {
          return { ok: false, error: 'Selection at index ' + i + ' is out of range (0-' + (questions[i].options.length - 1) + '): ' + sel + '.' };
        }
      }
    }

    // --- Resolve selections ---
    var resolved = [];
    for (var i = 0; i < selections.length; i++) {
      var sel = selections[i];
      if (sel === null) {
        // Highest-score option, ties → lowest index
        var bestIdx = 0;
        for (var j = 1; j < questions[i].options.length; j++) {
          if (questions[i].options[j].score > questions[i].options[bestIdx].score) {
            bestIdx = j;
          }
        }
        resolved.push(bestIdx);
      } else {
        resolved.push(sel);
      }
    }

    // --- Compute per-question scores ---
    var totalEarned = 0;
    var totalPossible = 0;
    var questionResults = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var optionScore = q.options[resolved[i]].score;
      var severityWeight = severityValues[q.severity_weight];
      var weightedScore = optionScore * severityWeight;
      var maxOptionScore = 0;
      var bestOptionIndex = 0;
      for (var j = 0; j < q.options.length; j++) {
        if (q.options[j].score > maxOptionScore) {
          maxOptionScore = q.options[j].score;
          bestOptionIndex = j;
        }
      }
      var maxPossible = maxOptionScore * severityWeight;

      totalEarned += weightedScore;
      totalPossible += maxPossible;

      questionResults.push({
        id: q.id,
        weightedScore: weightedScore,
        maxPossible: maxPossible,
        optionScore: optionScore,
        maxScore: maxOptionScore,
        selectedOption: q.options[resolved[i]],
        bestOption: q.options[bestOptionIndex],
        scenario: q.scenario,
        question: q.question,
        bestPractice: q.best_practice,
        astSourceUrl: q.ast_source_url,
        astRisks: q.ast_risks
      });
    }

    // --- Total possible invariant ---
    if (totalPossible !== 108) {
      throw new Error(
        'Scoring invariant violated: total_possible=' + totalPossible + ' but expected 108. ' +
        'The questions bank may be corrupted or modified.'
      );
    }

    // --- Percentage (internal anchor: drives blind-spot thresholds and
    //     the axis profile; never rendered as a headline grade) ---
    var percentage = Math.round((totalEarned / totalPossible) * 1000) / 10;

    // --- AST Scores ---
    var astAggregates = {};
    for (var i = 0; i < questionResults.length; i++) {
      var qr = questionResults[i];
      for (var a = 0; a < qr.astRisks.length; a++) {
        var astId = qr.astRisks[a];
        if (!astAggregates[astId]) {
          astAggregates[astId] = { earned: 0, possible: 0 };
        }
        astAggregates[astId].earned += qr.weightedScore;
        astAggregates[astId].possible += qr.maxPossible;
      }
    }

    var astScores = {};
    var astKeys = Object.keys(astAggregates).sort();
    for (var k = 0; k < astKeys.length; k++) {
      var astId = astKeys[k];
      var agg = astAggregates[astId];
      astScores[astId] = {
        earned: agg.earned,
        possible: agg.possible,
        percentage: Math.round((agg.earned / agg.possible) * 1000) / 10
      };
    }

    // --- Weakest Questions ---
    // Filter: chosen option's score is 0 or 1
    var weakCandidates = [];
    for (var i = 0; i < questionResults.length; i++) {
      var qr = questionResults[i];
      if (qr.optionScore <= 1) {
        weakCandidates.push(qr);
      }
    }
    // Sort by weightedScore ascending (worst first)
    weakCandidates.sort(function(a, b) {
      return a.weightedScore - b.weightedScore;
    });
    // Take up to 5
    var weakestQuestions = [];
    var count = Math.min(5, weakCandidates.length);
    for (var i = 0; i < count; i++) {
      var wc = weakCandidates[i];
      weakestQuestions.push({
        id: wc.id,
        scenario: wc.scenario,
        question: wc.question,
        selectedOption: wc.selectedOption,
        optionScore: wc.optionScore,
        maxScore: wc.maxScore,
        bestOption: wc.bestOption,
        bestPractice: wc.bestPractice,
        astSourceUrl: wc.astSourceUrl,
        astRisks: wc.astRisks
      });
    }

    // --- Ranked views ---
    // Weakest-first, deterministic tie-break by AST ID ascending.
    // The report owns the Blind Spot order so consumers never re-sort.
    var astRanked = [];
    for (var k2 = 0; k2 < astKeys.length; k2++) {
      var rankedId = astKeys[k2];
      var rankedAgg = astAggregates[rankedId];
      astRanked.push({
        id: rankedId,
        earned: rankedAgg.earned,
        possible: rankedAgg.possible,
        percentage: Math.round((rankedAgg.earned / rankedAgg.possible) * 1000) / 10
      });
    }
    astRanked.sort(function(a, b) {
      return (a.percentage - b.percentage) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    // --- Blind Spots ---
    // The <70% boundary defines a Blind Spot (a low AST Score).
    var blindSpotIds = [];
    for (var k3 = 0; k3 < astRanked.length; k3++) {
      if (astRanked[k3].percentage < 70) blindSpotIds.push(astRanked[k3].id);
    }

    // --- Attention Axes ---
    // The ten AST Scores aggregate into three behavioral axes (registry:
    // js/ast.js). A question mapped to risks from two axes feeds both —
    // the same earned/possible pair, exactly like the AST aggregation
    // above. Axis display names are Chrome Strings ('axis.*').
    var ASTReg = (typeof globalThis.App === 'object' && globalThis.App && globalThis.App.AST) || {};
    var axisOrder = (ASTReg.axisOrder) || ['INTAKE', 'EXPOSURE', 'UPKEEP'];
    var axisOf = ASTReg.axisOf || {};
    var axisAggregates = {};
    for (var ax = 0; ax < axisOrder.length; ax++) {
      axisAggregates[axisOrder[ax]] = { earned: 0, possible: 0 };
    }
    for (var i2 = 0; i2 < questionResults.length; i2++) {
      var qr2 = questionResults[i2];
      var seenAxis = {};
      for (var r2 = 0; r2 < qr2.astRisks.length; r2++) {
        var axis = axisOf[qr2.astRisks[r2]];
        if (!axis || seenAxis[axis]) continue;
        seenAxis[axis] = true;
        axisAggregates[axis].earned += qr2.weightedScore;
        axisAggregates[axis].possible += qr2.maxPossible;
      }
    }
    var axisScores = {};
    var axisRanked = [];
    for (var ax2 = 0; ax2 < axisOrder.length; ax2++) {
      var axisId = axisOrder[ax2];
      var axisAgg = axisAggregates[axisId];
      var axisPct = axisAgg.possible > 0
        ? Math.round((axisAgg.earned / axisAgg.possible) * 1000) / 10
        : 0;
      axisScores[axisId] = {
        earned: axisAgg.earned,
        possible: axisAgg.possible,
        percentage: axisPct
      };
      axisRanked.push({ id: axisId, earned: axisAgg.earned, possible: axisAgg.possible, percentage: axisPct });
    }

    // --- Type ---
    // The type reads the SHAPE of the axis profile, never its level:
    // the weakest axis is where attention rarely goes, the strongest is
    // where it lives. Ties break by canonical axis order (first wins for
    // weakest, first among the remaining wins for strongest) — fully
    // deterministic. Six (weak, strong) pairings exist with three axes;
    // the pair can never collapse because weak != strong.
    var rankedByPct = axisRanked.slice().sort(function(a, b) {
      return (a.percentage - b.percentage) ||
        (axisOrder.indexOf(a.id) - axisOrder.indexOf(b.id));
    });
    var weakAxis = rankedByPct[0].id;
    var strongAxis = rankedByPct[rankedByPct.length - 1].id;
    if (strongAxis === weakAxis) {
      // Degenerate only if fewer than two axes carry weight — fall back
      // to canonical neighbour order rather than emitting an invalid pair.
      for (var ax3 = 0; ax3 < axisOrder.length; ax3++) {
        if (axisOrder[ax3] !== weakAxis) { strongAxis = axisOrder[ax3]; break; }
      }
    }
    var typeId = classifyType(weakAxis, strongAxis);

    // --- Build report ---
    var report = {
      percentage: percentage,           // internal anchor, never rendered
      type: {
        id: typeId,
        weakAxis: weakAxis,
        strongAxis: strongAxis
      },
      axisScores: axisScores,
      axisRanked: axisRanked,
      astScores: astScores,
      astRanked: astRanked,
      blindSpotIds: blindSpotIds,
      weakestQuestions: weakestQuestions,
      totalEarned: totalEarned,
      totalPossible: totalPossible
    };

    return { ok: true, report: report };
  }

  /**
   * The six attention types — one per (weakest axis, strongest axis)
   * pairing of the three Attention Axes. Type ids are stable structure;
   * the MBTI-style letter code, type names, emojis and mottos are Chrome
   * Strings ('type.T1.code'…) owned by the dictionaries. No type ranks
   * above another: each describes where the participant's attention
   * lives and where it rarely goes.
   */
  var TYPE_IDS = {
    'INTAKE>EXPOSURE': 'T1',     // attention on exposure, rarely on intake
    'INTAKE>UPKEEP': 'T2',
    'EXPOSURE>INTAKE': 'T3',
    'EXPOSURE>UPKEEP': 'T4',
    'UPKEEP>INTAKE': 'T5',
    'UPKEEP>EXPOSURE': 'T6'
  };

  function classifyType(weakAxis, strongAxis) {
    var id = TYPE_IDS[weakAxis + '>' + strongAxis];
    if (!id) throw new Error('classifyType: unknown axis pair ' + weakAxis + '>' + strongAxis);
    return id;
  }

  // --- Exports ---
  globalThis.App.Scoring = {
    computeScores: computeScores
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.Scoring;
  }
})(globalThis);
