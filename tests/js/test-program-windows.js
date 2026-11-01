exports.name = 'Program windows: arrival, mount, taskbar (ticket #61)';

/**
 * The three-program desktop driven through the REAL presenter seam: the
 * results presenter renders the Action Plan and the Deep-Dive Prompt into
 * their own program frames, the windows arrive on their own rules (the
 * Deep-Dive Prompt minimized at the Finish Commit, the Action Plan when
 * its content settles), and an in-place re-render re-mounts the section
 * subtrees without duplicating or orphaning them.
 *
 * Everything is asserted as behaviour — which element the content ends up
 * under, which window the desktop calls active, what the taskbar reports —
 * never as markup or class names. The fake DOM is the test-rerender.js /
 * test-desktop-core.js pattern: snapshot the globals, install a page, and
 * restore them at the end.
 */

var PROMPT_MARK = 'PROGRAM-WINDOW-PROMPT-MARKER';
var PLAN_HEAD = 'PROGRAM-WINDOW-ACTION-ITEM';

function fakeEl(tag) {
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, children: [], parentNode: null,
    className: '', textContent: '', type: '', href: '', id: '',
    disabled: false, hidden: false, focused: false,
    attrs: {}, handlers: {}, classes: {},
    setAttribute: function(n, v) { el.attrs[n] = String(v); },
    getAttribute: function(n) {
      return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
    },
    appendChild: function(child) {
      el.children.push(child); if (child) child.parentNode = el; return child;
    },
    removeChild: function(child) {
      el.children = el.children.filter(function(x) { return x !== child; });
      if (child) child.parentNode = null; return child;
    },
    insertBefore: function(node, ref) {
      var i = el.children.indexOf(ref);
      if (i < 0) el.children.push(node); else el.children.splice(i, 0, node);
      node.parentNode = el; return node;
    },
    addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
    click: function() {
      if (el.disabled) return;
      if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
    },
    focus: function() { el.focused = true; }
  };
  el.classList = {
    add: function(k) { el.classes[k] = true; },
    remove: function(k) { delete el.classes[k]; },
    contains: function(k) { return !!el.classes[k]; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function() { return ''; },
    set: function(v) {
      if (v === '') {
        el.children.forEach(function(x) { if (x) x.parentNode = null; });
        el.children = [];
      }
    }
  });
  return el;
}

function countById(root, id, out) {
  out = out || [];
  if (!root) return out;
  var list = Array.isArray(root) ? root : [root];
  list.forEach(function(node) {
    if (!node) return;
    if (node.id === id) out.push(node);
    countById(node.children, id, out);
  });
  return out;
}

function textOf(node, out) {
  out = out || [];
  if (node == null) return out;
  if (node.nodeType === 3) { out.push(node.textContent); return out; }
  if (typeof node.textContent === 'string' && node.textContent !== '') {
    out.push(node.textContent);
  }
  (node.children || []).forEach(function(kid) { textOf(kid, out); });
  return out;
}

exports.run = function() {
  var results = [];
  function check(desc, pass, extra) {
    results.push({ pass: !!pass, message: desc + (extra ? ' — ' + extra : '') });
  }

  var prev = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    controller: globalThis.App && globalThis.App.Windows && globalThis.App.Windows.controller,
    showView: globalThis.App && globalThis.App.showView,
    actionPlan: globalThis.App && globalThis.App.ActionPlan,
    promptBuilder: globalThis.App && globalThis.App.PromptBuilder,
    sessionStore: globalThis.App && globalThis.App.SessionStore,
    locale: globalThis.App && globalThis.App.I18n && globalThis.App.I18n.locale
  };

  // ── the page: four views + three frames + the taskbar ────────────────
  var views = {};
  ['landing-view', 'quiz-view', 'results-view', 'review-view'].forEach(function(id) {
    var sec = fakeEl('section');
    sec.id = id;
    sec.hidden = true;
    views[id] = sec;
  });

  var body = fakeEl('body');
  var appEl = fakeEl('div');
  appEl.id = 'app';
  views['landing-view'].hidden = false;
  appEl.appendChild(views['landing-view']);
  appEl.appendChild(views['quiz-view']);
  appEl.appendChild(views['results-view']);
  appEl.appendChild(views['review-view']);
  body.appendChild(appEl);

  function makeFrame(program, mountId) {
    var win = fakeEl('div');
    var bar = fakeEl('div');
    var titleText = fakeEl('span');
    var bodyEl = fakeEl('div');
    bodyEl.id = mountId;
    bodyEl.setAttribute('data-results-mount', program);
    win.appendChild(bar);
    bar.appendChild(titleText);
    win.appendChild(bodyEl);
    body.appendChild(win);
    var grip = fakeEl('div');
    win.appendChild(grip);
    var btn = fakeEl('button');
    var buttons = {
      minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button')
    };
    return {
      windowEl: win, titleBar: bar, titleText: titleText, bodyEl: bodyEl,
      resizeGrip: grip, taskbarBtn: btn, buttons: buttons
    };
  }

  var planFrame = makeFrame('action-plan', 'results-mount-action-plan');
  var ddFrame = makeFrame('deep-dive', 'results-mount-deep-dive');

  globalThis.document = {
    body: body,
    documentElement: fakeEl('html'),
    createElement: function(tag) { return fakeEl(tag); },
    createElementNS: function(ns, tag) { return fakeEl(tag); },
    createTextNode: function(text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById: function(id) {
      var found = countById([appEl, planFrame.windowEl, ddFrame.windowEl, body], id);
      return found.length ? found[0] : null;
    },
    querySelector: function(sel) {
      if (sel !== '#app > section:not([hidden])') return null;
      var visible = views['landing-view'];
      ['landing-view', 'quiz-view', 'results-view', 'review-view'].forEach(function(v) {
        if (!views[v].hidden) visible = views[v];
      });
      return visible;
    }
  };
  globalThis.window = { APP_CONFIG: { proxyUrl: '' }, Corpus: {} };
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator) {
    try { globalThis.navigator = {}; } catch (e) { /* read-only host object */ }
  }

  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  require('../../js/ast.js');
  require('../../js/scoring.js');
  require('../../js/desktop-core.js');
  require('../../js/windows.js');
  require('../../js/results.js');

  var App = globalThis.App;
  var Windows = require('../../js/windows.js');
  App.I18n.use('en');
  App.showView = function(id) {
    ['landing-view', 'quiz-view', 'results-view', 'review-view'].forEach(function(v) {
      views[v].hidden = (v !== id);
    });
  };
  App.PromptBuilder = { build: function() { return PROMPT_MARK; } };

  var planAssembles = 0;
  function stubPlan(narrative, actions) {
    App.ActionPlan = {
      assemble: function() {
        planAssembles++;
        return Promise.resolve({ narrative: narrative, actions: actions, path: 'fallback' });
      }
    };
  }

  var VP = { width: 1024, height: 768, taskbar: 36 };
  var ctl = Windows.create({ doc: globalThis.document, viewport: function() { return VP; } });
  App.Windows = App.Windows || {};
  App.Windows.controller = ctl;

  var quizWindowEl = fakeEl('div');
  ctl.attach({
    windowEl: quizWindowEl,
    titleBar: fakeEl('div'),
    resizeGrip: fakeEl('div'),
    programBtn: fakeEl('button'),
    buttons: { minimize: fakeEl('button'), maximize: fakeEl('button'), close: fakeEl('button') }
  });
  ctl.attachProgram('action-plan', planFrame);
  ctl.attachProgram('deep-dive', ddFrame);

  var bank = require('../../questions.json');
  var answers = bank.questions.map(function() { return 1; });
  var scored = App.Scoring.computeScores(bank, answers);
  if (!scored.ok) {
    check('the real Scoring Engine yields a report', false, scored.error);
    return results;
  }

  return (async function() {
    try {
      // ── The Finish Commit ─────────────────────────────────────────────
      stubPlan('A narrative.', [{
        priority: '1', title: PLAN_HEAD, description: 'Do it.', ast_source: 'AST001'
      }]);

      App.renderResults(bank, scored.report);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      check('the Quiz window body no longer carries the two sections',
        textOf(views['results-view']).join(' ').indexOf(PROMPT_MARK) < 0 &&
        textOf(views['results-view']).join(' ').indexOf(PLAN_HEAD) < 0,
        textOf(views['results-view']).join(' ').slice(0, 60));
      check('the Deep-Dive Prompt section renders inside its own frame',
        textOf(ddFrame.bodyEl).join(' ').indexOf(PROMPT_MARK) >= 0);
      check('the Action Plan section renders inside its own frame',
        textOf(planFrame.bodyEl).join(' ').indexOf(PLAN_HEAD) >= 0);

      check('the Finish Commit opened the Deep-Dive Prompt MINIMIZED',
        ctl.getState('deep-dive').mode === 'minimized' &&
        ctl.isVisible('deep-dive') === false && ctl.inTaskbar('deep-dive') === true);
      check('the Action Plan window exists once its content settled',
        ctl.hasWindow('action-plan') === true &&
        ctl.isVisible('action-plan') === true);
      check('arrival left the Quiz window active, untouched and on top',
        ctl.snapshot().active === 'quiz' &&
        ctl.getState('quiz').mode === 'normal' &&
        ctl.snapshot().windows['action-plan'].z < ctl.snapshot().windows.quiz.z);
      check('the Action Plan arrived cascaded 24px from the Quiz window',
        ctl.geometry('action-plan').x === ctl.geometry('quiz').x + 24 &&
        ctl.geometry('action-plan').y === ctl.geometry('quiz').y + 24,
        JSON.stringify(ctl.geometry('action-plan')));
      check('the taskbar lists the three running programs in order',
        ctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive');
      check('exactly one host exists for each section',
        countById([body], 'results-mount-action-plan').length === 1 &&
        countById([body], 'results-mount-deep-dive').length === 1);

      // ── Switching programs from the taskbar ───────────────────────────
      ddFrame.taskbarBtn.click();
      check('the taskbar button restores and focuses the minimized window',
        ctl.getState('deep-dive').mode === 'normal' &&
        ctl.snapshot().active === 'deep-dive' &&
        ctl.snapshot().windows['deep-dive'].z > ctl.snapshot().windows['action-plan'].z);
      planFrame.windowEl.handlers.pointerdown({
        target: planFrame.bodyEl, pointerId: 4, button: 0, isPrimary: true,
        clientX: 10, clientY: 10, preventDefault: function() {}
      });
      check('a pointer interaction inside a frame raises it and makes it active',
        ctl.snapshot().active === 'action-plan' &&
        ctl.snapshot().windows['action-plan'].z > ctl.snapshot().windows['deep-dive'].z);

      // ── The in-place re-render (#56 seam) ─────────────────────────────
      var planWinBefore = ctl.geometry('action-plan');
      var quizModeBefore = ctl.getState('quiz').mode;
      App.I18n.use('zh');
      check('the language switch re-renders in place', App.rerenderResults() === true);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      App.I18n.use('en');
      check('the re-rendered Action Plan stays in its own window',
        textOf(planFrame.bodyEl).join(' ').indexOf(PLAN_HEAD) >= 0 &&
        textOf(views['results-view']).join(' ').indexOf(PLAN_HEAD) < 0);
      check('the re-rendered Deep-Dive Prompt stays in its own window',
        textOf(ddFrame.bodyEl).join(' ').indexOf(PROMPT_MARK) >= 0 &&
        textOf(views['results-view']).join(' ').indexOf(PROMPT_MARK) < 0);
      check('the re-render re-mounted exactly one section per window',
        countById([body], 'results-mount-action-plan').length === 1 &&
        countById([body], 'results-mount-deep-dive').length === 1 &&
        planFrame.bodyEl.children.length === 1 &&
        ddFrame.bodyEl.children.length === 1,
        'plan=' + planFrame.bodyEl.children.length + ' dd=' + ddFrame.bodyEl.children.length);
      check('the re-render neither moved nor re-arrived the windows',
        ctl.geometry('action-plan').x === planWinBefore.x &&
        ctl.geometry('action-plan').y === planWinBefore.y &&
        ctl.getState('quiz').mode === quizModeBefore &&
        ctl.getState('action-plan').mode === 'normal');

      // ── A second Completion: the deterministic fallback settles on its
      //    own microtask and the arrival rule is the same one.
      App.SessionStore = { clear: function() {}, load: function() { return { ok: true, answers: [] }; } };
      var fresh = App.Scoring.computeScores(bank, answers.map(function() { return 0; })).report;
      stubPlan('Another narrative.', [{
        priority: '1', title: PLAN_HEAD, description: 'Do it.', ast_source: 'AST002'
      }]);
      App.renderResults(bank, fresh);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      check('a new Completion re-renders into the same frames, one section each',
        planFrame.bodyEl.children.length === 1 && ddFrame.bodyEl.children.length === 1 &&
        textOf(planFrame.bodyEl).join(' ').indexOf(PLAN_HEAD) >= 0);

      // ── Leaving the desktop stage ──────────────────────────────────────
      App.showView('landing-view');
      ctl.render();
      check('the flow stage leaves no program window on the taskbar',
        ctl.runningPrograms().join(',') === 'quiz' &&
        ctl.getState('action-plan').mode === 'hidden' &&
        ctl.getState('deep-dive').mode === 'hidden');

      // The way back is the content: the next Completion settles, and both
      // windows arrive again on the desktop stage.
      var second = App.Scoring.computeScores(bank, answers.map(function() { return 2; })).report;
      stubPlan('Third narrative.', [{
        priority: '1', title: PLAN_HEAD, description: 'Again.', ast_source: 'AST003'
      }]);
      App.showView('quiz-view');
      App.renderResults(bank, second);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      check('a new Completion brings the settled programs back on the desktop',
        ctl.runningPrograms().join(',') === 'quiz,action-plan,deep-dive' &&
        ctl.getState('action-plan').mode === 'normal' &&
        ctl.getState('deep-dive').mode === 'minimized' &&
        planFrame.bodyEl.children.length === 1 &&
        ddFrame.bodyEl.children.length === 1);
    } catch (err) {
      check('program-window block ran without throwing', false, err && err.stack || String(err));
    } finally {
      // Leave every shared global exactly as this suite found it.
      if (prev.controller === undefined) delete App.Windows.controller;
      else App.Windows.controller = prev.controller;
      if (prev.showView === undefined) delete App.showView; else App.showView = prev.showView;
      if (prev.actionPlan === undefined) delete App.ActionPlan; else App.ActionPlan = prev.actionPlan;
      if (prev.promptBuilder === undefined) delete App.PromptBuilder;
      else App.PromptBuilder = prev.promptBuilder;
      if (prev.sessionStore === undefined) delete App.SessionStore;
      else App.SessionStore = prev.sessionStore;
      if (prev.document === undefined) delete globalThis.document;
      else globalThis.document = prev.document;
      if (prev.window === undefined) delete globalThis.window;
      else globalThis.window = prev.window;
      if (prev.navigator === undefined) { try { delete globalThis.navigator; } catch (e) {} }
      else globalThis.navigator = prev.navigator;
      if (prev.locale) App.I18n.use(prev.locale);
    }
    return results;
  })();
};
