exports.name = 'LangRouting';

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
   * The system-dialog primitive (js/windows.js) as a seam: true to its
   * contract — one dialog at a time, close() routes once to onOk or onCancel.
   * The real primitive's rendering and keyboard contract live in
   * tests/js/test-windows.js; here the dialog layer exists so the offer's
   * WIRING — which ids it resolves, what it records — is what gets asserted.
   */
  var offered = { opts: null, ctl: null };
  var savedWindows = globalThis.App.Windows;
  globalThis.App.Windows = {
    isDialogOpen: function() { return !!(offered.ctl && offered.ctl.isOpen()); },
    openSystemDialog: function(opts) {
      if (globalThis.App.Windows.isDialogOpen()) return null;
      var open = true;
      offered.opts = opts;
      offered.ctl = {
        isOpen: function() { return open; },
        close: function(result) {
          if (!open) return false;
          open = false;
          offered.ctl = null;
          if (result === 'ok' && typeof opts.onOk === 'function') opts.onOk();
          else if (result === 'cancel' && typeof opts.onCancel === 'function') opts.onCancel();
          return true;
        }
      };
      return offered.ctl;
    }
  };

  /**
   * A DOM node good enough to assert against: records children, attributes and
   * click handlers, so the offer can genuinely be rendered and used.
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
    offered.opts = null;
    offered.ctl = null;
  }

  // ── init(): automatic routing ───────────────────────────────────────────

  // 1. The core case: a Chinese-primary browser lands on the English page.
  reset(['zh-CN', 'zh']);
  check('a Chinese-primary visitor is taken to the Chinese page',
    LR.init() === 'redirected' && navigatedTo === 'zh/',
    'navigatedTo=' + navigatedTo);

  // 2. The choice is recorded before leaving, so the destination page cannot
  //    send them back.
  check('the redirect records the language choice',
    LP.get().language === 'zh', String(LP.get().language));

  // 3. A visitor already reading the page is left completely alone.
  reset(['en-US']);
  check('an English-primary visitor on the English page is not moved',
    LR.init() === 'browser-matches-page' && navigatedTo === null,
    LR.init());

  // 4. A stored Language Preference is a decision already made.
  reset(['zh-CN']);
  LP.setLanguage('en');
  check('a visitor who already chose a language is never re-routed',
    LR.init() === 'stored-preference' && navigatedTo === null,
    LR.init());

  // 5. Someone mid-assessment is never moved.
  reset(['zh-CN']);
  SS.save({ questions: [{ id: 'q1', options: [{ score: 0 }] }], phases: [] }, [0]);
  check('a Participant with an in-progress Session is never re-routed',
    LR.init() === 'session-in-progress' && navigatedTo === null,
    LR.init());

  // 6. A language we do not publish is ignored and records no choice — the
  //    visitor is still a first-time visitor.
  reset(['fr-FR']);
  check('a browser language the app does not have is ignored',
    LR.init() === 'browser-language-not-offered' && navigatedTo === null,
    LR.init());
  check('an ignored browser language does not record a choice',
    LP.get().language === null, String(LP.get().language));

  // 7. A single-language page has nothing to route to.
  reset(['zh-CN']);
  setPage({ 'data-lang-alt': null, 'data-lang-alt-locale': null });
  check('a page offering no other language does not route',
    LR.init() === 'no-other-language' && navigatedTo === null,
    LR.init());

  // 8. A browser reporting nothing usable is left alone rather than guessed at.
  reset([]);
  check('an unknown browser language is left alone',
    LR.init() === 'unknown-browser-language' && navigatedTo === null,
    LR.init());

  // 9. Tag variants on either side still pair up, on the mirror-image page.
  reset(['en-GB', 'en']);
  setPage({ lang: 'zh-Hans', 'data-lang-alt': '../', 'data-lang-alt-locale': 'en' });
  check('a Simplified Chinese page routes an English-primary visitor to the root',
    LR.init() === 'redirected' && navigatedTo === '../',
    'navigatedTo=' + navigatedTo);

  // 10. A failure in the guard degrades to doing nothing, never to throwing on
  //     a path that runs before the page renders.
  reset(['zh-CN']);
  var realGet = LP.get;
  LP.get = function() { throw new Error('storage exploded'); };
  var degraded = LR.init();
  LP.get = realGet;
  check('a failure during routing degrades silently instead of throwing',
    degraded === 'unavailable' && navigatedTo === null, degraded);

  // ── shouldOffer(): the dismissible offer ───────────────────────────────

  // 11. A first-time visitor whose browser language is neither page nor
  //     alternate may still read the other language; the offer covers them.
  reset(['fr-FR']);
  check('a visitor whose browser language is neither offered page gets the offer',
    LR.shouldOffer() === true);

  // 12. Never offered to someone already reading the page.
  reset(['en-US']);
  check('a visitor already reading the page is not offered anything',
    LR.shouldOffer() === false);

  // 13. Never offered once a choice is recorded.
  reset(['fr-FR']);
  LP.setLanguage('en');
  check('a recorded language choice suppresses the offer',
    LR.shouldOffer() === false);

  // 14. Never offered twice after a dismissal.
  reset(['fr-FR']);
  check('the offer is due before any dismissal', LR.shouldOffer() === true);
  LP.dismiss(LR.PROMPT);
  check('the offer is never due again after a dismissal',
    LR.shouldOffer() === false);

  // 15. Never offered on a page with no alternative.
  reset(['fr-FR']);
  setPage({ 'data-lang-alt': null, 'data-lang-alt-locale': null });
  check('a page offering no other language never shows the offer',
    LR.shouldOffer() === false);

  // 16. offerInto is inert — and says so — when nothing is due.
  reset(['en-US']);
  var inserted = 0;
  var inertHost = { firstChild: null, insertBefore: function() { inserted++; } };
  check('offerInto does not touch the page when no offer is due',
    LR.offerInto(inertHost) === false && inserted === 0,
    'inserted=' + inserted);
  check('offerInto tolerates a missing container',
    LR.offerInto(null) === false);

  // 17. When an offer IS due it opens a system dialog: an info dialog that
  //     is not dangerous, carrying the existing offer Chrome Strings, whose
  //     affirmative navigates the declared alternate and records the choice
  //     (ticket #44: banner → dialog, ADR 0018 semantics unchanged).
  reset(['fr-FR']);
  var host = fakeEl();
  check('offerInto opens the offer dialog when one is due',
    LR.offerInto(host) === true && !!offered.ctl);

  var opts = offered.opts;
  check('the offer dialog carries the offer Chrome Strings',
    opts.messageId === 'lang.offerQuestion' &&
    opts.titleId === 'lang.offerTitle' &&
    opts.okId === 'lang.offerAccept' &&
    opts.cancelId === 'lang.offerDismiss',
    JSON.stringify(opts.messageId));
  check('the offer is a safe info dialog (Enter is affirmative)',
    opts.dangerous === false && opts.icon === 'info');
  check('the offer names the other language and offers to continue',
    I18n.t(opts.messageId, opts.messageParams) === 'Read this in 中文?' &&
    I18n.t(opts.okId) === 'Continue',
    I18n.t(opts.messageId, opts.messageParams) + ' / ' + I18n.t(opts.okId));
  check('the offer links to the declared alternate',
    opts.messageParams.language === '中文' && !window.location.href,
    String(window.location.href));

  offered.ctl.close('ok');
  check('accepting the offer records the language choice',
    LP.get().language === 'zh', String(LP.get().language));
  check('accepting the offer navigates the declared alternate',
    window.location.href === 'zh/', String(window.location.href));

  // 18. Dismissing the dialog is remembered for good — and the dialog is
  //     gone, so the offer never comes back on this visit or the next.
  reset(['fr-FR']);
  LR.offerInto(fakeEl());
  offered.ctl.close('cancel');
  check('dismissing the offer closes the dialog',
    globalThis.App.Windows.isDialogOpen() === false);
  check('a dismissal is remembered for good',
    LP.isDismissed(LR.PROMPT) === true && LR.shouldOffer() === false);
  check('a dismissed offer does not reopen',
    LR.offerInto(fakeEl()) === false);

  // 19. One dialog at a time (double-open guard): the dialog layer owns
  //     the modal, so a second offer while one is up does not open another.
  reset(['fr-FR']);
  var first = LR.offerInto(fakeEl());
  var second = LR.offerInto(fakeEl());
  check('the offer dialog opens once per eligible visit',
    first === true && second === false,
    'first=' + first + ' second=' + second);
  check('the open offer dialog still switches and records on accept',
    offered.ctl.close('ok') === true && LP.get().language === 'zh',
    String(LP.get().language));

  reset();
  if (savedWindows === undefined) delete globalThis.App.Windows;
  else globalThis.App.Windows = savedWindows;
  delete globalThis.document;
  delete globalThis.window;
  return results;
};