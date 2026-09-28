(function(global) {
  'use strict';

  global.App = global.App || {};

  /**
   * Action Plan module.
   *
   * One interface for the two plan paths (LLM Path, Deterministic Fallback):
   * the caller hands over a scoring report, the Question Bank, the Grounding
   * Corpus, and app config; the module decides the path, applies the retry
   * policy, and resolves with the Narrative and Actions either way.
   *
   * @param {object} report - Inner report from App.Scoring.computeScores()
   * @param {object} bank   - Parsed questions.json
   * @param {string|null} corpus - Grounding Corpus text (null → fallback)
   * @param {object} config - APP_CONFIG ({ proxyUrl, timeoutMs })
   * @returns {Promise<{ ok: true, narrative: string, actions: object[], path: 'llm'|'fallback' }>}
   */
  function assemble(report, bank, corpus, config) {
    var proxyUrl = config && config.proxyUrl;

    // No proxy or no corpus → the Deterministic Fallback, straight away
    if (!proxyUrl || !corpus || !report) {
      return Promise.resolve(fallbackResult(report, bank));
    }

    var astRanked = report.astRanked || [];
    var weakAstIds = astRanked
      .slice(0, Math.min(5, astRanked.length))
      .map(function(r) { return r.id; });

    var excerpts = global.App.Extractor.extract(corpus, weakAstIds);
    var prompt = buildLlmPrompt(report, bank, excerpts);

    function track(event) {
      if (global.App.Analytics && typeof global.App.Analytics.track === 'function') {
        global.App.Analytics.track(event);
      }
    }

    function attempt() {
      var llm = global.App.LLMClient;
      return llm.generate(prompt, config, bank);
    }

    // ADR-0009: one retry, then the Deterministic Fallback
    return attempt()
      .then(function(first) {
        if (first && first.ok) {
          track('llm_success');
          return { ok: true, narrative: first.narrative, actions: first.actions, path: 'llm' };
        }
        return attempt().then(function(second) {
          if (second && second.ok) {
            track('llm_success');
            return { ok: true, narrative: second.narrative, actions: second.actions, path: 'llm' };
          }
          track('llm_fallback');
          return fallbackResult(report, bank);
        });
      })
      .catch(function() {
        track('llm_fallback');
        return fallbackResult(report, bank);
      });
  }

  function fallbackResult(report, bank) {
    var fb = global.App.FallbackAssembler.assemble(report, bank);
    return { ok: true, narrative: fb.narrative, actions: fb.actions, path: 'fallback' };
  }

  /**
   * Build the LLM Path prompt: participant profile + Weakest Questions +
   * Grounding Excerpts, with the grounding rules and output contract.
   */
  function buildLlmPrompt(report, bank, excerpts) {
    var AST = global.App.AST || { names: {}, severity: {} };
    var title = report.title || { name: 'Unknown', emoji: '?' };
    var percentage = report.percentage != null ? report.percentage : 0;

    // --- System Instruction ---
    var prompt =
      '## System Instruction\n\n' +
      'You are a security advisor analyzing a user\'s self-assessment results\n' +
      'on AI agent skill security, based on the OWASP Agentic Skills Top 10.\n\n' +
      'Your task: generate a personalized risk assessment and action plan.\n\n' +
      'RULES:\n\n' +
      '- Every factual claim MUST trace to the provided OWASP source material\n' +
      '- Do NOT invent attack scenarios or statistics not in the source\n' +
      '- Do NOT fabricate OWASP recommendations \u2014 use only what\'s provided\n' +
      '- If the source material doesn\'t cover a specific situation, say so\n' +
      '- Write for a non-technical audience \u2014 plain language, no jargon\n' +
      '- Tone: helpful advisor, not alarmist or condescending\n\n';

    // --- Participant Data ---
    prompt +=
      '## Participant Data\n\n' +
      'Title: ' + title.emoji + ' ' + title.name + '\n' +
      'Overall: ' + percentage + '%\n\n';

    // Per-AST scores, weakest first (order owned by the Scoring report)
    var astRanked = report.astRanked || [];
    prompt += 'Per-AST Scores:\n';
    for (var i = 0; i < astRanked.length; i++) {
      var r = astRanked[i];
      var riskName = AST.names[r.id] || r.id;
      prompt += '- ' + r.id + ' (' + riskName + ', ' + (AST.severity[r.id] || 'medium') + '): ' +
        r.earned + '/' + r.possible + ' (' + r.percentage + '%)\n';
    }

    // Weakest questions with chosen option / best practice / OWASP link
    var weakQs = report.weakestQuestions || [];
    if (weakQs.length > 0) {
      prompt += '\nWeakest Questions (lowest performance):\n';
      for (var j = 0; j < weakQs.length; j++) {
        var wq = weakQs[j];
        // Resolve option text from bank if selectedOption not present
        var selectedText = '';
        if (wq.selectedOption && wq.selectedOption.text) {
          selectedText = wq.selectedOption.text;
        } else if (wq.selectedOptionIndex != null) {
          // find question in bank to get option text
          for (var q = 0; q < bank.questions.length; q++) {
            if (bank.questions[q].id === wq.id) {
              var opt = bank.questions[q].options[wq.selectedOptionIndex];
              if (opt) selectedText = opt.text;
              break;
            }
          }
        }

        prompt += '- ' + wq.id + ': Chose "' + selectedText + '" (score: ' +
          (wq.weightedScore != null ? wq.weightedScore : 'N/A') + '/3)\n';
        if (wq.scenario) prompt += '  Scenario: ' + wq.scenario + '\n';
        if (wq.bestPractice) prompt += '  Best Practice: ' + wq.bestPractice + '\n';
        if (wq.astSourceUrl) prompt += '  OWASP Source: ' + wq.astSourceUrl + '\n';
      }
    }

    // --- OWASP Source Material ---
    prompt += '\n## OWASP Source Material\n\n';
    var excerptKeys = Object.keys(excerpts);
    for (var e = 0; e < excerptKeys.length; e++) {
      var ex = excerpts[excerptKeys[e]];
      prompt += '### ' + excerptKeys[e] + '\n\n';
      if (ex.description) prompt += ex.description + '\n\n';
      if (ex.evidence) prompt += '**Evidence:**\n' + ex.evidence + '\n\n';
      if (ex.mitigations) prompt += '**Mitigations:**\n' + ex.mitigations + '\n\n';
    }

    // --- Output Format ---
    prompt +=
      '## Output Format\n\n' +
      'Return ONLY a JSON object, no markdown fences, no commentary:\n\n' +
      '{\n' +
      '  "narrative": "2-4 sentence plain-language analysis of the Participant\'s blind spots,\n' +
      '    referencing their own choices and the OWASP evidence above",\n' +
      '  "actions": [\n' +
      '    {\n' +
      '      "priority": 1,\n' +
      '      "title": "short imperative action title",\n' +
      '      "description": "1-2 sentences: what to do and why, grounded in the source material",\n' +
      '      "ast_source": "AST01"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n\n' +
      'Rules: 3-5 actions, most important first (priority 1 = first). Each action must be\n' +
      'grounded in the provided material: its ast_source must be an AST ID covered by the\n' +
      'OWASP Source Material or Weakest Questions sections, and its description must trace\n' +
      'to that material.';

    return prompt;
  }

  global.App.ActionPlan = {
    assemble: assemble,
    buildLlmPrompt: buildLlmPrompt
  };

  if (typeof module !== 'undefined') {
    module.exports = global.App.ActionPlan;
  }
})(globalThis);
