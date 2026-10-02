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

  function questionsOf(bank) {
    return (bank && Array.isArray(bank.questions)) ? bank.questions : [];
  }

  function phasesOf(bank) {
    return (bank && Array.isArray(bank.phases)) ? bank.phases : [];
  }

  /**
   * The structural signature of a Question Bank: the language-independent
   * facts that give a stored answer its meaning.
   *
   * A Session records one Option index per Question, resolved positionally
   * against `bank.questions[i]` — scoring never looks a Question up by id. So
   * an answer stays valid exactly as long as the Question order, the Option
   * order and Option Scores, the Severity Weights that scale them, the AST
   * Risk mappings the report is built from, and the Phase membership all hold.
   * Those are the fields hashed here, and nothing else.
   *
   * Authored text is excluded on purpose: it is the one thing a Bank Variant
   * is allowed to differ on, so including it would make every Bank Variant
   * hash differently and version a shared Session against itself. This is the
   * same boundary the deploy gate enforces across Variants (ADR 0015), applied
   * at runtime.
   */
  function signature(bank) {
    var scoring = (bank && bank.meta && bank.meta.scoring) || null;
    return {
      questions: questionsOf(bank).map(function(q) {
        var options = Array.isArray(q.options) ? q.options : [];
        return {
          id: q.id,
          phase: q.phase,
          ast_risks: q.ast_risks,
          severity_weight: q.severity_weight,
          scores: options.map(function(o) { return o.score; })
        };
      }),
      phases: phasesOf(bank).map(function(p) {
        return { id: p.id, question_ids: p.question_ids };
      }),
      severity_values: scoring ? scoring.severity_values : null
    };
  }

  /**
   * Content hash of a bank's structure. Identical across Bank Variants, and
   * changed by anything that would re-attribute a stored answer.
   */
  function hashBank(bank) {
    return fnv1a(JSON.stringify(signature(bank)));
  }

  /**
   * One Session per Participant, shared by every Bank Variant.
   *
   * A Participant is one person taking one assessment; the language is the
   * page they are reading it in. Answers are Option indices into structurally
   * identical banks, so one record is correct in either language, and
   * switching language mid-assessment resumes where they left off rather than
   * starting a second run (ADR 0017, superseding ADR 0016).
   */
  var KEY = 'quiz-session';

  /** Pre-ADR-0017 keys were `quiz-session:<language>`. */
  var LEGACY_PREFIX = KEY + ':';

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function write(bank, answers) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: hashBank(bank), answers: answers }));
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  function countAnswered(answers) {
    var n = 0;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] !== null) n++;
    }
    return n;
  }

  /**
   * Shape-check an answers array against the bank it is about to be read with.
   * Returns a defensive copy, or null when the array cannot be trusted.
   */
  function validAnswers(arr, bank) {
    if (!Array.isArray(arr)) return null;
    var qs = questionsOf(bank);
    if (arr.length !== qs.length) return null;
    var out = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v === null) {
        out[i] = null;
        continue;
      }
      if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 0) return null;
      var options = Array.isArray(qs[i].options) ? qs[i].options : [];
      if (v >= options.length) return null;
      out[i] = v;
    }
    return out;
  }

  /** Every key written under the pre-ADR-0017 language-scoped scheme. */
  function legacyKeys() {
    var found = [];
    try {
      if (typeof localStorage.length !== 'number' || typeof localStorage.key !== 'function') {
        return found;
      }
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (typeof k === 'string' && k.indexOf(LEGACY_PREFIX) === 0) found.push(k);
      }
    } catch (e) {
      // unavailable — nothing to migrate
    }
    return found;
  }

  /**
   * Fold any language-scoped Session left by ADR 0016 into the shared record.
   *
   * Legacy records carry `v` = the old whole-bank text hash, which is not
   * comparable with the structural hash above, so they cannot be re-stamped
   * on faith: each candidate is shape-checked against the current bank and the
   * most-advanced survivor wins, since a Participant who answered three
   * Questions in one language and five in the other has eight Questions of
   * work, not two Sessions.
   *
   * The one thing this cannot detect is a bank edit that happened while those
   * Sessions sat in storage — shape survives a Question reorder or a re-score.
   * That window is one deploy wide and the legacy keys are deleted either way.
   */
  function migrate(bank) {
    var keys = legacyKeys();
    var best = null;
    var i;
    for (i = 0; i < keys.length; i++) {
      var rec = read(keys[i]);
      var answers = rec ? validAnswers(rec.answers, bank) : null;
      if (!answers) continue;
      if (!best || countAnswered(answers) > countAnswered(best)) best = answers;
    }
    if (best) write(bank, best);
    for (i = 0; i < keys.length; i++) {
      try {
        localStorage.removeItem(keys[i]);
      } catch (e) {
        // unavailable — swallow silently
      }
    }
    return best;
  }

  function load(bank) {
    var rec = read(KEY);
    if (rec && rec.v === hashBank(bank)) {
      var answers = validAnswers(rec.answers, bank);
      if (answers) return { ok: true, answers: answers };
      // Hashed for this bank but unreadable — corrupt, not a version drift.
      clear();
      return { ok: false, reason: 'empty' };
    }
    var migrated = migrate(bank);
    if (migrated) return { ok: true, answers: migrated };
    return { ok: false, reason: rec ? 'stale' : 'empty' };
  }

  function save(bank, answers) {
    write(bank, answers);
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // unavailable — swallow silently
    }
  }

  /**
   * Whether a Session record exists at all, without validating it against a
   * bank.
   *
   * First-visit routing has to decide before the Question Bank has loaded,
   * and a Participant who has already started must not be moved. It needs to
   * know that a record exists, not what is in it — validity is the bank
   * load's business.
   */
  function exists() {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch (e) {
      // unavailable — swallow silently
      return false;
    }
  }


  globalThis.App.SessionStore = { hashBank: hashBank, load: load, save: save, clear: clear, exists: exists };
  if (typeof module !== 'undefined') module.exports = globalThis.App.SessionStore;
})(globalThis);