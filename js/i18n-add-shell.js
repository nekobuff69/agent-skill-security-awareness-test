(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Desktop shell Chrome Strings (ticket #38).
   *
   * This add-on dictionary belongs to the shell layer only; it is the seam
   * described in js/i18n.js — add-on files extend the base dictionaries
   * instead of touching i18n/en.js / i18n/zh.js. A missing id keeps failing
   * loudly through I18n.t(), so both sides must register the same id set.
   */
  if (app.I18n && typeof app.I18n.extend === 'function') {
    app.I18n.extend('en', {

      /* ── Window frame ── */
      'shell.windowTitle': 'Agent Security Awareness Quiz',
      'shell.minimize': 'Minimize',
      'shell.maximize': 'Maximize',
      'shell.close': 'Close',

      /* ── Taskbar & Start menu ── */
      'shell.start': 'Start',
      'shell.menuAbout': 'About…',

      /* ── About window ── */
      'shell.aboutTitle': 'About Agent Security Awareness Quiz',
      'shell.aboutBody': 'A security-awareness assessment for people who ' +
        'build and run AI agents, with scenarios drawn from the OWASP Top 10.',
      'shell.aboutLink': 'OWASP Top 10 for Agentic Applications',
      'shell.aboutCredits': 'Chrome typeface: W95FA by Alina Sava ' +
        '(SIL Open Font License 1.1).',
      'shell.ok': 'OK'

    });

    app.I18n.extend('zh', {

      /* ── 窗口框架 ── */
      'shell.windowTitle': '智能体安全意识测评',
      'shell.minimize': '最小化',
      'shell.maximize': '最大化',
      'shell.close': '关闭',

      /* ── 任务栏与开始菜单 ── */
      'shell.start': '开始',
      'shell.menuAbout': '关于……',

      /* ── 关于窗口 ── */
      'shell.aboutTitle': '关于智能体安全意识测评',
      'shell.aboutBody': '面向构建和运营智能体人群的安全意识测评，' +
        '情境取材于 OWASP Top 10。',
      'shell.aboutLink': 'OWASP 智能体应用十大风险（英文）',
      'shell.aboutCredits': '界面字体：W95FA（作者 Alina Sava，' +
        'SIL OFL 1.1 许可）。',
      'shell.ok': '确定'

    });
  }

})(globalThis);
