(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * First-visit language routing.
   *
   * A Participant who arrives on a page in a language they do not read is
   * offered the other one, once. When the browser's primary language maps to a
   * language this app has and the current page is not already it, they are
   * taken there. Otherwise they get a dismissible offer, remembered if they
   * decline it.
   *
   * The two halves land together on purpose. Automatic routing without a
   * visible escape strands a reader whose browser primary language is not the
   * one they read, and a blocking language choice shown to every visitor taxes
   * the majority to help a minority — so neither ships alone.
   *
   * Nothing here moves a Participant who has already chosen: a recorded
   * Language Preference or an existing Session both stop it, and the language
   * switch in the page always wins regardless (ADR 0018).
   */

  var PROMPT = 'lang-offer';

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
   * Runs before the Question Bank loads, so it must not depend on one. Every
   * failure path degrades to doing nothing: a Participant who cannot be routed
   * should land on a working page, not an error.
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
      if (primary === here) return 'browser-matches-page';
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

  /**
   * Whether a dismissible offer is warranted. Guarded in full, never throws.
   */
  function shouldOffer() {
    try {
      if (app.LangPref.get().language) return false;
      if (app.LangPref.isDismissed(PROMPT)) return false;
      if (!other()) return false;
      // Someone already reading the page this language needs no offer.
      var primary = browserPrimary();
      return !!primary && primary !== pageLocale();
    } catch (e) {
      return false;
    }
  }

  /**
   * Insert the offer into the Landing Page, if one is due.
   *
   * Only the guard above is guarded. Everything from here on may throw on a
   * missing Chrome String id, and that is the intended failure: ADR 0015
   * wants a missing id to break loudly rather than render an empty label.
   */
  function offerInto(container) {
    if (!container || !shouldOffer()) return false;
    var alt = other();

    var wrap = document.createElement('div');
    wrap.className = 'lang-offer';

    var text = document.createElement('span');
    text.className = 'lang-offer-text';
    text.textContent = app.I18n.t('lang.offerQuestion', {
      language: app.I18n.t('lang.otherName')
    });
    wrap.appendChild(text);

    var accept = document.createElement('a');
    accept.className = 'lang-offer-accept';
    accept.href = alt.href;
    accept.textContent = app.I18n.t('lang.offerAccept');
    accept.addEventListener('click', function() {
      app.LangPref.setLanguage(alt.locale);
    });
    wrap.appendChild(accept);

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'lang-offer-dismiss';
    dismiss.textContent = app.I18n.t('lang.offerDismiss');
    dismiss.setAttribute('aria-label', app.I18n.t('lang.offerDismiss'));
    dismiss.addEventListener('click', function() {
      app.LangPref.dismiss(PROMPT);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    });
    wrap.appendChild(dismiss);

    container.insertBefore(wrap, container.firstChild);
    return true;
  }

  app.LangRouting = { PROMPT: PROMPT, init: init, offerInto: offerInto, shouldOffer: shouldOffer };

  if (typeof module !== 'undefined') module.exports = globalThis.App.LangRouting;
})(globalThis);