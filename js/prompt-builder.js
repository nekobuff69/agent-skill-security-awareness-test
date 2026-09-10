(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  var FRAMING =
    'I took an agent-skill security self-assessment based on the OWASP Agentic Skills Top 10. Please act as my security educator and help me improve my habits, one area at a time.';

  var SESSION_RULES =
    '## How to Teach Me\n' +
    '- Ground your explanations in the linked OWASP pages\n' +
    '- Adapt depth to my level (I\'m learning)\n' +
    '- Cover one area at a time\n' +
    '- End each area with one concrete habit I can adopt';

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
    var framing = FRAMING;

    // --- Section 2: Profile ---
    var title = report.title || { name: 'Unknown', emoji: '?' };
    var percentage = report.percentage != null ? report.percentage : 0;

    var profile = '## My Profile\n' +
      'Title: ' + title.emoji + ' ' + title.name + '\n' +
      'Overall: ' + percentage + '%\n' +
      '\n' +
      'Per-AST Scores:';

    // Sort AST scores weakest-first (by percentage ascending)
    var astKeys = Object.keys(report.astScores || {});
    astKeys.sort(function(a, b) {
      return (report.astScores[a].percentage || 0) - (report.astScores[b].percentage || 0);
    });

    for (var i = 0; i < astKeys.length; i++) {
      var astId = astKeys[i];
      var ast = report.astScores[astId];
      profile += '\n- ' + astId + ': ' + ast.percentage + '% (' + ast.earned + '/' + ast.possible + ')';
    }

    // --- Section 3: Choices ---
    var weakestQuestions = (report.weakestQuestions || []).slice(0, 5);

    function buildChoices(questions, truncateScenarios) {
      var choices = '## Weakest Areas';
      for (var q = 0; q < questions.length; q++) {
        var wq = questions[q];
        var scenario = wq.scenario || '';
        if (truncateScenarios && scenario.length > 80) {
          scenario = scenario.substring(0, 80) + '...';
        }
        choices += '\n\n### ' + wq.id + ': ' + (wq.astRisks || []).join(', ');
        choices += '\nScenario: ' + scenario;
        choices += '\nI chose: ' + (wq.selectedOption && wq.selectedOption.text ? wq.selectedOption.text : '');
        choices += '\nBest Practice: ' + (wq.bestPractice || '');
        choices += '\nOWASP: ' + (wq.astSourceUrl || '');
      }
      return choices;
    }

    // --- Assemble full prompt ---
    function assemble(choices) {
      return framing + '\n\n' + profile + '\n\n' + choices + '\n\n' + SESSION_RULES;
    }

    var choicesText = buildChoices(weakestQuestions, false);
    var prompt = assemble(choicesText);

    // --- Budget enforcement ---
    if (prompt.length > 3000) {
      // Step 1: truncate scenarios to 80 chars
      choicesText = buildChoices(weakestQuestions, true);
      prompt = assemble(choicesText);
    }

    if (prompt.length > 3000) {
      // Step 2: remove weakest questions from bottom until under budget
      while (weakestQuestions.length > 1 && prompt.length > 3000) {
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
