(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * First-visit language routing.
   *
   * On arrival with no recorded Language Preference and no in-progress
   * Session, the browser's primary language decides once: a system language
   * matching the alternate page redirects there and records the choice, a
   * system language matching the current page records the choice and stays,
   * and any other system language leaves the page alone and records nothing.
   * The recorded choice is what makes the decision one-way — the destination
   * page treats it as already made and never re-routes.
   *
   * Nothing here moves a Participant who has already chosen: a recorded
   * Language Preference or an existing Session both stop it before any
   * system-language signal is read, and the language switch — the tray
   * indicator and the Start-menu entry — always wins regardless.
   *
   * The routing runs before the Question Bank loads, so it must not depend
   * on one. Every failure path degrades to doing nothing: a Participant who
   * cannot be routed should land on a working page, not an error.
   */

  function attr(name) {
    return document.documentElement.getAttribute(name);
  }

  function pageLocale() {
    return app.LangPref.baseLocale(document.documentElement.lang);
  }

  /**
   * The other language, if this page offers one.
   *
   * The href comes from the page's data-lang-alt and the locale from
   * data-lang-alt-locale, so no path arithmetic is involved and adding a
   * language stays a matter of declaring it in the markup.
   */
  function other() {
    var href = attr('data-lang-alt');
    var locale = app.LangPref.baseLocale(attr('data-lang-alt-locale'));
    if (!href || !locale) return null;
    return { href: href, locale: locale };
  }

  function browserPrimary() {
    var langs = navigator.languages;
    var list = (langs && langs.length) ? langs : [navigator.language];
    return app.LangPref.baseLocale(list[0]);
  }

  /**
   * Decide what, if anything, to do about the language on arrival.
   *
   * The stored Language Preference and an in-progress Session both stop the
   * routing before the browser language is read at all. Otherwise the browser
   * primary language decides once: redirect to the alternate page and record,
   * or record and stay when the page already matches, or do nothing and
   * record nothing for a language the app does not publish.
   */
  function init() {
    try {
      if (app.LangPref.get().language) return 'stored-preference';
      // Already started. Where they are is where they chose to be.
      if (app.SessionStore.exists()) return 'session-in-progress';

      var here = pageLocale();
      var alt = other();
      if (!alt) return 'no-other-language';

      var primary = browserPrimary();
      if (!primary) return 'unknown-browser-language';
      if (primary === here) {
        // The system language already matches this page: record the choice
        // so this decision is made once and never revisited.
        app.LangPref.setLanguage(primary);
        return 'browser-matches-page';
      }
      if (primary !== alt.locale) return 'browser-language-not-offered';

      // Record the choice before leaving, so the destination page treats this
      // as a decision already made and can never send them back.
      app.LangPref.setLanguage(primary);
      window.location.replace(alt.href);
      return 'redirected';
    } catch (e) {
      return 'unavailable';
    }
  }

  app.LangRouting = { init: init };

  if (typeof module !== 'undefined') module.exports = globalThis.App.LangRouting;
})(globalThis);