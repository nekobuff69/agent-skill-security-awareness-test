var Extractor = require('../../js/extractor.js');

exports.name = 'Extractor';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── Mock corpus ──
  var mockCorpus = [
    '# AST01 — Malicious Skills',
    '',
    '## Description',
    'Attackers publish skills that appear legitimate but contain hidden malicious payloads.',
    'Because agent skills execute with the full permissions of the host agent,',
    'a malicious skill gains immediate access to API keys and credentials.',
    '',
    '## Real-World Evidence',
    '- ClawHavoc campaign (Jan 2026): 1,184 malicious skills across 12 publisher accounts.',
    '- Five of the top seven most-downloaded skills were confirmed malware.',
    '- Skills impersonating "Google" and "Solana wallet tracker".',
    '',
    '## Attack Scenarios',
    '### Typosquatting',
    'google-workspace vs. gogle-workspace',
    '',
    '## Preventive Mitigations',
    '1. Require cryptographic signatures on all published skills.',
    '2. Implement Merkle root signing for skill registries.',
    '3. Scan skills at publish time and at install time.',
    '',
    '# AST03 — Over-Privileged Skills',
    '',
    '## Description',
    'Skills are granted broader permissions than their stated function requires.',
    'This creates excessive blast radius.',
    '',
    '## Real-World Evidence',
    '- 280+ skills exposing API keys and PII beyond their declared function.',
    '- Agent deleted large volumes of email before the process was killed.',
    '',
    '## Preventive Mitigations',
    '1. Require skills to declare a permission manifest.',
    '2. Enforce per-skill scoped credentials.',
    '',
    '# AST05 — Untrusted External Instructions',
    '',
    '## Description',
    'Skills routinely reference external documentation.',
    'That content becomes part of the skill instructions.',
    '',
    '## Real-World Evidence',
    '- Anthropic warned about external URLs posing particular risk.',
    '',
    '## Preventive Mitigations',
    '1. Pin and verify referenced content.',
    '2. Prefer inlining over fetching.'
  ].join('\n');

  // ── 1. Extracts correct AST01 section from a mock corpus snippet ──
  var r1 = Extractor.extract(mockCorpus, ['AST01']);
  check('AST01 extract: result has AST01 key',
    r1.hasOwnProperty('AST01'),
    'keys=' + Object.keys(r1).join(','));
  check('AST01 extract: description is non-empty',
    r1.AST01 && r1.AST01.description.length > 0,
    'len=' + (r1.AST01 ? r1.AST01.description.length : 0));
  check('AST01 extract: description contains key phrase',
    r1.AST01 && r1.AST01.description.indexOf('malicious payloads') !== -1,
    r1.AST01 ? 'found' : 'missing');
  check('AST01 extract: evidence is non-empty',
    r1.AST01 && r1.AST01.evidence.length > 0,
    'len=' + (r1.AST01 ? r1.AST01.evidence.length : 0));
  check('AST01 extract: evidence contains ClawHavoc',
    r1.AST01 && r1.AST01.evidence.indexOf('ClawHavoc') !== -1,
    r1.AST01 ? 'found' : 'missing');
  check('AST01 extract: mitigations is non-empty',
    r1.AST01 && r1.AST01.mitigations.length > 0,
    'len=' + (r1.AST01 ? r1.AST01.mitigations.length : 0));
  check('AST01 extract: mitigations contain signatures',
    r1.AST01 && r1.AST01.mitigations.indexOf('cryptographic signatures') !== -1,
    r1.AST01 ? 'found' : 'missing');

  // ── 2. Returns only requested AST IDs ──
  var r2 = Extractor.extract(mockCorpus, ['AST01', 'AST03']);
  check('multiple IDs: only requested keys returned',
    Object.keys(r2).length === 2 && r2.hasOwnProperty('AST01') && r2.hasOwnProperty('AST03'),
    'keys=' + Object.keys(r2).join(','));
  check('multiple IDs: AST03 description has correct content',
    r2.AST03 && r2.AST03.description.indexOf('broader permissions') !== -1,
    r2.AST03 ? 'found' : 'missing');
  check('multiple IDs: AST03 evidence mentions API keys',
    r2.AST03 && r2.AST03.evidence.indexOf('API keys') !== -1,
    r2.AST03 ? 'found' : 'missing');

  // ── 3. Missing AST ID returns empty/excluded ──
  var r3 = Extractor.extract(mockCorpus, ['AST01', 'AST99']);
  check('missing ID: result has AST01',
    r3.hasOwnProperty('AST01'),
    'keys=' + Object.keys(r3).join(','));
  check('missing ID: AST99 excluded from result',
    !r3.hasOwnProperty('AST99'),
    'keys=' + Object.keys(r3).join(','));
  check('missing ID: only requested IDs attempted',
    Object.keys(r3).length === 1,
    'count=' + Object.keys(r3).length);

  // ── 4. Handles corpus with no matching sections gracefully ──
  var r4 = Extractor.extract(mockCorpus, ['AST99']);
  check('no match: returns empty object',
    typeof r4 === 'object' && Object.keys(r4).length === 0,
    'keys=' + Object.keys(r4).join(','));

  var r5 = Extractor.extract('Just some plain text, no headings here.', ['AST01']);
  check('plain text corpus: returns empty object',
    typeof r5 === 'object' && Object.keys(r5).length === 0,
    'keys=' + Object.keys(r5).join(','));

  var r6 = Extractor.extract(null, ['AST01']);
  check('null corpus: returns empty object',
    typeof r6 === 'object' && Object.keys(r6).length === 0,
    'type=' + typeof r6);

  var r7 = Extractor.extract(mockCorpus, null);
  check('null weakAstIds: returns empty object',
    typeof r7 === 'object' && Object.keys(r7).length === 0,
    'type=' + typeof r7);

  // ── 5. AST05 extraction (third section) ──
  var r8 = Extractor.extract(mockCorpus, ['AST05']);
  check('AST05 extract: description contains external documentation',
    r8.AST05 && r8.AST05.description.indexOf('external documentation') !== -1,
    r8.AST05 ? 'found' : 'missing');
  check('AST05 extract: mitigations contain pinning',
    r8.AST05 && r8.AST05.mitigations.indexOf('Pin and verify') !== -1,
    r8.AST05 ? 'found' : 'missing');

  // ── 6. Browser + Node dual export ──
  check('exports: module.exports is set', typeof Extractor.extract === 'function');
  check('exports: globalThis.App.Extractor exists',
    typeof globalThis.App !== 'undefined' &&
    typeof globalThis.App.Extractor === 'object' &&
    typeof globalThis.App.Extractor.extract === 'function');

  return results;
};
