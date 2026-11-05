(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};


  // Chrome String lookup, resolved inside build() so the Deep-Dive Prompt
  // localizes with the rest of the UI.
  function t(id, vars) {
    return globalThis.App.I18n.t(id, vars);
  }

  /**
   * Build the Deep-Dive Prompt from a scoring report.
   *
   * @param {object} report - The inner report object (not the {ok, report} wrapper).
   * @returns {string} The assembled prompt, ≤ 3000 chars.
   */
  function build(report) {
    if (!report || typeof report !== 'object') {
      throw new Error('build() requires a report object');
    }

    // --- Section 1: Framing ---
    var framing = t('prompt.framing');

    // --- Section 2: Profile ---
    // The tutor sees the five-letter attention code and the raw
    // earned/possible counts per trait dimension — the same objective
    // data as before, framed as attention shares rather than grades. No
    // title, no overall percentage: the profile starts from where
    // attention lives.
    var profilePicks = report.profile || [];
    var code = '';
    for (var p = 0; p < profilePicks.length; p++) {
      code += t('trait.' + profilePicks[p].trait + '.' + profilePicks[p].pole + '.code');
    }

    var profile = t('prompt.profile.heading') + '\n' +
      t('prompt.profile.type', { type: code }) + '\n' +
      '\n' +
      t('prompt.profile.axes');

    // Weakest-first order comes from the report — the Scoring Engine owns ranking.
    var traitRanked = (report && report.traitRanked) || [];
    for (var a = 0; a < traitRanked.length; a++) {
      var tr = traitRanked[a];
      profile += '\n' + t('prompt.profile.axisLine', {
        axis: t('trait.' + tr.id + '.name'),
        earned: tr.earned,
        possible: tr.possible
      });
    }

    profile += '\n\n' + t('prompt.profile.astScores');

    // Weakest-first order comes from the report — the Scoring Engine owns ranking.
    var astRanked = (report && report.astRanked) || [];
    for (var i = 0; i < astRanked.length; i++) {
      var r = astRanked[i];
      profile += '\n' + t('prompt.profile.astLine', { id: r.id, earned: r.earned, possible: r.possible });
    }

    // --- Section 3: Choices ---
    var weakestQuestions = (report.weakestQuestions || []).slice(0, 5);

    function buildChoices(questions, scenarioCap) {
      var choices = t('prompt.weakest.heading');
      for (var q = 0; q < questions.length; q++) {
        var wq = questions[q];
        var scenario = wq.scenario || '';
        if (scenarioCap && scenario.length > scenarioCap) {
          scenario = scenario.substring(0, scenarioCap) + t('fallback.ellipsis');
        }
        choices += '\n\n### ' + wq.id + ': ' + (wq.astRisks || []).join(', ');
        choices += '\n' + t('prompt.item.scenario', { text: scenario });
        // The choice itself is the material — no per-choice score line:
        // the tutor teaches from the choice and the stronger answer.
        if (wq.selectedOption && wq.selectedOption.text) {
          choices += '\n' + t('prompt.item.chose', { text: wq.selectedOption.text });
        }
        // The stronger answer with its reason — the tutor's first teaching
        // material. Only rendered when the report carries a best option.
        if (wq.bestOption && wq.bestOption.text) {
          choices += '\n' + t('prompt.item.better', {
            text: wq.bestOption.text,
            reason: (wq.bestOption.feedback || '').trim()
          });
        }
        choices += '\n' + t('prompt.item.bestPractice', { text: (wq.bestPractice || '') });
        choices += '\n' + t('prompt.item.owasp', { url: (wq.astSourceUrl || '') });
      }
      return choices;
    }

    // --- Assemble full prompt ---
    function assemble(choices) {
      return framing + '\n\n' + profile + '\n\n' + choices + '\n\n' + t('prompt.sessionRules');
    }

    // Scenarios clip to 120 chars by default; the budget ladder's first
    // step tightens that to 80 before any question is dropped.
    var choicesText = buildChoices(weakestQuestions, 120);
    var prompt = assemble(choicesText);

    // --- Budget enforcement ---
    var budget = t('prompt.budget');
    if (prompt.length > budget) {
      // Step 1: truncate scenarios to 80 chars
      choicesText = buildChoices(weakestQuestions, 80);
      prompt = assemble(choicesText);
    }

    if (prompt.length > budget) {
      // Step 2: remove weakest questions from bottom until under budget
      while (weakestQuestions.length > 1 && prompt.length > budget) {
        weakestQuestions.pop();
        choicesText = buildChoices(weakestQuestions, 80);
        prompt = assemble(choicesText);
      }
    }

    return prompt;
  }

  // --- Exports ---
  globalThis.App.PromptBuilder = {
    build: build
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.PromptBuilder;
  }
})(globalThis);
