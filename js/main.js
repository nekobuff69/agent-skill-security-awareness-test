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

    fetch(BANK_URL)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        global.Bank = data;
        app.Bank = data;

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

        if (typeof app.renderLanding === 'function') {
          app.renderLanding(data);
        }
      })
      .catch(function(err) {
        showError(t('error.loadBank', { message: err.message }));
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
