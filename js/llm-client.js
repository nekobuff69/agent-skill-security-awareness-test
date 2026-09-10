(function(global) {
  'use strict';

  globalThis.App = globalThis.App || {};

  var Validator = globalThis.App.ResponseValidator;

  /**
   * Call an LLM proxy, parse the response, and validate against the bank.
   *
   * @param {string} prompt  - The prompt to send to the LLM
   * @param {object} config  - { proxyUrl: string, timeoutMs?: number }
   * @param {object} bank    - Parsed questions.json (passed to ResponseValidator)
   * @returns {Promise<{ ok: true, narrative: string, actions: object[] }
   *                  | { ok: false, reason: string }>}
   */
  function generate(prompt, config, bank) {
    var timeoutMs = (config && typeof config.timeoutMs === 'number') ? config.timeoutMs : 8000;
    var proxyUrl = config && config.proxyUrl;

    if (!proxyUrl) {
      return Promise.resolve({ ok: false, reason: 'invalid-response' });
    }

    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);

    return fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'placeholder',
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    })
    .then(function(response) {
      clearTimeout(timer);

      if (!response.ok) {
        return { ok: false, reason: 'network' };
      }

      return response.json().then(function(data) {
        // Validate response shape: { choices: [{ message: { content: "..." } }] }
        if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
          return { ok: false, reason: 'invalid-response' };
        }

        var choice = data.choices[0];
        if (!choice || !choice.message || typeof choice.message.content !== 'string') {
          return { ok: false, reason: 'invalid-response' };
        }

        // Validate via ResponseValidator
        var result = Validator.validate(choice.message.content, bank);
        if (!result.ok) {
          return { ok: false, reason: 'validation' };
        }

        return {
          ok: true,
          narrative: result.parsed.narrative,
          actions: result.parsed.actions
        };
      });
    })
    .catch(function(err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        return { ok: false, reason: 'timeout' };
      }

      return { ok: false, reason: 'network' };
    });
  }

  globalThis.App.LLMClient = {
    generate: generate
  };

  if (typeof module !== 'undefined') {
    module.exports = globalThis.App.LLMClient;
  }
})(globalThis);
