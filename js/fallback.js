(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  // Chrome String lookup, resolved at call time so the Deterministic
  // Fallback prose localizes with the rest of the UI.
  function t(id, vars) {
    return globalThis.App.I18n.t(id, vars);
  }

  /** AST Risk display name — owned by the dictionary as 'ast.ASTnn'. */
  function riskName(astId) {
    return globalThis.App.I18n.astName(astId);
  }

  /**
   * Select the weakest AST Risks for the Action Plan:
   * all Blind Spots (below 70%), capped at 3–5.
   * If fewer than 3 Blind Spots, take all of them.
   * The report supplies the weakest-first order (astRanked); this only applies
   * the presentation cap from ADR-0009.
   */
  function selectWeakest(blindSpotIds) {
    if (!Array.isArray(blindSpotIds) || blindSpotIds.length === 0) return [];
    if (blindSpotIds.length <= 3) return blindSpotIds.slice();
    return blindSpotIds.slice(0, 5);
  }

  /**
   * Find all questions in the bank mapped to a given AST risk ID.
   */
  function questionsForRisk(bank, astId) {
    var result = [];
    for (var i = 0; i < bank.questions.length; i++) {
      var q = bank.questions[i];
      for (var j = 0; j < q.ast_risks.length; j++) {
        if (q.ast_risks[j] === astId) {
          result.push(q);
          break;
        }
      }
    }
    return result;
  }

  /**
   * Build a summary of the participant's behavior from weakestQuestions for a given risk.
   */
  function summarizeBehavior(weakQuestions, astId) {
    var matched = [];
    for (var i = 0; i < weakQuestions.length; i++) {
      var wq = weakQuestions[i];
      for (var j = 0; j < wq.astRisks.length; j++) {
        if (wq.astRisks[j] === astId) {
          matched.push(wq);
          break;
        }
      }
    }
    if (matched.length === 0) return t('fallback.behavior.none');
    var snippets = [];
    for (var k = 0; k < matched.length; k++) {
      var opt = matched[k].selectedOption;
      if (opt && opt.text) {
        var snippet = opt.text.length > 60
          ? opt.text.slice(0, 57) + t('fallback.ellipsis')
          : opt.text;
        snippets.push(t('fallback.quoteOpen') + snippet + t('fallback.quoteClose'));
      }
    }
    if (snippets.length === 0) return t('fallback.behavior.none');
    if (snippets.length === 1) return t('fallback.behavior.single', { quote: snippets[0] });
    var last = snippets.pop();
    return t('fallback.behavior.multiple', { list: snippets.join(', '), last: last });
  }

  /**
   * Build the narrative string.
   */
  function buildNarrative(weakIds, astScores, bank, weakQuestions) {
    var parts = [];
    for (var i = 0; i < weakIds.length; i++) {
      var astId = weakIds[i];
      var pct = astScores[astId].percentage;
      var risk = riskName(astId);
      var behavior = summarizeBehavior(weakQuestions, astId);

      var qs = questionsForRisk(bank, astId);
      var bestPractices = [];
      for (var j = 0; j < qs.length; j++) {
        if (qs[j].best_practice) bestPractices.push(qs[j].best_practice);
      }
      var insight = bestPractices.length > 0
        ? bestPractices[0]
        : t('fallback.insight.generic', { risk: risk });

      parts.push(t('fallback.narrative.item', {
        risk: risk,
        percentage: pct,
        behavior: behavior,
        insight: insight
      }));
    }
    return parts.join('\n\n');
  }

  /**
   * Derive a concise action title from best practices for a risk.
   */
  function deriveTitle(bank, astId) {
    var risk = riskName(astId);
    var qs = questionsForRisk(bank, astId);
    if (qs.length === 0) return t('fallback.action.title', { risk: risk });

    // Default to "Improve {risk_name}" — the most concise, clear pattern
    return t('fallback.action.title', { risk: risk });
  }

  /**
   * Build actions array.
   */
  function buildActions(weakIds, bank) {
    var actions = [];
    for (var i = 0; i < weakIds.length; i++) {
      var astId = weakIds[i];
      var risk = riskName(astId);
      var qs = questionsForRisk(bank, astId);

      var bestPractices = [];
      for (var j = 0; j < qs.length; j++) {
        if (qs[j].best_practice) bestPractices.push(qs[j].best_practice);
      }

      // Build description from 1–2 best practices
      var descriptionParts = [];
      var limit = Math.min(2, bestPractices.length);
      for (var k = 0; k < limit; k++) {
        descriptionParts.push(bestPractices[k]);
      }
      if (descriptionParts.length === 0) {
        descriptionParts.push(
          t('fallback.action.description.generic', { risk: risk })
        );
      }
      descriptionParts.push(t('fallback.action.description.owaspRef'));
      var description = descriptionParts.join(' ');

      actions.push({
        priority: i + 1,
        title: deriveTitle(bank, astId),
        description: description,
        ast_source: astId + ': ' + risk
      });
    }
    return actions;
  }

  /**
   * Assemble a deterministic fallback action plan from a scoring report and question bank.
   *
   * @param {object} report - Scoring report with astScores, weakestQuestions, percentage, etc.
   * @param {object} bank   - Parsed questions.json
   * @returns {{ narrative: string, actions: Array }}
   */
  function assemble(report, bank) {
    if (!report || !report.astScores || !bank || !Array.isArray(bank.questions)) {
      return { narrative: '', actions: [] };
    }

    var weakIds = selectWeakest(report.blindSpotIds);

    if (weakIds.length === 0) {
      return {
        narrative: t('fallback.narrative.clear', { percentage: report.percentage || 0 }),
        actions: []
      };
    }

    var weakQuestions = report.weakestQuestions || [];
    var narrative = buildNarrative(weakIds, report.astScores, bank, weakQuestions);
    var actions = buildActions(weakIds, bank);

    return { narrative: narrative, actions: actions };
  }

  // --- Exports ---
  globalThis.App.FallbackAssembler = {
    assemble: assemble
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.FallbackAssembler;
  }
})(globalThis);
