(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  // Chrome String lookup, resolved at render time.
  function t(id, vars) {
    return app.I18n.t(id, vars);
  }

  // View router
  app.showView = function(viewId) {
    var sections = document.querySelectorAll('#app > section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].hidden = true;
    }
    var target = document.getElementById(viewId);
    if (target) {
      target.hidden = false;
    }
  };

  // Error display
  function showError(message) {
    var landing = document.getElementById('landing-view');
    if (!landing) return;
    landing.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    landing.appendChild(p);

    var retry = document.createElement('button');
    retry.className = 'btn-primary';
    retry.textContent = t('error.retry');
    retry.style.maxWidth = '200px';
    retry.style.marginTop = '1rem';
    retry.addEventListener('click', function() {
      loadBank();
    });
    landing.appendChild(retry);

    landing.hidden = false;
    landing.style.display = '';
  }

  // Each page declares which Question Bank Variant and Grounding Corpus it
  // loads, relative to itself — the English page and the Chinese page differ
  // only in these two attributes plus the dictionary it links. No build step.
  var BANK_URL = document.documentElement.getAttribute('data-bank') || 'questions.json';
  var CORPUS_URL = document.documentElement.getAttribute('data-corpus') || 'docs/owasp-ast-full.md';

  // ── Active view ───────────────────────────────────────────────────

  // The id of the one visible section (`hidden` is the single source of
  // truth — showView toggles it), or null when nothing is visible. Used by
  // the re-render seam to decide what to rebuild.
  app.currentView = function() {
    var sections = document.querySelectorAll('#app > section');
    for (var i = 0; i < sections.length; i++) {
      if (!sections[i].hidden) return sections[i].id || null;
    }
    return null;
  };

  // ── Bank fetch seam (issue #48) ────────────────────────────────────

  // Fetch and parse a Question Bank from any URL. Deliberately state-free:
  // it never touches the active bank or any view — the caller decides
  // what the data is for (initial load, refresh, Bank Variant swap).
  app.fetchBank = function(url, onReady, onError) {
    return fetch(url)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        if (typeof onReady === 'function') onReady(data);
      })
      .catch(function(err) {
        if (typeof onError === 'function') onError(err);
        else showError(t('error.loadBank', { message: err.message }));
      });
  };

  // ── Bank swap + re-render seam (issue #48) ─────────────────────────

  // Make `data` the active Question Bank and rebuild whichever view is
  // currently visible from current state — without a page load.
  //
  //   answering  → re-rendered in place at the same Question with every
  //                recorded answer intact when the new bank is structurally
  //                identical (the Bank Variant boundary, ADR 0017); a
  //                structural change cannot re-attribute stored answers, so
  //                it falls back to the Session-aware fresh render.
  //   results / review → rebuilt from the same score report, so the same
  //                report can be shown against another Bank Variant.
  //   landing / none → rebuilt from the new bank's meta.
  //
  // Returns the view id that was re-rendered.
  app.activateBank = function(data) {
    global.Bank = data;
    app.Bank = data;

    var view = app.currentView();

    if (view === 'quiz-view' && typeof app.quizState === 'function') {
      var state = app.quizState();
      if (state) {
        var identical = app.SessionStore &&
          app.SessionStore.hashBank(state.bank) === app.SessionStore.hashBank(data);
        if (identical && typeof app.rerenderQuiz === 'function') {
          app.rerenderQuiz(data, state.currentIdx, state.answers);
        } else {
          app.renderQuiz(data);
        }
        return 'quiz-view';
      }
    }

    if ((view === 'results-view' || view === 'review-view') &&
        typeof app.resultsState === 'function') {
      var rs = app.resultsState();
      if (rs && rs.report) {
        if (view === 'results-view') {
          app.renderResults(data, rs.report);
        } else if (typeof app.renderReview === 'function') {
          app.renderReview(data, rs.report);
        }
        return view;
      }
    }

    app.renderLanding(data);
    return 'landing-view';
  };

  // One-call refresh seam: fetch a Question Bank from a caller-supplied
  // URL, make it active, and re-render the active view in place.
  // onDone receives (bank, viewId).
  app.loadBankFrom = function(url, onDone, onError) {
    return app.fetchBank(url, function(data) {
      var view = app.activateBank(data);
      if (typeof onDone === 'function') onDone(data, view);
    }, onError);
  };

  // Fetch and initialize bank
  function loadBank() {
    var landing = document.getElementById('landing-view');
    if (landing) {
      // Build via textContent so the dictionary value is never parsed as HTML.
      landing.innerHTML = '';
      var loadingP = document.createElement('p');
      loadingP.textContent = t('loading.bank');
      landing.appendChild(loadingP);
      landing.hidden = false;
    }

    app.fetchBank(BANK_URL, function(data) {
      // Fetch Grounding Corpus for LLM path
      fetch(CORPUS_URL)
        .then(function(resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.text();
        })
        .then(function(text) {
          global.Corpus = text;
        })
        .catch(function() {
          global.Corpus = null;
        });

      app.activateBank(data);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Select the dictionary before anything renders — a page never shows
    // untranslated Chrome Strings.
    app.I18n.use(document.documentElement.lang);
    document.title = t('doc.title');

    // First-visit language routing, before the bank loads — it needs no
    // assessment content and should not wait on it.
    if (app.LangRouting && typeof app.LangRouting.init === 'function') {
      app.LangRouting.init();
    }
    loadBank();
  });

})(globalThis);
