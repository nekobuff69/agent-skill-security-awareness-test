exports.name = 'LangRouting';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var fs = require('fs');
  var path = require('path');
  var repo = path.join(__dirname, '..', '..');

  function read(rel) {
    return fs.readFileSync(path.join(repo, rel), 'utf8');
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

  require('../../js/i18n.js');
  require('../../js/lang-pref.js');
  require('../../js/session-store.js');
  require('../../js/lang-routing.js');

  var LP = globalThis.App.LangPref;
  var SS = globalThis.App.SessionStore;
  var LR = globalThis.App.LangRouting;
  var I18n = globalThis.App.I18n;

  var navigatedTo = null;

  /**
   * A DOM node good enough to assert against: records children, attributes
   * and click handlers, so a page can genuinely be built and inspected.
   */
  function fakeEl() {
    var el = {
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '',
      attrs: {}, handlers: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      appendChild: function(c) { el.children.push(c); return c; },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      insertBefore: function(node) {
        el.children.unshift(node);
        node.parentNode = el;
        return node;
      },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
      }
    };
    return el;
  }

  /**
   * Node ships a getter-only `navigator` built-in, so a plain assignment is
   * silently dropped and every browser language would read as en-US. Redefine
   * the property instead; it is configurable.
   */
  function setBrowserLanguages(languages) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: languages, language: languages[0] },
      configurable: true,
      writable: true
    });
  }

  // The page under test: an English page offering Chinese at zh/.
  var PAGE = {
    lang: 'en',
    'data-lang-alt': 'zh/',
    'data-lang-alt-locale': 'zh'
  };

  function setPage(overrides) {
    var attrs = {};
    var k;
    for (k in PAGE) {
      if (Object.prototype.hasOwnProperty.call(PAGE, k)) attrs[k] = PAGE[k];
    }
    if (overrides) {
      for (k in overrides) {
        if (!Object.prototype.hasOwnProperty.call(overrides, k)) continue;
        if (overrides[k] === null) delete attrs[k];
        else attrs[k] = overrides[k];
      }
    }
    // `lang` is a property reflecting the content attribute, as it is in a
    // real document — the app reads it that way, not via getAttribute.
    var documentElement = {
      getAttribute: function(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      }
    };
    Object.defineProperty(documentElement, 'lang', {
      get: function() { return attrs.lang || ''; },
      configurable: true
    });
    globalThis.document = {
      documentElement: documentElement,
      createElement: function() { return fakeEl(); }
    };
    globalThis.window = {
      location: { replace: function(href) { navigatedTo = href; } }
    };
    navigatedTo = null;
  }

  function reset(languages) {
    Object.keys(store).forEach(function(k) { delete store[k]; });
    setPage();
    setBrowserLanguages(languages || ['en-US']);
    I18n.use('en');
  }

  // ── init(): the first-visit decision (ADR 0018, ticket #54) ────────────

  // 1. The core case: a Chinese-primary browser lands on the English page.
  reset(['zh-CN', 'zh']);
  check('a Chinese-primary visitor is taken to the Chinese page',
    LR.init() === 'redirected' && navigatedTo === 'zh/',
    'navigatedTo=' + navigatedTo);

  // 2. The choice is recorded before leaving, so the destination page cannot
  //    send them back.
  check('the redirect records the language choice',
    LP.get().language === 'zh', String(LP.get().language));

  // 3. The recorded decision is one-way: on the destination the stored
  //    choice stops routing before the browser language is even read.
  setPage({ lang: 'zh', 'data-lang-alt': '../', 'data-lang-alt-locale': 'en' });
  check('the recorded choice makes the decision one-way',
    LR.init() === 'stored-preference' && navigatedTo === null,
    LR.init());

  // 4. A visitor already reading the page is left where they are — and the
  //    system language matching the page records the choice.
  reset(['en-US']);
  check('an English-primary visitor on the English page is not moved',
    LR.init() === 'browser-matches-page' && navigatedTo === null,
    LR.init());
  check('staying on the matching page records the language choice',
    LP.get().language === 'en', String(LP.get().language));

  // 5. …so a later arrival with the same browser is a stored preference,
  //    not a fresh decision.
  check('the recorded match stops routing on later arrivals',
    LR.init() === 'stored-preference' && navigatedTo === null,
    LR.init());

  // 6. A stored Language Preference always wins over the system language.
  reset(['zh-CN']);
  LP.setLanguage('en');
  check('a visitor who already chose a language is never re-routed',
    LR.init() === 'stored-preference' && navigatedTo === null,
    LR.init());

  // 7. Someone mid-assessment is never moved — even when the system language
  //    points at the alternate page.
  reset(['zh-CN']);
  SS.save({ questions: [{ id: 'q1', options: [{ score: 0 }] }], phases: [] }, [0]);
  check('a Participant with an in-progress Session is never re-routed',
    LR.init() === 'session-in-progress' && navigatedTo === null,
    LR.init());

  // 8. A language we do not publish is ignored and records nothing — the
  //    visitor keeps the page they linked to and stays a first-time visitor.
  reset(['fr-FR']);
  check('a browser language the app does not have is ignored',
    LR.init() === 'browser-language-not-offered' && navigatedTo === null,
    LR.init());
  check('an ignored browser language does not record a choice',
    LP.get().language === null, String(LP.get().language));

  // 9. A single-language page has nothing to route to — and records nothing.
  reset(['zh-CN']);
  setPage({ 'data-lang-alt': null, 'data-lang-alt-locale': null });
  check('a page offering no other language does not route',
    LR.init() === 'no-other-language' && navigatedTo === null,
    LR.init());
  check('a single-language page records no choice',
    LP.get().language === null, String(LP.get().language));

  // 10. A browser reporting nothing usable is left alone rather than guessed
  //     at, and nothing is recorded.
  reset([]);
  check('an unknown browser language is left alone',
    LR.init() === 'unknown-browser-language' && navigatedTo === null,
    LR.init());
  check('an unknown browser language does not record a choice',
    LP.get().language === null, String(LP.get().language));

  // 11. Tag variants on either side still pair up, on the mirror-image page,
  //     and the record lands there too.
  reset(['en-GB', 'en']);
  setPage({ lang: 'zh-Hans', 'data-lang-alt': '../', 'data-lang-alt-locale': 'en' });
  check('a Simplified Chinese page routes an English-primary visitor to the root',
    LR.init() === 'redirected' && navigatedTo === '../',
    'navigatedTo=' + navigatedTo);
  check('the mirror-image redirect records the language choice',
    LP.get().language === 'en', String(LP.get().language));

  // 12. A failure in the guard degrades to doing nothing, never to throwing on
  //     a path that runs before the page renders.
  reset(['zh-CN']);
  var realGet = LP.get;
  LP.get = function() { throw new Error('storage exploded'); };
  var degraded = LR.init();
  LP.get = realGet;
  check('a failure during routing degrades silently instead of throwing',
    degraded === 'unavailable' && navigatedTo === null, degraded);

  // ── The offer machinery is gone (ticket #54) ────────────────────────────

  // 13. No offer entry point survives on either module.
  check('LangRouting exposes no offer entry point',
    LR.offerInto === undefined && LR.shouldOffer === undefined &&
    LR.PROMPT === undefined);
  check('LangPref exposes no dismissal state',
    LP.dismiss === undefined && LP.isDismissed === undefined);

  // 14. No offer code path remains in the shipped sources.
  var routingSrc = read('js/lang-routing.js');
  check('lang-routing.js carries no offer code path',
    routingSrc.indexOf('offerInto') === -1 &&
    routingSrc.indexOf('shouldOffer') === -1 &&
    routingSrc.indexOf('lang-offer') === -1 &&
    routingSrc.indexOf('openSystemDialog') === -1 &&
    routingSrc.indexOf('lang.offer') === -1);
  var prefSrc = read('js/lang-pref.js');
  check('lang-pref.js carries no dismissal bookkeeping',
    prefSrc.indexOf('dismiss') === -1);
  var quizSrc = read('js/quiz.js');
  check('quiz.js carries no offer wiring',
    quizSrc.indexOf('offerInto') === -1 && quizSrc.indexOf('shouldOffer') === -1);

  // 15. The offer dialog copy ids are gone from both dictionaries, while the
  //     labels the language tray still resolves remain declared.
  var enDict = read('i18n/en.js');
  var zhDict = read('i18n/zh.js');
  var goneIds = ['lang.offerQuestion', 'lang.offerAccept', 'lang.offerDismiss'];
  var stillThere = goneIds.filter(function(id) {
    var needle = "'" + id + "'";
    return enDict.indexOf(needle) !== -1 || zhDict.indexOf(needle) !== -1;
  });
  check('the offer dialog copy ids are gone from both dictionaries',
    stillThere.length === 0, stillThere.join(','));
  check('the language tray labels remain declared',
    I18n.has('lang.offerTitle') && I18n.has('lang.otherName'));

  reset();
  delete globalThis.document;
  delete globalThis.window;
  return results;
};
