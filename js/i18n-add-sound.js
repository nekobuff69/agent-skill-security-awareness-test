/**
 * System-sound Chrome Strings (ticket #41).
 *
 * Loaded on both pages after i18n/<lang>.js, per the add-on convention:
 * extend only, never re-register — the base dictionaries own every other
 * id and the missing-id hard failure (ADR 0015) is unchanged.
 *
 * One id set:
 *   sound.menuItem  - the Start-menu entry label (the mute toggle).
 *
 * Consumed by js/shell.js (Start-menu entry) when App.Sound is loaded;
 * js/sound.js itself speaks no strings.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  if (!app.I18n || typeof app.I18n.extend !== 'function') return;

  app.I18n.extend('en', {
    'sound.menuItem': 'Sound'
  });

  app.I18n.extend('zh', {
    'sound.menuItem': '声音'
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = globalThis.App;
