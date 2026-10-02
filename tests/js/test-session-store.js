var assert = require('assert');

exports.name = 'SessionStore';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // Mock localStorage — must be in place before requiring the module, and must
  // expose length/key() because the store enumerates legacy keys to migrate.
  var store = {};
  globalThis.localStorage = {
    get length() { return Object.keys(store).length; },
    key: function(i) { return Object.keys(store)[i]; },
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  };

  // Load module
  require('../../js/session-store.js');
  var SS = globalThis.App.SessionStore;

  var KEY = 'quiz-session';

  function opt(score, text) {
    return { text: text || ('choice ' + score), score: score, feedback: 'because ' + score };
  }

  function question(id, scores, text) {
    return {
      id: id,
      phase: 'phase1',
      ast_risks: ['AST01'],
      severity_weight: 'high',
      scenario: text || 'a scenario',
      question: text || ('ask about ' + id),
      options: scores.map(function(s, i) { return opt(s, text + ' option ' + i); })
    };
  }

  function makeBank(opts) {
    opts = opts || {};
    return {
      meta: { scoring: { severity_values: opts.severity || { critical: 3, high: 2, medium: 1 } } },
      phases: [{ id: 'phase1', question_ids: ['q1', 'q2', 'q3'] }],
      questions: opts.questions || [
        question('q1', [0, 1, 2, 3]),
        question('q2', [0, 2, 1, 3]),
        question('q3', [0, 1, 2, 3])
      ]
    };
  }

  // The same assessment as makeBank(), authored in another language: every
  // authored string differs, nothing structural does.
  function makeBankOtherLanguage() {
    var bank = makeBank();
    bank.questions.forEach(function(q) {
      q.scenario = '一个场景';
      q.question = '关于 ' + q.id + ' 的问题';
      q.options.forEach(function(o, i) { o.text = '选项 ' + i; o.feedback = '因为 ' + i; });
    });
    bank.phases[0].title = '阶段一';
    return bank;
  }

  var bankEn = makeBank();
  var bankZh = makeBankOtherLanguage();

  function reset() {
    Object.keys(store).forEach(function(k) { delete store[k]; });
  }

  // 1. save + load roundtrip
  var answers1 = [0, 1, 2];
  SS.save(bankEn, answers1);
  var r1 = SS.load(bankEn);
  check('save + load roundtrip',
    r1.ok === true && JSON.stringify(r1.answers) === JSON.stringify(answers1),
    JSON.stringify(r1));

  // 2. The invariant the whole design rests on: authored text is excluded from
  //    the hash, so both Bank Variants version-stamp one shared Session
  //    identically. If this fails, a language switch wipes in-progress answers.
  check('structural hash is identical across Bank Variants that differ only in text',
    SS.hashBank(bankEn) === SS.hashBank(bankZh),
    'en=' + SS.hashBank(bankEn) + ' zh=' + SS.hashBank(bankZh));
  check('the two Bank Variants really do differ in authored text',
    bankEn.questions[0].question !== bankZh.questions[0].question,
    bankEn.questions[0].question + ' vs ' + bankZh.questions[0].question);

  // 3. A Participant's progress survives a language switch — the behaviour
  //    under test. Answer in English, resume from the Chinese page.
  reset();
  SS.save(bankEn, [3, 0, null]);
  var rZh = SS.load(bankZh);
  check('a Session saved in one language resumes intact in the other',
    rZh.ok === true && JSON.stringify(rZh.answers) === JSON.stringify([3, 0, null]),
    JSON.stringify(rZh));
  check('a language switch does not leave a second Session behind',
    Object.keys(store).join(',') === KEY,
    Object.keys(store).join(','));

  // 4. Anything that would re-attribute an answer must invalidate the Session.
  //    Question order is the case the deploy gate cannot see.
  var reordered = makeBank({
    questions: [bankEn.questions[1], bankEn.questions[0], bankEn.questions[2]]
  });
  check('reordering the Question array changes the hash',
    SS.hashBank(reordered) !== SS.hashBank(bankEn),
    'reordered=' + SS.hashBank(reordered) + ' original=' + SS.hashBank(bankEn));

  reset();
  SS.save(bankEn, [0, 1, 2]);
  var rReordered = SS.load(reordered);
  check('a reordered bank reads as stale rather than mis-scoring',
    rReordered.ok === false && rReordered.reason === 'stale',
    JSON.stringify(rReordered));

  // 5. Option Scores and Severity Weights drive the number, so they are hashed.
  var rescored = makeBank({
    questions: [bankEn.questions[0], bankEn.questions[1],
      question('q3', [0, 3, 2, 1])]
  });
  check('re-scoring an Option changes the hash',
    SS.hashBank(rescored) !== SS.hashBank(bankEn),
    'rescored=' + SS.hashBank(rescored));

  reset();
  SS.save(bankEn, [0, 1, 2]);
  var rRescored = SS.load(rescored);
  check('a re-scored bank reads as stale',
    rRescored.ok === false && rRescored.reason === 'stale',
    JSON.stringify(rRescored));

  var reweighted = makeBank({ severity: { critical: 3, high: 1, medium: 1 } });
  check('changing Severity Weights changes the hash',
    SS.hashBank(reweighted) !== SS.hashBank(bankEn),
    'reweighted=' + SS.hashBank(reweighted));

  // 6. Purely editorial text changes must NOT cost anyone their progress.
  var reworded = makeBank();
  reworded.questions[0].question = 'an entirely different wording';
  reworded.questions[1].best_practice = 'new best practice';
  check('rewording authored text does not change the hash',
    SS.hashBank(reworded) === SS.hashBank(bankEn),
    'reworded=' + SS.hashBank(reworded));

  reset();
  SS.save(bankEn, [1, 2, 0]);
  var rReworded = SS.load(reworded);
  check('a reworded bank keeps the Session',
    rReworded.ok === true && JSON.stringify(rReworded.answers) === JSON.stringify([1, 2, 0]),
    JSON.stringify(rReworded));

  // 7. Adding or removing a Question invalidates the Session.
  var grown = makeBank({
    questions: bankEn.questions.concat([question('q4', [0, 1, 2, 3])])
  });
  check('adding a Question changes the hash',
    SS.hashBank(grown) !== SS.hashBank(bankEn),
    'grown=' + SS.hashBank(grown));

  // 8. hashBank is deterministic
  var h1 = SS.hashBank(bankEn);
  var h2 = SS.hashBank(bankEn);
  check('hashBank produces consistent hash for same input',
    h1 === h2 && typeof h1 === 'string' && h1.length === 8,
    'hash=' + h1 + ' len=' + h1.length);

  // 9. empty storage returns empty
  reset();
  var r3 = SS.load(bankEn);
  check('empty localStorage returns empty',
    r3.ok === false && r3.reason === 'empty',
    JSON.stringify(r3));

  // 10. corrupt JSON in localStorage
  reset();
  store[KEY] = '{bad json';
  var r4 = SS.load(bankEn);
  check('corrupt JSON returns empty',
    r4.ok === false && r4.reason === 'empty',
    JSON.stringify(r4));

  // 11. clear() removes the Session
  reset();
  SS.save(bankEn, [0, 1, 2]);
  var existed = store[KEY] !== undefined;
  SS.clear();
  var gone = store[KEY] === undefined;
  check('clear() removes session', existed && gone);

  // 12. nulls preserved in roundtrip — null means "not yet answered"
  reset();
  SS.save(bankEn, [null, 1, null]);
  var r12 = SS.load(bankEn);
  check('null answers preserved in roundtrip',
    r12.ok === true && Array.isArray(r12.answers) &&
    r12.answers.length === 3 &&
    r12.answers[0] === null && r12.answers[1] === 1 && r12.answers[2] === null,
    JSON.stringify(r12));

  // 13. A record whose hash matches but whose payload cannot be trusted is
  //     corruption, not a version drift: discard it quietly rather than
  //     telling the Participant their bank changed.
  reset();
  store[KEY] = JSON.stringify({ v: SS.hashBank(bankEn), answers: [0, 1] });
  var r13 = SS.load(bankEn);
  check('a hash-matching record with the wrong answer count reads as empty',
    r13.ok === false && r13.reason === 'empty',
    JSON.stringify(r13));
  check('the unusable record is discarded, not left to fail again',
    store[KEY] === undefined, String(store[KEY]));

  reset();
  store[KEY] = JSON.stringify({ v: SS.hashBank(bankEn), answers: [0, 1, 9] });
  var r13b = SS.load(bankEn);
  check('an out-of-range Option index reads as empty',
    r13b.ok === false && r13b.ok !== true && r13b.reason === 'empty',
    JSON.stringify(r13b));

  // ── Migration from the language-scoped keys (ADR 0016) ────────────────

  // 14. A Participant partway through in one language keeps their answers.
  reset();
  store['quiz-session:zh'] = JSON.stringify({ v: 'legacyhash', answers: [3, 0, null] });
  var r14 = SS.load(bankEn);
  check('a language-scoped Session is migrated into the shared record',
    r14.ok === true && JSON.stringify(r14.answers) === JSON.stringify([3, 0, null]),
    JSON.stringify(r14));
  check('migrated answers are re-stamped with the current structural hash',
    JSON.parse(store[KEY]).v === SS.hashBank(bankEn),
    'stored v=' + JSON.parse(store[KEY]).v);
  check('the legacy key is deleted after migrating',
    store['quiz-session:zh'] === undefined);

  // 15. Progress in both languages is one Participant's work, not two
  //     Sessions: the more-advanced record wins.
  reset();
  store['quiz-session:en'] = JSON.stringify({ v: 'legacyhash', answers: [0, 1, null] });
  store['quiz-session:zh'] = JSON.stringify({ v: 'legacyhash', answers: [3, 0, 2] });
  var r15 = SS.load(bankEn);
  check('when both languages have progress, the more-advanced one is kept',
    r15.ok === true && JSON.stringify(r15.answers) === JSON.stringify([3, 0, 2]),
    JSON.stringify(r15));
  check('both legacy keys are deleted',
    store['quiz-session:en'] === undefined && store['quiz-session:zh'] === undefined,
    Object.keys(store).join(','));

  // 16. A legacy record whose shape no longer fits the bank is not carried
  //     over, and does not silently truncate to the new length.
  reset();
  store['quiz-session:en'] = JSON.stringify({ v: 'legacyhash', answers: [0, 1] });
  var r16 = SS.load(bankEn);
  check('a legacy Session of the wrong length is not migrated',
    r16.ok === false && r16.reason === 'empty',
    JSON.stringify(r16));

  // 17. An unusable legacy key is still cleaned up, so it cannot linger and
  //     be reconsidered on every load.
  reset();
  store['quiz-session:de'] = '{bad json';
  var r17 = SS.load(bankEn);
  check('an unusable legacy key is removed',
    r17.ok === false && store['quiz-session:de'] === undefined,
    JSON.stringify(r17) + ' keys=' + Object.keys(store).join(','));

  // 18. A live Session is authoritative: legacy keys left behind by an older
  //     tab are not allowed to overwrite it.
  reset();
  SS.save(bankEn, [1, 1, 1]);
  store['quiz-session:zh'] = JSON.stringify({ v: 'legacyhash', answers: [3, 3, 3] });
  var r18 = SS.load(bankEn);
  check('a live Session is not overwritten by a stray legacy key',
    r18.ok === true && JSON.stringify(r18.answers) === JSON.stringify([1, 1, 1]),
    JSON.stringify(r18));

  // 19. Retake clears the one shared record, from either language.
  reset();
  SS.save(bankEn, [1, 2, 3]);
  SS.clear();
  check('Retake clears the shared Session for both languages',
    SS.load(bankEn).ok === false && SS.load(bankZh).ok === false,
    JSON.stringify([SS.load(bankEn), SS.load(bankZh)]));

  reset();
  return results;
};