(function(global) {
  'use strict';

  global.App = global.App || {};

  /**
   * AST Risk registry — the canonical id/name/severity tables for the
   * ten OWASP Agentic Skills Top 10 risks. Single source for every
   * consumer (results rendering, fallback, the LLM prompt, tests).
   */
  global.App.AST = {
    ids: [
      'AST01', 'AST02', 'AST03', 'AST04', 'AST05',
      'AST06', 'AST07', 'AST08', 'AST09', 'AST10'
    ],
    names: {
      AST01: 'Malicious Skills',
      AST02: 'Supply Chain Compromise',
      AST03: 'Over-Privileged Skills',
      AST04: 'Insecure Metadata',
      AST05: 'Untrusted External Instructions',
      AST06: 'Weak Isolation',
      AST07: 'Update Drift',
      AST08: 'Poor Scanning',
      AST09: 'No Governance',
      AST10: 'Cross-Platform Reuse'
    },
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
