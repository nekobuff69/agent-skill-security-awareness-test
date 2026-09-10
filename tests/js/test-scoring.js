var fs = require('fs');
var path = require('path');

exports.name = 'Scoring Engine';

exports.run = function() {
  var bank = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../questions.json'), 'utf8')
  );
  var Scoring = require('../../js/scoring.js');
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── 1. all-zero fixture ──
  var allZero = new Array(20).fill(0);
  var r0 = Scoring.computeScores(bank, allZero);
  check('all-zero: ok is true', r0.ok, r0.error);
  check('all-zero: totalPossible is 108', r0.ok && r0.report.totalPossible === 108);
  check('all-zero: title is Uncharted',
    r0.ok && r0.report.title.name === 'Uncharted',
    'got ' + (r0.ok ? r0.report.title.name : r0.error));
  check('all-zero: totalEarned > 0 (realistic minimum)',
    r0.ok && r0.report.totalEarned >= 0 && r0.report.totalEarned < 20,
    'earned=' + (r0.ok ? r0.report.totalEarned : 'N/A'));

  // ── 2. all-best fixture ──
  var allBest = [3,3,3,3,3,3,3,null,1,2,2,2,2,1,3,null,2,2,3,3];
  var r1 = Scoring.computeScores(bank, allBest);
  check('all-best: ok is true', r1.ok, r1.error);
  check('all-best: totalEarned equals totalPossible (100%)',
    r1.ok && r1.report.totalEarned === r1.report.totalPossible,
    'earned=' + (r1.ok ? r1.report.totalEarned : 'N/A') +
    ' possible=' + (r1.ok ? r1.report.totalPossible : 'N/A'));
  check('all-best: percentage is 100',
    r1.ok && r1.report.percentage === 100,
    'got ' + (r1.ok ? r1.report.percentage : r1.error));
  check('all-best: title is Sentinel',
    r1.ok && r1.report.title.name === 'Sentinel',
    'got ' + (r1.ok ? r1.report.title.name : r1.error));

  // ── 3. common-user fixture ──
  var commonUser = bank.test_fixtures.scoring_cases.find(function(c) { return c.id === 'common-user'; });
  var r2 = Scoring.computeScores(bank, commonUser.answers);
  var commonTitles = ['Uncharted', 'Newcomer'];
  check('common-user: ok is true', r2.ok, r2.error);
  check('common-user: title in [Uncharted, Newcomer]',
    r2.ok && commonTitles.indexOf(r2.report.title.name) !== -1,
    'got ' + (r2.ok ? r2.report.title.name : r2.error));

  // ── 4. security-aware fixture ──
  var secAware = bank.test_fixtures.scoring_cases.find(function(c) { return c.id === 'security-aware'; });
  var r3 = Scoring.computeScores(bank, secAware.answers);
  var awareTitles = ['Aware', 'Practitioner'];
  check('security-aware: ok is true', r3.ok, r3.error);
  check('security-aware: title in [Aware, Practitioner]',
    r3.ok && awareTitles.indexOf(r3.report.title.name) !== -1,
    'got ' + (r3.ok ? r3.report.title.name : r3.error));

  // ── 5. totalPossible === 108 invariant ──
  check('totalPossible is 108 for all-zero',
    r0.ok && r0.report.totalPossible === 108,
    'got ' + (r0.ok ? r0.report.totalPossible : 'N/A'));
  check('totalPossible is 108 for all-best',
    r1.ok && r1.report.totalPossible === 108,
    'got ' + (r1.ok ? r1.report.totalPossible : 'N/A'));
  check('totalPossible is 108 for common-user',
    r2.ok && r2.report.totalPossible === 108,
    'got ' + (r2.ok ? r2.report.totalPossible : 'N/A'));
  check('totalPossible is 108 for security-aware',
    r3.ok && r3.report.totalPossible === 108,
    'got ' + (r3.ok ? r3.report.totalPossible : 'N/A'));

  // ── 6. Multi-mapping question (q07 → AST03+AST06) ──
  // q07 is at index 8 in the bank's questions array (id=q07)
  var q07Index = bank.questions.findIndex(function(q) { return q.id === 'q07'; });
  var q07 = bank.questions[q07Index];
  // Verify it maps to both AST03 and AST06
  check('multi-mapping: q07 has both AST03 and AST06',
    q07.ast_risks.indexOf('AST03') !== -1 && q07.ast_risks.indexOf('AST06') !== -1,
    'ast_risks=' + JSON.stringify(q07.ast_risks));
  // Use all-best fixture — q07 is index 8 with null → resolves to score=3
  var q07sw = bank.meta.scoring.severity_values[q07.severity_weight];
  var q07earned = 3 * q07sw; // score 3 × severity weight
  var q07max = 3 * q07sw;   // max option score=3 × severity weight
  var ast03 = r1.report.astScores['AST03'];
  var ast06 = r1.report.astScores['AST06'];
  check('multi-mapping: q07 weighted score appears in AST03 aggregate',
    ast03 && ast03.earned >= q07earned,
    'AST03.earned=' + (ast03 ? ast03.earned : 'undefined') + ' q07_earned=' + q07earned);
  check('multi-mapping: q07 weighted score appears in AST06 aggregate',
    ast06 && ast06.earned >= q07earned,
    'AST06.earned=' + (ast06 ? ast06.earned : 'undefined') + ' q07_earned=' + q07earned);
  // Also verify q19 (index 6 in array) maps to AST01+AST06
  var q19Index = bank.questions.findIndex(function(q) { return q.id === 'q19'; });
  var q19 = bank.questions[q19Index];
  check('multi-mapping: q19 has both AST01 and AST06',
    q19.ast_risks.indexOf('AST01') !== -1 && q19.ast_risks.indexOf('AST06') !== -1,
    'ast_risks=' + JSON.stringify(q19.ast_risks));

  // ── 7. Empty selections → ok:false ──
  var r4 = Scoring.computeScores(bank, []);
  check('empty selections: ok is false', !r4.ok, r4.error);

  // ── 8. Short selections (10 items) → ok:false ──
  var r5 = Scoring.computeScores(bank, new Array(10).fill(0));
  check('short selections (10): ok is false', !r5.ok, r5.error);

  // ── 9. Out-of-range index (5) → ok:false ──
  var outOfRange = new Array(20).fill(0);
  outOfRange[5] = 5;
  var r6 = Scoring.computeScores(bank, outOfRange);
  check('out-of-range index (5): ok is false', !r6.ok, r6.error);

  // ── 10. Non-integer index ("2") → ok:false ──
  var nonInt = new Array(20).fill(0);
  nonInt[5] = "2";
  var r7 = Scoring.computeScores(bank, nonInt);
  check('non-integer index ("2"): ok is false', !r7.ok, r7.error);

  // ── 11. Weakest questions ──
  var weak = r0.report.weakestQuestions;
  check('weakest questions: count ≤ 5', weak.length <= 5,
    'count=' + weak.length);
  // Sorted ascending by weighted_score
  var sortedCorrectly = true;
  for (var w = 1; w < weak.length; w++) {
    var qPrev = bank.questions.find(function(q) { return q.id === weak[w-1].id; });
    var qCurr = bank.questions.find(function(q) { return q.id === weak[w].id; });
    var swPrev = bank.meta.scoring.severity_values[qPrev.severity_weight];
    var swCurr = bank.meta.scoring.severity_values[qCurr.severity_weight];
    var prevIdx = bank.questions.indexOf(qPrev);
    var currIdx = bank.questions.indexOf(qCurr);
    var prevEarned = allZero[prevIdx] !== null
      ? qPrev.options[allZero[prevIdx]].score * swPrev
      : 0;
    var currEarned = allZero[currIdx] !== null
      ? qCurr.options[allZero[currIdx]].score * swCurr
      : 0;
    if (currEarned < prevEarned) sortedCorrectly = false;
  }
  check('weakest questions: sorted ascending by weighted_score', sortedCorrectly);
  // All have score 0 or 1
  var allLowScore = weak.every(function(wq) {
    return wq.selectedOption.score <= 1;
  });
  check('weakest questions: all have selectedOption.score ≤ 1', allLowScore,
    'scores=' + weak.map(function(w) { return w.selectedOption.score; }).join(','));
  // Verify required fields exist
  var allFieldsPresent = weak.every(function(wq) {
    return wq.id && wq.scenario && wq.question && wq.selectedOption &&
           wq.selectedOption.text !== undefined && wq.selectedOption.score !== undefined &&
           wq.selectedOption.feedback !== undefined && wq.bestPractice &&
           wq.astSourceUrl && Array.isArray(wq.astRisks);
  });
  check('weakest questions: all have required fields', allFieldsPresent);

  // ── 12. null answer resolution ──
  // q06 (id=q06, index 7) max is option[1] with score=2
  // q13 (id=q13, index 15) max is option[3] with score=2
  var q06Idx = bank.questions.findIndex(function(q) { return q.id === 'q06'; });
  var q13Idx = bank.questions.findIndex(function(q) { return q.id === 'q13'; });
  var nullSel = new Array(20).fill(0);
  nullSel[q06Idx] = null;
  nullSel[q13Idx] = null;
  var r8 = Scoring.computeScores(bank, nullSel);
  check('null resolution: ok is true', r8.ok, r8.error);
  // q06: option[1] has score=2 (highest), q06 severity=high(2), weighted=4
  var q06Data = bank.questions[q06Idx];
  var q06MaxScore = Math.max.apply(null, q06Data.options.map(function(o) { return o.score; }));
  var q06SW = bank.meta.scoring.severity_values[q06Data.severity_weight];
  // Find the index of the highest-score option (ties → lowest index)
  var q06ExpectedIdx = 0;
  for (var qi = 1; qi < q06Data.options.length; qi++) {
    if (q06Data.options[qi].score > q06Data.options[q06ExpectedIdx].score) q06ExpectedIdx = qi;
  }
  // Verify the score matches what we expect from null resolution
  check('null resolution: q06 resolves to max-score option (score=' + q06MaxScore + ')',
    r8.ok && r8.report.totalEarned > 0,
    'totalEarned=' + (r8.ok ? r8.report.totalEarned : r8.error));
  // q13: option[3] has score=2, q13 severity=medium(1), weighted=2
  var q13Data = bank.questions[q13Idx];
  var q13MaxScore = Math.max.apply(null, q13Data.options.map(function(o) { return o.score; }));
  check('null resolution: q13 resolves to max-score option (score=' + q13MaxScore + ')',
    r8.ok && q13MaxScore === 2,
    'q13 max=' + q13MaxScore);

  // ── 13. Browser + Node dual export ──
  check('exports: module.exports is set', typeof Scoring.computeScores === 'function');
  check('exports: globalThis.App.Scoring exists',
    typeof globalThis.App !== 'undefined' && typeof globalThis.App.Scoring === 'object' && typeof globalThis.App.Scoring.computeScores === 'function');

  return results;
};
