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
   * Per-field clip caps tried in order during budget enforcement; the first
   * one that fits wins, so the least aggressive clip is chosen.
   */
  var FIELD_CAPS = [600, 400, 300, 200, 120, 60];

  /**
   * Build the OWASP Source Material section.
   *
   * @param {string[]} keys - AST Risk ids, weakest first
   * @param {object} excerpts - AST Risk id → { description, evidence, mitigations }
   * @param {number|null} cap - per-field clip cap (null = no clipping)
   * @param {boolean} omitBodies - keep the AST Risk headings, drop the bodies
   */
  function buildSourceMaterial(keys, excerpts, cap, omitBodies) {
    var out = t('llm.source.heading');
    for (var e = 0; e < keys.length; e++) {
      var ex = excerpts[keys[e]];
      if (!ex) continue;
      out += t('llm.source.section', { id: keys[e] });
      if (omitBodies) {
        out += t('llm.excerpt.truncated') + '\n\n';
        continue;
      }
      if (ex.description) out += clipField(ex.description, cap) + '\n\n';
      if (ex.evidence) out += t('llm.source.evidence', { text: clipField(ex.evidence, cap) });
      if (ex.mitigations) out += t('llm.source.mitigations', { text: clipField(ex.mitigations, cap) });
    }
    return out;
  }

  /**
   * Clip one long text field to `cap` characters, marking it so the model
   * reads the field as cut rather than complete. Applied to the Grounding
   * Excerpt fields and to the Weakest Question Scenario/Best Practice, which
   * are the other unbounded text in the prompt.
   */
  function clipField(text, cap) {
    if (!cap || text.length <= cap) return text;
    return text.substring(0, cap) + '\n' + t('llm.excerpt.truncated');
  }

  /**
   * Enforce t('llm.budget') on the assembled prompt.
   *
   * Load-bearing, and never trimmed: `head` (the System Instruction — grounding
   * rules, language rule, output contract) and `tail` (the Output Format — it
   * is the answer contract itself). Only the middle is ever cut.
   *
   * The ladder, applied in order, each step a pure function of its inputs so
   * the same report always yields the same prompt string:
   *   0. Fits already → return unchanged.
   *   1. Clip every long text field to a per-field cap — the largest cap in
   *      FIELD_CAPS that fits — with every section still present: each
   *      excerpt's Description/Evidence/Mitigations and each Weakest
   *      Question's Scenario/Best Practice. Each clipped field is closed with
   *      llm.excerpt.truncated so the model reads it as cut rather than ended.
   *      Coverage beats depth: a clipped note on all five weak AST Risks is
   *      worth more to the model than one AST Risk in full, because the
   *      Participant is weakest across all five. Scenario and Best Practice
   *      are clipped here too — on a long report they are as large as the
   *      excerpts, and clipping them is what keeps step 2 from having to drop
   *      AST Risk sections at all.
   *   2. Drop whole Grounding Excerpt sections, keeping the longest prefix
   *      that fits, weakest AST Risk first.
   *   3. Drop the excerpt bodies, keeping the AST Risk headings, so the
   *      Participant can still see which risks were grounded.
   *   4. Clamp: head and tail are reserved whole, the middle is clipped to the
   *      room that is left, and the clip is marked llm.prompt.truncated.
   * Steps 1-3 are the ones that fire on real reports; step 4 is the backstop
   * that guarantees prompt.length <= budget for any input. If head + tail
   * alone exceed the budget, the whole prompt is hard-sliced — the length
   * guarantee wins over the contract in that one case, and it is documented
   * here rather than left implicit. That needs llm.budget below head + tail
   * (1403 characters in English, 730 in Chinese at the shipped values), so it
   * cannot happen at 6000.
   *
   * @param {string} head
   * @param {string} tail
   * @param {function(number, number|null, boolean): string} buildMiddle
   *   (excerptCount, fieldCap, omitBodies) → middle section
   * @returns {string} prompt, at most t('llm.budget') characters
   */
  function enforceBudget(head, tail, buildMiddle) {
    var budget = t('llm.budget');
    var total = buildMiddle.length;

    var full = head + buildMiddle(-1, null, false) + tail;
    if (full.length <= budget) return full;

    // Step 1 — per-field clip, largest cap that fits, every excerpt kept
    for (var c = 0; c < FIELD_CAPS.length; c++) {
      var clipped = head + buildMiddle(-1, FIELD_CAPS[c], false) + tail;
      if (clipped.length <= budget) return clipped;
    }

    // Step 2 — longest prefix of whole excerpts that fits, unclipped
    for (var n = 1; n <= total; n++) {
      var kept = head + buildMiddle(n, null, false) + tail;
      if (kept.length <= budget) return kept;
    }

    // Step 3 — excerpt bodies dropped, AST Risk headings kept
    var stripped = head + buildMiddle(-1, null, true) + tail;
    if (stripped.length <= budget) return stripped;

    // Step 4 — clamp the middle; head and tail are reserved first
    var marker = '\n' + t('llm.prompt.truncated') + '\n';
    var reserved = head.length + marker.length + tail.length;
    if (reserved >= budget) return full.substring(0, budget);
    return head + marker + buildMiddle(-1, null, true).substring(0, budget - reserved) + tail;
  }

  /**
   * Build the LLM Path prompt: participant profile + Weakest Questions +
   * Grounding Excerpts, with the grounding rules and output contract,
   * trimmed to t('llm.budget').
   */
  function buildLlmPrompt(report, bank, excerpts) {
    var AST = global.App.AST || { severity: {} };
    var title = report.title || {
      name: t('llm.titleFallback'),
      emoji: t('llm.titleFallbackEmoji')
    };
    var percentage = report.percentage != null ? report.percentage : 0;

    // --- System Instruction (load-bearing: survives every trim step) ---
    var head = t('llm.system', {
      languageRule: t('llm.languageRule', { language: t('lang.name') })
    });

    // --- Output Format (load-bearing: the answer contract) ---
    var tail = t('llm.outputFormat');

    var excerptKeys = Object.keys(excerpts);

    /**
     * Everything between head and tail: Participant Data, per-AST Scores,
     * Weakest Questions, and OWASP Source Material. The excerpt count, field
     * clip cap and body-dropping flag come from the budget ladder.
     */
    function buildMiddle(excerptCount, fieldCap, omitBodies) {
      var middle = '';

      // --- Participant Data ---
      // The dictionary template ends with a single newline after the language
      // rule; the pre-change prompt separated these sections with a blank line,
      // so the newlines are reproduced here.
      middle += '\n' +
        t('llm.participant.heading') + '\n\n' +
        t('llm.participant.title', { title: title.emoji + ' ' + title.name }) + '\n' +
        t('llm.participant.overall', { percentage: percentage }) + '\n\n';

      // Per-AST scores, weakest first (order owned by the Scoring report)
      var astRanked = report.astRanked || [];
      middle += t('llm.astScores.heading') + '\n';
      for (var i = 0; i < astRanked.length; i++) {
        var r = astRanked[i];
        middle += t('llm.astLine', {
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
        middle += t('llm.weakest.heading');
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

          middle += t('llm.weakestLine', {
            id: wq.id,
            selected: selectedText,
            score: (wq.weightedScore != null ? wq.weightedScore : 'N/A')
          }) + '\n';
          if (wq.scenario) {
            middle += t('llm.weakestScenario', { text: clipField(wq.scenario, fieldCap) }) + '\n';
          }
          if (wq.bestPractice) {
            middle += t('llm.weakestBestPractice', { text: clipField(wq.bestPractice, fieldCap) }) + '\n';
          }
          if (wq.astSourceUrl) middle += t('llm.weakestOwasp', { url: wq.astSourceUrl }) + '\n';
        }
      }

      // --- OWASP Source Material ---
      middle += buildSourceMaterial(
        excerptCount === -1 ? excerptKeys : excerptKeys.slice(0, excerptCount),
        excerpts, fieldCap, omitBodies
      );

      return middle;
    }

    return enforceBudget(head, tail, buildMiddle);
  }

  global.App.ActionPlan = {
    assemble: assemble,
    buildLlmPrompt: buildLlmPrompt,
    enforceBudget: enforceBudget,
    fieldCaps: FIELD_CAPS
  };

  if (typeof module !== 'undefined') {
    module.exports = global.App.ActionPlan;
  }
})(globalThis);
