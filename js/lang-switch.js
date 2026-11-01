(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── Instant language switch (issue #55) ──────────────────────────────

     The taskbar's language toggle no longer navigates. On the Landing Page
     and the Answering Screen it swaps the Chrome String dictionary and the
     Bank Variant in place — App.activateBank re-renders whichever view is
     visible from current state (issue #48), so the current Question, every
     recorded answer and the scroll position survive — and updates <html
     lang>, document.title and the URL path, pushing a history entry per
     switch so Back and Forward swap languages correctly.

     The alternate dictionary and Bank Variant are prefetched once the
     browser is idle, so the first toggle shows no loading stall. If the
     alternate fetch fails, the current language stays and a dismissible,
     non-blocking notice says so — nothing about the page state changes.

     Every URL, dictionary and bank location comes from the page markup
     (data-lang-alt* on <html>, mirrored by hand across the two HTML files);
     no path arithmetic lives here. On the results and review views the
     toggle keeps the pre-#55 record-and-navigate behavior (the same action
     as js/shell.js recordChoice); instant presence there is ticket #56. */

  var boot = null;          // captured at start(): the page's own locale
  var decl = null;          // the alternate as the markup declares it
  var ready = false;        // the initial Bank Variant has landed
  var busy = false;         // one swap at a time
  var activeLocale = null;  // tracked after each in-place swap
  var resources = {};       // locale → { dict: promise, bank: promise }
  var noticeEl = null;
  var noticeTimerId = null;
  var popstateAttached = false;
  var syncQueued = false;   // a popstate arrived mid-swap: reconcile after
  var prefetchStatus = 'idle';   // idle → loading → ready | failed

  function base(locale) {
    return app.I18n && app.I18n.baseLocale ? app.I18n.baseLocale(locale) : null;
  }

  /** The window if it offers DOM events, else the global (headless Node). */
  function popstateTarget() {
    if (global.window && typeof global.window.addEventListener === 'function') {
      return global.window;
    }
    if (typeof global.addEventListener === 'function') return global;
    return null;
  }

  /* ── Declaration from the markup ─────────────────────────────────────── */

  /**
   * The alternate language as the page declares it. Nothing here derives a
   * path: data-lang-alt (the alternate page), -locale, -lang (the full
   * <html lang> value after switching), -dict (the Chrome String
   * dictionary script) and -bank (the Bank Variant JSON) are all authored
   * per page.
   */
  function readDecl() {
    var doc = global.document;
    if (!doc || !doc.documentElement || !doc.documentElement.getAttribute) return null;
    var root = doc.documentElement;
    var href = root.getAttribute('data-lang-alt');
    var locale = base(root.getAttribute('data-lang-alt-locale'));
    var lang = root.getAttribute('data-lang-alt-lang');
    var dict = root.getAttribute('data-lang-alt-dict');
    var bank = root.getAttribute('data-lang-alt-bank');
    if (!href || !locale || !lang || !dict || !bank) return null;
    return { href: href, locale: locale, lang: lang, dict: dict, bank: bank };
  }

  function resolveUrl(ref) {
    try {
      if (typeof global.URL === 'function' && global.location && global.location.href) {
        return new global.URL(ref, global.location.href);
      }
    } catch (e) { /* no URL surface */ }
    return null;
  }

  function captureBoot() {
    var doc = global.document;
    if (!doc || !doc.documentElement || !doc.documentElement.getAttribute) {
      boot = null;
      return;
    }
    var root = doc.documentElement;
    var lang = root.getAttribute('lang');
    // Same default as js/main.js's BANK_URL, so a page that declares no
    // data-bank still swaps against the bank the app itself would load.
    boot = {
      locale: base(lang),
      lang: lang,
      bank: root.getAttribute('data-bank') || 'questions.json',
      url: (global.location && global.location.href) || null,
      href: (global.location && global.location.href) || null
    };
    var url = resolveUrl(boot.url || '');
    if (url) boot.url = url.href;
  }

  function resolveDecl() {
    if (!decl) {
      decl = readDecl();
      if (!decl) return null;
      var url = resolveUrl(decl.href);
      decl.url = url ? url.href : null;
      decl.pathname = url ? url.pathname : null;
    }
    // (Re)create on demand: a failed swap drops its cache entry so the
    // next attempt fetches afresh instead of replaying a poisoned promise.
    if (!resources[decl.locale]) {
      resources[decl.locale] = {
        dict: dictionaryPromise(decl),
        bank: bankPromise(decl.bank)
      };
    }
    return decl;
  }

  /**
   * The locale the toggle moves TO: the other one of the two the page
   * knows about — the declared alternate, or the page's own language when
   * the in-place switch has already taken the alternate.
   */
  function otherLocale(d) {
    return activeLocale === d.locale ? boot.locale : d.locale;
  }

  /** Page URL + href for a target locale: the alternate's or the boot page's. */
  function urlFor(d, locale) {
    return locale === d.locale
      ? { locale: locale, url: d.url, href: d.href }
      : { locale: locale, url: boot.url, href: boot.href };
  }

  /* ── Resource loading (single-flight per locale) ─────────────────────── */

  /**
   * Load and register the alternate Chrome String dictionary by injecting
   * the declared <script> — the same idiom js/shell.js uses to inject
   * js/sound.js. Registration alone changes nothing visible: the active
   * locale only flips in apply(). Headless fake elements expose only
   * addEventListener + appendChild, so this degrades to a rejection.
   */
  function dictionaryPromise(d) {
    return new Promise(function(resolve, reject) {
      var doc = global.document;
      if (!doc || !doc.createElement) { reject(new Error('no document')); return; }
      var script = doc.createElement('script');
      script.type = 'text/javascript';
      script.src = d.dict;
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        if (ok) resolve(true);
        else reject(new Error('dictionary load failed: ' + d.dict));
      }
      script.addEventListener('load', function() { finish(true); });
      script.addEventListener('error', function() { finish(false); });
      var host = doc.head || doc.documentElement || doc.body;
      if (!host || typeof host.appendChild !== 'function') {
        reject(new Error('no script host')); return;
      }
      host.appendChild(script);
    });
  }

  /** Fetch a Bank Variant through the #48 fetch seam. */
  function bankPromise(url) {
    return new Promise(function(resolve, reject) {
      if (!app.fetchBank || typeof app.fetchBank !== 'function') {
        reject(new Error('no fetch seam')); return;
      }
      app.fetchBank(url, resolve, function(err) {
        reject(err || new Error('bank load failed: ' + url));
      });
    });
  }

  /**
   * Resources for swapping TO `locale`. The declared alternate loads from
   * the markup; the page's own locale needs no dictionary fetch (registered
   * at boot) but does need its Bank Variant reference — after an in-place
   * swap app.Bank points at the variant we left, so swapTo captures the
   * page's own bank before the first swap away. The bank URL is still the
   * markup-declared data-bank, so nothing is guessed here either.
   */
  function resourcesFor(locale) {
    var d = resolveDecl();
    if (!d || !boot) return null;
    if (resources[locale]) return resources[locale];
    if (locale !== boot.locale) return null;
    resources[locale] = {
      dict: Promise.resolve(true),
      bank: bankPromise(boot.bank)
    };
    return resources[locale];
  }

  /* ── Idle prefetch ───────────────────────────────────────────────────── */

  /**
   * Capture the page locale, wire Back/Forward, and load the alternate
   * dictionary and Bank Variant while the browser is idle, so the first
   * toggle swaps instantly. Idle callback if the browser offers one, a
   * short timeout otherwise. A prefetch failure is silent — the toggle
   * retries on demand and, if that also fails, surfaces the notice.
   */
  function start() {
    if (!boot) {
      captureBoot();
      activeLocale = boot && boot.locale ? boot.locale
        : base(app.I18n ? app.I18n.locale : null);
    }
    if (!popstateAttached) {
      var target = popstateTarget();
      if (target) {
        target.addEventListener('popstate', handlePopstate);
        popstateAttached = true;
      }
    }
    schedulePrefetch();
    return true;
  }

  /**
   * The initial Bank Variant has landed (or failed): the Landing Page is
   * rendered and a swap can no longer race the first load. Called from
   * js/main.js's loadBank.
   */
  function markReady() {
    ready = true;
    return ready;
  }

  function schedulePrefetch() {
    if (!boot || !readDecl()) return;
    var win = global.window;
    var idle = win && typeof win.requestIdleCallback === 'function'
      ? win.requestIdleCallback.bind(win)
      : (typeof global.requestIdleCallback === 'function'
        ? global.requestIdleCallback.bind(global)
        : null);
    if (idle) {
      idle(function() { prefetchNow(); }, { timeout: 2000 });
    } else if (typeof global.setTimeout === 'function') {
      global.setTimeout(prefetchNow, 1200);
    }
  }

  /** Load both alternate resources immediately (also the on-demand path). */
  function prefetchNow() {
    var d = resolveDecl();
    if (!d) return Promise.resolve(false);
    prefetchStatus = 'loading';
    var r = resources[d.locale];
    return Promise.all([r.dict, r.bank]).then(
      function() { prefetchStatus = 'ready'; return true; },
      function() { prefetchStatus = 'failed'; return false; }
    );
  }

  /* ── The switch action ───────────────────────────────────────────────── */

  function toggle() {
    if (!boot || !ready || busy) return false;
    var d = resolveDecl();
    if (!d) return false;
    var view = app.currentView ? app.currentView() : null;
    // Splash + answering screen: instant, in place. Results and review keep
    // the #50 navigation until #56 makes them instant too.
    if (view !== 'landing-view' && view !== 'quiz-view') {
      return legacyNavigate(urlFor(d, otherLocale(d)));
    }
    swapTo(otherLocale(d), { push: true });
    return true;
  }

  /** Pre-#55 behavior: record the Language Preference, then navigate. */
  function legacyNavigate(target) {
    try {
      if (app.LangPref && typeof app.LangPref.setLanguage === 'function') {
        app.LangPref.setLanguage(base(target.locale));
      }
      global.location.href = target.href;
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Apply one language in place: dictionary first, then Bank Variant, then
   * document language/title, then re-render the live view from current
   * state via App.activateBank (issue #48). No view is rebuilt twice and
   * the Session is untouched — every recorded answer is re-attributed by
   * the structural identity the Bank Variant contract guarantees (ADR 0015).
   */
  function swapTo(locale, opts) {
    var d = resolveDecl();
    var r = resourcesFor(locale);
    if (!d || !r || !app.I18n || !app.activateBank) return false;
    if (busy) return false;

    // Capture the page's own Bank Variant while it is still the active one.
    if (boot.locale === activeLocale && !resources[boot.locale] && app.Bank) {
      resources[boot.locale] = {
        dict: Promise.resolve(true),
        bank: Promise.resolve(app.Bank)
      };
    }

    busy = true;
    return Promise.all([r.dict, r.bank]).then(function(loaded) {
      // Release before apply(): apply is synchronous, and a loud render
      // failure (a missing Chrome String id, ADR 0015) must never leave
      // the toggle wedged behind a stuck busy flag.
      busy = false;
      apply(locale, d, opts, loaded[1]);
      if (syncQueued) {
        syncQueued = false;
        reconcileLocation();
      }
    }, function() {
      busy = false;
      // Drop the poisoned cache so the next attempt fetches afresh.
      if (resources[locale] === r) delete resources[locale];
      showNotice(d);
      return false;
    });
  }

  function apply(locale, d, opts, bank) {
    dismissNotice();   // a stale "can't switch" banner must not survive a success
    app.I18n.use(locale);
    var doc = global.document;
    doc.title = app.I18n.t('doc.title');
    doc.documentElement.setAttribute('lang',
      locale === d.locale ? d.lang : boot.lang);

    var view = app.currentView ? app.currentView() : 'landing-view';
    var scroll = captureScroll(view);
    app.activateBank(bank);            // #48 seam: rebuild from current state
    restoreScroll(view, scroll);

    if (app.LangPref && typeof app.LangPref.setLanguage === 'function') {
      app.LangPref.setLanguage(locale);
    }
    activeLocale = locale;

    if (opts && opts.push) {
      var target = urlFor(d, locale);
      pushHistory(target.locale, target.url);
    }
    refreshChrome();
  }

  /* ── History: one entry per language, Back/Forward swap in place ─────── */

  function pushHistory(locale, url) {
    var h = global.history;
    if (!h || typeof h.pushState !== 'function' || !url) return false;
    try {
      h.pushState({ ls: base(locale) }, '', url);
      return true;
    } catch (e) {
      return false;
    }
  }

  function handlePopstate(ev) {
    var d = resolveDecl();
    if (!d) return;
    if (busy) { syncQueued = true; return; }
    reconcileLocation(ev && ev.state ? ev.state.ls : null);
  }

  /**
   * Bring the in-place language in line with the current history entry.
   * The entry's stored locale decides when it has one; otherwise the URL
   * decides (the alternate page's URL is the declared alternate, anything
   * else is the page's own). Returns true when a swap was started.
   */
  function reconcileLocation(stateLocale) {
    var d = resolveDecl();
    if (!d || !boot) return false;
    var target = stateLocale && base(stateLocale)
      ? base(stateLocale)
      : (atAlternatePage() ? d.locale : boot.locale);
    if (target === activeLocale) return false;
    swapTo(target, { push: false });
    return true;
  }

  function atAlternatePage() {
    var d = resolveDecl();
    if (!d || !d.pathname || !global.location) return false;
    return global.location.pathname === d.pathname;
  }

  /* ── Scroll position ─────────────────────────────────────────────────── */

  function captureScroll(view) {
    var scroller = findScrollBody(view);
    if (scroller && typeof scroller.scrollTop === 'number') {
      return { top: scroller.scrollTop };
    }
    return null;
  }

  function findScrollBody(view) {
    var doc = global.document;
    if (!doc || view !== 'quiz-view') return null;
    var host = doc.getElementById ? doc.getElementById('quiz-view') : null;
    if (!host || typeof host.querySelector !== 'function') return null;
    return host.querySelector('.quiz-body');   // the scroll container (ticket #52)
  }

  function restoreScroll(view, saved) {
    if (!saved) return;
    var scroller = findScrollBody(view);
    if (scroller) scroller.scrollTop = saved.top;
  }

  /* ── The failure notice (dismissible, non-blocking) ──────────────────── */

  function showNotice(d) {
    var doc = global.document;
    if (!doc || !doc.getElementById) return;
    var view = app.currentView ? app.currentView() : 'landing-view';
    var host = doc.getElementById(view);
    if (!host || typeof host.appendChild !== 'function') return;
    // On the answering screen the banner belongs inside the scroll body,
    // above the card — exactly where js/quiz.js puts its own notice.
    var scroller = findScrollBody(view) || host;
    dismissNotice();

    var banner = doc.createElement('div');
    banner.className = 'quiz-notice';
    banner.setAttribute('role', 'status');
    banner.appendChild(doc.createTextNode(
      app.I18n.t('lang.switchUnavailable', { language: app.I18n.t('lang.otherName') })
    ));
    var dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'quiz-notice-dismiss';
    dismiss.setAttribute('aria-label', app.I18n.t('shell.close'));
    dismiss.textContent = app.I18n.t('shell.close');
    dismiss.addEventListener('click', function() { dismissNotice(); });
    banner.appendChild(dismiss);

    var first = scroller.firstChild;
    if (!first && scroller.children && scroller.children.length) {
      first = scroller.children[0];
    }
    if (first && typeof scroller.insertBefore === 'function') {
      scroller.insertBefore(banner, first);
    } else if (typeof scroller.appendChild === 'function') {
      scroller.appendChild(banner);
    } else {
      return;
    }
    noticeEl = banner;
    noticeTimerId = global.setTimeout(function() {
      noticeTimerId = null;
      noticeEl = null;
      if (banner.parentNode && typeof banner.parentNode.removeChild === 'function') {
        banner.parentNode.removeChild(banner);
      }
    }, 8000);
  }

  function dismissNotice() {
    if (noticeTimerId !== null && typeof global.clearTimeout === 'function') {
      global.clearTimeout(noticeTimerId);
      noticeTimerId = null;
    }
    if (noticeEl && noticeEl.parentNode && typeof noticeEl.parentNode.removeChild === 'function') {
      noticeEl.parentNode.removeChild(noticeEl);
    }
    noticeEl = null;
  }

  /* ── Refresh the shell's language surfaces after a swap ─────────────── */

  function refreshChrome() {
    var shell = app.Shell;
    var ctl = shell && shell.controller;
    if (ctl && typeof ctl.refreshLang === 'function') ctl.refreshLang();
  }

  /* ── Test surface ────────────────────────────────────────────────────── */

  function state() {
    return {
      activeLocale: activeLocale,
      ready: ready,
      busy: busy,
      declared: !!readDecl(),
      prefetch: prefetchStatus
    };
  }

  /** Test seam: drop every cached resource, listener and captured page. */
  function reset() {
    var target = popstateTarget();
    if (popstateAttached && target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('popstate', handlePopstate);
    }
    popstateAttached = false;
    dismissNotice();
    boot = null;
    decl = null;
    ready = false;
    busy = false;
    activeLocale = null;
    resources = {};
    syncQueued = false;
    prefetchStatus = 'idle';
  }

  app.LangSwitch = {
    start: start,
    ready: markReady,
    prefetchNow: prefetchNow,
    toggle: toggle,
    state: state,
    reset: reset
  };

  if (typeof module !== 'undefined') module.exports = global.App.LangSwitch;

})(globalThis);
