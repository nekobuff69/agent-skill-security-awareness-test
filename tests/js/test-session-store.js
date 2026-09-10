var assert = require('assert');

exports.name = 'SessionStore';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // Mock localStorage — must be in place before requiring the module
  var store = {};
  globalThis.localStorage = {
    getItem: function(k) { return store[k] || null; },
    setItem: function(k, v) { store[k] = v; },
    removeItem: function(k) { delete store[k]; }
  };

  // Load module
  require('../../js/session-store.js');
  var SS = globalThis.App.SessionStore;

  var bank1 = {
    questions: [{ id: 'q1', text: 'Hello?' }, { id: 'q2', text: 'World?' }],
    phases: ['intro', 'main']
  };

  var bank2 = {
    questions: [{ id: 'q1', text: 'Hello!' }, { id: 'q2', text: 'World?' }],
    phases: ['intro', 'main']
  };

  // 1. save + load roundtrip
  var answers1 = [0, 1, 2, null, 0];
  SS.save(bank1, answers1);
  var r1 = SS.load(bank1);
  check('save + load roundtrip',
    r1.ok === true && JSON.stringify(r1.answers) === JSON.stringify(answers1),
    JSON.stringify(r1));

  // 2. stale hash when bank questions change
  SS.save(bank1, [0, 1]);
  var r2 = SS.load(bank2);
  check('stale hash when bank questions change',
    r2.ok === false && r2.reason === 'stale',
    JSON.stringify(r2));

  // 3. empty localStorage returns empty
  SS.clear();
  var r3 = SS.load(bank1);
  check('empty localStorage returns empty',
    r3.ok === false && r3.reason === 'empty',
    JSON.stringify(r3));

  // 4. corrupt JSON in localStorage
  store['quiz-session'] = '{bad json';
  var r4 = SS.load(bank1);
  check('corrupt JSON returns empty',
    r4.ok === false && r4.reason === 'empty',
    JSON.stringify(r4));

  // 5. clear() removes session
  SS.save(bank1, [0, 1]);
  var existed = store['quiz-session'] !== undefined;
  SS.clear();
  var gone = store['quiz-session'] === undefined;
  check('clear() removes session', existed && gone);

  // 6. hashBank is consistent
  var h1 = SS.hashBank(bank1);
  var h2 = SS.hashBank(bank1);
  check('hashBank produces consistent hash for same input',
    h1 === h2 && typeof h1 === 'string' && h1.length === 8,
    'hash=' + h1 + ' len=' + h1.length);

  // 7. null answers preserved in roundtrip
  var nullAnswers = [null, null, null];
  SS.save(bank1, nullAnswers);
  var r7 = SS.load(bank1);
  check('null answers preserved in roundtrip',
    r7.ok === true && Array.isArray(r7.answers) &&
    r7.answers.length === 3 &&
    r7.answers[0] === null && r7.answers[1] === null && r7.answers[2] === null,
    JSON.stringify(r7));

  return results;
};
