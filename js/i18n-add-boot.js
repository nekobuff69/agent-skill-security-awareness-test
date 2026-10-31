(function(global) {
  'use strict';

  // Boot splash Chrome Strings, layered onto the base dictionaries via the
  // App.I18n.extend seam (issue #39). Both pages load the base dictionary for
  // their language before this file, so `extend` is always present in a real
  // browser run; the guard only keeps a headless require of this file alone
  // from crashing.
  if (!global.App || !global.App.I18n ||
      typeof global.App.I18n.extend !== 'function') {
    return;
  }
  var extend = global.App.I18n.extend;

  // The splash reuses the landing title as its app-name string so the boot
  // screen always names the program that follows it; only the boot-local
  // ids live here.
  extend('en', {
    'boot.status': 'Starting application…'
  });

  extend('zh', {
    'boot.status': '正在启动程序……'
  });

  if (typeof module !== 'undefined') {
    // Nothing to export beyond the extended dictionaries; the require is
    // kept valid for headless test harnesses that only load i18n first.
    if (global.App && global.App.I18n) module.exports = global.App.I18n;
    else module.exports = {};
  }
})(globalThis);
