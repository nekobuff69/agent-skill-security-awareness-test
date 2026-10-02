(function(global) {
  'use strict';

  global.App = global.App || {};

  /**
   * AST Risk registry — the canonical id and Severity tables for the
   * ten OWASP Agentic Skills Top 10 risks. Single source for every
   * consumer (results rendering, fallback, the LLM prompt, tests).
   *
   * Display names are NOT here: they are Chrome Strings owned by the
   * dictionary (ids 'ast.AST01'…'ast.AST10'), resolved through
   * App.I18n.astName(astId) at render time so they localize with the
   * rest of the UI.
   */
  global.App.AST = {
    ids: [
      'AST01', 'AST02', 'AST03', 'AST04', 'AST05',
      'AST06', 'AST07', 'AST08', 'AST09', 'AST10'
    ],
    severity: {
      AST01: 'critical', AST02: 'critical',
      AST03: 'high', AST04: 'high', AST05: 'high', AST06: 'high',
      AST07: 'medium', AST08: 'medium', AST09: 'medium', AST10: 'medium'
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = global.App.AST;
  }
})(globalThis);
