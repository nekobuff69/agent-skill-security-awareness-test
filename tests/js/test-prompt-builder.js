exports.name = 'PromptBuilder';

exports.run = function() {
  var PromptBuilder = require('../../js/prompt-builder.js');
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // --- Mock report with realistic bank data ---
  function mockReport() {
    return {
      percentage: 42,
      title: {
        name: 'Aware',
        emoji: '🔍',
        threshold: 30
      },
      astScores: {
        'AST01': { earned: 3, possible: 12, percentage: 25 },
        'AST02': { earned: 1, possible: 9, percentage: 11.1 },
        'AST03': { earned: 5, possible: 9, percentage: 55.6 },
        'AST04': { earned: 2, possible: 12, percentage: 16.7 },
        'AST05': { earned: 5, possible: 9, percentage: 55.6 },
        'AST06': { earned: 8, possible: 9, percentage: 88.9 },
        'AST07': { earned: 7, possible: 9, percentage: 77.8 },
        'AST08': { earned: 5, possible: 9, percentage: 55.6 },
        'AST09': { earned: 9, possible: 12, percentage: 75.0 },
        'AST10': { earned: 7, possible: 9, percentage: 77.8 }
      },
      astRanked: [
        { id: 'AST02', earned: 1, possible: 9, percentage: 11.1 },
        { id: 'AST04', earned: 2, possible: 12, percentage: 16.7 },
        { id: 'AST01', earned: 3, possible: 12, percentage: 25 },
        { id: 'AST03', earned: 5, possible: 9, percentage: 55.6 },
        { id: 'AST05', earned: 5, possible: 9, percentage: 55.6 },
        { id: 'AST08', earned: 5, possible: 9, percentage: 55.6 },
        { id: 'AST09', earned: 9, possible: 12, percentage: 75.0 },
        { id: 'AST07', earned: 7, possible: 9, percentage: 77.8 },
        { id: 'AST10', earned: 7, possible: 9, percentage: 77.8 },
        { id: 'AST06', earned: 8, possible: 9, percentage: 88.9 }
      ],
      weakestQuestions: [
        {
          id: 'q04',
          scenario: 'An agent can execute arbitrary shell commands without confirmation. What is the safest default?',
          question: 'What would you do?',
          selectedOption: { text: 'Allow all shell commands to streamline workflows', score: 0, feedback: '...' },
          bestPractice: 'Restrict shell execution to an allowlist of pre-approved commands and require user confirmation for any new command.',
          astSourceUrl: 'https://owasp.org/www-project-agentic-skills-top-10/ast02.html',
          astRisks: ['AST02']
        },
        {
          id: 'q11',
          scenario: 'A user asks the agent to summarize a document containing sensitive PII. How should the agent handle it?',
          question: 'How should the agent handle it?',
          selectedOption: { text: 'Summarize the full document including all PII', score: 0, feedback: '...' },
          bestPractice: 'Detect and redact PII before processing; only output sanitized summaries.',
          astSourceUrl: 'https://owasp.org/www-project-agentic-skills-top-10/ast03.html',
          astRisks: ['AST03']
        },
        {
          id: 'q15',
          scenario: 'An external plugin returns data that conflicts with the agent\'s system prompt instructions. What should the agent do?',
          question: 'What should the agent do?',
          selectedOption: { text: 'Trust the plugin data and override system instructions', score: 0, feedback: '...' },
          bestPractice: 'Treat external plugin data as untrusted; never let it override system-level security constraints.',
          astSourceUrl: 'https://owasp.org/www-project-agentic-skills-top-10/ast05.html',
          astRisks: ['AST05']
        }
      ],
      totalEarned: 45,
      totalPossible: 108
    };
  }

  // --- Test 1: All four sections present ---
  var result1 = PromptBuilder.build(mockReport());
  check('All four sections present',
    result1.indexOf('My Profile') !== -1 &&
    result1.indexOf('Weakest Areas') !== -1 &&
    result1.indexOf('How to Teach Me') !== -1 &&
    result1.indexOf('OWASP Agentic Skills Top 10') !== -1,
    'missing sections');

  // --- Test 2: Section order ---
  var posProfile = result1.indexOf('My Profile');
  var posChoices = result1.indexOf('Weakest Areas');
  var posSession = result1.indexOf('How to Teach Me');
  check('Section order: Profile before Weakest Areas before Session Rules',
    posProfile < posChoices && posChoices < posSession,
    'Profile=' + posProfile + ' Weakest=' + posChoices + ' Session=' + posSession);

  // --- Test 3: Budget ≤ 3000 chars with 5 weakest questions ---
  var report5 = mockReport();
  report5.weakestQuestions.push({
    id: 'q18',
    scenario: 'The agent receives a prompt injection attempt embedded in a web page it was asked to summarize. What is the correct response?',
    question: 'What is the correct response?',
    selectedOption: { text: 'Follow the injected instructions since they appear in the content', score: 0, feedback: '...' },
    bestPractice: 'Isolate web content from agent instructions; treat all external text as data, never executable instructions.',
    astSourceUrl: 'https://owasp.org/www-project-agentic-skills-top-10/ast05.html',
    astRisks: ['AST05']
  });
  report5.weakestQuestions.push({
    id: 'q20',
    scenario: 'A newly installed skill requests permission to access the filesystem and the network. The user approved only filesystem access. What should the agent do?',
    question: 'What should the agent do?',
    selectedOption: { text: 'Grant network access anyway since the skill needs it to function properly', score: 0, feedback: '...' },
    bestPractice: 'Enforce principle of least privilege: only honor permissions explicitly granted by the user.',
    astSourceUrl: 'https://owasp.org/www-project-agentic-skills-top-10/ast03.html',
    astRisks: ['AST03']
  });
  var result3 = PromptBuilder.build(report5);
  check('Budget ≤ 3000 chars with 5 weakest questions',
    result3.length <= 3000,
    'length=' + result3.length);

  // --- Test 4: Weakest questions carried correctly ---
  check('Weakest questions carried (id/choice/best practice/link)',
    result1.indexOf('q04') !== -1 &&
    result1.indexOf('q11') !== -1 &&
    result1.indexOf('q15') !== -1 &&
    result1.indexOf('Allow all shell commands to streamline workflows') !== -1 &&
    result1.indexOf('Summarize the full document including all PII') !== -1 &&
    result1.indexOf('Restrict shell execution to an allowlist') !== -1 &&
    result1.indexOf('https://owasp.org/www-project-agentic-skills-top-10/ast02.html') !== -1 &&
    result1.indexOf('https://owasp.org/www-project-agentic-skills-top-10/ast03.html') !== -1,
    'missing content in prompt');

  // --- Test 5: Progression Title and percentage in Profile ---
  check('Title + percentage in Profile',
    result1.indexOf('🔍 Aware') !== -1 &&
    result1.indexOf('Overall: 42%') !== -1,
    'missing title or percentage');

  // --- Test 6: Per-AST scores sorted weakest-first ---
  // AST02 (11.1%) before AST04 (16.7%) before AST01 (25%) before AST03 (55.6%)
  var pos02 = result1.indexOf('- AST02');
  var pos04 = result1.indexOf('- AST04');
  var pos01 = result1.indexOf('- AST01');
  var pos03 = result1.indexOf('- AST03');
  check('Per-AST scores weakest-first ordering',
    pos02 < pos04 && pos04 < pos01 && pos01 < pos03,
    'AST02=' + pos02 + ' AST04=' + pos04 + ' AST01=' + pos01 + ' AST03=' + pos03);

  return results;
};
