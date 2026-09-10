var Validator = require('../../js/validator.js');

exports.name = 'ResponseValidator';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── Mock bank ──
  var mockBank = {
    questions: [
      { id: 'q01', ast_risks: ['AST01'] },
      { id: 'q02', ast_risks: ['AST03'] },
      { id: 'q03', ast_risks: ['AST06'] },
      { id: 'q04', ast_risks: ['AST01', 'AST06'] },
      { id: 'q05', ast_risks: ['AST04'] }
    ]
  };

  // ── Valid output ──
  var validOutput = JSON.stringify({
    narrative: 'Your results reveal significant blind spots in agent skill security. Most concerning is your pattern around skill installation trust — you scored lowest on questions about verifying publishers before installing skills.',
    actions: [
      {
        priority: 1,
        title: 'Verify publisher identity',
        description: 'Check the publisher account history before installing.',
        ast_source: 'AST01 — Malicious Skills'
      },
      {
        priority: 2,
        title: 'Scope permissions',
        description: 'Review each permission request against what the skill actually needs.',
        ast_source: 'AST03 — Over-Privileged Skills'
      }
    ]
  });

  // ── 1. Valid output → ok:true with parsed narrative and actions ──
  var r1 = Validator.validate(validOutput, mockBank);
  check('valid output: ok is true', r1.ok, r1.error);
  check('valid output: parsed.narrative is a string',
    r1.ok && typeof r1.parsed.narrative === 'string',
    r1.ok ? 'type=' + typeof r1.parsed.narrative : r1.error);
  check('valid output: parsed.narrative contains key phrase',
    r1.ok && r1.parsed.narrative.indexOf('blind spots') !== -1,
    r1.ok ? 'found' : r1.error);
  check('valid output: parsed.actions is an array',
    r1.ok && Array.isArray(r1.parsed.actions),
    r1.ok ? 'len=' + r1.parsed.actions.length : r1.error);
  check('valid output: parsed.actions has 2 items',
    r1.ok && r1.parsed.actions.length === 2,
    r1.ok ? 'len=' + r1.parsed.actions.length : r1.error);

  // ── 2. Invalid JSON → ok:false ──
  var r2 = Validator.validate('not valid json {{{', mockBank);
  check('invalid JSON: ok is false', !r2.ok, r2.error);
  check('invalid JSON: error mentions JSON',
    r2.error && r2.error.toLowerCase().indexOf('json') !== -1,
    r2.error);

  // ── 3. Missing narrative field → ok:false ──
  var noNarrative = JSON.stringify({
    actions: [
      { priority: 1, title: 'Test', description: 'Test', ast_source: 'AST01' }
    ]
  });
  var r3 = Validator.validate(noNarrative, mockBank);
  check('missing narrative: ok is false', !r3.ok, r3.error);
  check('missing narrative: error mentions narrative',
    r3.error && r3.error.toLowerCase().indexOf('narrative') !== -1,
    r3.error);

  // ── 4. Empty actions array → ok:false ──
  var emptyActions = JSON.stringify({
    narrative: 'This is a narrative with enough characters to pass the length check requirement.',
    actions: []
  });
  var r4 = Validator.validate(emptyActions, mockBank);
  check('empty actions: ok is false', !r4.ok, r4.error);
  check('empty actions: error mentions actions',
    r4.error && r4.error.toLowerCase().indexOf('actions') !== -1,
    r4.error);

  // ── 5. Action with unknown AST reference (AST99) → ok:false ──
  var unknownAst = JSON.stringify({
    narrative: 'This is a narrative with enough characters to pass the length check requirement for validation.',
    actions: [
      { priority: 1, title: 'Test', description: 'Test action', ast_source: 'AST99 — Unknown Risk' }
    ]
  });
  var r5 = Validator.validate(unknownAst, mockBank);
  check('unknown AST99: ok is false', !r5.ok, r5.error);
  check('unknown AST99: error mentions AST ID',
    r5.error && r5.error.indexOf('AST99') !== -1,
    r5.error);

  // ── 6. Action with valid AST reference → ok:true ──
  var validAst = JSON.stringify({
    narrative: 'Your assessment shows gaps in permission management. Focus on scoping permissions to match the skill stated function before installation.',
    actions: [
      { priority: 1, title: 'Scope permissions', description: 'Review each permission.', ast_source: 'AST03 — Over-Privileged Skills' }
    ]
  });
  var r6 = Validator.validate(validAst, mockBank);
  check('valid AST03: ok is true', r6.ok, r6.error);
  check('valid AST03: parsed has correct structure',
    r6.ok && r6.parsed.actions[0].ast_source.indexOf('AST03') !== -1,
    r6.ok ? 'found' : r6.error);

  // ── 7. Narrative too short → ok:false ──
  var shortNarrative = JSON.stringify({
    narrative: 'Too short.',
    actions: [
      { priority: 1, title: 'Test', description: 'Test', ast_source: 'AST01' }
    ]
  });
  var r7 = Validator.validate(shortNarrative, mockBank);
  check('short narrative (< 50 chars): ok is false', !r7.ok, r7.error);
  check('short narrative: error mentions length or short',
    r7.error && (r7.error.indexOf('short') !== -1 || r7.error.indexOf('length') !== -1 || r7.error.indexOf('50') !== -1),
    r7.error);

  // ── 8. ast_source without ASTxx pattern → ok:false ──
  var noAstPattern = JSON.stringify({
    narrative: 'A narrative that is long enough to pass the validation length check for testing purposes.',
    actions: [
      { priority: 1, title: 'Test', description: 'Test', ast_source: 'No AST ID here' }
    ]
  });
  var r8 = Validator.validate(noAstPattern, mockBank);
  check('no ASTxx pattern: ok is false', !r8.ok, r8.error);

  // ── 9. Action missing required field (title) → ok:false ──
  var missingTitle = JSON.stringify({
    narrative: 'A narrative that is long enough to pass the validation length check for testing purposes.',
    actions: [
      { priority: 1, description: 'Test', ast_source: 'AST01' }
    ]
  });
  var r9 = Validator.validate(missingTitle, mockBank);
  check('missing title: ok is false', !r9.ok, r9.error);
  check('missing title: error mentions title',
    r9.error && r9.error.toLowerCase().indexOf('title') !== -1,
    r9.error);

  // ── 10. Empty narrative string → ok:false ──
  var emptyNarrative = JSON.stringify({
    narrative: '',
    actions: [
      { priority: 1, title: 'Test', description: 'Test', ast_source: 'AST01' }
    ]
  });
  var r10 = Validator.validate(emptyNarrative, mockBank);
  check('empty narrative string: ok is false', !r10.ok, r10.error);

  // ── 11. Markdown-fenced JSON → ok:true (fence tolerated) ──
  var fencedOutput = '```json\n' + validOutput + '\n```';
  var rFenced = Validator.validate(fencedOutput, mockBank);
  check('fenced JSON: ok is true', rFenced.ok, rFenced.error);
  check('fenced JSON: parsed.narrative preserved',
    rFenced.ok && rFenced.parsed.narrative === JSON.parse(validOutput).narrative,
    rFenced.ok ? 'preserved' : rFenced.error);

  // ── 12. Browser + Node dual export ──
  check('exports: module.exports is set', typeof Validator.validate === 'function');
  check('exports: globalThis.App.ResponseValidator exists',
    typeof globalThis.App !== 'undefined' &&
    typeof globalThis.App.ResponseValidator === 'object' &&
    typeof globalThis.App.ResponseValidator.validate === 'function');

  return results;
};
