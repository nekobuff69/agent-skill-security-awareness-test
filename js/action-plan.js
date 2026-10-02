(function(global) {
  'use strict';

  global.App = global.App || {};

  // Chrome String lookup, resolved inside buildLlmPrompt so the LLM Path
  // prompt localizes with the rest of the UI.
  function t(id, vars) {
    return global.App.I18n.t(id, vars);
  }

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
    var AST = global.App.AST || { severity: {} };
    var title = report.title || {
      name: t('prompt.titleFallback'),
      emoji: t('prompt.titleFallbackEmoji')
    };
    var percentage = report.percentage != null ? report.percentage : 0;

    // --- System Instruction ---
    var prompt = t('llm.system', {
      languageRule: t('llm.languageRule', { language: t('lang.name') })
    });

    // --- Participant Data ---
    // The dictionary template ends with a single newline after the language
    // rule; the pre-change prompt separated these sections with a blank line,
    // so the newlines are reproduced here.
    prompt += '\n' +
      t('llm.participant.heading') + '\n\n' +
      t('llm.participant.title', { title: title.emoji + ' ' + title.name }) + '\n' +
      t('llm.participant.overall', { percentage: percentage }) + '\n\n';

    // Per-AST scores, weakest first (order owned by the Scoring report)
    var astRanked = report.astRanked || [];
    prompt += t('llm.astScores.heading') + '\n';
    for (var i = 0; i < astRanked.length; i++) {
      var r = astRanked[i];
      prompt += t('llm.astLine', {
        id: r.id,
        name: global.App.I18n.astName(r.id),
        severity: t('severity.' + (AST.severity[r.id] || 'medium')),
        earned: r.earned,
        possible: r.possible,
        percentage: r.percentage
      }) + '\n';
    }

    // Weakest questions with chosen option / best practice / OWASP link
    var weakQs = report.weakestQuestions || [];
    if (weakQs.length > 0) {
      prompt += t('llm.weakest.heading');
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

        prompt += t('llm.weakestLine', {
          id: wq.id,
          selected: selectedText,
          score: (wq.weightedScore != null ? wq.weightedScore : 'N/A')
        }) + '\n';
        if (wq.scenario) prompt += t('llm.weakestScenario', { text: wq.scenario }) + '\n';
        if (wq.bestPractice) prompt += t('llm.weakestBestPractice', { text: wq.bestPractice }) + '\n';
        if (wq.astSourceUrl) prompt += t('llm.weakestOwasp', { url: wq.astSourceUrl }) + '\n';
      }
    }

    // --- OWASP Source Material ---
    prompt += t('llm.source.heading');
    var excerptKeys = Object.keys(excerpts);
    for (var e = 0; e < excerptKeys.length; e++) {
      var ex = excerpts[excerptKeys[e]];
      prompt += t('llm.source.section', { id: excerptKeys[e] });
      if (ex.description) prompt += ex.description + '\n\n';
      if (ex.evidence) prompt += t('llm.source.evidence', { text: ex.evidence });
      if (ex.mitigations) prompt += t('llm.source.mitigations', { text: ex.mitigations });
    }

    // --- Output Format ---
    prompt += t('llm.outputFormat');

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