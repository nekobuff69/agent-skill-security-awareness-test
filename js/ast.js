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
    },
    /**
     * Trait Dimensions — five fine-grained behavioral families the ten
     * AST Risks group into (ADR 0026 supersedes ADR 0025's three axes).
     * Keys are self-describing and stable; order is load-bearing: it is
     * the position order of the five-letter profile code and the
     * deterministic tie-break for aggregation. Display names and the
     * two pole descriptions per dimension are Chrome Strings
     * ('trait.VETTING'…), not literals here.
     *
     *   VETTING   — do you check where a skill comes from (AST01, AST02)
     *   PRIVILEGE — how much you hand a skill (AST03, AST04)
     *   HYGIENE   — is outside content data or instructions (AST05, AST06)
     *   CURRENT   — do updates and re-checks actually happen (AST07, AST08)
     *   MAPPED    — do you know what you installed where (AST09, AST10)
     */
    traits: {
      VETTING:   ['AST01', 'AST02'],
      PRIVILEGE: ['AST03', 'AST04'],
      HYGIENE:   ['AST05', 'AST06'],
      CURRENT:   ['AST07', 'AST08'],
      MAPPED:    ['AST09', 'AST10']
    },
    traitOrder: ['VETTING', 'PRIVILEGE', 'HYGIENE', 'CURRENT', 'MAPPED']
  };

  /** Which trait dimension an AST Risk belongs to — resolved once, after
   *  the literal above is complete. */
  (function() {
    var keys = global.App.AST.traitOrder;
    var map = global.App.AST.traitOf = {};
    for (var a = 0; a < keys.length; a++) {
      var list = global.App.AST.traits[keys[a]];
      for (var i = 0; i < list.length; i++) map[list[i]] = keys[a];
    }
  })();

  if (typeof module !== 'undefined') {
    module.exports = global.App.AST;
  }
})(globalThis);
