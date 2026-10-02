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
    var title = report.title || {
      name: t('prompt.titleFallback'),
      emoji: t('prompt.titleFallbackEmoji')
    };
    var percentage = report.percentage != null ? report.percentage : 0;

    var profile = t('prompt.profile.heading') + '\n' +
      t('prompt.profile.title', { title: title.emoji + ' ' + title.name }) + '\n' +
      t('prompt.profile.overall', { percentage: percentage }) + '\n' +
      '\n' +
      t('prompt.profile.astScores');

    // Weakest-first order comes from the report — the Scoring Engine owns ranking.
    var astRanked = (report && report.astRanked) || [];
    for (var i = 0; i < astRanked.length; i++) {
      var r = astRanked[i];
      profile += '\n- ' + r.id + ': ' + r.percentage + '% (' + r.earned + '/' + r.possible + ')';
    }

    // --- Section 3: Choices ---
    var weakestQuestions = (report.weakestQuestions || []).slice(0, 5);

    function buildChoices(questions, truncateScenarios) {
      var choices = t('prompt.weakest.heading');
      for (var q = 0; q < questions.length; q++) {
        var wq = questions[q];
        var scenario = wq.scenario || '';
        if (truncateScenarios && scenario.length > 80) {
          scenario = scenario.substring(0, 80) + t('fallback.ellipsis');
        }
        choices += '\n\n### ' + wq.id + ': ' + (wq.astRisks || []).join(', ');
        choices += '\n' + t('prompt.item.scenario', { text: scenario });
        choices += '\n' + t('prompt.item.chose', { text: (wq.selectedOption && wq.selectedOption.text ? wq.selectedOption.text : '') });
        choices += '\n' + t('prompt.item.bestPractice', { text: (wq.bestPractice || '') });
        choices += '\n' + t('prompt.item.owasp', { url: (wq.astSourceUrl || '') });
      }
      return choices;
    }

    // --- Assemble full prompt ---
    function assemble(choices) {
      return framing + '\n\n' + profile + '\n\n' + choices + '\n\n' + t('prompt.sessionRules');
    }

    var choicesText = buildChoices(weakestQuestions, false);
    var prompt = assemble(choicesText);

    // --- Budget enforcement ---
    var budget = t('prompt.budget');
    if (prompt.length > budget) {
      // Step 1: truncate scenarios to 80 chars
      choicesText = buildChoices(weakestQuestions, true);
      prompt = assemble(choicesText);
    }

    if (prompt.length > budget) {
      // Step 2: remove weakest questions from bottom until under budget
      while (weakestQuestions.length > 1 && prompt.length > budget) {
        weakestQuestions.pop();
        choicesText = buildChoices(weakestQuestions, true);
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
