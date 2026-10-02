var fs = require('fs');
var path = require('path');

// Both dictionaries are registered up front so a single module can prove the
// budget holds in each language.
var I18n = require('../../js/i18n.js');
require('../../i18n/en.js');
require('../../i18n/zh.js');

require('../../js/scoring.js');
require('../../js/extractor.js');
require('../../js/ast.js');
require('../../js/action-plan.js');
require('../../js/validator.js');

var ActionPlan = globalThis.App.ActionPlan;
var Validator = globalThis.App.ResponseValidator;

exports.name = 'Action Plan prompt budget';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var bank = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../questions.json'), 'utf8')
  );
  var corpus = fs.readFileSync(
    path.resolve(__dirname, '../../docs/owasp-ast-full.md'), 'utf8'
  );

  var astIds = globalThis.App.AST.ids.slice();

  function repeat(text, times) {
    var out = '';
    for (var i = 0; i < times; i++) out += text;
    return out;
  }

  // Worst case the Question Bank can produce: every AST Risk scored, five
  // Weakest Questions carrying very long Scenarios and Best Practices, and a
  // full-length Grounding Excerpt for each of the five weak AST Risks.
  var worst = {
    title: { name: 'Delegating Agent Security Champion', emoji: '🛡️' },
    percentage: 37,
    astRanked: astIds.map(function(id, i) {
      return {
        id: id,
        earned: i + 1,
        possible: 24,
        percentage: Math.round((i + 1) / 24 * 100)
      };
    }),
    weakestQuestions: astIds.slice(0, 5).map(function(id, i) {
      return {
        id: 'Q' + (i + 1),
        selectedOptionIndex: 1,
        weightedScore: 0,
        scenario: repeat('A very long Scenario describing a realistic agent failure mode. ', 30),
        bestPractice: repeat('A very long Best Practice recommendation with detail. ', 20),
        astSourceUrl: 'https://example.org/owasp/ast/0' + (i + 1) + '#risk'
      };
    })
  };

  var excerpts = globalThis.App.Extractor.extract(corpus, astIds.slice(0, 5));

  var normal = globalThis.App.Scoring.computeScores(
    bank,
    bank.test_fixtures.scoring_cases.find(function(c) { return c.id === 'all-zero'; }).answers
  ).report;

  // --- 1. the prompt never exceeds the budget --------------------------------

  ['en', 'zh'].forEach(function(lang) {
    I18n.use(lang);
    var budget = I18n.t('llm.budget');
    var worstPrompt = ActionPlan.buildLlmPrompt(worst, bank, excerpts);
    check(lang + ': worst-case prompt is within t(\'llm.budget\')',
      worstPrompt.length <= budget,
      worstPrompt.length + ' / ' + budget);

    var normalPrompt = ActionPlan.buildLlmPrompt(normal, bank, excerpts);
    check(lang + ': real-report prompt is within t(\'llm.budget\')',
      normalPrompt.length <= budget,
      normalPrompt.length + ' / ' + budget);
  });

  // The ceiling is read from the dictionary, so raising it there raises it
  // here too — assert the shape, not the number. A literal here would only
  // re-assert the constant and would fail on any deliberate retune.
  I18n.use('en');
  check('budget is read from the dictionary as a number',
    typeof I18n.t('llm.budget') === 'number' && I18n.t('llm.budget') > 0,
    String(I18n.t('llm.budget')));

  // The ceiling must be a guardrail, not a permanent tax: a normal report
  // still has to carry every Grounding Excerpt it needs to stay grounded.
  // If the budget is set so low that the ladder always strips the material,
  // the Prompt degrades on every request instead of only on a bad one.
  ['en', 'zh'].forEach(function(lang) {
    I18n.use(lang);
    var budget = I18n.t('llm.budget');
    var p = ActionPlan.buildLlmPrompt(normal, bank, excerpts);
    var kept = (p.match(/^### AST\d\d/gm) || []).length;
    check(lang + ': a normal report keeps all five Grounding Excerpts under the budget',
      kept === 5, kept + ' of 5, prompt ' + p.length + ' / ' + budget);
  });

  // --- 2. the trim ladder is deterministic ------------------------------------

  ['en', 'zh'].forEach(function(lang) {
    I18n.use(lang);
    var first = ActionPlan.buildLlmPrompt(worst, bank, excerpts);
    var stable = true;
    for (var i = 0; i < 4; i++) {
      if (ActionPlan.buildLlmPrompt(worst, bank, excerpts) !== first) stable = false;
    }
    check(lang + ': the same report builds a byte-identical prompt every time', stable);

    // Determinism must also hold across the fields the ladder reads in a fixed
    // order: buildSourceMaterial walks Object.keys, which is insertion order,
    // so two extracts of the same corpus agree.
    var a = ActionPlan.buildLlmPrompt(worst, bank,
      globalThis.App.Extractor.extract(corpus, astIds.slice(0, 5)));
    var b = ActionPlan.buildLlmPrompt(worst, bank,
      globalThis.App.Extractor.extract(corpus, astIds.slice(0, 5)));
    check(lang + ': repeated extraction builds the same prompt', a === b);
  });

  // --- 3. the load-bearing sections survive trimming -------------------------

  // A real report is already trimmed on every run (see the budget figures
  // below), so the assertions are made against that trimmed output, and again
  // against a budget small enough to force the deepest step.
  ['en', 'zh'].forEach(function(lang) {
    I18n.use(lang);
    var system = I18n.t('llm.system', {
      languageRule: I18n.t('llm.languageRule', { language: I18n.t('lang.name') })
    });
    var outputFormat = I18n.t('llm.outputFormat');
    var trimmed = ActionPlan.buildLlmPrompt(worst, bank, excerpts);

    check(lang + ': System Instruction survives trimming intact',
      trimmed.indexOf(system) === 0);
    check(lang + ': language rule survives inside the System Instruction',
      trimmed.indexOf(I18n.t('llm.languageRule', { language: I18n.t('lang.name') })) !== -1);
    check(lang + ': Output Format survives trimming intact',
      trimmed.indexOf(outputFormat) !== -1);
    check(lang + ': Output Format closes the prompt',
      trimmed.slice(-outputFormat.length) === outputFormat);

    // Grounding coverage: every weak AST Risk the report asked for is still
    // named, so the model can still ground an action in it.
    var weakAst = worst.astRanked.slice(0, 5).map(function(r) { return r.id; });
    var missing = weakAst.filter(function(id) {
      return trimmed.indexOf(I18n.t('llm.source.section', { id: id })) === -1;
    });
    check(lang + ': every weak AST Risk section survives trimming', missing.length === 0,
      missing.join(', '));

    // A clipped field is marked, so the model reads it as cut.
    check(lang + ': clipped excerpt fields carry the truncation marker',
      trimmed.indexOf(I18n.t('llm.excerpt.truncated')) !== -1);
  });

  // Register a copy of the en dictionary under a throwaway locale with a much
  // smaller budget, to force the deep steps of the ladder. Ids are read from
  // the shipped source and resolved through t(), so no value is ever
  // re-parsed and neither dictionary file changes.
  function dictionaryWithBudget(locale, budget) {
    I18n.use('en');
    var src = fs.readFileSync(path.resolve(__dirname, '../../i18n/en.js'), 'utf8');
    var ids = [];
    var re = /^\s*'([^']+)':/gm;
    var m;
    while ((m = re.exec(src)) !== null) ids.push(m[1]);
    var dict = {};
    for (var i = 0; i < ids.length; i++) dict[ids[i]] = I18n.t(ids[i]);
    dict['llm.budget'] = budget;
    I18n.register(locale, dict);
    I18n.use(locale);
  }

  function systemAndFormat() {
    return {
      system: I18n.t('llm.system', {
        languageRule: I18n.t('llm.languageRule', { language: I18n.t('lang.name') })
      }),
      outputFormat: I18n.t('llm.outputFormat')
    };
  }

  // A budget above head + tail (1403 chars in English) but far below the real
  // report, so the deep steps of the ladder fire and the contract is tested.
  (function() {
    dictionaryWithBudget('tiny', 1600);
    var budget = I18n.t('llm.budget');
    var prompt = ActionPlan.buildLlmPrompt(worst, bank, excerpts);
    var parts = systemAndFormat();
    check('tiny budget: prompt is still within budget',
      prompt.length <= budget, prompt.length + ' / ' + budget);
    check('tiny budget: System Instruction survives intact',
      prompt.indexOf(parts.system) === 0);
    check('tiny budget: Output Format survives intact',
      prompt.slice(-parts.outputFormat.length) === parts.outputFormat);
  })();

  // A budget below head + tail: the hard slice is the documented last resort,
  // and the length guarantee still holds.
  (function() {
    dictionaryWithBudget('narrow', 120);
    var budget = I18n.t('llm.budget');
    var prompt = ActionPlan.buildLlmPrompt(worst, bank, excerpts);
    check('budget smaller than head + tail: prompt still respects the budget',
      prompt.length <= budget, prompt.length + ' / ' + budget);
  })();

  // Leave the process on 'en', the locale the shipped suites expect.
  I18n.use('en');

  // --- 4. the Chinese output still validates ---------------------------------

  var zhNarrative = '你的自评显示，你在多步代理任务的权限交接上留下了明显的盲区：' +
    '你多次选择让子代理自行决定工具调用范围，而不是在每一步显式授权。' +
    '结合 OWASP 素材中关于权限提升与过度自主的证据，这意味着一个被诱导的子代理' +
    '可以在你不知情的情况下扩大操作范围。建议先收紧默认权限，再逐步放权。';

  var zhActions = [
    {
      priority: 1,
      title: '为每个子代理显式声明最小权限',
      description: '按 OWASP 素材中最小权限原则，为每个子代理单独列出允许调用的工具清单，并在评审时逐条核对。',
      ast_source: 'AST02'
    },
    {
      priority: 2,
      title: '在高风险工具前加入人工确认',
      description: '依据素材中关于人工介入缓解的建议，在子代理执行删除、支付或外发动作前要求一次显式确认。',
      ast_source: 'AST03'
    }
  ];

  var zhOk = Validator.validate(JSON.stringify({
    narrative: zhNarrative,
    actions: zhActions
  }), bank);
  check('validator accepts a Chinese Narrative with Chinese Actions', zhOk.ok,
    zhOk.ok ? '' : zhOk.error);
  check('Chinese Narrative clears the 50-character minimum',
    zhNarrative.length >= 50, zhNarrative.length + ' characters');

  // An unknown AST Risk is still a rejection: the grounding contract does not
  // weaken for Chinese output.
  var unknown = Validator.validate(JSON.stringify({
    narrative: zhNarrative,
    actions: [
      {
        priority: 1,
        title: '引用一个不在题库里的 AST 风险',
        description: '这条行动的 ast_source 指向一个题库里不存在的 AST 编号，应当被运行时校验拒绝。',
        ast_source: 'AST99'
      }
    ]
  }), bank);
  check('validator rejects a Chinese action whose ast_source is not in the Question Bank',
    !unknown.ok && /unknown AST ID/.test(unknown.ok ? '' : unknown.error),
    unknown.ok ? 'accepted' : unknown.error);

  // The Chinese Narrative reaches 50 characters sooner than the English one,
  // which is the correct direction — confirm the English original is the
  // binding constraint, not the Chinese translation.
  var enNarrative = 'Your self-assessment shows a clear blind spot in how you hand off ' +
    'authority across multi-step agent tasks: you repeatedly chose to let a sub-agent ' +
    'decide its own tool scope rather than granting it explicitly at each step. Against ' +
    'the OWASP material on privilege escalation and excessive autonomy, that means an ' +
    'induced sub-agent can widen its reach without your knowledge.';
  check('English Narrative clears the same 50-character minimum',
    Validator.validate(JSON.stringify({
      narrative: enNarrative,
      actions: [{ priority: 1, title: 'Pin the skill', description: 'Pin to a hash.', ast_source: 'AST01' }]
    }), bank).ok);
  check('a Narrative under 50 characters is still rejected',
    !Validator.validate(JSON.stringify({
      narrative: '太短了。',
      actions: zhActions
    }), bank).ok);

  return results;
};