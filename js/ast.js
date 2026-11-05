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
     * Attention Axes — the three behavioral families the ten AST Risks
     * group into for the type classifier. Keys are self-describing and
     * stable; order is load-bearing: it is the deterministic tie-break
     * for "weakest"/"strongest" axis. Axis display names, single-letter
     * MBTI-style codes and per-axis risk notes are Chrome Strings
     * ('axis.INTAKE'…), not literals here.
     *
     *   INTAKE   — what you let in: skills, sources, external instructions
     *   EXPOSURE — what you give out: permissions, metadata, isolation
     *   UPKEEP   — how you keep up: updates, scans, governance, reuse
     */
    axes: {
      INTAKE:   ['AST01', 'AST02', 'AST05'],
      EXPOSURE: ['AST03', 'AST04', 'AST06'],
      UPKEEP:   ['AST07', 'AST08', 'AST09', 'AST10']
    },
    axisOrder: ['INTAKE', 'EXPOSURE', 'UPKEEP']
  };

  /** Which axis an AST Risk belongs to — resolved once, after the
   *  literal above is complete. */
  (function() {
    var keys = global.App.AST.axisOrder;
    var map = global.App.AST.axisOf = {};
    for (var a = 0; a < keys.length; a++) {
      var list = global.App.AST.axes[keys[a]];
      for (var i = 0; i < list.length; i++) map[list[i]] = keys[a];
    }
  })();

  if (typeof module !== 'undefined') {
    module.exports = global.App.AST;
  }
})(globalThis);
