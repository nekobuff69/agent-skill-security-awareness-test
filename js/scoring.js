(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  /**
   * Compute scores for a quiz session.
   *
   * The report carries no tier or grade for presentation: `percentage`
   * and the score numbers are internal anchors (blind-spot thresholds,
   * the tutor prompts), while the user-facing identity of a result is
   * `profile` — five trait-dimension pole picks that the render layer
   * composes into a five-letter code plus one trait phrase per
   * dimension (ADR 0026).
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

    // --- Trait Dimensions ---
    // The ten AST Scores aggregate into five fine-grained behavioral
    // dimensions (registry: js/ast.js). A question mapped to risks from
    // two dimensions feeds both — the same earned/possible pair, exactly
    // like the AST aggregation above. Display names and pole phrases are
    // Chrome Strings ('trait.*').
    var ASTReg = (typeof globalThis.App === 'object' && globalThis.App && globalThis.App.AST) || {};
    var traitOrder = (ASTReg.traitOrder) ||
      ['VETTING', 'PRIVILEGE', 'HYGIENE', 'CURRENT', 'MAPPED'];
    var traitOf = ASTReg.traitOf || {};
    var traitAggregates = {};
    for (var tx = 0; tx < traitOrder.length; tx++) {
      traitAggregates[traitOrder[tx]] = { earned: 0, possible: 0 };
    }
    for (var i2 = 0; i2 < questionResults.length; i2++) {
      var qr2 = questionResults[i2];
      var seenTrait = {};
      for (var r2 = 0; r2 < qr2.astRisks.length; r2++) {
        var trait = traitOf[qr2.astRisks[r2]];
        if (!trait || seenTrait[trait]) continue;
        seenTrait[trait] = true;
        traitAggregates[trait].earned += qr2.weightedScore;
        traitAggregates[trait].possible += qr2.maxPossible;
      }
    }
    var traitScores = {};
    var traitRanked = [];
    for (var tx2 = 0; tx2 < traitOrder.length; tx2++) {
      var traitId = traitOrder[tx2];
      var traitAgg = traitAggregates[traitId];
      var traitPct = traitAgg.possible > 0
        ? Math.round((traitAgg.earned / traitAgg.possible) * 1000) / 10
        : 0;
      traitScores[traitId] = {
        earned: traitAgg.earned,
        possible: traitAgg.possible,
        percentage: traitPct
      };
      traitRanked.push({ id: traitId, earned: traitAgg.earned, possible: traitAgg.possible, percentage: traitPct });
    }

    // --- Profile (the type) ---
    // MBTI mechanics, honestly derived: each dimension carries two poles
    // — the attentive pole (≥50% of that dimension's own scale) and the
    // drifting pole (<50%). The participant's five pole picks compose
    // into the type: the render layer assembles the five-letter code
    // (one pole letter per dimension, in registry order) and the one
    // trait phrase per dimension from the dictionary — the code and the
    // phrases ARE the type; there is no nickname to translate. Pole
    // letters and phrases are Chrome Strings ('trait.X.hi.code'…).
    // Exactly 50% counts as the attentive pole: attention paid wins ties.
    var profile = [];
    for (var px = 0; px < traitOrder.length; px++) {
      var pTrait = traitOrder[px];
      var pPct = traitScores[pTrait].percentage;
      profile.push({
        trait: pTrait,
        pole: pPct >= 50 ? 'hi' : 'lo',
        percentage: pPct
      });
    }

    // --- Build report ---
    var report = {
      percentage: percentage,           // internal anchor, never rendered
      profile: profile,                 // [{trait, pole, percentage}] — the type
      traitScores: traitScores,
      traitRanked: traitRanked,
      astScores: astScores,
      astRanked: astRanked,
      blindSpotIds: blindSpotIds,
      weakestQuestions: weakestQuestions,
      totalEarned: totalEarned,
      totalPossible: totalPossible
    };

    return { ok: true, report: report };
  }

  // --- Exports ---
  globalThis.App.Scoring = {
    computeScores: computeScores
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.Scoring;
  }
})(globalThis);
