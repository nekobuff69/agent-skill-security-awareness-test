(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  /**
   * The Participant's remembered language choice.
   *
   * Deliberately not part of the Session. A Session is version-stamped against
   * the Question Bank's structure and is discarded when that structure
   * changes; folding the language choice in would silently reset it on every
   * assessment edit, and starting, Completing or Retaking an assessment would
   * rewrite it. One key, one small record, independent of assessment content.
   */
  var KEY = 'quiz-lang';

  /**
   * Normalize a document language tag to its base form. 'zh-Hans' and 'zh'
   * both resolve to 'zh'.
   *
   * This mirrors App.I18n.baseLocale and must keep agreeing with it: a
   * language tag variant must not be able to split one language's stored
   * preference across two values. The module takes no dependency on the
   * dictionary so it stays loadable on its own; a test pins the two together.
   */
  function baseLocale(lang) {
    return String(lang == null ? '' : lang).trim().toLowerCase().split(/[-_]/)[0];
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw === null) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var language = typeof parsed.language === 'string' ? baseLocale(parsed.language) : '';
      // Any other fields in the record (leftovers from an earlier schema,
      // for example) are ignored: the choice is the only fact kept.
      return { language: language || null };
    } catch (e) {
      // unavailable or corrupt — treat as no preference rather than throwing
      return null;
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  /** The stored preference. Always returns a usable shape, never null. */
  function get() {
    return read() || { language: null };
  }

  /**
   * Record a deliberate language choice, normalizing the tag. This is what a
   * Participant using the language switch — or the first-visit routing
   * deciding on the matching page — sets, and it is what stops first-visit
   * routing from ever moving them again.
   */
  function setLanguage(lang) {
    var state = get();
    state.language = baseLocale(lang) || null;
    write(state);
    return state.language;
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  globalThis.App.LangPref = {
    baseLocale: baseLocale,
    get: get,
    setLanguage: setLanguage,
    clear: clear
  };
  if (typeof module !== 'undefined') module.exports = globalThis.App.LangPref;
})(globalThis);