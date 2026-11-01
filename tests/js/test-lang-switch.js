exports.name = 'Instant language switch (issue #55): in-place swap, state preservation, URL sync, prefetch fallback';

exports.run = function() {
  var results = [];
  function check(desc, pass, extra) {
    var msg = desc;
    if (extra !== undefined && extra !== null && String(extra) !== '') {
      msg += ' — ' + extra;
    }
    results.push({ pass: !!pass, message: msg });
  }

  // ── globals this test owns; snapshotted, restored before resolve ──────
  var prev = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    history: globalThis.history,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    Analytics: globalThis.Analytics,
    Bank: globalThis.Bank,
    Corpus: globalThis.Corpus
  };

  function restoreGlobals() {
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window;
    else globalThis.window = prev.window;
    if (prev.location === undefined) delete globalThis.location;
    else globalThis.location = prev.location;
    if (prev.history === undefined) delete globalThis.history;
    else globalThis.history = prev.history;
    if (prev.localStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev.localStorage;
    if (prev.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prev.fetch;
    globalThis.setTimeout = prev.setTimeout;
    globalThis.clearTimeout = prev.clearTimeout;
    if (prev.Analytics === undefined) delete globalThis.Analytics;
    else globalThis.Analytics = prev.Analytics;
    if (prev.Bank === undefined) delete globalThis.Bank;
    else globalThis.Bank = prev.Bank;
    if (prev.Corpus === undefined) delete globalThis.Corpus;
    else globalThis.Corpus = prev.Corpus;
  }

  // ── queued timers: quiz beats stay deterministic and synchronous ──────
  var timerQueue = [];
  globalThis.setTimeout = function(fn, ms) {
    timerQueue.push({ fn: fn, ms: ms || 0 });
    return timerQueue.length;
  };
  globalThis.clearTimeout = function(id) {
    if (timerQueue[id - 1]) timerQueue[id - 1].fn = null;
  };
  function flushTimers() {
    var q = timerQueue.slice();
    timerQueue.length = 0;
    for (var i = 0; i < q.length; i++) if (q[i].fn) q[i].fn();
  }

  // ── fake DOM (pattern from test-rerender.js / test-shell.js) ──────────
  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '', id: '',
      disabled: false, hidden: false, scrollTop: 0,
      attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) {
        el.attrs[n] = v;
        // The real DOM reflects <html lang> onto the .lang property
        // (js/main.js's boot reads document.documentElement.lang).
        if (n === 'lang') el.lang = v;
      },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(c) { el.children.push(c); c.parentNode = el; return c; },
      insertBefore: function(node, ref) {
        if (!ref) { el.children.push(node); }
        else {
          var i = el.children.indexOf(ref);
          el.children.splice(i < 0 ? el.children.length : i, 0, node);
        }
        node.parentNode = el;
        return node;
      },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
        c.parentNode = null;
        return c;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; },
      scrollIntoView: function() {},
      // Selector support for '.class' and '#id', deep search — enough for
      // findScrollBody('.quiz-body') and rendered controls.
      querySelector: function(sel) {
        var kind = sel.charAt(0);
        var name = sel.slice(1);
        var stack = el.children.slice();
        while (stack.length) {
          var n = stack.shift();
          if (!n || typeof n !== 'object') continue;
          if (kind === '.' && String(n.className || '').split(/\s+/).indexOf(name) >= 0) return n;
          if (kind === '#' && n.id === name) return n;
          if (n.children) stack = stack.concat(n.children);
        }
        return null;
      }
    };
    // innerHTML = '' is how every view clears itself — it must really
    // empty the children, or re-render assertions see stale trees.
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return ''; },
      set: function(v) { if (v === '') el.children = []; }
    });
    Object.defineProperty(el, 'firstChild', {
      get: function() { return el.children.length ? el.children[0] : null; }
    });
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    return el;
  }

  var sections = ['landing-view', 'quiz-view', 'results-view', 'review-view'].map(function(id) {
    var s = fakeEl('section');
    s.id = id;
    s.hidden = (id !== 'landing-view');
    return s;
  });
  var appEl = fakeEl('div');
  appEl.id = 'app';
  sections.forEach(function(s) { appEl.appendChild(s); });
  var byIdMap = { app: appEl };
  sections.forEach(function(s) { byIdMap[s.id] = s; });

  var docHandlers = {};
  var scriptLog = [];

  var fakeDoc = {
    readyState: 'loading',
    title: '',
    createElement: function(tag) { return fakeEl(tag); },
    createElementNS: function(ns, tag) { return fakeEl(tag); },
    createTextNode: function(text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById: function(id) {
      return Object.prototype.hasOwnProperty.call(byIdMap, id) ? byIdMap[id] : null;
    },
    querySelectorAll: function(sel) {
      return sel === '#app > section' ? sections.slice() : [];
    },
    addEventListener: function(type, fn) {
      (docHandlers[type] = docHandlers[type] || []).push(fn);
    },
    documentElement: (function() {
      var html = fakeEl('html');
      html.setAttribute('lang', 'en');
      html.setAttribute('data-bank', 'questions.json');
      html.setAttribute('data-corpus', 'docs/owasp-ast-full.md');
      html.setAttribute('data-lang-alt', 'zh/');
      html.setAttribute('data-lang-alt-locale', 'zh');
      html.setAttribute('data-lang-alt-lang', 'zh-Hans');
      html.setAttribute('data-lang-alt-dict', 'i18n/zh.js');
      html.setAttribute('data-lang-alt-bank', 'questions.zh.json');
      return html;
    })(),
    head: (function() {
      var head = fakeEl('head');
      // Dictionary injection: appendChild fires the script's load handler
      // synchronously, exactly like a cached script landing.
      head.appendChild = function(c) {
        c.parentNode = head;
        head.children.push(c);
        scriptLog.push(c);
        if (c && c.handlers && c.handlers.load) c.handlers.load();
        return c;
      };
      return head;
    })(),
    body: fakeEl('body')
  };
  fakeDoc.body.appendChild(appEl);
  globalThis.document = fakeDoc;

  // reduced motion → every beat path runs through the queued timers
  var winHandlers = {};
  var idleQueue = [];
  globalThis.window = {
    matchMedia: function() { return { matches: true }; },
    addEventListener: function(type, fn) {
      (winHandlers[type] = winHandlers[type] || []).push(fn);
    },
    removeEventListener: function(type, fn) {
      winHandlers[type] = (winHandlers[type] || []).filter(function(f) { return f !== fn; });
    },
    requestIdleCallback: function(cb) { idleQueue.push(cb); return idleQueue.length; }
  };
  function runIdle() {
    var q = idleQueue.slice();
    idleQueue.length = 0;
    q.forEach(function(fn) { fn(); });
  }
  function firePopstate(state) {
    (winHandlers.popstate || []).slice().forEach(function(fn) { fn({ state: state }); });
  }
  function fireDoc(type) {
    (docHandlers[type] || []).slice().forEach(function(fn) { fn(); });
  }

  globalThis.location = { href: 'https://quiz.test/', pathname: '/' };
  var historyEntries = [];
  globalThis.history = {
    pushState: function(state, title, url) {
      var u = new URL(String(url), globalThis.location.href);
      historyEntries.push({ state: state, url: u.href });
      globalThis.location.href = u.href;
      globalThis.location.pathname = u.pathname;
    }
  };

  var store = {};
  globalThis.localStorage = {
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  };

  globalThis.Analytics = { track: function() {} };

  // ── Bank Variants: the real pair, structurally identical by contract ──
  var enBank = require('../../questions.json');
  var zhBank = require('../../questions.zh.json');

  // ── fetch seam: bank JSON per URL, corpus text, per-URL failure ───────
  var fetchLog = [];
  var failBankUrls = {};
  globalThis.fetch = function(url) {
    var u = String(url);
    fetchLog.push(u);
    if (failBankUrls[u]) return Promise.reject(new Error('network down'));
    if (/\.md$/.test(u)) {
      return Promise.resolve({
        ok: true,
        text: function() { return Promise.resolve('# corpus'); },
        json: function() { return Promise.reject(new Error('not json')); }
      });
    }
    var bank = u.indexOf('zh') >= 0 ? zhBank : enBank;
    return Promise.resolve({
      ok: true,
      json: function() { return Promise.resolve(bank); },
      text: function() { return Promise.resolve('{}'); }
    });
  };

  function fetchCount(url) {
    return fetchLog.filter(function(u) { return u === url; }).length;
  }

  // ── module load (document must exist first) ───────────────────────────
  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  require('../../js/session-store.js');
  require('../../js/wizard-nav.js');
  require('../../js/ast.js');
  require('../../js/lang-pref.js');
  require('../../js/quiz.js');
  require('../../js/main.js');
  require('../../js/shell.js');
  require('../../js/lang-switch.js');

  var App = globalThis.App;
  var I18n = App.I18n;
  var LangSwitch = App.LangSwitch;
  var Shell = App.Shell;
  var prevLocale = I18n.locale;

  function settle() {
    var p = Promise.resolve();
    for (var i = 0; i < 30; i++) p = p.then(function() {});
    return p;
  }

  function walk(node, tag, out) {
    out = out || [];
    if (!node || !node.children) return out;
    for (var c = 0; c < node.children.length; c++) {
      var child = node.children[c];
      if (child && child.tagName && tag && child.tagName === tag.toUpperCase()) out.push(child);
      walk(child, tag, out);
    }
    return out;
  }
  function allText(node, out) {
    out = out || [];
    if (node == null) return out;
    if (typeof node === 'object' && node.nodeType === 3) { out.push(node.textContent); return out; }
    if (typeof node.textContent === 'string' && node.nodeType !== 3) out.push(node.textContent);
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) allText(node.children[i], out);
    }
    return out;
  }
  function viewText(id) { return allText(byIdMap[id]).join(' '); }
  function findButton(root, pred) {
    var btns = walk(root, 'button');
    for (var i = 0; i < btns.length; i++) if (pred(btns[i])) return btns[i];
    return null;
  }
  function optionButton(qid, optIdx) {
    return findButton(byIdMap['quiz-view'], function(b) {
      return b.getAttribute('data-qid') === qid && b.getAttribute('data-opt') === String(optIdx);
    });
  }
  function quizBody() { return byIdMap['quiz-view'].querySelector('.quiz-body'); }

  return (async function() {
    try {
      /* ── Boot through the real DOMContentLoaded path ─────────────────── */
      fireDoc('DOMContentLoaded');
      await settle();

      var ctl = Shell.controller;
      check('boot renders the Landing Page in English in place',
        App.currentView() === 'landing-view' &&
        viewText('landing-view').indexOf(enBank.meta.title) >= 0,
        viewText('landing-view').slice(0, 80));
      check('boot sets the document title from the dictionary',
        fakeDoc.title === 'Agent Security Awareness Quiz', fakeDoc.title);
      check('the shell built the two-segment tray control',
        !!(ctl && ctl.langSegments && ctl.langSegments.self && ctl.langSegments.other));
      check('the tray shows EN pressed and the alternate flat at boot',
        ctl.langSegments.self.textContent === 'EN' &&
        ctl.langSegments.self.getAttribute('aria-pressed') === 'true' &&
        ctl.langSegments.other.textContent === '中文',
        ctl.langSegments.self.textContent + '/' + ctl.langSegments.other.textContent);

      /* ── Idle prefetch: nothing fetched until the browser is idle ───── */
      check('the alternate is not fetched before the idle callback',
        fetchCount('questions.zh.json') === 0);
      check('prefetch is scheduled through requestIdleCallback', idleQueue.length === 1,
        String(idleQueue.length));

      runIdle();
      await settle();
      check('the idle prefetch fetches the alternate Bank Variant once',
        fetchCount('questions.zh.json') === 1, fetchLog.join(','));
      check('the idle prefetch injects the declared alternate dictionary',
        scriptLog.some(function(s) { return s.src === 'i18n/zh.js'; }),
        scriptLog.map(function(s) { return s.src; }).join(','));
      check('the switch reports the alternate prefetched',
        LangSwitch.state().prefetch === 'ready', LangSwitch.state().prefetch);

      /* ── Toggle #1: splash, en → zh, via the tray control ───────────── */
      ctl.langSegments.other.click();
      await settle();

      check('tray toggle swaps the splash in place (no navigation)',
        App.currentView() === 'landing-view' &&
        location.href === 'https://quiz.test/zh/' &&
        historyEntries.length === 1,
        'view=' + App.currentView() + ' href=' + location.href +
        ' entries=' + historyEntries.length);
      check('the splash now shows the Chinese Bank Variant and Chrome Strings',
        viewText('landing-view').indexOf(zhBank.meta.title) >= 0 &&
        viewText('landing-view').indexOf(enBank.meta.title) === -1,
        viewText('landing-view').slice(0, 80));
      check('document language and title follow the switch',
        document.documentElement.getAttribute('lang') === 'zh-Hans' &&
        fakeDoc.title === '智能体安全意识测评',
        document.documentElement.getAttribute('lang') + '/' + fakeDoc.title);
      check('the URL entry records the pushed locale',
        historyEntries[0].url === 'https://quiz.test/zh/' &&
        historyEntries[0].state && historyEntries[0].state.ls === 'zh',
        JSON.stringify(historyEntries[0]));
      check('the Language Preference records the new choice',
        App.LangPref.get().language === 'zh' &&
        JSON.parse(localStorage.getItem('quiz-lang')).language === 'zh',
        JSON.stringify(App.LangPref.get()));
      check('the first toggle costs no extra fetch (prefetch cache hit)',
        fetchCount('questions.zh.json') === 1 && fetchCount('questions.json') === 1,
        fetchLog.join(','));
      check('the tray re-labels itself after the switch',
        ctl.langSegments.self.textContent === '中文' &&
        ctl.langSegments.self.getAttribute('aria-pressed') === 'true' &&
        ctl.langSegments.other.textContent === 'English' &&
        ctl.programLabel.textContent === I18n.t('shell.windowTitle'),
        ctl.langSegments.self.textContent + '/' + ctl.langSegments.other.textContent);

      /* ── Start the quiz in zh, record an answer, move to Question 2 ──── */
      var startBtn = findButton(byIdMap['landing-view'], function(b) { return b.id === 'start-btn'; });
      check('the splash still offers Start', !!startBtn);
      startBtn.click();
      await settle();
      check('Start opens the Answering Screen on the Chinese bank',
        App.currentView() === 'quiz-view' &&
        viewText('quiz-view').indexOf(zhBank.questions[0].scenario) >= 0,
        viewText('quiz-view').slice(0, 80));

      var firstOpt = optionButton(zhBank.questions[0].id, 0);
      check('the first Option is tappable', !!firstOpt);
      firstOpt.click();
      flushTimers();   // advance beat → gotoQuestion
      flushTimers();   // card wipe → renderQuestion
      await settle();

      var st = App.quizState();
      check('answering advanced to Question 2 with the pick recorded',
        st && st.currentIdx === 1 && st.answers[0] === 0,
        JSON.stringify(st && { idx: st.currentIdx, answers: st.answers }));
      quizBody().scrollTop = 42;

      /* ── Toggle #2: mid-quiz, zh → en — state survives ──────────────── */
      ctl.langSegments.other.click();
      await settle();

      st = App.quizState();
      var view2 = App.currentView();
      check('mid-quiz switch keeps the Answering Screen, Question 2 and every answer',
        view2 === 'quiz-view' && st && st.currentIdx === 1 && st.answers[0] === 0,
        JSON.stringify({ view: view2, idx: st && st.currentIdx, answers: st && st.answers }));
      check('the Question Card renders in English at the same Question',
        viewText('quiz-view').indexOf(enBank.questions[1].scenario) >= 0 &&
        viewText('quiz-view').indexOf(zhBank.questions[1].scenario) === -1,
        viewText('quiz-view').slice(0, 120));
      check('document language, title and URL follow the switch back',
        document.documentElement.getAttribute('lang') === 'en' &&
        fakeDoc.title === 'Agent Security Awareness Quiz' &&
        historyEntries.length === 2 &&
        historyEntries[1].url === 'https://quiz.test/' &&
        historyEntries[1].state.ls === 'en',
        document.documentElement.getAttribute('lang') + '/' + fakeDoc.title +
        ' entries=' + historyEntries.length);
      check('scroll position on the scroll body is restored',
        quizBody().scrollTop === 42, String(quizBody().scrollTop));
      check('switching back fetched nothing (both Variants cached)',
        fetchCount('questions.json') === 1 && fetchCount('questions.zh.json') === 1,
        fetchLog.join(','));

      /* ── Toggle #3: back to zh — repeated switches stay stable ──────── */
      ctl.langSegments.other.click();
      await settle();
      st = App.quizState();
      check('a third switch keeps the same Question and answers',
        App.currentView() === 'quiz-view' && st.currentIdx === 1 && st.answers[0] === 0 &&
        viewText('quiz-view').indexOf(zhBank.questions[1].scenario) >= 0,
        JSON.stringify({ idx: st.currentIdx, answers: st.answers }));
      check('the URL stack grows one entry per switch',
        historyEntries.length === 3 && historyEntries[2].state.ls === 'zh',
        String(historyEntries.length));
      check('the Language Preference tracks every switch',
        App.LangPref.get().language === 'zh',
        JSON.stringify(App.LangPref.get()));

      /* ── Back / Forward: history swaps back without losing state ────── */
      var backEntry = historyEntries[1];
      location.href = backEntry.url;
      location.pathname = new URL(backEntry.url).pathname;
      firePopstate(backEntry.state);
      await settle();
      st = App.quizState();
      check('Back swaps to the previous language in place, no new entry',
        I18n.locale === 'en' &&
        document.documentElement.getAttribute('lang') === 'en' &&
        fakeDoc.title === 'Agent Security Awareness Quiz' &&
        historyEntries.length === 3 &&
        st.currentIdx === 1 && st.answers[0] === 0,
        'locale=' + I18n.locale + ' entries=' + historyEntries.length +
        ' idx=' + (st && st.currentIdx));

      var fwdEntry = historyEntries[2];
      location.href = fwdEntry.url;
      location.pathname = new URL(fwdEntry.url).pathname;
      firePopstate(fwdEntry.state);
      await settle();
      check('Forward swaps ahead again, still no new entry',
        I18n.locale === 'zh' && historyEntries.length === 3 &&
        document.documentElement.getAttribute('lang') === 'zh-Hans',
        'locale=' + I18n.locale + ' entries=' + historyEntries.length);

      /* ── Failed fetch: keep the language, show the dismissible notice ── */
      LangSwitch.reset();
      App.showView('landing-view');
      I18n.use('en');
      document.documentElement.setAttribute('lang', 'en');
      fakeDoc.title = I18n.t('doc.title');
      App.activateBank(enBank);
      location.href = 'https://quiz.test/';
      location.pathname = '/';
      var hrefAtStart = location.href;
      var entriesBeforeFailure = historyEntries.length;

      failBankUrls['questions.zh.json'] = true;
      LangSwitch.start();
      check('the toggle refuses to swap before the first Bank Variant lands',
        LangSwitch.toggle() === false);
      LangSwitch.ready();

      runIdle();
      await settle();
      check('a failed prefetch is reported and silent',
        LangSwitch.state().prefetch === 'failed',
        LangSwitch.state().prefetch);

      var fetchesBeforeToggle = fetchLog.length;
      var toggleFailed = LangSwitch.toggle();
      await settle();
      var notice = byIdMap['landing-view'].querySelector('.quiz-notice');
      check('a failed switch leaves the language untouched',
        toggleFailed === true &&
        I18n.locale === 'en' &&
        fakeDoc.title === 'Agent Security Awareness Quiz' &&
        document.documentElement.getAttribute('lang') === 'en' &&
        historyEntries.length === entriesBeforeFailure,
        'locale=' + I18n.locale + ' entries=' + historyEntries.length);
      check('a failed switch records no Language Preference change',
        JSON.parse(localStorage.getItem('quiz-lang')).language === 'zh',
        localStorage.getItem('quiz-lang'));
      check('a failed switch fetches nothing new and surfaces a notice',
        fetchLog.length === fetchesBeforeToggle && !!notice,
        'fetches=' + fetchLog.length + ' vs ' + fetchesBeforeToggle);
      check('the notice names the language it could not switch to',
        !!notice && allText(notice).join(' ').indexOf('中文') >= 0,
        notice ? allText(notice).join(' ') : 'no notice');

      var dismissBtn = notice && walk(notice, 'button')[0];
      check('the notice carries a dismiss control', !!dismissBtn);
      dismissBtn.click();
      check('the dismiss control removes the notice',
        byIdMap['landing-view'].querySelector('.quiz-notice') === null);

      /* ── Retry after failure: the poisoned cache was dropped ─────────── */
      delete failBankUrls['questions.zh.json'];
      var zhFetchesBeforeRetry = fetchCount('questions.zh.json');
      var retry = LangSwitch.toggle();
      await settle();
      check('a retry after a failed fetch succeeds and swaps',
        retry === true && I18n.locale === 'zh' &&
        fakeDoc.title === '智能体安全意识测评' &&
        historyEntries.length === entriesBeforeFailure + 1 &&
        historyEntries[historyEntries.length - 1].state.ls === 'zh',
        'locale=' + I18n.locale + ' entries=' + historyEntries.length);
      check('the retry re-fetched the alternate Bank Variant exactly once',
        fetchCount('questions.zh.json') === zhFetchesBeforeRetry + 1,
        String(fetchCount('questions.zh.json')) + ' vs ' + zhFetchesBeforeRetry);

      /* ── Results view: keeps the #50 record-and-navigate behavior ────── */
      App.showView('results-view');
      var entriesBeforeNav = historyEntries.length;
      var navResult = LangSwitch.toggle();
      await settle();
      check('on results the toggle keeps today\'s navigation behavior',
        navResult === true &&
        location.href === hrefAtStart &&
        historyEntries.length === entriesBeforeNav &&
        I18n.locale === 'zh',
        'href=' + location.href + ' entries=' + historyEntries.length +
        ' locale=' + I18n.locale);
      check('the navigation path still records the Language Preference',
        App.LangPref.get().language === 'en',
        JSON.stringify(App.LangPref.get()));

      /* ── Markup: declared alternates, mirrored across both pages ─────── */
      var fs = require('fs');
      var path = require('path');
      var ROOT = path.join(__dirname, '..', '..');
      function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
      var enHtml = read('index.html');
      var zhHtml = read('zh/index.html');
      function altAttrs(html) {
        return (html.match(/data-lang-alt[\w-]*/g) || []).sort();
      }
      check('both pages declare the same data-lang-alt* attribute family',
        JSON.stringify(altAttrs(enHtml)) === JSON.stringify(altAttrs(zhHtml)) &&
        altAttrs(enHtml).length === 5,
        JSON.stringify(altAttrs(enHtml)) + ' vs ' + JSON.stringify(altAttrs(zhHtml)));
      check('the declared alternate dictionary and bank differ per page as authored',
        enHtml.indexOf('data-lang-alt-dict="i18n/zh.js"') >= 0 &&
        enHtml.indexOf('data-lang-alt-bank="questions.zh.json"') >= 0 &&
        zhHtml.indexOf('data-lang-alt-dict="../i18n/en.js"') >= 0 &&
        zhHtml.indexOf('data-lang-alt-bank="../questions.json"') >= 0);
      check('both pages load js/lang-switch.js',
        enHtml.indexOf('js/lang-switch.js') >= 0 &&
        zhHtml.indexOf('../js/lang-switch.js') >= 0);
      check('js/lang-switch.js hardcodes no locale path arithmetic',
        read('js/lang-switch.js').indexOf('zh/') === -1);

      /* ── The notice id exists in both dictionaries ───────────────────── */
      I18n.use('en');
      var enNotice = I18n.t('lang.switchUnavailable', { language: '中文' });
      I18n.use('zh');
      var zhNotice = I18n.t('lang.switchUnavailable', { language: 'English' });
      check('both dictionaries carry the switch-failure notice id',
        enNotice.indexOf('中文') >= 0 && zhNotice.indexOf('English') >= 0,
        enNotice + ' / ' + zhNotice);
    } catch (err) {
      check('test body completed without throwing', false, err && err.stack || String(err));
    }

    // ── restore globals for the rest of the suite ───────────────────────
    try { LangSwitch.reset(); } catch (e) { /* best effort */ }
    if (prevLocale) I18n.use(prevLocale);
    restoreGlobals();
    return results;
  })();
};
