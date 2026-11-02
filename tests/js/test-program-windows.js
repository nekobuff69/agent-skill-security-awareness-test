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
      // The disclosure rows are native <details>/<summary> (ticket #72):
      // the browser flips the disclosure on a press — pointer or keyboard —
      // and the app wires no handler of its own. The fake keeps that native
      // contract so a test can open and close a disclosure as a user does.
      if (el.tagName === 'SUMMARY' && el.parentNode &&
          el.parentNode.tagName === 'DETAILS') {
        el.parentNode.open = !el.parentNode.open;
      }
    },
    focus: function() { el.focused = true; },
    // Class-only deep search, enough for the Review screen's
    // header.querySelector('.results-review-back-btn').
    querySelector: function(sel) {
      var cls = String(sel).replace(/^\./, '');
      var stack = el.children.slice();
      while (stack.length) {
        var n = stack.shift();
        if (!n || typeof n !== 'object') continue;
        if (String(n.className || '').split(/\s+/).indexOf(cls) >= 0) return n;
        if (n.children) stack = stack.concat(n.children);
      }
      return null;
    }
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

// Nodes carrying a given ARIA role, over a list of roots — the menu bar and
// its commands are asserted through the role a pointer or a keyboard user
// meets, not through markup.
function byRole(roots, role, out) {
  out = out || [];
  (Array.isArray(roots) ? roots : [roots]).forEach(function(node) {
    if (!node || typeof node !== 'object') return;
    if (node.attrs && node.attrs.role === role) out.push(node);
    (node.children || []).forEach(function(kid) { byRole(kid, role, out); });
  });
  return out;
}

function buttonsUnder(node, out) {
  out = out || [];
  if (!node || typeof node !== 'object') return out;
  if (node.tagName === 'BUTTON') out.push(node);
  (node.children || []).forEach(function(kid) { buttonsUnder(kid, out); });
  return out;
}

// Nodes of a given tag over a tree — the disclosure rows are asserted
// through the element a pointer or a keyboard meets (ticket #72), not
// through the class the stylesheet happens to paint.
function byTag(node, tag, out) {
  out = out || [];
  if (!node || typeof node !== 'object') return out;
  if (node.tagName === String(tag).toUpperCase()) out.push(node);
  (node.children || []).forEach(function(kid) { byTag(kid, tag, out); });
  return out;
}

function under(root, node) {
  var stack = [root];
  while (stack.length) {
    var cur = stack.pop();
    if (cur === node) return true;
    (cur && cur.children || []).forEach(function(kid) { stack.push(kid); });
  }
  return false;
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
  var shareCalls = [];
  var copyWrites = [];
  globalThis.window = {
    APP_CONFIG: { proxyUrl: '' },
    Corpus: {},
    Analytics: { track: function() {} }
  };
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator) {
    try { globalThis.navigator = {}; } catch (e) { /* read-only host object */ }
  }
  // The two platform affordances the Quiz commands ride on, recorded so a
  // menu item can be fired from a pointer and its payload observed.
  globalThis.navigator.share = function(payload) {
    shareCalls.push(payload);
    return Promise.resolve();
  };
  globalThis.navigator.clipboard = {
    writeText: function(text) { copyWrites.push(text); return Promise.resolve(); }
  };

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

      // ── Ticket #72: the Action Plan window reads as one ranked list ────
      // One panel carries one row per Action, and the Narrative Expander is
      // the window's single disclosure: it arrives closed and a press on its
      // row opens and closes it, exactly as the native <details> contract
      // answers pointer and keyboard on the page.
      var planSection = planFrame.bodyEl.children[0];
      var planBody = planSection.children[1];   // the plan under its heading
      var planPanel = planBody.children[0];
      var planRow = planPanel.children[0];
      var planExpander = byTag(planFrame.bodyEl, 'details')[0];
      var planSummaryRow = planExpander.children[0];
      check('the ranked panel holds one row per Action and the window owns one disclosure only',
        planBody.children.length === 2 &&
        planPanel.children.length === 1 &&
        byTag(planFrame.bodyEl, 'details').length === 1 &&
        planExpander === planBody.children[1] &&
        textOf(planRow).join(' ').indexOf(PLAN_HEAD) >= 0 &&
        textOf(planRow).join(' ').indexOf('Do it.') >= 0,
        'rows=' + planPanel.children.length);
      check('the Narrative Expander arrives closed under its Chrome String row',
        planExpander.open !== true &&
        planSummaryRow.tagName === 'SUMMARY' &&
        textOf(planSummaryRow).join('') === App.I18n.t('results.narrativeSummary') &&
        planExpander.children[1].textContent === 'A narrative.');
      planSummaryRow.click();
      check('a press on the disclosure row opens it',
        planExpander.open === true);
      planSummaryRow.click();
      check('a second press closes it again with the Narrative still inside',
        planExpander.open === false &&
        planExpander.children[1].textContent === 'A narrative.');

      // ── The Quiz window's menu bar (ticket #65) ───────────────────────
      var allBars = byRole([body], 'menubar');
      check('the page carries one menu bar and it stands in the Quiz body',
        allBars.length === 1 && under(views['results-view'], allBars[0]),
        'bars=' + allBars.length);
      var commands = byRole([body], 'menuitem');
      check('the bar owns the four commands, and nothing else on the page does',
        commands.length === 4 &&
        commands.map(function(c) { return c.textContent; }).join('|') ===
          ['results.downloadPng', 'results.share', 'results.reviewBtn',
            'results.retake'].map(function(id) { return App.I18n.t(id); }).join('|'),
        commands.map(function(c) { return c.textContent; }).join('|'));
      check('no command leaks out of the bar into the body below it',
        buttonsUnder(views['results-view']).length === 4 &&
        buttonsUnder(views['results-view']).every(function(b) {
          return allBars[0].children.indexOf(b) >= 0;
        }),
        'buttons=' + buttonsUnder(views['results-view']).length);
      check('the other two windows own no menu and the Action Plan owns no command',
        byRole([planFrame.windowEl], 'menubar').length === 0 &&
        byRole([planFrame.windowEl], 'menuitem').length === 0 &&
        buttonsUnder(planFrame.bodyEl).length === 0 &&
        byRole([ddFrame.windowEl], 'menubar').length === 0 &&
        byRole([ddFrame.windowEl], 'menuitem').length === 0);

      // ── Ticket #74: the Deep-Dive window is one prompt field and its bar ──
      // The fold is gone. The body leads with the window's flat command
      // strip — the Quiz menu-bar surface carrying ONE command, no menu
      // role — then the one-line guidance, then the prompt, visible before
      // any press because nothing is collapsed any more.
      var ddSectionEl = ddFrame.bodyEl.children[0];
      var ddBar = ddSectionEl.children[0];
      var ddBody = ddSectionEl.children[2];
      check('the Copy bar heads the Deep-Dive body and no fold survives in it',
        String(ddBar.className).indexOf('results-deep-dive-bar') >= 0 &&
        String(ddBar.className).indexOf('results-menu-bar') >= 0 &&
        byTag(ddFrame.bodyEl, 'details').length === 0 &&
        byTag(ddFrame.bodyEl, 'summary').length === 0);
      check('the guidance line sits above a prompt field that is open on restore',
        ddBody.children[0].textContent === App.I18n.t('results.deepDiveSub') &&
        ddBody.children[1].tagName === 'PRE' &&
        ddBody.children[1].textContent === PROMPT_MARK,
        textOf(ddBody).join(' ').slice(0, 60));
      var ddCommands = buttonsUnder(ddBar);
      check('the bar owns one flat Copy Prompt command',
        ddCommands.length === 1 &&
        buttonsUnder(ddFrame.bodyEl).length === 1 &&
        ddCommands[0].textContent === App.I18n.t('results.copy'),
        ddCommands.map(function(b) { return b.textContent; }).join('|'));
      App.SessionStore = { clear: function() {}, load: function() { return { ok: true, answers: [] }; } };
      ddCommands[0].click();
      await Promise.resolve(); await Promise.resolve();
      check('one activation copies the prompt and answers with its copied state',
        copyWrites.length === 1 && copyWrites[0] === PROMPT_MARK &&
        ddCommands[0].textContent === App.I18n.t('results.copied'),
        ddCommands[0].textContent);

      // Keyboard traversal inside the bar, and a pointer click that runs a
      // command: Review reaches the Review stage, Back returns.
      commands[0].focus();
      allBars[0].handlers.keydown({
        key: 'ArrowRight', target: commands[0], preventDefault: function() {}
      });
      check('an arrow key hands the focus along the bar',
        commands[1].focused === true);
      commands[2].click();
      check('Review answers reaches the Review stage of the Quiz program',
        views['review-view'].hidden === false && views['results-view'].hidden === true);
      views['review-view'].querySelector('.results-review-back-btn').click();
      check('Back returns to the results stage',
        views['results-view'].hidden === false && views['review-view'].hidden === true);
      commands[1].click();
      check('Share hands the Web Share dialog this Completion\'s score',
        shareCalls.length === 1 &&
        String(shareCalls[0].text).indexOf(scored.report.percentage + '%') >= 0,
        JSON.stringify(shareCalls));

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
      var zhCommands = ['results.downloadPng', 'results.share',
        'results.reviewBtn', 'results.retake'].map(function(id) {
          return App.I18n.t(id);
        });
      check('the language switch re-renders in place', App.rerenderResults() === true);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      App.I18n.use('en');
      var reBar = byRole([body], 'menubar');
      check('the re-render rebuilds one menu bar, its commands in the new language',
        reBar.length === 1 &&
        byRole([reBar[0]], 'menuitem').map(function(c) { return c.textContent; })
          .join('|') === zhCommands.join('|') &&
        buttonsUnder(views['results-view']).length === 4 &&
        byRole([ddFrame.bodyEl], 'menuitem').length === 0 &&
        buttonsUnder(ddFrame.bodyEl).length === 1,
        'bars=' + reBar.length + ' ddButtons=' + buttonsUnder(ddFrame.bodyEl).length);
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

      // ── #64: one request per language, answered from cache ever after ──
      // The switch above (en → zh) regenerated — that is the ONLY trigger.
      // Back to English the plan for this Completion is already settled,
      // so the re-render must come from cache: no third request, content
      // painted in the same frame, windows unmoved.
      check('the Completion cost one request and the language switch exactly one more (#64)',
        planAssembles === 2, 'calls=' + planAssembles);
      var planWinBeforeCache = ctl.geometry('action-plan');
      var callsBeforeCache = planAssembles;
      App.rerenderResults();   // the dictionary is back to en
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      check('switching back to a language with a settled plan re-renders from cache: no new request (#64)',
        planAssembles === callsBeforeCache &&
        textOf(planFrame.bodyEl).join(' ').indexOf(PLAN_HEAD) >= 0 &&
        ctl.geometry('action-plan').x === planWinBeforeCache.x &&
        ctl.getState('action-plan').mode === 'normal',
        'calls=' + planAssembles);

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

      // ── Retake, last of the four commands (ticket #65) ────────────────
      var retakeClears = 0;
      App.SessionStore = {
        clear: function() { retakeClears++; },
        load: function() { return { ok: true, answers: [] }; }
      };
      var finalCommands = byRole([views['results-view']], 'menuitem');
      finalCommands[finalCommands.length - 1].click();
      // Ticket #66: Retake is a destructive path — it asks first. The
      // confirmation is a system dialog on the page, and only its Yes
      // releases the tail; the click alone must have destroyed nothing.
      var retakeAsk = byRole([body], 'dialog')[0];
      var retakeYes = retakeAsk ? buttonsUnder(retakeAsk).filter(function(b) {
        return b.textContent === App.I18n.t('windows.yes');
      })[0] : null;
      check('Retake asks for confirmation before it ends the run',
        !!retakeYes && retakeClears === 0 &&
        views['landing-view'].hidden === true,
        'clears=' + retakeClears + ' ask=' + !!retakeAsk);
      retakeYes.click();
      check('Retake still clears the Session and hands the page back to the opening view',
        retakeClears === 1 &&
        views['landing-view'].hidden === false &&
        views['results-view'].hidden === true,
        'clears=' + retakeClears);
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
      // The share/clipboard affordances were added to the host's own
      // navigator object, so restoring the reference is not enough — take
      // the properties back and a sibling suite sees the platform it expects.
      try {
        delete globalThis.navigator.share;
        delete globalThis.navigator.clipboard;
      } catch (e) { /* read-only host object */ }
      if (prev.navigator === undefined) { try { delete globalThis.navigator; } catch (e) {} }
      else globalThis.navigator = prev.navigator;
      if (prev.locale) App.I18n.use(prev.locale);
    }
    return results;
  })();
};
