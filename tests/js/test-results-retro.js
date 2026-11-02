exports.name = 'Results (retro data-viz contract, tickets #45, #56)';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── fakeEl DOM stub (pattern from test-shell.js / test-lang-routing.js) ──

  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '', download: '',
      disabled: false,
      attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(c) { el.children.push(c); c.parentNode = el; return c; },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
        c.parentNode = null;
        return c;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
        // The disclosure rows are native <details>/<summary> (ticket #72):
        // the browser flips the disclosure on a pointer press and on
        // Enter/Space over the focused summary, and the app adds no handler
        // of its own. The fake answers with the same native contract.
        if (el.tagName === 'SUMMARY' && el.parentNode &&
            el.parentNode.tagName === 'DETAILS') {
          el.parentNode.open = !el.parentNode.open;
        }
      },
      focus: function() { el.focused = true; }
    };
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    // The presenters clear a subtree by assigning `innerHTML = ''` before
    // re-mounting (renderResults, renderPlanContent): the fake node has to
    // answer with the same detach, or a re-render check would see the old
    // children still hanging under it.
    Object.defineProperty(el, 'innerHTML', {
      get: function() { return el._innerHTML || ''; },
      set: function(value) {
        el._innerHTML = value;
        if (value === '') {
          for (var c = 0; c < el.children.length; c++) el.children[c].parentNode = null;
          el.children = [];
          el.textContent = '';
        }
      },
      enumerable: true,
      configurable: true
    });
    return el;
  }

  var fakeDoc = {
    // No defaultView on purpose: buildRadar's headingFont() must fall back to
    // the W95FA stack constant when there is no computed style (headless).
    createElement: function(tag) { return fakeEl(tag); },
    createElementNS: function(ns, tag) { return fakeEl(tag); },
    createTextNode: function(text) { return { nodeType: 3, textContent: String(text) }; },
    createDocumentFragment: function() { return fakeEl('#fragment'); },
    // The menu commands reach the Review screen through the live page; the
    // headless page has no views, so the lookup finds nothing and the
    // presenters fall through to the view switch the test observes.
    getElementById: function() { return null; }
  };

  var prevDoc = globalThis.document;
  globalThis.document = fakeDoc;

  // ── Dictionaries + module load ─────────────────────────────────────────
  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  var I18n = globalThis.App.I18n;
  I18n.use('en');

  require('../../js/ast.js');
  var AST = globalThis.App.AST;

  var Results = require('../../js/results.js');
  check('module loads headless and exposes the internals seam',
    Results && Results.resultsInternals &&
    typeof Results.resultsInternals.buildRadar === 'function');

  var internals = Results.resultsInternals;

  // Retro-skin ids resolve in BOTH locales (ADR 0015).
  I18n.use('en');
  var overallEn = I18n.t('results.overall');
  I18n.use('zh');
  var overallZh = I18n.t('results.overall');
  I18n.use('en');
  check('results.* retro ids resolve in en and zh',
    overallEn === 'Overall' && overallZh === '总分',
    overallEn + '/' + overallZh);
  // Ticket #60: the fake Title Card's [—][□][×] aria-labels left with the
  // fake chrome; asking for one must throw in BOTH dictionaries.
  var btnGone = 0;
  ['en', 'zh'].forEach(function(locale) {
    I18n.use(locale);
    try { I18n.t('results.titleBtnMin'); } catch (e) { btnGone++; }
  });
  I18n.use('en');
  check('the retired Title Card button ids are gone from both dictionaries',
    btnGone === 2, String(btnGone));

  // ── Synthetic report (structure only — scoring fixtures live elsewhere) ─
  var pcts = [33, 50, 62, 70, 74, 81, 88, 92, 96, 100];
  var astScores = {};
  var astRanked = [];
  for (var i = 0; i < AST.ids.length; i++) {
    var id = AST.ids[i];
    astScores[id] = { percentage: pcts[i] };
    astRanked.push({ id: id, percentage: pcts[i], earned: pcts[i], possible: 100 });
  }
  var report = {
    percentage: 62,
    title: { emoji: 'X', name: 'Sentinel' },
    astScores: astScores,
    astRanked: astRanked,
    weakestQuestions: []
  };

  // ── helper: collect elements by tag over the fake tree ──────────────────
  function walk(node, tag, out) {
    out = out || [];
    if (!node || !node.children) return out;
    for (var c = 0; c < node.children.length; c++) {
      var child = node.children[c];
      if (child.tagName && child.tagName === tag.toUpperCase()) out.push(child);
      walk(child, tag, out);
    }
    return out;
  }
  function allText(node, out) {
    out = out || [];
    if (node == null) return out;
    if (typeof node === 'object' && node.nodeType === 3) { out.push(node.textContent); }
    if (typeof node.textContent === 'string' && node.nodeType !== 3) out.push(node.textContent);
    if (node.children) {
      for (var c = 0; c < node.children.length; c++) allText(node.children[c], out);
    }
    return out;
  }
  function classOf(node) { return String(node.className || ''); }

  // ══ Risk Radar SVG contract ═════════════════════════════════════════════

  var svg = internals.buildRadar(report);
  // buildRadar sets the class via setAttribute, so the fake tree stores it
  // under attrs.class rather than the className property.
  var svgClass = classOf(svg) || String(svg.attrs['class'] || '');
  check('radar viewBox is 0 0 400 400 with the results class',
    svg.attrs.viewBox === '0 0 400 400' && svgClass.indexOf('results-radar-svg') >= 0,
    svg.attrs.viewBox + '/' + svgClass);

  var polys = walk(svg, 'polygon');
  check('radar data polygon exists (exactly one)', polys.length === 1, 'count=' + polys.length);
  var poly = polys[0];
  check('polygon stroked pure black with square joins',
    poly.attrs.stroke === '#000000' && poly.attrs['stroke-linejoin'] === 'miter',
    poly.attrs.stroke + '/' + poly.attrs['stroke-linejoin']);
  check('polygon fill is the 1px score-band dither (system-colour band, not severity)',
    poly.attrs.fill === 'url(#results-radar-dither)',
    poly.attrs.fill);

  var patterns = walk(svg, 'pattern');
  check('dither pattern exists with a white tile and dark band cells',
    patterns.length === 1 && patterns[0].attrs.id === 'results-radar-dither',
    patterns.length ? patterns[0].attrs.id : 'none');
  var patRects = patterns.length ? walk(patterns[0], 'rect') : [];
  var bandColor = internals.scoreColor(report.percentage); // 62 → olive
  var whiteTiles = patRects.filter(function(r) { return r.attrs.fill === '#FFFFFF'; });
  var bandCells = patRects.filter(function(r) { return r.attrs.fill === bandColor; });
  check('pattern tile is #FFFFFF and both band cells use the score-band colour',
    whiteTiles.length === 1 && bandCells.length === 2,
    'white=' + whiteTiles.length + ' band=' + bandCells.length + '/' + bandColor);

  var tspans = walk(svg, 'tspan');
  var ids = tspans.filter(function(t) { return /^AST\d\d$/.test(t.textContent); });
  var pctsT = tspans.filter(function(t) { return /^\d+%$/.test(t.textContent); });
  check('ten AST-ID labels and ten percentage labels present (ADR 0005)',
    ids.length === 10 && pctsT.length === 10,
    'ids=' + ids.length + ' pct=' + pctsT.length);
  check('labels render on the W95 chrome face from the heading token',
    ids.every(function(t) { return String(t.attrs['font-family']).indexOf('W95FA') >= 0; }) &&
    pctsT.every(function(t) { return String(t.attrs['font-family']).indexOf('W95FA') >= 0; }));
  check('AST-ID labels are black, weight 400 (pixel face carries no bold)',
    ids.every(function(t) { return t.attrs.fill === '#000000' && t.attrs['font-weight'] === '400'; }));
  check('percentage labels carry the score-band colour per axis',
    pctsT.every(function(t) {
      var v = parseInt(t.textContent, 10);
      return t.attrs.fill === internals.scoreColor(v);
    }));
  check('headingFont() resolves the W95FA stack headless (token fallback)',
    internals.headingFont().indexOf('W95FA') >= 0,
    internals.headingFont());

  var svgText = allText(svg).join(' ');
  check('radar carries no severity chips or severity words (ADR 0005 amendment)',
    svgText.indexOf('%') >= 0 &&
    !/critical|high|medium|low|严重|高危|中危|低危/i.test(svgText),
    svgText.slice(0, 60));
  var chipEls = walk(svg, 'span').concat(walk(svg, 'div'));
  check('radar SVG contains no chip elements', chipEls.length === 0,
    'spans/divs=' + chipEls.length);

  // Dots keep the per-axis score-band colours (graphics on the white field).
  var dots = walk(svg, 'circle');
  var dotFills = dots.filter(function(d) { return d.attrs.r === 3.5; });
  check('score dots keep per-axis band fills',
    dotFills.length === 20 && // 10 initial + 10 re-appended above the polygon
    dotFills.slice(10).every(function(d, idx) {
      return d.attrs.fill === internals.scoreColor(pcts[idx]);
    }),
    'dots=' + dotFills.length);

  // ══ Results header panel (ticket #60: the window's first body panel) ═══

  var header = internals.buildResultsHeader(report);
  check('the header is the sunken client field itself — no fake window frame',
    classOf(header) === 'results-title-card', classOf(header));
  check('the Progression Title (emoji + name) leads the body panel',
    classOf(header.children[0]).indexOf('results-title-name') >= 0 &&
    header.children[0].textContent === 'X Sentinel',
    classOf(header.children[0]) + '/' + header.children[0].textContent);
  check('the Overall caption + percentage follow with the band class',
    header.children[1].textContent === 'Overall' &&
    header.children[2].textContent === '62%' &&
    classOf(header.children[2]).indexOf(internals.scoreClass(report.percentage)) >= 0,
    header.children[1].textContent + '/' + header.children[2].textContent +
    '/' + classOf(header.children[2]));
  // The fake chrome is gone: no title-bar row, no reuse of the shell's
  // .os-titlebar* classes, no second set of [—][□][×] anywhere. These
  // assertions REPLACE the ones that pinned the three disabled glyphs —
  // the real frame (js/shell.js + js/windows.js) owns the only title bar.
  var barNodes = walk(header, 'div').concat(walk(header, 'button')).filter(function(n) {
    return classOf(n).indexOf('os-titlebar') >= 0 ||
      String(n.attrs['data-os-button'] || '').length > 0;
  });
  check('the header renders no title bar and no title-bar buttons',
    barNodes.length === 0 && header.children.length === 3,
    'chrome nodes=' + barNodes.length);

  // ══ Blind-Spot Bars: weakest-first, full localized names ════════════════

  var bars = internals.buildBars(report);
  var rows = bars.children;
  // label row structure: .results-bar-label div → text node with the name
  var firstLabel = rows[0].children[0].children[0].textContent;
  check('ten bar rows, weakest first (ranking from the report)',
    rows.length === 10 &&
    firstLabel === I18n.astName(astRanked[0].id),
    rows.length + ' rows, first=' + firstLabel);
  var fill0 = rows[0].children[1].children[0];
  check('bar fill keeps the width-driven behaviour and band class',
    fill0.attrs.style === 'width:33%' &&
    classOf(fill0).indexOf(internals.scoreClass(33)) >= 0,
    fill0.attrs.style + '/' + classOf(fill0));

  // ══ Review: no scores/percentages, tree structure intact ════════════════

  var bank = {
    phases: [{ id: 'p1', title: 'Phase One' }],
    questions: [{
      id: 'q1', phase: 'p1',
      scenario: 'Scenario text', question: 'Question text?',
      options: [
        { text: 'Option A', feedback: 'Why A.' },
        { text: 'Option B', feedback: 'Why B.' }
      ],
      best_practice: 'Do the safe thing.',
      ast_source_url: 'https://owasp.github.io/x'
    }]
  };
  var review = internals.buildReview(bank, [1]);
  var reviewText = allText(review).join(' ');
  check('review renders one disclosure item per question',
    review.children.length === 1 &&
    classOf(review.children[0]).indexOf('results-review-item') >= 0);
  check('review carries no score numerals or percentages (ADR 0005)',
    reviewText.indexOf('%') < 0 && !/\b\d{1,3} (points|pts)\b/i.test(reviewText));
  var sel = walk(review, 'summary')[0];
  check('review summary is a details-disclosure row with the Q chip',
    classOf(sel).indexOf('results-review-summary') >= 0 &&
    sel.children[0].textContent === I18n.t('quiz.questionChip', { number: 1 }),
    sel.children[0].textContent);
  check('selected option is marked in the child rows',
    walk(review, 'div').some(function(d) {
      return classOf(d).indexOf('results-review-option-selected') >= 0;
    }));

  // ══ Issue #56: prose re-anchors to the active Bank Variant ═════════════

  var enBank56 = {
    meta: { scoring: { titles: [
      { threshold: 90, name: 'Sentinel',  emoji: 'S' },
      { threshold: 50, name: 'Practitioner', emoji: 'P' },
      { threshold: 0,  name: 'Newcomer',  emoji: 'N' }
    ] } },
    questions: [{
      id: 'q1',
      scenario: 'EN scenario', question: 'EN question?',
      best_practice: 'EN best practice.', ast_source_url: 'https://owasp.github.io/en',
      options: [
        { text: 'EN option A', feedback: 'EN feedback A.' },
        { text: 'EN option B', feedback: 'EN feedback B.' }
      ]
    }]
  };
  var zhBank56 = {
    meta: { scoring: { titles: [
      { threshold: 90, name: '守望者',   emoji: 'S' },
      { threshold: 50, name: '实干者',   emoji: 'P' },
      { threshold: 0,  name: '新手',     emoji: 'N' }
    ] } },
    questions: [{
      id: 'q1',
      scenario: '中文情景', question: '中文问题？',
      best_practice: '中文最佳实践。', ast_source_url: 'https://owasp.github.io/zh',
      options: [
        { text: '中文选项 A', feedback: '中文反馈 A。' },
        { text: '中文选项 B', feedback: '中文反馈 B。' }
      ]
    }]
  };
  var report56 = {
    percentage: 62,
    title: { name: 'Practitioner', emoji: 'P', threshold: 50 },
    astScores: { AST01: { earned: 1, possible: 10, percentage: 10 } },
    astRanked: [],
    blindSpotIds: ['AST01'],
    weakestQuestions: [
      {
        id: 'q1', scenario: 'EN scenario', question: 'EN question?',
        selectedOption: enBank56.questions[0].options[1],
        bestPractice: 'EN best practice.',
        astSourceUrl: 'https://owasp.github.io/en',
        astRisks: ['AST01']
      },
      {
        id: 'q99', scenario: 'EN orphan scenario', question: 'EN orphan?',
        selectedOption: { text: 'EN orphan option' },
        bestPractice: 'EN orphan practice.',
        astSourceUrl: 'https://owasp.github.io/orphan',
        astRisks: ['AST01']
      }
    ],
    totalEarned: 5,
    totalPossible: 108
  };

  var shownZh56 = internals.localizedReport(report56, zhBank56, enBank56);
  check('the Progression Title re-anchors at the same Title Ladder threshold',
    shownZh56.title.name === '实干者' &&
    shownZh56.title.emoji === 'P' &&
    shownZh56.title.threshold === 50,
    JSON.stringify(shownZh56.title));
  check('Weakest Question prose re-anchors by Question id',
    shownZh56.weakestQuestions[0].scenario === '中文情景' &&
    shownZh56.weakestQuestions[0].question === '中文问题？' &&
    shownZh56.weakestQuestions[0].bestPractice === '中文最佳实践。' &&
    shownZh56.weakestQuestions[0].astSourceUrl === 'https://owasp.github.io/zh',
    shownZh56.weakestQuestions[0].scenario);
  check('the chosen Option re-anchors by structural index, not by text',
    shownZh56.weakestQuestions[0].selectedOption === zhBank56.questions[0].options[1] &&
    shownZh56.weakestQuestions[0].selectedOptionIndex === 1,
    shownZh56.weakestQuestions[0].selectedOption.text);
  check('a Question missing from the Variant keeps its report text',
    shownZh56.weakestQuestions[1].scenario === 'EN orphan scenario',
    shownZh56.weakestQuestions[1].scenario);
  check('every number is the cached report\'s own, never recomputed',
    shownZh56.percentage === report56.percentage &&
    shownZh56.astScores === report56.astScores &&
    shownZh56.blindSpotIds === report56.blindSpotIds &&
    shownZh56.totalPossible === report56.totalPossible,
    String(shownZh56.percentage));
  check('the cached report itself is never mutated by a re-anchor',
    report56.title.name === 'Practitioner' &&
    report56.weakestQuestions[0].scenario === 'EN scenario' &&
    report56.weakestQuestions[0].selectedOption.text === 'EN option B',
    report56.title.name + '/' + report56.weakestQuestions[0].scenario);
  check('a Bank without scoring meta returns the report unchanged',
    internals.localizedReport(report56, { questions: [] }) === report56);
  check('re-anchoring against the scoring Bank Variant is a no-op for its own prose',
    (function() {
      var same = internals.localizedReport(report56, enBank56, enBank56);
      return same.title.name === 'Practitioner' &&
        same.weakestQuestions[0].scenario === 'EN scenario' &&
        same.weakestQuestions[0].selectedOption.text === 'EN option B';
    })());

  // ══ Quiz window menu bar (ticket #65) ═════════════════════════════════

  var prevShowView = Results.showView;
  var prevSessionStore = Results.SessionStore;
  var prevShare = navigator.share;
  var viewsShown = [];
  var sessionClears = 0;
  var shareCalls = [];
  Results.showView = function(id) { viewsShown.push(id); };
  Results.SessionStore = {
    clear: function() { sessionClears++; },
    load: function() { return { ok: true, answers: [] }; }
  };
  navigator.share = function(payload) { shareCalls.push(payload); return Promise.resolve(); };

  var bar = internals.buildMenuBar(report);
  var menuBtns = walk(bar, 'button');
  check('the Quiz menu bar owns the four commands, in order',
    bar.attrs.role === 'menubar' && menuBtns.length === 4 &&
      menuBtns.map(function(b) { return b.textContent; }).join('|') ===
        I18n.t('results.downloadPng') + '|' + I18n.t('results.share') + '|' +
        I18n.t('results.reviewBtn') + '|' + I18n.t('results.retake'),
    menuBtns.map(function(b) { return b.textContent; }).join('|'));
  check('the bar names itself, and the name resolves in both dictionaries',
    bar.attrs['aria-label'] === I18n.t('results.menuBar') &&
      I18n.t('results.menuBar') === 'Quiz window menu',
    bar.attrs['aria-label']);
  I18n.use('zh');
  check('the menu bar name resolves in zh too',
    I18n.t('results.menuBar') === '测验窗口菜单' &&
      internals.buildMenuBar(report).attrs['aria-label'] === '测验窗口菜单',
    I18n.t('results.menuBar'));
  I18n.use('en');
  check('the bar never re-renders the commands: they are its own children',
    bar.children.length === 4 &&
      bar.children.every(function(child) { return child.tagName === 'BUTTON'; }));
  check('every command is a menuitem and the bar keeps one tab stop',
    menuBtns.every(function(b) {
      return b.attrs.role === 'menuitem' && b.attrs.type === 'button';
    }) && menuBtns[0].attrs.tabindex === '0' &&
      menuBtns.slice(1).every(function(b) { return b.attrs.tabindex === '-1'; }));

  var prevented = 0;
  function press(key, target) {
    bar.handlers.keydown({
      key: key, target: target, preventDefault: function() { prevented++; }
    });
  }
  press('ArrowRight', menuBtns[0]);
  check('ArrowRight hands the focus to the next command',
    menuBtns[1].focused === true &&
      menuBtns[1].attrs.tabindex === '0' &&
      menuBtns[0].attrs.tabindex === '-1' && prevented === 1,
    'prevented=' + prevented);
  press('ArrowRight', menuBtns[3]);
  check('the command focus wraps past the last command',
    menuBtns[0].focused === true && menuBtns[3].attrs.tabindex === '-1');
  press('ArrowLeft', menuBtns[0]);
  check('ArrowLeft wraps back from the first command',
    menuBtns[3].attrs.tabindex === '0');
  press('Home', menuBtns[3]);
  check('Home lands on the first command', menuBtns[0].attrs.tabindex === '0');
  press('End', menuBtns[0]);
  check('End lands on the last command', menuBtns[3].attrs.tabindex === '0');
  press('ArrowUp', menuBtns[3]);
  check('a key the bar does not own is left to the page', prevented === 5,
    'prevented=' + prevented);

  menuBtns[2].click();
  check('Review answers reaches the Review stage of the Quiz program',
    viewsShown[viewsShown.length - 1] === 'review-view', viewsShown.join(','));
  menuBtns[3].click();
  check('Retake keeps its behaviour: Session cleared, landing in view',
    sessionClears === 1 && viewsShown[viewsShown.length - 1] === 'landing-view',
    viewsShown.join(','));

  // ── Retake is a CONFIRMED destructive path (ticket #66) ───────────────
  // The page above carries no dialog surface (this suite's fake document
  // has no body), so the command ended the run directly — the pre-#66
  // semantic a surface-less page keeps. On a page WITH the surface the
  // same menu-bar command asks first, and nothing goes until Yes.
  (function() {
    var prev = {
      document: globalThis.document,
      windows: globalThis.App.Windows,
      sessionStore: globalThis.App.SessionStore,
      desktopStore: globalThis.App.DesktopStore,
      showView: globalThis.App.showView
    };
    var Windows66 = require('../../js/windows.js');
    var askDoc = {
      body: fakeEl('body'),
      activeElement: null,
      createElement: function(tag) { return fakeEl(tag); },
      createElementNS: function(ns, tag) { return fakeEl(tag); }
    };
    globalThis.document = askDoc;
    globalThis.App.Windows = Windows66;
    var tail = [];
    globalThis.App.SessionStore = {
      clear: function() { tail.push('session'); }
    };
    globalThis.App.DesktopStore = {
      clear: function() { tail.push('record'); }
    };
    globalThis.App.showView = function(id) { tail.push('view:' + id); };
    Windows66.controller = {
      resetPrograms: function() { tail.push('desktop'); return true; }
    };

    function texts(node, out) {
      out = out || [];
      if (node == null) return out;
      if (typeof node.textContent === 'string' && node.textContent !== '') out.push(node.textContent);
      (node.children || []).forEach(function(kid) { texts(kid, out); });
      return out;
    }
    function askDialog() {
      var stack = askDoc.body.children.slice();
      while (stack.length) {
        var n = stack.shift();
        if (n && n.attrs && n.attrs.role === 'dialog' &&
          texts(n).join(' ').indexOf(I18n.t('windows.retakeMessage')) >= 0) return n;
        if (n && n.children) stack = stack.concat(n.children);
      }
      return null;
    }
    function labeled(root, label) {
      var stack = [root];
      while (stack.length) {
        var n = stack.shift();
        if (n && n.tagName === 'BUTTON' && n.textContent === label) return n;
        if (n && n.children) stack = stack.concat(n.children);
      }
      return null;
    }

    var askBtn = askDialog();
    check('nothing has been asked or destroyed before the command runs',
      askBtn === null && tail.length === 0, 'tail=' + tail.join(','));

    // Escape owns the dialog tier: it cancels the question, never confirms
    // it, and the run survives untouched.
    menuBtns[menuBtns.length - 1].click();
    var ask1 = askDialog();
    check('the menu-bar Retake opens the confirmation and destroys nothing yet',
      !!ask1 && Windows66.isDialogOpen() === true && tail.length === 0);
    ask1.handlers.keydown({
      key: 'Escape', preventDefault: function() {}, stopPropagation: function() {}
    });
    check('Escape cancels the Retake question — the run stays intact',
      Windows66.isDialogOpen() === false && tail.length === 0);

    // The affirmative path clears BOTH records, shows landing and takes
    // the desktop down.
    menuBtns[menuBtns.length - 1].click();
    labeled(askDialog(), I18n.t('windows.yes')).click();
    check('the confirmed Retake clears Session and Record, then shows landing and ends the desktop',
      tail.join(',') === 'session,record,view:landing-view,desktop', tail.join(','));
    check('the answer leaves no dialog on the page',
      Windows66.isDialogOpen() === false && askDialog() === null);

    // Hand the page and the shared seams back.
    delete Windows66.controller;
    if (prev.windows === undefined) delete globalThis.App.Windows;
    else globalThis.App.Windows = prev.windows;
    ['SessionStore', 'DesktopStore', 'showView'].forEach(function(key) {
      if (prev[key] === undefined) delete globalThis.App[key];
      else globalThis.App[key] = prev[key];
    });
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
  })();
  menuBtns[1].click();
  check('Share hands the Web Share dialog this Completion\'s score',
    shareCalls.length === 1 && String(shareCalls[0].text).indexOf('62') >= 0,
    JSON.stringify(shareCalls));

  // Without Web Share the command is not offered — the capability rule the
  // in-body button followed is the rule the menu follows.
  delete navigator.share;
  var noShare = walk(internals.buildMenuBar(report), 'button');
  check('Share is offered only where the platform can share',
    noShare.length === 3 &&
      noShare.map(function(b) { return b.textContent; }).join('|') !==
        I18n.t('results.downloadPng') + '|' + I18n.t('results.share'),
    noShare.map(function(b) { return b.textContent; }).join('|'));

  if (prevShowView === undefined) delete Results.showView;
  else Results.showView = prevShowView;
  if (prevSessionStore === undefined) delete Results.SessionStore;
  else Results.SessionStore = prevSessionStore;
  if (prevShare === undefined) delete navigator.share;
  else navigator.share = prevShare;

  // ══ CSS-side style contract (glyphs, field, segmentation) ═══════════════

  var fs = require('fs');
  var css = fs.readFileSync(require('path').join(__dirname, '../../css/results.css'), 'utf8');
  check('review toggle glyphs are square [+]/[-] (no chevron)',
    /content: '\[\+\] '/.test(css) && /content: '\[-\] '/.test(css) &&
    css.indexOf("'▸ '") < 0);
  check('radar sits in a sunken white field',
    /\.results-radar-wrap \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    /\.results-radar-wrap \{[^}]*background: var\(--color-surface\)/.test(css));
  check('blind-spot fills are segmented blocks with a reduced-motion gate',
    css.indexOf('repeating-linear-gradient') >= 0 &&
    /prefers-reduced-motion: reduce\) \{\s*\.results-bar-fill \{\s*transition: none/.test(css));
  // Ticket #60: the header panel is the window's sunken client field — the
  // raised frame belongs to the real shell window, not to a nested fake.
  // Ticket #72 retires the LAST nested raised frame in the Action Plan: the
  // ranked list sits in one sunken panel and its rows carry no bevel.
  check('the header panel and the ranked list are sunken fields; the rows carry no frame',
    /\.results-title-card \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    /\.results-action-list \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    /\.results-action-list \{[^}]*background: var\(--color-surface\)/.test(css) &&
    !/\.results-action-item \{[^}]*box-shadow/.test(css) &&
    !/\.results-action-item \{[^}]*background/.test(css) &&
    css.indexOf('.results-title-window') < 0);
  check('priority is a sunken badge, not a navy disc or a title-bar field',
    /\.results-action-priority \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    /\.results-action-priority \{[^}]*color: var\(--color-primary\)/.test(css) &&
    /\.results-action-priority \{[^}]*border-radius: 0/.test(css) &&
    css.indexOf('.results-action-item .results-action-priority') < 0);
  check('the Narrative Expander row leads with the square [+]/[-] glyph in black',
    /\.results-narrative-summary \{[^}]*cursor: pointer/.test(css) &&
    /\.results-narrative-summary \{[^}]*color: var\(--color-text\)/.test(css) &&
    /\.results-narrative-summary::before \{[^}]*content: '\[\+\] '/.test(css) &&
    /\.results-narrative-details\[open\] > \.results-narrative-summary::before \{[^}]*content: '\[-\] '/.test(css) &&
    /\.results-review-summary \{[^}]*color: var\(--color-text\)/.test(css) &&
    /\.results-review-qnum \{[^}]*color: var\(--color-text\)/.test(css));
  // Navy belongs to the Window Frame (css/shell.css). The Deep-Dive Prompt's
  // navy expander row — the last in-window gradient — went with the fold
  // itself (#74), so no exemption is needed any more.
  check('no navy gradient paints inside the window content',
    (function() {
      var offenders = [];
      var rule = /([^\{\}]+)\{([^\{\}]*)\}/g;
      var m;
      while ((m = rule.exec(css)) !== null) {
        if (m[2].indexOf('linear-gradient(90deg, #000080') >= 0) {
          offenders.push(m[1].replace(/\s+/g, ' ').trim());
        }
      }
      return offenders.length === 0;
    })());
  // Ticket #74: the Prompt window is unfolded. Its body is the one-line
  // guidance above a sunken field the prompt scrolls inside, the fold's
  // chrome is gone from both sheets, and the window's one command paints
  // through the shared menu-bar strip rules (its own class only scopes it).
  var skin = fs.readFileSync(require('path').join(__dirname, '../../css/theme-retro-os.css'), 'utf8');
  check('the Deep-Dive body is one sunken scrolling prompt field with no fold chrome',
    /\.results-prompt-pre \{[^}]*max-height[^}]*overflow: auto/.test(css) &&
    /\.results-prompt-pre \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    css.indexOf('.results-prompt-details') < 0 &&
    css.indexOf('.results-prompt-summary') < 0 &&
    css.indexOf('.results-deep-dive-heading') < 0 &&
    skin.indexOf('.results-prompt-details') < 0 &&
    skin.indexOf('.results-prompt-summary') < 0 &&
    skin.indexOf('.results-deep-dive-heading') < 0);
  check('the Copy Prompt command sits in the shared menu-bar strip',
    /\.results-menu-bar \{[^}]*display: flex/.test(css) &&
    /\.results-menu-bar \.results-menu-item/.test(css));
  // Ticket #65: the commands live in one strip that wraps at the window's
  // 360px floor, and the two rows that used to carry them are gone.
  check('the menu bar is a wrapping strip and the old command rows are gone',
    /\.results-menu-bar \{[^}]*display: flex[^}]*flex-wrap: wrap/.test(css) &&
      css.indexOf('.results-btn-row') < 0 &&
      css.indexOf('.results-action-btn-row') < 0);

  // ══ PNG export pipeline: the body sheet, rasterised as before ═════════

  // Snapshot the real constructors before stubbing them: deleting them
  // outright (the old cleanup) would strip Node's URL from every later
  // suite — js/lang-switch.js resolves its URL against global URL.
  var prevXMLSerializer = globalThis.XMLSerializer;
  var prevBlob = globalThis.Blob;
  var prevURL = globalThis.URL;
  var prevImage = globalThis.Image;

  var captured = { serialized: null, passedSvg: null, calls: [], blob: null, a: null };
  globalThis.XMLSerializer = function() {
    this.serializeToString = function(node) {
      captured.passedSvg = node;
      return '<svg data-retro-radar/>';
    };
  };
  globalThis.Blob = function(parts, opts) {
    captured.blob = { parts: parts, type: opts && opts.type };
    return captured.blob;
  };
  globalThis.URL = {
    createObjectURL: function(b) { return 'blob:fake-url'; },
    revokeObjectURL: function(u) { captured.revoked = u; }
  };
  globalThis.Image = function() {
    var img = this;
    Object.defineProperty(img, 'src', {
      set: function(v) { img._src = v; if (img.onload) img.onload(); }
    });
  };
  var canvasCtx = {
    fillStyle: '', fillRect: function() { captured.calls.push(['fillRect'].concat([].slice.call(arguments))); },
    drawImage: function() { captured.calls.push(['drawImage'].concat([].slice.call(arguments))); }
  };
  var fakeCanvas = fakeEl('canvas');
  fakeCanvas.width = 0; fakeCanvas.height = 0;
  fakeCanvas.getContext = function() { return canvasCtx; };
  fakeCanvas.toBlob = function(cb, type) { captured.pngBlob = { type: type, size: 7 }; cb(captured.pngBlob); };
  var origCreate = fakeDoc.createElement;
  fakeDoc.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'canvas') return fakeCanvas;
    if (String(tag).toLowerCase() === 'a') {
      var a = fakeEl('a');
      a.click = function() { captured.a = a; };
      return a;
    }
    return origCreate(tag);
  };

  // ── The composed body sheet (ticket #65): what the export renders ────
  // The window chrome is never snapshotted; the sheet is re-drawn from the
  // report, so the assertions run on that tree, not on the stubbed
  // serializer's output.
  var sheet = internals.buildExportSvg(report);
  var sheetText = allText(sheet).join(' ');
  var metrics = internals.exportMetrics(report);
  check('the export sheet is 800 wide, one row pitch per ranked AST',
    metrics.w === 800 && metrics.h === 658 + 9 * 24 + 12 + 24 &&
      sheet.attrs.width === '800' && sheet.attrs.height === String(metrics.h) &&
      sheet.attrs.viewBox === '0 0 800 ' + metrics.h,
    JSON.stringify(metrics));
  check('the sheet carries the score header, the radar and the bars',
    sheetText.indexOf('X Sentinel') >= 0 &&
      sheetText.indexOf('Overall') >= 0 &&
      sheetText.indexOf('62%') >= 0 &&
      walk(sheet, 'svg').length === 1 &&
      String(walk(sheet, 'svg')[0].attrs['class']).indexOf('results-radar-svg') >= 0 &&
      walk(sheet, 'polygon').length === 1 &&
      sheetText.indexOf(I18n.astName(astRanked[0].id)) >= 0 &&
      sheetText.indexOf(I18n.astName(astRanked[9].id)) >= 0,
    sheetText.slice(0, 80));
  check('the sheet carries no window chrome and no commands',
    ['results.downloadPng', 'results.share', 'results.reviewBtn', 'results.retake',
      'results.menuBar'].every(function(id) {
        return sheetText.indexOf(I18n.t(id)) < 0;
      }) &&
      walk(sheet, 'button').length === 0 &&
      classOf(sheet).indexOf('menu') < 0,
    sheetText.slice(0, 80));

  var exportBar = internals.buildMenuBar(report);
  var dlBtn = walk(exportBar, 'button')[0];
  dlBtn.click();
  fakeDoc.createElement = origCreate;

  check('the Download PNG command is the menu bar\'s own',
    dlBtn.textContent === I18n.t('results.downloadPng') &&
      dlBtn.attrs.role === 'menuitem');
  check('export snapshots a freshly composed body sheet, never the live radar',
    captured.passedSvg !== svg &&
      captured.passedSvg.attrs.width === '800' &&
      captured.passedSvg.attrs.height === String(metrics.h) &&
      walk(captured.passedSvg, 'polygon').length === 1);
  check('export canvas is the sheet size, filled #ffffff then drawn 1:1',
    fakeCanvas.width === metrics.w && fakeCanvas.height === metrics.h &&
    canvasCtx.fillStyle === '#ffffff' &&
    captured.calls[0] && captured.calls[0].join(',') === 'fillRect,0,0,800,' + metrics.h &&
    captured.calls[1] && captured.calls[1][0] === 'drawImage' &&
    typeof captured.calls[1][1] === 'object' &&
    captured.calls[1].slice(2).join(',') === '0,0,800,' + metrics.h,
    JSON.stringify(captured.calls));
  check('export downloads ast-risk-radar.png as a non-zero image/png blob',
    captured.a && captured.a.download === 'ast-risk-radar.png' &&
    captured.pngBlob && captured.pngBlob.type === 'image/png' &&
    captured.pngBlob.size > 0 &&
    captured.blob && captured.blob.type.indexOf('image/svg+xml') === 0 &&
    captured.blob.parts[0] === '<svg data-retro-radar/>');

  // ══ Action Plan: requested once per (report, language), cached (#64) ═══
  // The presenter is exercised through the buildActionPlan seam with the
  // module's own restore bracket (App.beginPlanRestore / finishPlanRestore)
  // and stubs for the two collaborators it talks to: App.ActionPlan (the
  // generation) and App.DesktopStore (the per-tab Record cache). Behaviour
  // is asserted — request counts, painted text, cache entries — never
  // markup. Async because a settled request paints on a microtask, like
  // the page does.
  var AppG = globalThis.App;
  var planPrev = {
    window: globalThis.window,
    actionPlan: AppG.ActionPlan,
    desktopStore: AppG.DesktopStore,
    windows: AppG.Windows,
    locale: I18n.locale
  };
  var assembles = [];   // one row per App.ActionPlan.assemble call
  var resolvers = [];   // the test's control over each request
  var saved = [];       // one row per desktop Record patch
  globalThis.window = { APP_CONFIG: { proxyUrl: 'https://proxy.test' }, Corpus: {} };
  AppG.ActionPlan = {
    assemble: function(reportArg, bankArg, corpusArg, configArg) {
      assembles.push({ report: reportArg, bank: bankArg, corpus: corpusArg, config: configArg });
      return new Promise(function(res) { resolvers.push(res); });
    }
  };
  AppG.DesktopStore = {
    savePlan: function(lang, plan) {
      if (typeof plan.narrative !== 'string' || !Array.isArray(plan.actions)) return false;
      saved.push([lang, plan]);
      return true;
    }
  };
  AppG.Windows = {};   // no controller here: arrival gestures quietly no-op

  function planText(node) { return allText(node).join(' '); }
  function planReport(pct) {
    return {
      percentage: pct, title: { emoji: 'X', name: 'Sentinel' },
      astScores: {}, astRanked: [], weakestQuestions: []
    };
  }
  // ── restore globals for the sibling test modules ──────────────────────
  function restoreGlobal(name, prev) {
    if (prev === undefined) delete globalThis[name];
    else globalThis[name] = prev;
  }

  var bankPlan = { questions: [] };
  function settlePlan() { return new Promise(function(res) { setTimeout(res, 0); }); }

  return (async function() {
    try {
      I18n.use('en');
      var loadingEn = I18n.t('results.planLoading');

      // ── a live Completion: one request, loading while in flight, then
      //    the settled payload paints and lands in the Record cache ──
      var reportA = planReport(62);
      var wrapA = internals.buildActionPlan(reportA, bankPlan, bankPlan);
      check('the live first render issues exactly one Action Plan request (#64)',
        assembles.length === 1 && resolvers.length === 1 &&
        planText(wrapA).indexOf(loadingEn) >= 0,
        'calls=' + assembles.length);
      resolvers[0]({
        narrative: 'EN LIVE PLAN',
        actions: [{ priority: '1', title: 'Lock it', description: 'Now.', ast_source: 'AST001' }],
        path: 'llm'
      });
      await settlePlan();
      check('the settled plan paints over the loading state',
        planText(wrapA).indexOf('EN LIVE PLAN') >= 0 &&
        planText(wrapA).indexOf('Lock it') >= 0 &&
        planText(wrapA).indexOf(loadingEn) < 0,
        planText(wrapA).slice(0, 80));
      check('the settled payload is cached in the desktop Record under its language (#64)',
        saved.length === 1 && saved[0][0] === 'en' &&
        saved[0][1].narrative === 'EN LIVE PLAN',
        JSON.stringify(saved.map(function(r) { return r[0]; })));

      // ── Ticket #72: the settled plan reads as ONE ranked list ──────────
      // The Actions are rows inside a single panel, and the Narrative
      // Expander is one disclosure row that arrives closed and flips on
      // its summary — the markup the stylesheet now paints as list-row
      // chrome, asserted as structure, not as colour.
      function hasClass(node, cls) {
        return String(node.className || '').split(/\s+/).indexOf(cls) >= 0;
      }
      var planPanel = wrapA.children[0];
      var planRow = planPanel.children[0];
      var planHead = planRow.children[0];
      check('the Actions paint as rows inside the one ranked panel',
        hasClass(planPanel, 'results-action-list') &&
        wrapA.children.length === 2 &&
        planPanel.children.length === 1 &&
        hasClass(planRow, 'results-action-item') &&
        hasClass(planHead, 'results-action-head') &&
        hasClass(planHead.children[0], 'results-action-priority') &&
        planHead.children[0].textContent === '1' &&
        hasClass(planHead.children[1], 'results-action-title') &&
        hasClass(planHead.children[2], 'results-ast-chip') &&
        planHead.children[2].textContent === 'AST001' &&
        planRow.children[1].tagName === 'P' &&
        hasClass(planRow.children[1], 'results-action-desc') &&
        planRow.children[1].textContent === 'Now.',
        classOf(planPanel) + '/' + classOf(planRow));
      var planExpander = wrapA.children[1];
      var planSummary = planExpander.children[0];
      check('the Narrative Expander is a disclosure row, closed by default',
        planExpander.tagName === 'DETAILS' &&
        hasClass(planExpander, 'results-narrative-details') &&
        !planExpander.open &&
        planSummary.tagName === 'SUMMARY' &&
        hasClass(planSummary, 'results-narrative-summary') &&
        allText(planSummary).join('') === I18n.t('results.narrativeSummary') &&
        planExpander.children[1].textContent === 'EN LIVE PLAN');
      planSummary.click();
      check('a press on the disclosure row opens it',
        planExpander.open === true);
      planSummary.click();
      check('another press closes it again, with the Narrative intact',
        planExpander.open === false &&
        planExpander.children[1].textContent === 'EN LIVE PLAN');

      // ── relaunch of the settled Completion: the in-page cache answers ──
      var wrapB = internals.buildActionPlan(reportA, bankPlan, bankPlan);
      check('re-rendering the settled Completion answers from cache: no request, no loading (#64)',
        assembles.length === 1 && saved.length === 1 &&
        planText(wrapB).indexOf('EN LIVE PLAN') >= 0 &&
        planText(wrapB).indexOf(loadingEn) < 0);

      // ── the restore bracket: a cached payload for the restored
      //    language re-renders without a request (recomputed report — a
      //    fresh object identity, exactly what App.Scoring hands back) ──
      AppG.beginPlanRestore({
        en: { narrative: 'CACHED EN PLAN', actions: [{ priority: '2', title: 'Cached card', description: 'From cache.', ast_source: 'AST002' }] }
      });
      var wrapC = internals.buildActionPlan(planReport(62), bankPlan, bankPlan);
      check('a restore with a cached payload for its language renders it with no request and no loading frame (#64)',
        assembles.length === 1 &&
        planText(wrapC).indexOf('CACHED EN PLAN') >= 0 &&
        planText(wrapC).indexOf('Cached card') >= 0 &&
        planText(wrapC).indexOf(loadingEn) < 0,
        planText(wrapC).slice(0, 80));
      check('the close of a covered restore fires no request (#64)',
        AppG.finishPlanRestore() === false && assembles.length === 1 && saved.length === 1);

      // ── the restore without a payload for this language: nothing is
      //    issued inside the render, the payload cached for another
      //    language is never shown, and the close fires the one request
      //    through the live path (proxy config reaches assemble — the
      //    #63 forced Deterministic Fallback is gone) ──
      AppG.beginPlanRestore({ zh: { narrative: 'ZH ONLY PLAN', actions: [] } });
      var reportM = planReport(62);
      var wrapD = internals.buildActionPlan(reportM, bankPlan, bankPlan);
      check('a payload cached for another language is never rendered (#64)',
        planText(wrapD).indexOf('ZH ONLY PLAN') < 0);
      check('the cache-missed restore render fires NO request and shows no loading frame yet (#64)',
        assembles.length === 1 && planText(wrapD).indexOf(loadingEn) < 0 &&
        resolvers.length === 1);
      check('the restore close issues exactly one queued request through the live path (#64)',
        AppG.finishPlanRestore() === true && assembles.length === 2 &&
        assembles[1].config === globalThis.window.APP_CONFIG &&
        assembles[1].report === reportM);
      check('the re-request shows the loading state until it settles',
        planText(wrapD).indexOf(loadingEn) >= 0);
      resolvers[1]({ narrative: 'EN RESTORED PLAN', actions: [], path: 'fallback' });
      await settlePlan();
      check('the restored desktop settles once and re-caches the payload (#64)',
        planText(wrapD).indexOf('EN RESTORED PLAN') >= 0 &&
        planText(wrapD).indexOf(loadingEn) < 0 &&
        saved.length === 2 && saved[1][0] === 'en' &&
        saved[1][1].narrative === 'EN RESTORED PLAN',
        JSON.stringify(saved.map(function(r) { return r[0] + ':' + r[1].narrative; })));

      // ── the language switch: the only regeneration trigger; the late
      //    resolution caches under the language that ISSUED the request ──
      I18n.use('zh');
      var loadingZh = I18n.t('results.planLoading');
      var reportZ = planReport(62);
      var wrapZ = internals.buildActionPlan(reportZ, bankPlan, bankPlan);
      check('a language switch outside a restore requests exactly once for the new language (#64)',
        assembles.length === 3 && planText(wrapZ).indexOf(loadingZh) >= 0,
        'calls=' + assembles.length);
      I18n.use('en');   // switch away while the zh request is still in flight
      resolvers[2]({ narrative: 'ZH LATE PLAN', actions: [], path: 'llm' });
      await settlePlan();
      check('a late resolution caches under the language that issued the request (#64)',
        saved.length === 3 && saved[2][0] === 'zh' &&
        saved[2][1].narrative === 'ZH LATE PLAN',
        JSON.stringify(saved.map(function(r) { return r[0]; })));
      I18n.use('zh');
      var wrapZ2 = internals.buildActionPlan(reportZ, bankPlan, bankPlan);
      check('switching back to a language whose plan settled re-renders from cache, not a new request (#64)',
        assembles.length === 3 &&
        planText(wrapZ2).indexOf('ZH LATE PLAN') >= 0 &&
        planText(wrapZ2).indexOf(loadingZh) < 0);
      I18n.use('en');

      // ── a superseded Completion caches nothing: the live report is
      //    replaced before the old request's late resolution lands ──
      var reportOld = planReport(40);
      internals.buildActionPlan(reportOld, bankPlan, bankPlan);   // assembles #4
      var reportNew = planReport(40);
      internals.buildActionPlan(reportNew, bankPlan, bankPlan);   // assembles #5
      check('a new Completion takes one fresh request per language (#64)',
        assembles.length === 5);
      var savedBeforeStale = saved.length;
      resolvers[3]({ narrative: 'DEAD COMPLETION', actions: [], path: 'llm' });
      await settlePlan();
      check('the superseded report\'s late resolution never enters the cache (#64)',
        saved.length === savedBeforeStale &&
        saved.every(function(r) { return r[1].narrative !== 'DEAD COMPLETION'; }),
        JSON.stringify(saved.map(function(r) { return r[1].narrative; })));
      resolvers[4]({ narrative: 'LIVE COMPLETION', actions: [], path: 'llm' });
      await settlePlan();
      check('the live Completion\'s resolution does (#64)',
        saved.length === savedBeforeStale + 1 &&
        saved[saved.length - 1][1].narrative === 'LIVE COMPLETION',
        JSON.stringify(saved.map(function(r) { return r[1].narrative; })));

      // ── #64/#66 handshake: discarding the desktop Record (Quit, Retake,
      //    quiet invalidation — desktop-store's clear() calls the
      //    presenter's actionPlanRecordGone) evicts the live render: a
      //    resolution that lands late caches nothing, paints nothing, and
      //    above all never ARRIVES an Action Plan window over the
      //    teardown's resetPrograms(). ──
      var arrivals = 0;
      AppG.Windows = {
        controller: { actionPlanArrived: function() { arrivals++; return true; } }
      };
      var reportT = planReport(61);
      var wrapT = internals.buildActionPlan(reportT, bankPlan, bankPlan);
      var savedAtTeardown = saved.length;
      AppG.actionPlanRecordGone();
      resolvers[resolvers.length - 1]({ narrative: 'AFTER TEARDOWN', actions: [], path: 'llm' });
      await settlePlan();
      check('the resolution landing after the Record teardown caches nothing (#64/#66)',
        saved.length === savedAtTeardown &&
        saved.every(function(r) { return r[1].narrative !== 'AFTER TEARDOWN'; }),
        JSON.stringify(saved.map(function(r) { return r[1].narrative; })));
      check('…paints nothing and arrives no window over the teardown (#64/#66)',
        arrivals === 0 && planText(wrapT).indexOf('AFTER TEARDOWN') < 0,
        'arrivals=' + arrivals);
    } catch (err) {
      check('Action Plan cache block ran without throwing', false,
        err && err.stack || String(err));
    } finally {
      AppG.finishPlanRestore();   // never strand the bracket for a sibling
      function restoreAppG(name, prev) {
        if (prev === undefined) delete AppG[name];
        else AppG[name] = prev;
      }
      if (planPrev.window === undefined) delete globalThis.window;
      else globalThis.window = planPrev.window;
      restoreAppG('ActionPlan', planPrev.actionPlan);
      restoreAppG('DesktopStore', planPrev.desktopStore);
      restoreAppG('Windows', planPrev.windows);
      if (planPrev.locale) I18n.use(planPrev.locale);
    }

    // ── restore globals for the sibling test modules ────────────────────
    restoreGlobal('XMLSerializer', prevXMLSerializer);
    restoreGlobal('Blob', prevBlob);
    restoreGlobal('URL', prevURL);
    restoreGlobal('Image', prevImage);
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;

    return results;
  })();
};
