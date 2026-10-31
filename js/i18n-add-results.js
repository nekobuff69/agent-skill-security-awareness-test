(function(global) {
  'use strict';

  // Results-view Chrome Strings, layered onto the base dictionaries via the
  // App.I18n.extend seam (ADR 0015). Both pages load the base dictionary for
  // their language before this file, so `extend` is always present in a real
  // browser run; the guard only keeps a headless require of this file alone
  // from crashing.
  if (!global.App || !global.App.I18n ||
      typeof global.App.I18n.extend !== 'function') {
    return;
  }
  var extend = global.App.I18n.extend;

  // Retro skin additions (ticket #45). Only ids the renderer actually uses —
  // section headings and panel copy already resolve from the base dictionary
  // (results.radarTitle … results.reviewBack; see i18n/en.js).
  //   results.overall        — fires the Overall Percentage caption inside the
  //                            sunken client field of the Title Card window.
  //   results.titleBtnMin    — aria-labels for the drawn, DISABLED [—][□][×]
  //   results.titleBtnMax /  — marks of the Title Card title bar (mirrors the
  //   results.titleBtnClose    shell's shell.minimize/maximize/close labels).
  extend('en', {
    'results.overall': 'Overall',
    'results.titleBtnMin': 'Minimize',
    'results.titleBtnMax': 'Maximize',
    'results.titleBtnClose': 'Close'
  });

  extend('zh', {
    'results.overall': '总分',
    'results.titleBtnMin': '最小化',
    'results.titleBtnMax': '最大化',
    'results.titleBtnClose': '关闭'
  });

  if (typeof module !== 'undefined') {
    // Nothing to export beyond the extended dictionaries; the require is
    // kept valid for headless test harnesses that only load i18n first.
    if (global.App && global.App.I18n) module.exports = global.App.I18n;
    else module.exports = {};
  }
})(globalThis);
