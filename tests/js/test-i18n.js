var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '../..');

exports.name = 'I18n Chrome String dictionary';

exports.run = function() {
  var I18n = require(path.join(ROOT, 'js/i18n.js'));
  require(path.join(ROOT, 'i18n/en.js'));
  I18n.use('en');

  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // --- t() returns the English string ---

  check('t() returns the English string',
    I18n.t('quiz.labelScenario') === 'Scenario',
    I18n.t('quiz.labelScenario'));

  check('t() returns the previous button text',
    I18n.t('quiz.previous') === '← Previous',
    JSON.stringify(I18n.t('quiz.previous')));

  check('t() returns a multi-word chrome string verbatim',
    I18n.t('results.narrativeSummary') === 'Why these actions? Read the analysis',
    I18n.t('results.narrativeSummary'));

  // --- t() throws on a missing id rather than returning empty or English ---

  var threw = false;
  var returned = 'NOT_SET';
  try {
    returned = I18n.t('this.id.does.not.exist');
  } catch (e) {
    threw = true;
  }
  check('t() throws on a missing id', threw);
  check('t() does not return a value for a missing id', returned === 'NOT_SET',
    String(returned));
  check('t() does not return empty string for a missing id', returned !== '',
    JSON.stringify(returned));

  // --- extend() merges add-on Chrome Strings without replacing the base ---

  I18n.extend('en', { 'shell.test.merged': 'Merged value' });
  check('extend() adds a new id to a registered locale',
    I18n.t('shell.test.merged') === 'Merged value', I18n.t('shell.test.merged'));
  check('extend() keeps base dictionary ids after merging',
    I18n.t('quiz.labelScenario') === 'Scenario');
  I18n.extend('en', { 'shell.test.merged': 'Overwritten' });
  check('extend() lets a later duplicate id win (namespacing convention)',
    I18n.t('shell.test.merged') === 'Overwritten');
  I18n.extend('probe', { 'shell.test.merged': 'Probe only' });
  I18n.use('probe');
  check('extend() registers a locale that had no base dictionary (add-on before base load never blanks a page)',
    I18n.t('shell.test.merged') === 'Probe only', I18n.t('shell.test.merged'));
  var probeMissingThrew = false;
  try { I18n.t('quiz.labelScenario'); } catch (e) { probeMissingThrew = true; }
  check('an add-on-only dictionary still throws for base ids it never provided', probeMissingThrew);
  I18n.use('en');
  var extendThrew = false;
  try { I18n.extend('en', null); } catch (e) { extendThrew = true; }
  check('extend() rejects a non-object additions argument', extendThrew);

  var astThrew = false;
  try {
    I18n.astName('AST99');
  } catch (e) {
    astThrew = true;
  }
  check('astName() throws for an unknown AST id', astThrew);

  // --- placeholder substitution ---

  check('placeholder substitution fills {number} and {title}',
    I18n.t('quiz.phaseChip', { number: 2, title: 'Should I Install This?' }) ===
      'Phase 2 · Should I Install This?',
    I18n.t('quiz.phaseChip', { number: 2, title: 'Should I Install This?' }));

  check('placeholder substitution fills {count} and {time}',
    I18n.t('landing.meta', { count: 20, time: '8-12 minutes' }) ===
      '20 questions · 8-12 minutes',
    I18n.t('landing.meta', { count: 20, time: '8-12 minutes' }));

  check('placeholder substitution fills {risk} in a fallback string',
    I18n.t('fallback.action.title', { risk: 'Malicious Skills' }) ===
      'Improve Malicious Skills',
    I18n.t('fallback.action.title', { risk: 'Malicious Skills' }));

  check('a single placeholder used twice is substituted both times',
    I18n.t('llm.weakestLine', { id: 'Q01', selected: 'it', score: 0 }) ===
      '- Q01: Chose "it" (score: 0/3)',
    I18n.t('llm.weakestLine', { id: 'Q01', selected: 'it', score: 0 }));

  // --- baseLocale normalizes script/region tags ---

  check("baseLocale('zh-Hans') normalizes to zh", I18n.baseLocale('zh-Hans') === 'zh',
    I18n.baseLocale('zh-Hans'));
  check("baseLocale('zh-Hans-CN') normalizes to zh", I18n.baseLocale('zh-Hans-CN') === 'zh',
    I18n.baseLocale('zh-Hans-CN'));
  check("baseLocale('zh_CN') normalizes to zh", I18n.baseLocale('zh_CN') === 'zh',
    I18n.baseLocale('zh_CN'));
  check("baseLocale('en-US') normalizes to en", I18n.baseLocale('en-US') === 'en',
    I18n.baseLocale('en-US'));
  check("baseLocale(' EN ') is trimmed and lowercased", I18n.baseLocale(' EN ') === 'en',
    I18n.baseLocale(' EN '));

  // --- astName resolves AST Risk names from the dictionary ---

  check("astName('AST01') returns 'Malicious Skills'",
    I18n.astName('AST01') === 'Malicious Skills',
    I18n.astName('AST01'));

  check("astName('AST10') returns 'Cross-Platform Reuse'",
    I18n.astName('AST10') === 'Cross-Platform Reuse',
    I18n.astName('AST10'));

  // Every AST id in the registry has a dictionary name.
  var AST = require(path.join(ROOT, 'js/ast.js'));
  var missingNames = [];
  for (var i = 0; i < AST.ids.length; i++) {
    try {
      I18n.astName(AST.ids[i]);
    } catch (e) {
      missingNames.push(AST.ids[i]);
    }
  }
  check('every AST id has a dictionary name', missingNames.length === 0,
    missingNames.join(', '));

  // AST names live in exactly one place: the dictionary, not js/ast.js.
  check('js/ast.js no longer carries a names table', AST.names === undefined,
    typeof AST.names);

  // Severity stays in js/ast.js — it is scoring metadata, not UI copy.
  check('js/ast.js still owns ids and severity',
    Array.isArray(AST.ids) && AST.ids.length === 10 &&
    typeof AST.severity === 'object' && AST.severity.AST01 === 'critical');

  // --- the dictionary has no unintentionally empty value ---

  // Read the shipped dictionary source so this covers every id, including
  // ones this test does not itself call.
  var src = fs.readFileSync(path.join(ROOT, 'i18n/en.js'), 'utf8');
  var re = /^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)'/gm;
  var m;
  var total = 0;
  var empties = [];

  while ((m = re.exec(src)) !== null) {
    total++;
    // An escaped-quote-free empty string is the only empty case.
    if (m[2] === '') empties.push(m[1]);
  }

  check('dictionary declares a non-trivial number of ids', total > 80, String(total));
  check('no dictionary id has an unintentionally empty value', empties.length === 0,
    empties.join(', '));

  // --- every id the modules actually ask for exists ---

  // Spot-check the id set the UI modules depend on, so a rename in the
  // dictionary surfaces here rather than as a runtime throw.
  var requiredIds = [
    'doc.title', 'lang.name', 'lang.switchUnavailable',
    'loading.bank', 'error.loadBank', 'error.retry',
    'landing.headline1', 'landing.headline2', 'landing.titleFallback',
    'landing.body', 'landing.meta',
    'landing.metaCountFallback', 'landing.timeFallback', 'landing.start',
    'quiz.phaseChip', 'quiz.questionChip', 'quiz.labelScenario',
    'quiz.labelQuestion', 'quiz.previous', 'quiz.bankChanged',
    'results.radarTitle', 'results.barsTitle', 'results.actionPlanTitle',
    'results.deepDiveTitle', 'results.planLoading', 'results.narrativeSummary',
    'results.deepDiveHeading', 'results.deepDiveSub', 'results.showPrompt',
    'results.copy', 'results.copied', 'results.copyFailed', 'results.downloadPng',
    'results.share', 'results.shareTitle', 'results.shareText', 'results.retake',
    'results.reviewBtn', 'results.reviewTitle', 'results.reviewBack',
    'review.feedbackLabel', 'review.bestPracticeLabel', 'review.viewOnOwasp',
    'fallback.behavior.none', 'fallback.behavior.single', 'fallback.behavior.multiple',
    'fallback.quoteOpen', 'fallback.quoteClose', 'fallback.ellipsis',
    'fallback.insight.generic', 'fallback.narrative.item', 'fallback.narrative.clear',
    'fallback.action.title', 'fallback.action.description.generic',
    'fallback.action.description.owaspRef',
    'prompt.budget', 'prompt.titleFallback', 'prompt.titleFallbackEmoji',
    'prompt.framing', 'prompt.sessionRules', 'prompt.profile.heading',
    'prompt.profile.title', 'prompt.profile.overall', 'prompt.profile.astScores',
    'prompt.weakest.heading', 'prompt.item.scenario', 'prompt.item.chose',
    'prompt.item.bestPractice', 'prompt.item.owasp',
    'llm.system', 'llm.languageRule', 'llm.participant.heading',
    'llm.participant.title', 'llm.participant.overall', 'llm.astScores.heading',
    'llm.astLine', 'llm.weakest.heading', 'llm.weakestLine', 'llm.weakestScenario',
    'llm.weakestBestPractice', 'llm.weakestOwasp', 'llm.source.heading',
    'llm.source.section', 'llm.source.evidence', 'llm.source.mitigations',
    'llm.outputFormat',
    'severity.critical', 'severity.high', 'severity.medium'
  ];

  var missingIds = requiredIds.filter(function(id) { return !I18n.has(id); });
  check('every id the UI modules ask for is present', missingIds.length === 0,
    missingIds.join(', '));

  // --- budgets stay numbers ---

  check('prompt.budget is the number 3000', I18n.t('prompt.budget') === 3000,
    String(I18n.t('prompt.budget')));
  // Not pinned to a literal: the LLM prompt budget is an operational knob,
  // not a contract. What must hold is that it is a usable number. The
  // cross-language half of this check needs a second dictionary and lands
  // with the Simplified Chinese page.
  check('llm.budget is a positive number', typeof I18n.t('llm.budget') === 'number' &&
    I18n.t('llm.budget') > 0, String(I18n.t('llm.budget')));

  // A Chinese Participant must not get a different guardrail from an English
  // one — the same ceiling in both dictionaries.
  // Requiring the dictionary registers it; it exports nothing of its own.
  require(path.join(ROOT, 'i18n/zh.js'));
  I18n.use('zh');
  var zhLlmBudget = I18n.t('llm.budget');
  var zhPromptBudget = I18n.t('prompt.budget');
  I18n.use('en');
  check('both languages enforce the same budgets',
    zhLlmBudget === I18n.t('llm.budget') && zhPromptBudget === I18n.t('prompt.budget'),
    zhLlmBudget + '/' + zhPromptBudget);

  // --- the two dictionaries declare the same ids (no id drift) ---

  function declaredIds(rel) {
    var text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    var idRe = /^\s*'([^']+)':/gm;
    var found = [];
    var hit;
    while ((hit = idRe.exec(text)) !== null) found.push(hit[1]);
    return found.sort();
  }

  var enIds = declaredIds('i18n/en.js');
  var zhIds = declaredIds('i18n/zh.js');
  var zhOnly = zhIds.filter(function(id) { return enIds.indexOf(id) === -1; });
  var enOnly = enIds.filter(function(id) { return zhIds.indexOf(id) === -1; });
  check('the two dictionaries declare exactly the same ids (no id drift)',
    enIds.length === zhIds.length && zhOnly.length === 0 && enOnly.length === 0,
    'en=' + enIds.length + ' zh=' + zhIds.length +
    ' zh-only=' + zhOnly.join(',') + ' en-only=' + enOnly.join(','));

  // --- format() leaves unknown placeholders intact ---

  check('format() leaves an unsupplied placeholder intact',
    I18n.format('a {one} b {two}', { one: 'X' }) === 'a X b {two}',
    I18n.format('a {one} b {two}', { one: 'X' }));

  return results;
};
