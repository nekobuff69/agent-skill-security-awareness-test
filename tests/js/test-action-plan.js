var fs = require('fs');
var path = require('path');

// Select the Chrome String dictionary before the modules build any prompt.
var I18n = require('../../js/i18n.js');
require('../../i18n/en.js');
I18n.use('en');

require('../../js/scoring.js');
require('../../js/fallback.js');
require('../../js/extractor.js');
require('../../js/llm-client.js');
require('../../js/action-plan.js');

exports.name = 'Action Plan module';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var ActionPlan = globalThis.App.ActionPlan;
  var bank = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../questions.json'), 'utf8')
  );
  var report = globalThis.App.Scoring.computeScores(
    bank,
    bank.test_fixtures.scoring_cases.find(function(c) { return c.id === 'all-zero'; }).answers
  ).report;

  var corpusText = fs.readFileSync(
    path.resolve(__dirname, '../../docs/owasp-ast-full.md'), 'utf8'
  );

  // The Action Plan module looks up App.LLMClient at call time, so tests
  // swap in a fake adapter and restore it afterwards.
  var realLLMClient = globalThis.App.LLMClient;
  var fakeCalls = [];
  var fakeResponses = []; // one entry per generate() call

  function installFake(responses) {
    fakeCalls = [];
    fakeResponses = responses;
    globalThis.App.LLMClient = {
      generate: function(prompt, config, b) {
        fakeCalls.push({ prompt: prompt, config: config, bank: !!b });
        var resp = fakeResponses.shift() || { ok: false, reason: 'network' };
        return Promise.resolve(resp);
      }
    };
  }

  function run(name, config, corpus, responses, assertions) {
    return function() {
      installFake(responses);
      return ActionPlan.assemble(report, bank, corpus, config)
        .then(function(plan) {
          assertions(plan);
        })
        .catch(function(err) {
          check(name + ': resolved without error', false, String(err));
        });
    };
  }

  // Sequential chain: each run's fake-adapter state must not be reset while
  // another run's microtasks are still pending.
  var chain = Promise.resolve();

  // 1. No proxy configured → Deterministic Fallback
  chain = chain.then(run('fallback|no-proxy', {}, corpusText, [], function(plan) {
    check('fallback|no-proxy: path is fallback', plan.path === 'fallback', plan.path);
    check('fallback|no-proxy: narrative is a non-empty string',
      typeof plan.narrative === 'string' && plan.narrative.length > 0);
    check('fallback|no-proxy: actions carry ast_source',
      Array.isArray(plan.actions) && plan.actions.length > 0 &&
      plan.actions.every(function(a) { return /^AST\d{2}/.test(a.ast_source); }));
    check('fallback|no-proxy: no LLM call made', fakeCalls.length === 0);
  }));

  // 2. Corpus missing → Deterministic Fallback even with proxy configured
  chain = chain.then(run('fallback|no-corpus', { proxyUrl: 'https://proxy.example' }, null, [], function(plan) {
    check('fallback|no-corpus: path is fallback', plan.path === 'fallback', plan.path);
    check('fallback|no-corpus: no LLM call made', fakeCalls.length === 0);
  }));

  // 3. LLM success on first attempt → LLM Path, no retry
  chain = chain.then(run('llm|first-attempt', { proxyUrl: 'https://proxy.example' }, corpusText, [
    { ok: true, narrative: 'The analysis narrative from the provider.', actions: [
      { priority: 1, title: 'Pin your skills', description: 'Pin to immutable hashes.', ast_source: 'AST01' }
    ]}
  ], function(plan) {
    check('llm|first-attempt: path is llm', plan.path === 'llm', plan.path);
    check('llm|first-attempt: narrative passes through',
      plan.narrative === 'The analysis narrative from the provider.');
    check('llm|first-attempt: actions pass through',
      plan.actions.length === 1 && plan.actions[0].ast_source === 'AST01');
    check('llm|first-attempt: exactly one LLM call', fakeCalls.length === 1,
      String(fakeCalls.length));
    check('llm|first-attempt: prompt carries the report and grounding',
      fakeCalls[0] && fakeCalls[0].prompt.indexOf('Per-AST Scores') !== -1 &&
      fakeCalls[0].prompt.indexOf('OWASP Source Material') !== -1);
    check('llm|first-attempt: proxy config forwarded',
      fakeCalls[0] && fakeCalls[0].config.proxyUrl === 'https://proxy.example');
  }));

  // 4. First attempt fails, retry succeeds → LLM Path
  chain = chain.then(run('llm|retry-succeeds', { proxyUrl: 'https://proxy.example' }, corpusText, [
    { ok: false, reason: 'network' },
    { ok: true, narrative: 'Retry narrative.', actions: [
      { priority: 1, title: 'Rotate keys', description: 'Rotate now.', ast_source: 'AST06' }
    ]}
  ], function(plan) {
    check('llm|retry-succeeds: path is llm', plan.path === 'llm', plan.path);
    check('llm|retry-succeeds: second attempt wins',
      plan.narrative === 'Retry narrative.');
    check('llm|retry-succeeds: two LLM calls (one retry)', fakeCalls.length === 2,
      String(fakeCalls.length));
  }));

  // 5. Both attempts fail → Deterministic Fallback (ADR-0009: one retry)
  chain = chain.then(run('fallback|after-retry', { proxyUrl: 'https://proxy.example' }, corpusText, [
    { ok: false, reason: 'network' },
    { ok: false, reason: 'timeout' }
  ], function(plan) {
    check('fallback|after-retry: path is fallback', plan.path === 'fallback', plan.path);
    check('fallback|after-retry: narrative present',
      typeof plan.narrative === 'string' && plan.narrative.length > 0);
    check('fallback|after-retry: exactly two LLM calls', fakeCalls.length === 2,
      String(fakeCalls.length));
  }));

  // 6. LLM client throws → Deterministic Fallback
  chain = chain.then(function() {
    fakeCalls = [];
    globalThis.App.LLMClient = {
      generate: function() { return Promise.reject(new Error('boom')); }
    };
    return ActionPlan.assemble(report, bank, corpusText,
        { proxyUrl: 'https://proxy.example' })
      .then(function(plan) {
        check('fallback|throw: path is fallback', plan.path === 'fallback', plan.path);
      })
      .catch(function(err) {
        check('fallback|throw: resolved without error', false, String(err));
      });
  });

  return chain.then(function() {
    globalThis.App.LLMClient = realLLMClient; // restore for other test modules
    return results;
  });
};
