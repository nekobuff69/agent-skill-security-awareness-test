(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

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
    retry.textContent = 'Retry';
    retry.style.maxWidth = '200px';
    retry.style.marginTop = '1rem';
    retry.addEventListener('click', function() {
      loadBank();
    });
    landing.appendChild(retry);

    landing.hidden = false;
    landing.style.display = '';
  }

  // Fetch and initialize bank
  function loadBank() {
    var landing = document.getElementById('landing-view');
    if (landing) {
      landing.innerHTML = '<p>Loading&hellip;</p>';
      landing.hidden = false;
    }

    fetch('questions.json')
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        global.Bank = data;
        app.Bank = data;

        // Fetch Grounding Corpus for LLM path
        fetch('docs/owasp-ast-full.md')
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
        showError('Failed to load question bank: ' + err.message);
      });
  }

  document.addEventListener('DOMContentLoaded', function() {
    loadBank();
  });

})(globalThis);
