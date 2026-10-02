(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function hashBank(bank) {
    return fnv1a(JSON.stringify(bank.questions) + JSON.stringify(bank.phases));
  }

  var KEY = 'quiz-session';

  /**
   * Storage key, scoped by language.
   *
   * A Participant who starts the assessment in one Bank Variant, switches to
   * the other, and switches back finds their answers intact: each language
   * keeps its own Session. The content-hash versioning inside each key is
   * unchanged (ADR-0016 supersedes ADR-0011 on the key shape only).
   */
  function storageKey(locale) {
    var lang = typeof locale === 'string' ? locale.toLowerCase().split(/[-_]/)[0] : '';
    return KEY + ':' + (lang || 'en');
  }

  function load(bank, locale) {
    try {
      var raw = localStorage.getItem(storageKey(locale));
      if (raw === null) return { ok: false, reason: 'empty' };
      var parsed = JSON.parse(raw);
      if (parsed.v === hashBank(bank)) {
        return { ok: true, answers: parsed.answers };
      }
      return { ok: false, reason: 'stale' };
    } catch (e) {
      return { ok: false, reason: 'empty' };
    }
  }

  function save(bank, answers, locale) {
    try {
      localStorage.setItem(storageKey(locale), JSON.stringify({ v: hashBank(bank), answers: answers }));
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  function clear(locale) {
    try {
      localStorage.removeItem(storageKey(locale));
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  globalThis.App.SessionStore = { hashBank: hashBank, storageKey: storageKey, load: load, save: save, clear: clear };
  if (typeof module !== 'undefined') module.exports = globalThis.App.SessionStore;
})(globalThis);
