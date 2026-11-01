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
   * switch — the tray indicator and the Start-menu entry (ADR 0018) — always
   * wins regardless.
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
   * Present the offer as the Landing Page's due, if one is.
   *
   * The presentation is a system dialog (App.Windows, ticket #44), not
   * inline page chrome: an info dialog, `dangerous: false` so Enter is the
   * affirmative, with the existing offer copy resolved as Chrome Strings.
   * The `container` gate keeps the offer tied to the Landing Page — the
   * dialog renders on the desktop layer, not inside the container.
   *
   * Only the guard above is guarded. Everything from here on may throw on a
   * missing Chrome String id, and that is the intended failure: ADR 0015
   * wants a missing id to break loudly rather than render an empty label.
   */
  function offerInto(container) {
    if (!container || !shouldOffer()) return false;
    // One dialog at a time: the desktop owns a modal, so a system dialog
    // already on screen (End Program, another offer) defers this one.
    if (!app.Windows || typeof app.Windows.openSystemDialog !== 'function') return false;
    if (typeof app.Windows.isDialogOpen === 'function' && app.Windows.isDialogOpen()) return false;
    var alt = other();
    if (!alt) return false;

    var controller = app.Windows.openSystemDialog({
      icon: 'info',
      titleId: 'lang.offerTitle',
      messageId: 'lang.offerQuestion',
      messageParams: { language: app.I18n.t('lang.otherName') },
      okId: 'lang.offerAccept',
      cancelId: 'lang.offerDismiss',
      dangerous: false,
      onOk: function() {
        // Record the choice before leaving, exactly as the old banner's
        // accept click did, so the destination page treats this as a
        // decision already made and can never send them back.
        app.LangPref.setLanguage(alt.locale);
        window.location.href = alt.href;
      },
      onCancel: function() {
        app.LangPref.dismiss(PROMPT);
      }
    });
    return !!controller;
  }

  app.LangRouting = { PROMPT: PROMPT, init: init, offerInto: offerInto, shouldOffer: shouldOffer };

  if (typeof module !== 'undefined') module.exports = globalThis.App.LangRouting;
})(globalThis);