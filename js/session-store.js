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

  function load(bank) {
    try {
      var raw = localStorage.getItem(KEY);
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

  function save(bank, answers) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: hashBank(bank), answers: answers }));
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  globalThis.App.SessionStore = { hashBank: hashBank, load: load, save: save, clear: clear };
  if (typeof module !== 'undefined') module.exports = globalThis.App.SessionStore;
})(globalThis);
