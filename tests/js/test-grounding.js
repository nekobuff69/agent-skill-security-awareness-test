var fs = require('fs');
var path = require('path');
global.App = global.App || {};
var Extractor = require('../../js/extractor.js');

exports.name = 'Grounding Corpus';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // The Grounding Corpus is load-bearing for the LLM Path (ADR-0007/0010):
  // runtime validation is structural only, so the prompt-embedded excerpts are
  // the sole anti-hallucination mechanism. A corpus edit that breaks the
  // heading format would silently empty the evidence layer — this test gates
  // the shipped file, not a fake fixture.
  var corpusPath = path.join(__dirname, '..', '..', 'docs', 'owasp-ast-full.md');
  var corpus = null;
  try {
    corpus = fs.readFileSync(corpusPath, 'utf8');
  } catch (e) {
    corpus = null;
  }

  check('corpus file exists', !!corpus, corpus ? 'len=' + corpus.length : 'docs/owasp-ast-full.md missing');
  check('corpus is non-trivial', !!corpus && corpus.length > 10000, corpus ? 'len=' + corpus.length : '');

  if (corpus) {
    var ids = ['AST01', 'AST02', 'AST03', 'AST04', 'AST05', 'AST06', 'AST07', 'AST08', 'AST09', 'AST10'];
    var out = Extractor.extract(corpus, ids);
    var complete = 0;

    for (var i = 0; i < ids.length; i++) {
      var ex = out[ids[i]];
      var ok = !!(ex && ex.description && ex.description.length > 0 &&
        ex.evidence && ex.evidence.length > 0 &&
        ex.mitigations && ex.mitigations.length > 0);
      if (ok) complete++;
      check(ids[i] + ': description/evidence/mitigations all non-empty', ok,
        ex ? 'd=' + (ex.description || '').length +
             ' e=' + (ex.evidence || '').length +
             ' m=' + (ex.mitigations || '').length : 'missing');
    }

    check('all 10 AST Risks extract cleanly', complete === 10, complete + '/10');
  }

  return results;
};
