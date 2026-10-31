(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Chrome String dictionary.
   *
   * Every user-visible interface string lives in a dictionary keyed by string
   * id, registered per locale. Rendering resolves through t(); a missing id
   * throws instead of silently rendering empty or falling back to English.
   *
   * Question Bank content is NOT translated here — it arrives already authored
   * per language in the Bank Variant the page loads.
   */

  var dictionaries = {};
  var activeLocale = null;

  /**
   * Register a dictionary for one locale.
   * @param {string} locale - 'en', 'zh'
   * @param {object} dictionary - string-id → string (or number for budgets)
   */
  function register(locale, dictionary) {
    if (typeof locale !== 'string' || locale === '') {
      throw new Error('i18n.register requires a locale string');
    }
    if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary)) {
      throw new Error('i18n.register requires a dictionary object for locale ' + locale);
    }
    dictionaries[locale.toLowerCase()] = dictionary;
  }

  /**
   * Merge extra Chrome Strings into a locale's dictionary. The seam for
   * module-level contributions that land outside register() (tests, late
   * modules): merges into whatever
   * register() already placed, and creates the dictionary when absent —
   * the page's locale is still verified loudly by use(), and missing ids
   * still throw in t(), so this can never mask an absent base dictionary.
   * @param {string} locale - 'en', 'zh'
   * @param {object} additions - string-id → string (or number for budgets)
   */
  function extend(locale, additions) {
    if (typeof locale !== 'string' || locale === '') {
      throw new Error('i18n.extend requires a locale string');
    }
    if (!additions || typeof additions !== 'object' || Array.isArray(additions)) {
      throw new Error('i18n.extend requires an additions object for locale ' + locale);
    }
    var key = locale.toLowerCase();
    var dict = dictionaries[key] || (dictionaries[key] = {});
    for (var id in additions) {
      if (Object.prototype.hasOwnProperty.call(additions, id)) {
        dict[id] = additions[id];
      }
    }
  }

  /**
   * Normalize a document language tag to its dictionary key.
   * 'zh-Hans' and 'zh' both resolve to 'zh'.
   */
  function baseLocale(lang) {
    return String(lang == null ? '' : lang).trim().toLowerCase().split(/[-_]/)[0];
  }

  /**
   * Select the active dictionary. Throws when the page declares a language
   * with no dictionary — a page never renders in the wrong language.
   *
   * @param {string} lang - document.documentElement.lang
   * @returns {string} the active locale key
   */
  function use(lang) {
    var key = baseLocale(lang);
    if (!dictionaries[key]) {
      throw new Error('No string dictionary registered for locale "' + key + '"');
    }
    activeLocale = key;
    return key;
  }

  /** Substitute {name} placeholders; unknown placeholders are left intact. */
  function format(template, vars) {
    if (vars == null) return template;
    return String(template).replace(/\{(\w+)\}/g, function(match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
  }

  /**
   * Resolve one Chrome String. Numbers pass through unformatted so budgets
   * stay numbers.
   *
   * @param {string} id - string id, e.g. 'quiz.labelScenario'
   * @param {object} [vars] - placeholder values
   * @returns {string|number}
   */
  function t(id, vars) {
    if (activeLocale === null) {
      throw new Error('i18n.t("' + id + '") called before a dictionary was selected');
    }
    var dictionary = dictionaries[activeLocale];
    if (!Object.prototype.hasOwnProperty.call(dictionary, id)) {
      throw new Error('Missing ' + activeLocale + ' string for id "' + id + '"');
    }
    var value = dictionary[id];
    if (typeof value === 'string') return format(value, vars);
    return value;
  }

  /** Resolve an AST Risk display name from the dictionary. */
  function astName(astId) {
    return t('ast.' + astId);
  }

  app.I18n = {
    register: register,
    extend: extend,
    use: use,
    t: t,
    format: format,
    astName: astName,
    baseLocale: baseLocale,
    get locale() { return activeLocale; },
    has: function(id) {
      return activeLocale !== null &&
        Object.prototype.hasOwnProperty.call(dictionaries[activeLocale], id);
    }
  };

  if (typeof module !== 'undefined') module.exports = global.App.I18n;

})(globalThis);
