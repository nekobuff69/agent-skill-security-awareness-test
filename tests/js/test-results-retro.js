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
      },
      focus: function() { el.focused = true; }
    };
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
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
      ast_source_url: 'https://owasp.org/x'
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
      best_practice: 'EN best practice.', ast_source_url: 'https://owasp.org/en',
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
      best_practice: '中文最佳实践。', ast_source_url: 'https://owasp.org/zh',
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
        astSourceUrl: 'https://owasp.org/en',
        astRisks: ['AST01']
      },
      {
        id: 'q99', scenario: 'EN orphan scenario', question: 'EN orphan?',
        selectedOption: { text: 'EN orphan option' },
        bestPractice: 'EN orphan practice.',
        astSourceUrl: 'https://owasp.org/orphan',
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
    shownZh56.weakestQuestions[0].astSourceUrl === 'https://owasp.org/zh',
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
  check('header panel + nested panels carry Win95 bevels (no radii)',
    /\.results-title-card \{[^}]*box-shadow: var\(--bevel-sunken\)/.test(css) &&
    /\.results-action-item \{[^}]*box-shadow: var\(--bevel-raised\)/.test(css) &&
    css.indexOf('.results-title-window') < 0);
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

  // ── restore globals for the sibling test modules ────────────────────────
  function restoreGlobal(name, prev) {
    if (prev === undefined) delete globalThis[name];
    else globalThis[name] = prev;
  }
  restoreGlobal('XMLSerializer', prevXMLSerializer);
  restoreGlobal('Blob', prevBlob);
  restoreGlobal('URL', prevURL);
  restoreGlobal('Image', prevImage);
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;

  return results;
};
