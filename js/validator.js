(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  /**
   * Validate raw LLM text output against expected shape and bank.
   *
   * @param {string} rawText - Raw text output from the LLM (expected JSON)
   * @param {object} bank    - Parsed questions.json (must have questions[].ast_risks)
   * @returns {{ ok: true, parsed: { narrative: string, actions: object[] } }
   *          | { ok: false, error: string }}
   */
  function validate(rawText, bank) {
    // Step 1: JSON parse
    var parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return { ok: false, error: 'Invalid JSON: ' + e.message };
    }

    // Step 2: Top-level shape
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Response is not an object' };
    }

    if (typeof parsed.narrative !== 'string' || parsed.narrative.length === 0) {
      return { ok: false, error: 'Missing or empty narrative field' };
    }

    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
      return { ok: false, error: 'Missing or empty actions array' };
    }

    // Step 3: Action shape
    for (var i = 0; i < parsed.actions.length; i++) {
      var action = parsed.actions[i];
      if (typeof action.priority !== 'number') {
        return { ok: false, error: 'Action ' + (i + 1) + ': priority must be a number' };
      }
      if (typeof action.title !== 'string' || action.title.length === 0) {
        return { ok: false, error: 'Action ' + (i + 1) + ': title must be a non-empty string' };
      }
      if (typeof action.description !== 'string' || action.description.length === 0) {
        return { ok: false, error: 'Action ' + (i + 1) + ': description must be a non-empty string' };
      }
      if (typeof action.ast_source !== 'string' || action.ast_source.length === 0) {
        return { ok: false, error: 'Action ' + (i + 1) + ': ast_source must be a non-empty string' };
      }

      // Step 4: ast_source format and bank validation
      var astMatch = action.ast_source.match(/AST\d{2}/);
      if (!astMatch) {
        return { ok: false, error: 'Action ' + (i + 1) + ': ast_source must contain ASTxx pattern (e.g. AST01)' };
      }

      var astId = astMatch[0];
      var idInBank = false;

      if (bank && Array.isArray(bank.questions)) {
        for (var q = 0; q < bank.questions.length; q++) {
          var risks = bank.questions[q].ast_risks;
          if (Array.isArray(risks) && risks.indexOf(astId) !== -1) {
            idInBank = true;
            break;
          }
        }
      }

      if (!idInBank) {
        return { ok: false, error: 'Action ' + (i + 1) + ': ast_source references unknown AST ID ' + astId };
      }
    }

    // Step 5: Narrative length
    if (parsed.narrative.length < 50) {
      return { ok: false, error: 'Narrative is too short (minimum 50 characters, got ' + parsed.narrative.length + ')' };
    }

    return { ok: true, parsed: parsed };
  }

  globalThis.App.ResponseValidator = {
    validate: validate
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.ResponseValidator;
  }
})(globalThis);
