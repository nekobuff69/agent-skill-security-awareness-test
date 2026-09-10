(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  /**
   * Extract excerpts for weak AST risks from a Grounding Corpus markdown string.
   *
   * @param {string} corpusText  - Full text content of owasp-ast-full.md
   * @param {string[]} weakAstIds - Array of AST IDs to extract, e.g. ['AST01', 'AST03']
   * @returns {{ [astId]: { description: string, evidence: string, mitigations: string } }}
   */
  function extract(corpusText, weakAstIds) {
    var result = {};

    if (!corpusText || !Array.isArray(weakAstIds)) {
      return result;
    }

    var lines = corpusText.split('\n');

    // Build risk sections: each starts at a heading matching # ASTxx or ## ASTxx
    var sections = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^#{1,2}\s+AST(\d{2})\b/);
      if (m) {
        sections.push({ id: 'AST' + m[1], start: i });
      }
    }

    for (var s = 0; s < sections.length; s++) {
      sections[s].end = (s < sections.length - 1) ? sections[s + 1].start : lines.length;
    }

    function findLineIndex(sectionLines, patterns) {
      for (var j = 0; j < sectionLines.length; j++) {
        for (var p = 0; p < patterns.length; p++) {
          if (sectionLines[j].toLowerCase().indexOf(patterns[p].toLowerCase()) !== -1) {
            return j;
          }
        }
      }
      return -1;
    }

    function extractBetween(sectionLines, startPatterns, stopAtH2) {
      var startIdx = findLineIndex(sectionLines, startPatterns);
      if (startIdx === -1) return '';

      var endIdx = sectionLines.length;
      if (stopAtH2) {
        for (var j = startIdx + 1; j < sectionLines.length; j++) {
          if (/^#{1,3}\s+/.test(sectionLines[j])) {
            endIdx = j;
            break;
          }
        }
      }

      return sectionLines.slice(startIdx, endIdx).join('\n').trim();
    }

    for (var w = 0; w < weakAstIds.length; w++) {
      var targetId = weakAstIds[w];
      var section = null;

      for (var s2 = 0; s2 < sections.length; s2++) {
        if (sections[s2].id === targetId) {
          section = sections[s2];
          break;
        }
      }

      if (!section) continue;

      var sectionLines = lines.slice(section.start, section.end);

      var description = extractBetween(sectionLines, ['## description', '## overview'], true);
      var evidence = extractBetween(
        sectionLines,
        ['## real-world evidence', '## evidence', '## real world evidence'],
        true
      );
      var mitigations = extractBetween(
        sectionLines,
        ['## preventive mitigations', '## mitigations', '## checklist', '## remediation', '## recommendations'],
        true
      );

      result[targetId] = {
        description: description,
        evidence: evidence,
        mitigations: mitigations
      };
    }

    return result;
  }

  globalThis.App.Extractor = {
    extract: extract
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.Extractor;
  }
})(globalThis);
