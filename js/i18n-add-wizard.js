/**
 * Wizard Row Chrome Strings (ticket #40, ADR 0020).
 *
 * Loaded on both pages after i18n/<lang>.js, per the add-on convention:
 * extend only, never re-register — the base dictionaries own every other
 * id and the missing-id hard failure (ADR 0015) is unchanged.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  if (!app.I18n || typeof app.I18n.extend !== 'function') return;

  app.I18n.extend('en', {
    'wizard.back': '< Back',
    'wizard.next': 'Next >',
    'wizard.finish': 'Finish'
  });

  app.I18n.extend('zh', {
    'wizard.back': '< 上一步',
    'wizard.next': '下一步 >',
    'wizard.finish': '完成'
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
