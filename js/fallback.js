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
   * The participant's weak questions mapped to one risk, in report order.
   */
  function matchedWeakQuestions(weakQuestions, astId) {
    var matched = [];
    if (!Array.isArray(weakQuestions)) return matched;
    for (var i = 0; i < weakQuestions.length; i++) {
      var wq = weakQuestions[i];
      var risks = wq.astRisks || [];
      for (var j = 0; j < risks.length; j++) {
        if (risks[j] === astId) {
          matched.push(wq);
          break;
        }
      }
    }
    return matched;
  }

  /**
   * The best practice to act on for one risk: the participant's weakest
   * question's practice when one exists (personalized), else the first
   * bank question mapped to the risk.
   */
  function bestPracticeFor(bank, astId, weakQuestions) {
    var matched = matchedWeakQuestions(weakQuestions, astId);
    if (matched.length > 0 && matched[0].bestPractice) {
      return matched[0].bestPractice;
    }
    var qs = questionsForRisk(bank, astId);
    for (var i = 0; i < qs.length; i++) {
      if (qs[i].best_practice) return qs[i].best_practice;
    }
    return '';
  }

  /**
   * Build a summary of the participant's behavior from weakestQuestions for a given risk.
   */
  function summarizeBehavior(weakQuestions, astId) {
    var matched = matchedWeakQuestions(weakQuestions, astId);
    if (matched.length === 0) return t('fallback.behavior.none');
    var snippets = [];
    for (var k = 0; k < matched.length; k++) {
      var opt = matched[k].selectedOption;
      if (opt && opt.text) {
        snippets.push(t('fallback.quoteOpen') + opt.text + t('fallback.quoteClose'));
      }
    }
    if (snippets.length === 0) return t('fallback.behavior.none');
    if (snippets.length === 1) return t('fallback.behavior.single', { quote: snippets[0] });
    var last = snippets.pop();
    return t('fallback.behavior.multiple', { list: snippets.join(', '), last: last });
  }

  /**
   * Action titles are curated per-risk Chrome Strings ('action.AST01'…
   * 'action.AST10' in the locale dictionary) — a short imperative label
   * that paraphrases the practice rather than repeating its first clause,
   * so the title and the description never duplicate each other.
   */
  function deriveTitle(astId) {
    return t('action.' + astId);
  }

  /**
   * Build the narrative string: one short paragraph per weak risk that
   * has a specific answer to point at; risks without one are merged
   * into a single closing line so the paragraph shapes never repeat.
   */
  function buildNarrative(weakIds, astScores, bank, weakQuestions) {
    var parts = [];
    var quietIds = [];
    for (var i = 0; i < weakIds.length; i++) {
      var astId = weakIds[i];
      var pct = astScores[astId].percentage;
      var risk = riskName(astId);
      var matched = matchedWeakQuestions(weakQuestions, astId);
      var hasChoice = matched.some(function(wq) {
        return wq.selectedOption && wq.selectedOption.text;
      });
      if (!hasChoice) {
        quietIds.push(risk);
        continue;
      }
      parts.push(t('fallback.narrative.item', {
        risk: risk,
        percentage: pct,
        behavior: summarizeBehavior(weakQuestions, astId)
      }));
    }
    if (quietIds.length > 0) {
      parts.push(t('fallback.narrative.others', { risks: quietIds.join(t('fallback.listSep')) }));
    }
    return parts.join('\n\n');
  }

  /**
   * Build actions array. Each action is one concrete practice — no
   * backstory: the participant's answers and their analysis live in the
   * narrative, never in the action rows.
   */
  function buildActions(weakIds, bank, weakQuestions) {
    var actions = [];
    for (var i = 0; i < weakIds.length; i++) {
      var astId = weakIds[i];
      var risk = riskName(astId);
      var practice = bestPracticeFor(bank, astId, weakQuestions);
      var description = practice ||
        t('fallback.action.description.generic', { risk: risk });

      actions.push({
        priority: i + 1,
        title: deriveTitle(astId),
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
    var actions = buildActions(weakIds, bank, weakQuestions);

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
