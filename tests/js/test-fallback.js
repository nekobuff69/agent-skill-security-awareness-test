var path = require('path');
var assert = require('assert');

exports.name = 'FallbackAssembler';

exports.run = function() {
  var bank = require(path.resolve(__dirname, '../../questions.json'));
  var FallbackAssembler = require(path.resolve(__dirname, '../../js/fallback.js'));
  // Select the Chrome String dictionary — the Deterministic Fallback
  // resolves its prose through App.I18n at assemble() time.
  var I18n = require(path.resolve(__dirname, '../../js/i18n.js'));
  require(path.resolve(__dirname, '../../i18n/en.js'));
  I18n.use('en');
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // --- Mock reports ---

  // Mock: 4 weak risks (all below 70%), percentage 42
  var mockWeakReport = {
    percentage: 42,
    title: { name: 'Newcomer', emoji: '🌱', threshold: 30 },
    astScores: {
      AST01: { earned: 2, possible: 12, percentage: 16.7 },
      AST02: { earned: 3, possible: 9, percentage: 33.3 },
      AST03: { earned: 1, possible: 6, percentage: 16.7 },
      AST04: { earned: 4, possible: 12, percentage: 33.3 },
      AST05: { earned: 5, possible: 9, percentage: 55.6 },
      AST06: { earned: 8, possible: 9, percentage: 88.9 },
      AST07: { earned: 6, possible: 9, percentage: 66.7 },
      AST08: { earned: 2, possible: 6, percentage: 33.3 },
      AST09: { earned: 9, possible: 12, percentage: 75.0 },
      AST10: { earned: 7, possible: 9, percentage: 77.8 }
    },
    astRanked: [
      { id: 'AST01', earned: 2, possible: 12, percentage: 16.7 },
      { id: 'AST03', earned: 1, possible: 6, percentage: 16.7 },
      { id: 'AST02', earned: 3, possible: 9, percentage: 33.3 },
      { id: 'AST04', earned: 4, possible: 12, percentage: 33.3 },
      { id: 'AST08', earned: 2, possible: 6, percentage: 33.3 },
      { id: 'AST05', earned: 5, possible: 9, percentage: 55.6 },
      { id: 'AST07', earned: 6, possible: 9, percentage: 66.7 },
      { id: 'AST09', earned: 9, possible: 12, percentage: 75.0 },
      { id: 'AST10', earned: 7, possible: 9, percentage: 77.8 },
      { id: 'AST06', earned: 8, possible: 9, percentage: 88.9 }
    ],
    blindSpotIds: ['AST01', 'AST03', 'AST02', 'AST04', 'AST08', 'AST05', 'AST07'],
    weakestQuestions: [
      {
        id: 'q01',
        scenario: 'You found a skill on a marketplace.',
        question: 'What would you actually do?',
        selectedOption: { text: 'Install it — 500+ people can\'t all be wrong', score: 0, feedback: '...' },
        bestPractice: 'Always verify publisher identity.',
        astSourceUrl: 'https://owasp.org/ast01',
        astRisks: ['AST01']
      },
      {
        id: 'q04',
        scenario: 'You noticed a misspelled dependency.',
        question: 'Would you catch this?',
        selectedOption: { text: 'I\'d install it anyway', score: 0, feedback: '...' },
        bestPractice: 'Inspect the full dependency tree.',
        astSourceUrl: 'https://owasp.org/ast02',
        astRisks: ['AST02']
      }
    ],
    totalEarned: 47,
    totalPossible: 108
  };

  // Mock: all risks ≥ 70%
  var mockStrongReport = {
    percentage: 82,
    title: { name: 'Practitioner', emoji: '🛠️', threshold: 70 },
    astScores: {
      AST01: { earned: 10, possible: 12, percentage: 83.3 },
      AST02: { earned: 7, possible: 9, percentage: 77.8 },
      AST03: { earned: 5, possible: 6, percentage: 83.3 },
      AST04: { earned: 10, possible: 12, percentage: 83.3 },
      AST05: { earned: 8, possible: 9, percentage: 88.9 },
      AST06: { earned: 9, possible: 9, percentage: 100.0 },
      AST07: { earned: 8, possible: 9, percentage: 88.9 },
      AST08: { earned: 5, possible: 6, percentage: 83.3 },
      AST09: { earned: 11, possible: 12, percentage: 91.7 },
      AST10: { earned: 8, possible: 9, percentage: 88.9 }
    },
    astRanked: [
      { id: 'AST02', earned: 7, possible: 9, percentage: 77.8 },
      { id: 'AST01', earned: 10, possible: 12, percentage: 83.3 },
      { id: 'AST03', earned: 5, possible: 6, percentage: 83.3 },
      { id: 'AST04', earned: 10, possible: 12, percentage: 83.3 },
      { id: 'AST08', earned: 5, possible: 6, percentage: 83.3 },
      { id: 'AST05', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST07', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST10', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST09', earned: 11, possible: 12, percentage: 91.7 },
      { id: 'AST06', earned: 9, possible: 9, percentage: 100.0 }
    ],
    blindSpotIds: [],
    weakestQuestions: [],
    totalEarned: 89,
    totalPossible: 108
  };

  // --- Tests ---

  // 1. Schema parity
  var result1 = FallbackAssembler.assemble(mockWeakReport, bank);
  check('Schema parity: output has narrative (string) and actions (array with correct fields)',
    typeof result1.narrative === 'string' &&
    Array.isArray(result1.actions) &&
    result1.actions.length > 0,
    typeof result1.narrative + ', ' + result1.actions.length + ' actions');

  // 2. Actions count: 3-5 actions for a report with 4 weak risks
  check('Actions count: 3-5 actions for a report with 4 weak risks',
    result1.actions.length >= 3 && result1.actions.length <= 5,
    'got ' + result1.actions.length);

  // 3. Weakest-first ordering: priorities are ascending (1, 2, 3, ...)
  var prioritiesAscending = true;
  for (var i = 0; i < result1.actions.length; i++) {
    if (result1.actions[i].priority !== i + 1) {
      prioritiesAscending = false;
      break;
    }
  }
  check('Weakest-first ordering: priorities are ascending (1, 2, 3, ...)',
    prioritiesAscending,
    'got [' + result1.actions.map(function(a) { return a.priority; }).join(',') + ']');

  // 4. Valid AST attribution
  var validAstIds = Object.keys(mockWeakReport.astScores);
  var allAstValid = true;
  var badAst = '';
  for (var j = 0; j < result1.actions.length; j++) {
    var src = result1.actions[j].ast_source;
    if (!/^AST\d{2}/.test(src)) {
      allAstValid = false;
      badAst = src;
      break;
    }
    var astId = src.match(/^(AST\d{2})/)[1];
    if (validAstIds.indexOf(astId) === -1) {
      allAstValid = false;
      badAst = astId;
      break;
    }
  }
  check('Valid AST attribution: every action ast_source matches AST\\d{2} and exists in bank',
    allAstValid,
    badAst ? 'bad: ' + badAst : '');

  // 5. Narrative references actual risk names from the bank
  var riskNames = [
    'Malicious Skills', 'Supply Chain Compromise', 'Over-Privileged Skills',
    'Insecure Metadata', 'Untrusted External Instructions', 'Weak Isolation',
    'Update Drift', 'Poor Scanning', 'No Governance', 'Cross-Platform Reuse'
  ];
  var foundCount = 0;
  for (var k = 0; k < riskNames.length; k++) {
    if (result1.narrative.indexOf(riskNames[k]) !== -1) foundCount++;
  }
  check('Narrative references actual risk names from the bank',
    foundCount >= 1,
    'found ' + foundCount + ' risk name(s)');

  // 6. Mock report with percentage=42 and 4 weak risks produces 4 actions
  var report4 = {
    percentage: 42,
    title: { name: 'Newcomer', emoji: '🌱', threshold: 30 },
    astScores: {
      AST01: { earned: 2, possible: 12, percentage: 16.7 },
      AST02: { earned: 6, possible: 9, percentage: 66.7 },
      AST03: { earned: 6, possible: 6, percentage: 100.0 },
      AST04: { earned: 4, possible: 12, percentage: 33.3 },
      AST05: { earned: 8, possible: 9, percentage: 88.9 },
      AST06: { earned: 8, possible: 9, percentage: 88.9 },
      AST07: { earned: 8, possible: 9, percentage: 88.9 },
      AST08: { earned: 2, possible: 6, percentage: 33.3 },
      AST09: { earned: 10, possible: 12, percentage: 83.3 },
      AST10: { earned: 8, possible: 9, percentage: 88.9 }
    },
    astRanked: [
      { id: 'AST01', earned: 2, possible: 12, percentage: 16.7 },
      { id: 'AST04', earned: 4, possible: 12, percentage: 33.3 },
      { id: 'AST08', earned: 2, possible: 6, percentage: 33.3 },
      { id: 'AST02', earned: 6, possible: 9, percentage: 66.7 },
      { id: 'AST09', earned: 10, possible: 12, percentage: 83.3 },
      { id: 'AST05', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST06', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST07', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST10', earned: 8, possible: 9, percentage: 88.9 },
      { id: 'AST03', earned: 6, possible: 6, percentage: 100.0 }
    ],
    blindSpotIds: ['AST01', 'AST04', 'AST08', 'AST02'],
    weakestQuestions: [
      { id: 'q01', scenario: '', question: '', selectedOption: { text: 'Install it', score: 0 }, bestPractice: 'Verify identity.', astSourceUrl: '', astRisks: ['AST01'] },
      { id: 'q04', scenario: '', question: '', selectedOption: { text: 'Install anyway', score: 0 }, bestPractice: 'Check deps.', astSourceUrl: '', astRisks: ['AST02'] },
      { id: 'q06', scenario: '', question: '', selectedOption: { text: 'Accept defaults', score: 0 }, bestPractice: 'Review permissions.', astSourceUrl: '', astRisks: ['AST03'] }
    ],
    totalEarned: 48,
    totalPossible: 108
  };
  var result4 = FallbackAssembler.assemble(report4, bank);
  check('Mock report with percentage=42 and 4 weak risks produces 4 actions',
    result4.actions.length === 4,
    'got ' + result4.actions.length);

  // 7. Mock report with all risks ≥ 70% produces ≤ 2 actions
  var resultStrong = FallbackAssembler.assemble(mockStrongReport, bank);
  check('Mock report with all risks ≥ 70% produces ≤ 2 actions',
    resultStrong.actions.length <= 2,
    'got ' + resultStrong.actions.length);

  return results;
};
