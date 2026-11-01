exports.name = 'Results (retro data-viz contract, ticket #45)';

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
    createDocumentFragment: function() { return fakeEl('#fragment'); }
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

  // shell.js first — the page order — because the Title Card draws from
  // App.Shell.TITLE_BAR_GLYPHS (#49), the one glyph table both windows use.
  require('../../js/shell.js');
  var Shell = globalThis.App.Shell;

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
  var minZh = I18n.t('results.titleBtnMin');
  I18n.use('en');
  check('results.* retro ids resolve in en and zh',
    overallEn === 'Overall' && overallZh === '总分' && minZh === '最小化',
    overallEn + '/' + overallZh + '/' + minZh);
  check('title-button ids resolve in en', I18n.t('results.titleBtnMax') === 'Maximize');

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

  // ══ Title Card window idiom ═════════════════════════════════════════════

  var frag = internals.buildTitleCard(report);
  var win = frag.children[0];
  check('title card renders as a window frame',
    classOf(win) === 'results-title-window', classOf(win));
  var bar = win.children[0];
  var client = win.children[1];
  check('title bar reuses the shell .os-titlebar idiom',
    classOf(bar).indexOf('os-titlebar') >= 0, classOf(bar));
  var titleText = bar.children[0];
  check('title bar carries the Progression Title emoji + name',
    classOf(titleText).indexOf('os-titlebar-title') >= 0 &&
    titleText.textContent === 'X Sentinel',
    titleText.textContent);
  var buttons = bar.children[1];
  var btnEls = buttons.children;
  check('drawn DISABLED [—][□][×] marks with data-os-button hooks (shell parity)',
    btnEls.length === 3 &&
    btnEls.every(function(b) { return b.disabled === true; }) &&
    btnEls[0].attrs['data-os-button'] === 'minimize' &&
    btnEls[1].attrs['data-os-button'] === 'maximize' &&
    btnEls[2].attrs['data-os-button'] === 'close' &&
    btnEls.every(function(b) { return classOf(b).indexOf('os-titlebar-btn') >= 0; }));
  check('title-bar buttons carry localized aria-labels',
    btnEls[0].attrs['aria-label'] === 'Minimize' && btnEls[2].attrs['aria-label'] === 'Close',
    btnEls[0].attrs['aria-label'] + '/' + btnEls[2].attrs['aria-label']);
  // #49: the card draws the shell's glyph table verbatim — 6×2 bar, 9×9
  // outlined square, 8×7 cross, currentColor-painted — so the program
  // window and this card can never render differently.
  check('title-card buttons draw the shell glyph table verbatim (both windows identical)',
    btnEls.every(function(b) {
      var action = b.attrs['data-os-button'];
      return typeof b.innerHTML === 'string' &&
        b.innerHTML === Shell.TITLE_BAR_GLYPHS[action] &&
        b.innerHTML.indexOf('<svg') === 0 &&
        b.innerHTML.indexOf('class="tb-glyph"') >= 0 &&
        b.innerHTML.indexOf('fill="currentColor"') >= 0;
    }));
  check('client field keeps the .results-title-card class (skin paints it)',
    classOf(client).indexOf('results-title-card') >= 0, classOf(client));
  check('client shows the Overall caption + percentage with the band class',
    client.children[0].textContent === 'Overall' &&
    client.children[1].textContent === '62%' &&
    classOf(client.children[1]).indexOf(internals.scoreClass(report.percentage)) >= 0,
    client.children[0].textContent + '/' + client.children[1].textContent +
    '/' + classOf(client.children[1]));

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
  check('title window + nested panels carry Win95 bevels (no radii)',
    /\.results-title-window \{[^}]*box-shadow: var\(--bevel-raised\)/.test(css) &&
    /\.results-action-item \{[^}]*box-shadow: var\(--bevel-raised\)/.test(css));

  // ══ PNG export pipeline: params unchanged for the data ══════════════════

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

  var dlBtn = internals.buildDownloadPng(svg);
  dlBtn.click();
  fakeDoc.createElement = origCreate;

  check('export snapshots the same SVG element (same palette path)',
    captured.passedSvg === svg);
  check('export canvas is 800×800 filled #ffffff then draws the SVG at 800×800',
    fakeCanvas.width === 800 && fakeCanvas.height === 800 &&
    canvasCtx.fillStyle === '#ffffff' &&
    captured.calls[0] && captured.calls[0].join(',') === 'fillRect,0,0,800,800' &&
    captured.calls[1] && captured.calls[1][0] === 'drawImage' &&
    typeof captured.calls[1][1] === 'object' &&
    captured.calls[1].slice(2).join(',') === '0,0,800,800',
    JSON.stringify(captured.calls));
  check('export downloads ast-risk-radar.png as a non-zero image/png blob',
    captured.a && captured.a.download === 'ast-risk-radar.png' &&
    captured.pngBlob && captured.pngBlob.type === 'image/png' &&
    captured.pngBlob.size > 0 &&
    captured.blob && captured.blob.type.indexOf('image/svg+xml') === 0 &&
    captured.blob.parts[0] === '<svg data-retro-radar/>');

  // ── restore globals for the sibling test modules ────────────────────────
  delete globalThis.XMLSerializer;
  delete globalThis.Blob;
  delete globalThis.URL;
  delete globalThis.Image;
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;

  return results;
};
