exports.name = 'LangPref';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

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

  require('../../js/lang-pref.js');
  var LP = globalThis.App.LangPref;

  var KEY = 'quiz-lang';
  var SESSION_KEY = 'quiz-session';

  function reset() {
    Object.keys(store).forEach(function(k) { delete store[k]; });
  }

  // 1. An untouched browser reports no preference rather than throwing.
  reset();
  var empty = LP.get();
  check('no stored preference reads as no language and no dismissals',
    empty.language === null && Array.isArray(empty.dismissed) && empty.dismissed.length === 0,
    JSON.stringify(empty));

  // 2. The chosen language round-trips, normalized to its base form, so a tag
  //    variant cannot split one language's preference across two values.
  reset();
  LP.setLanguage('zh-Hans');
  check('a chosen language round-trips normalized',
    LP.get().language === 'zh',
    LP.get().language);
  LP.setLanguage('en-GB');
  check('a later choice replaces the earlier one',
    LP.get().language === 'en',
    LP.get().language);
  check('setLanguage reports what it stored',
    LP.setLanguage('zh_CN') === 'zh', 'zh_CN');

  // 3. The normalizer must agree with the dictionary's, or a language tag
  //    variant resolves two different ways in two places.
  require('../../js/i18n.js');
  var I18n = globalThis.App.I18n;
  var tags = ['en', 'zh', 'zh-Hans', 'zh_CN', 'zh-Hant-TW', 'EN-us', '  zh-Hans  ', '', null, undefined, 42];
  var mismatches = tags.filter(function(t) { return LP.baseLocale(t) !== I18n.baseLocale(t); });
  check('the preference normalizer matches the dictionary normalizer on every tag',
    mismatches.length === 0,
    mismatches.length ? 'mismatched: ' + JSON.stringify(mismatches) : 'checked ' + tags.length + ' tags');

  // 4. Dismissals are per-prompt and permanent.
  reset();
  check('an undismissed prompt reads as not dismissed',
    LP.isDismissed('lang-offer') === false);
  LP.dismiss('lang-offer');
  check('a dismissed prompt reads as dismissed',
    LP.isDismissed('lang-offer') === true);
  check('dismissing one prompt does not dismiss another',
    LP.isDismissed('some-other-prompt') === false);

  // 5. Dismissals accumulate without duplicating, and survive a language choice.
  reset();
  LP.dismiss('lang-offer');
  LP.dismiss('lang-offer');
  LP.dismiss('lang-offer');
  check('repeated dismissal is stored once',
    LP.get().dismissed.length === 1,
    JSON.stringify(LP.get().dismissed));
  LP.setLanguage('en');
  check('a language choice preserves dismissals',
    LP.isDismissed('lang-offer') === true && LP.get().language === 'en',
    JSON.stringify(LP.get()));
  LP.dismiss('second-prompt');
  check('further dismissals accumulate',
    LP.get().dismissed.length === 2,
    JSON.stringify(LP.get().dismissed));

  // 6. The preference is independent of the Session in both directions.
  reset();
  require('../../js/session-store.js');
  var SS = globalThis.App.SessionStore;
  LP.setLanguage('zh');
  SS.save({ questions: [{ id: 'q1', options: [{ score: 0 }] }], phases: [] }, [0]);
  check('answering a Question does not alter the language preference',
    LP.get().language === 'zh', LP.get().language);
  SS.clear();
  check('Retaking does not alter the language preference',
    LP.get().language === 'zh' && LP.isDismissed('lang-offer') === false,
    JSON.stringify(LP.get()));

  // 7. A bank edit resets Sessions. The language preference must survive it.
  reset();
  LP.setLanguage('zh');
  LP.dismiss('lang-offer');
  SS.save({ questions: [{ id: 'q1', options: [{ score: 0 }] }], phases: [] }, [0]);
  var stale = SS.load({ questions: [{ id: 'q1', options: [{ score: 3 }] }], phases: [] });
  check('an Option re-score does reset the Session',
    stale.ok === false && stale.reason === 'stale',
    JSON.stringify(stale));
  check('the language preference survives the Session reset',
    LP.get().language === 'zh' && LP.isDismissed('lang-offer') === true,
    JSON.stringify(LP.get()));
  check('the preference lives under its own key and carries no assessment data',
    Object.keys(store).indexOf(KEY) !== -1 &&
    KEY !== SESSION_KEY &&
    Object.keys(JSON.parse(store[KEY])).sort().join(',') === 'dismissed,language',
    Object.keys(store).join(',') + ' record=' + store[KEY]);

  // 8. exists() reports the Session without needing a bank to read it.
  reset();
  check('exists() is false with no Session',
    SS.exists() === false);
  SS.save({ questions: [{ id: 'q1', options: [{ score: 0 }] }], phases: [] }, [0]);
  check('exists() is true once a Session is stored',
    SS.exists() === true);
  SS.clear();
  check('exists() is false again after Retake',
    SS.exists() === false);
  // 9. Corrupt or hostile stored data must degrade to "no preference" rather
  //    than throw on a path that runs before the page renders.
  reset();
  store[KEY] = '{bad json';
  var corrupt = LP.get();
  check('corrupt JSON reads as no preference',
    corrupt.language === null && corrupt.dismissed.length === 0,
    JSON.stringify(corrupt));
  check('isDismissed on corrupt data is false, not a throw',
    LP.isDismissed('lang-offer') === false);

  reset();
  store[KEY] = JSON.stringify({ language: 42, dismissed: 'not-an-array' });
  var hostile = LP.get();
  check('wrongly typed fields degrade to a usable shape',
    hostile.language === null && hostile.dismissed.length === 0,
    JSON.stringify(hostile));

  reset();
  store[KEY] = JSON.stringify({ language: 'zh', dismissed: ['a', 7, null, 'a', '', 'b'] });
  var cleaned = LP.get();
  check('dismissal ids that are not non-empty strings are dropped, and not duplicated',
    JSON.stringify(cleaned.dismissed) === JSON.stringify(['a', 'b']),
    JSON.stringify(cleaned.dismissed));
  check('a valid language survives alongside unusable dismissal entries',
    cleaned.language === 'zh', String(cleaned.language));

  // 10. Unavailable storage must never throw.
  reset();
  var realStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: function() { throw new Error('denied'); },
    setItem: function() { throw new Error('denied'); },
    removeItem: function() { throw new Error('denied'); },
    length: 0,
    key: function() { return null; }
  };
  var threw = null;
  try {
    LP.get();
    LP.setLanguage('zh');
    LP.dismiss('lang-offer');
    LP.isDismissed('lang-offer');
    LP.clear();
    SS.exists();
  } catch (e) {
    threw = e;
  }
  globalThis.localStorage = realStorage;
  check('every preference operation survives unavailable storage',
    threw === null, threw ? String(threw) : 'no throw');

  // 11. clear() removes the record.
  reset();
  LP.setLanguage('zh');
  LP.dismiss('lang-offer');
  LP.clear();
  check('clear() removes the stored preference',
    store[KEY] === undefined && LP.get().language === null);

  reset();
  return results;
};