(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── constants ── */
  // AST ids and Severity come from js/ast.js; display names are Chrome
  // Strings in the dictionary, resolved via App.I18n.astName at render time.
  var AST = (global.App && global.App.AST) || { ids: [], severity: {} };

  // Chrome String lookup, resolved at render time.
  function t(id, vars) {
    return app.I18n.t(id, vars);
  }

  /* ── helpers ── */

  function scoreColor(pct) {
    /* Classic 16-colour system set, dark variants: these values render both
       as SVG text (the per-axis percentages) and as graphic fills (the score
       dots), and the text role is the binding one — dark variants clear the
       contrast floor on the radar's white field, bright tints do not. Same
       rationale as the Score colours block in css/theme-retro-os.css. */
    if (pct < 50) return '#800000';
    if (pct < 70) return '#808000';
    return '#008000';
  }

  function scoreClass(pct) {
    if (pct < 50) return 'results-red';
    if (pct < 70) return 'results-amber';
    return 'results-green';
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'textContent' || k === 'innerHTML') {
          node[k] = attrs[k];
        } else if (k === 'className') {
          node.className = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (typeof children[i] === 'string') {
          node.appendChild(document.createTextNode(children[i]));
        } else if (children[i]) {
          node.appendChild(children[i]);
        }
      }
    }
    return node;
  }

  /* ── build phase lookup for review ── */
  function phaseLookup(bank) {
    var map = {};
    for (var i = 0; i < bank.phases.length; i++) {
      var p = bank.phases[i];
      map[p.id] = p;
    }
    return map;
  }

  /* ── Title Card ── */
  /* Title-bar button glyphs for the Title Card window. Mirrors the shell's
     idiom (js/shell.js): drawn, DISABLED, inert — aria-labels only, no live
     controls on a static results document. */
  var TITLE_BUTTON_ACTIONS = ['minimize', 'maximize', 'close'];
  var TITLE_BUTTON_LABEL_IDS = [
    'results.titleBtnMin', 'results.titleBtnMax', 'results.titleBtnClose'
  ];

  function buildTitleCard(report) {
    var title = report.title;
    var frag = document.createDocumentFragment();

    /* The percentage is the most eye-catching element on the results page, so it
       has to carry the score's meaning. It previously had no score class at all
       and inherited --color-accent from .results-title-pct — the same orange used
       for every risk indicator in the bars and the radar — so a perfect score
       and a failing one rendered identically, while green bars sat directly
       beside the headline saying the opposite. scoreClass() already exists and
       already drives the bar fills; applying it here makes the two agree.

       The colours resolve in css/theme-retro-os.css to the *-text tokens
       rather than the fill tokens, because the fill values do not meet the
       contrast floor for text on a light background.

       Ticket #45: the card is now a window in the .os-window idiom — a
       silver raised frame with a navy title bar carrying the Progression
       Title (emoji + name), and a sunken white client field carrying the
       Overall Percentage. The title bar and its disabled control buttons
       reuse the shell's classes (css/shell.css) so the two windows draw
       identically; the tier data path (title.emoji/title.name/percentage +
       scoreClass) is unchanged. */
    var win = el('div', { className: 'results-title-window' });

    var bar = el('div', { className: 'os-titlebar results-title-bar' });
    bar.appendChild(el('div', {
      className: 'os-titlebar-title results-title-caption',
      textContent: title.emoji + ' ' + title.name
    }));
    var buttons = el('div', { className: 'os-titlebar-buttons' });
    for (var b = 0; b < TITLE_BUTTON_ACTIONS.length; b++) {
      var action = TITLE_BUTTON_ACTIONS[b];
      var btn = el('button', { className: 'os-titlebar-btn' });
      btn.type = 'button';
      btn.disabled = true;
      btn.setAttribute('data-os-button', action);
      btn.setAttribute('aria-label', t(TITLE_BUTTON_LABEL_IDS[b]));
      buttons.appendChild(btn);
    }
    bar.appendChild(buttons);
    win.appendChild(bar);

    /* Client field: .results-title-card keeps its class, so the skin's
       sunken-white rule (css/theme-retro-os.css) paints the Win95 field. */
    var client = el('div', { className: 'results-title-card' }, [
      el('div', { className: 'results-overall-caption', textContent: t('results.overall') }),
      el('div', {
        className: 'results-title-pct ' + scoreClass(report.percentage),
        textContent: report.percentage + '%'
      })
    ]);
    win.appendChild(client);
    frag.appendChild(win);

    return frag;
  }

  /* ── Risk Radar (hand-rolled SVG) ── */

  /* Chrome typeface for the axis labels. The W95 skin declares the heading
     token ('W95FA' first) in css/theme-retro-os.css; SVG text cannot inherit
     CSS custom properties inside an <img>-decoded export either, so the stack
     is written as a font-family attribute. Read from the computed token at
     render time (falls back to the token's declared stack when headless,
     where there is no document.defaultView). Same palette-constant pattern
     as scoreColor(): the constant exists so the chart stays self-contained. */
  var HEADING_STACK = "'W95FA', 'Segoe UI', Tahoma, 'SimSun', sans-serif";

  function headingFont() {
    try {
      var view = document.defaultView;
      if (view && typeof view.getComputedStyle === 'function') {
        var v = view.getComputedStyle(document.documentElement)
                  .getPropertyValue('--font-heading');
        if (v && v.trim()) return v.trim();
      }
    } catch (e) { /* headless: no computed style — use the stack constant */ }
    return HEADING_STACK;
  }

  /* Score-band dither: a 2×2 userSpace pattern — two dark-tint pixels on a
     white tile (the 1px checkerboard the skin uses for graphic fills). The
     fill colour is the band of the Participant's Overall Percentage; the
     polygon outline is black vector linework, no shadows, square joins. */
  function buildRadarFillPattern(color) {
    var ns = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(ns, 'defs');
    var pattern = document.createElementNS(ns, 'pattern');
    pattern.setAttribute('id', 'results-radar-dither');
    pattern.setAttribute('width', '2');
    pattern.setAttribute('height', '2');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    var tile = document.createElementNS(ns, 'rect');
    tile.setAttribute('x', '0');
    tile.setAttribute('y', '0');
    tile.setAttribute('width', '2');
    tile.setAttribute('height', '2');
    tile.setAttribute('fill', '#FFFFFF');
    pattern.appendChild(tile);

    for (var c = 0; c < 2; c++) {
      var cell = document.createElementNS(ns, 'rect');
      cell.setAttribute('x', String(c));
      cell.setAttribute('y', String(c));
      cell.setAttribute('width', '1');
      cell.setAttribute('height', '1');
      cell.setAttribute('fill', color);
      pattern.appendChild(cell);
    }
    defs.appendChild(pattern);
    return defs;
  }

  function buildRadar(report, svgEl) {
    var cx = 200, cy = 200;
    var maxR = 140;         // outer ring
    var gridLevels = 4;     // 25%, 50%, 75%, 100%
    var step = 36;          // 360/10 degrees
    var svg = svgEl || document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.setAttribute('class', 'results-radar-svg');
    var font = headingFont();   // chrome face for AST-ID + percentage labels

    // background circle
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', cx);
    bg.setAttribute('cy', cy);
    bg.setAttribute('r', maxR);
    bg.setAttribute('fill', '#fff');
    bg.setAttribute('stroke', '#e0e0e0');
    bg.setAttribute('stroke-width', '1');
    svg.appendChild(bg);

    // grid rings
    for (var lv = 1; lv <= gridLevels; lv++) {
      var r = (maxR / gridLevels) * lv;
      var ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', cx);
      ring.setAttribute('cy', cy);
      ring.setAttribute('r', r);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#e0e0e0');
      ring.setAttribute('stroke-width', '0.75');
      svg.appendChild(ring);
    }

    // axis lines and labels
    var astScores = report.astScores;
    var astIds = AST.ids;
    var points = [];

    for (var i = 0; i < 10; i++) {
      var angle = (step * i - 90) * Math.PI / 180;
      var x = cx + maxR * Math.cos(angle);
      var y = cy + maxR * Math.sin(angle);

      // axis line
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', x);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#ccc');
      line.setAttribute('stroke-width', '0.75');
      svg.appendChild(line);

      // score point on axis
      var astId = astIds[i];
      var pct = (astScores[astId] && astScores[astId].percentage != null) ? astScores[astId].percentage : 0;
      var valR = (pct / 100) * maxR;
      var px = cx + valR * Math.cos(angle);
      var py = cy + valR * Math.sin(angle);
      points.push({ x: px, y: py });

      // score dot
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('fill', scoreColor(pct));
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '1');
      svg.appendChild(dot);

      // axis label — two lines: AST ID + percentage (no severity)
      // labelR=125 keeps all text inside 0..400 viewBox
      // At worst case (angle=18deg, cos=0.951): start-anchored right edge = 125*0.951+200+42 = 358.9 < 400
      // At left (cos=-0.951): end-anchored left edge = 125*(-0.951)+200-42 = 60.9 > 0
      // At top (sin=-0.951): y = 125*(-0.951)+200-18 = 83.1 > 10
      // At bottom (sin=0.951): y = 125*0.951+200+8 = 318.9 < 400
      var labelR = 125;
      var lx = cx + labelR * Math.cos(angle);
      var ly = cy + labelR * Math.sin(angle);
      var anchor = 'middle';
      if (Math.cos(angle) > 0.3) anchor = 'start';
      else if (Math.cos(angle) < -0.3) anchor = 'end';

      var tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', lx);
      tspan.setAttribute('y', ly - 6);
      tspan.setAttribute('text-anchor', anchor);
      tspan.setAttribute('font-size', '9');
      tspan.setAttribute('font-family', font);
      tspan.setAttribute('font-weight', '400');
      tspan.setAttribute('fill', '#000000');
      tspan.textContent = astId;

      var tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan2.setAttribute('x', lx);
      tspan2.setAttribute('y', ly + 6);
      tspan2.setAttribute('text-anchor', anchor);
      tspan2.setAttribute('font-size', '8');
      tspan2.setAttribute('font-family', font);
      tspan2.setAttribute('font-weight', '400');
      tspan2.setAttribute('fill', scoreColor(pct));
      tspan2.textContent = pct + '%';

      var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.appendChild(tspan);
      lbl.appendChild(tspan2);
      svg.appendChild(lbl);
    }

    // polygon fill: score-band dither pattern (overall percentage band)
    var polyPts = points.map(function(p) { return p.x + ',' + p.y; }).join(' ');
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', polyPts);
    poly.setAttribute('fill', 'url(#results-radar-dither)');
    poly.setAttribute('stroke', '#000000');
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(poly);
    svg.appendChild(buildRadarFillPattern(scoreColor(report.percentage)));

    // re-append dots on top of polygon
    for (var i = 0; i < points.length; i++) {
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', points[i].x);
      dot.setAttribute('cy', points[i].y);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('fill', scoreColor((astScores[astIds[i]] && astScores[astIds[i]].percentage != null) ? astScores[astIds[i]].percentage : 0));
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '1');
      svg.appendChild(dot);
    }

    return svg;
  }

  /* ── Blind-Spot Bars ── */
  function buildBars(report) {
    var wrap = el('div', { className: 'results-bars' });

    // weakest-first order comes from the report (Scoring Engine owns ranking);
    // labels are the full localized AST display names (Chrome Strings via
    // App.I18n.astName — ADR 0015), never the short IDs used on the radar.
    var astRanked = report.astRanked || [];

    for (var i = 0; i < astRanked.length; i++) {
      var astId = astRanked[i].id;
      var pct = astRanked[i].percentage || 0;
      var row = el('div', { className: 'results-bar-row' }, [
        el('div', { className: 'results-bar-label' }, [
          document.createTextNode(app.I18n.astName(astId))
        ]),
        el('div', { className: 'results-bar-track' }, [
          el('div', {
            className: 'results-bar-fill ' + scoreClass(pct),
            style: 'width:' + pct + '%'
          })
        ]),
        el('div', { className: 'results-bar-pct', textContent: pct + '%' })
      ]);
      wrap.appendChild(row);
    }

    return wrap;
  }

  /* ── Action Plan ── */
  function buildActionPlan(report, bank) {
    var wrap = el('div', { className: 'results-action-plan' });
    var proxyUrl = window.APP_CONFIG && window.APP_CONFIG.proxyUrl;
    var corpus = window.Corpus;

    // Loading indicator; on the fallback path assemble resolves in a
    // microtask so this never visibly paints.
    wrap.appendChild(el('p', { className: 'results-action-narrative results-loading', textContent: t('results.planLoading') }));

    // The Action Plan module owns the path decision and retry policy
    App.ActionPlan.assemble(report, bank, corpus, window.APP_CONFIG)
      .then(function(plan) {
        renderPlanContent(wrap, plan.narrative, plan.actions);
      });
    return wrap;
  }

  function renderPlanContent(wrap, narrative, actions) {
    wrap.innerHTML = '';

    // Action cards are the always-visible content
    if (actions && actions.length > 0) {
      var list = el('div', { className: 'results-action-list' });
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        var item = el('div', { className: 'results-action-item' }, [
          el('div', { className: 'results-action-head' }, [
            el('span', { className: 'results-action-priority', textContent: a.priority }),
            el('span', { className: 'results-action-title', textContent: a.title }),
            el('span', { className: 'results-ast-chip', textContent: a.ast_source })
          ]),
          el('p', { className: 'results-action-desc', textContent: a.description })
        ]);
        list.appendChild(item);
      }
      wrap.appendChild(list);
    }

    // Narrative prose in a collapsed expander after the action cards
    if (narrative) {
      var narrativeDetails = el('details', { className: 'results-narrative-details' });
      narrativeDetails.appendChild(el('summary', { className: 'results-narrative-summary' }, [
        document.createTextNode(t('results.narrativeSummary'))
      ]));
      var paras = narrative.split(/\n\n+/);
      for (var i = 0; i < paras.length; i++) {
        if (paras[i].trim()) {
          narrativeDetails.appendChild(el('p', { className: 'results-action-narrative', textContent: paras[i].trim() }));
        }
      }
      wrap.appendChild(narrativeDetails);
    }
  }

  /* ── Deep-Dive Prompt ── */
  function buildDeepDive(report) {
    var promptText = App.PromptBuilder.build(report);
    var wrap = el('div', { className: 'results-deep-dive' });

    // Engaging heading + supporting line
    wrap.appendChild(el('h3', { className: 'results-deep-dive-heading', textContent: t('results.deepDiveHeading') }));
    wrap.appendChild(el('p', { className: 'results-deep-dive-sub', textContent: t('results.deepDiveSub') }));

    var details = el('details', { className: 'results-prompt-details' });
    var summary = el('summary', { className: 'results-prompt-summary' }, [
      document.createTextNode(t('results.showPrompt'))
    ]);
    details.appendChild(summary);

    var pre = el('pre', { className: 'results-prompt-pre', textContent: promptText });
    details.appendChild(pre);

    var btn = el('button', { className: 'results-copy-btn', textContent: t('results.copy') });
    btn.addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).then(function() {
          window.Analytics.track('template_copied');
          btn.textContent = t('results.copied');
          setTimeout(function() { btn.textContent = t('results.copy'); }, 2000);
        }).catch(function() {
          fallbackCopy(promptText, btn);
        });
      } else {
        fallbackCopy(promptText, btn);
      }
    });
    details.appendChild(btn);

    wrap.appendChild(details);
    return wrap;
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      window.Analytics.track('template_copied');
      btn.textContent = t('results.copied');
      setTimeout(function() { btn.textContent = t('results.copy'); }, 2000);
    } catch (e) {
      btn.textContent = t('results.copyFailed');
      setTimeout(function() { btn.textContent = t('results.copy'); }, 2000);
    }
    document.body.removeChild(ta);
  }

  /* ── Review Accordion ── */
  function buildReview(bank, selections) {
    var phases = phaseLookup(bank);
    var wrap = el('div', { className: 'results-review' });

    // Build a map of questionId → selection index from the selections array
    // selections[i] corresponds to bank.questions[i]
    var selMap = {};
    if (Array.isArray(selections)) {
      for (var i = 0; i < bank.questions.length; i++) {
        if (i < selections.length) {
          selMap[bank.questions[i].id] = selections[i];
        }
      }
    }

    for (var q = 0; q < bank.questions.length; q++) {
      var question = bank.questions[q];
      var phase = phases[question.phase] || {};
      var selIdx = selMap[question.id];
      var selectedOption = (selIdx != null && question.options[selIdx]) ? question.options[selIdx] : null;

      var details = el('details', { className: 'results-review-item' });

      // summary — question text as the clickable header
      var summaryEl = el('summary', { className: 'results-review-summary' }, [
        el('span', { className: 'results-review-qnum', textContent: t('quiz.questionChip', { number: q + 1 }) }),
        document.createTextNode(' ' + question.question)
      ]);
      details.appendChild(summaryEl);

      // inner content
      var inner = el('div', { className: 'results-review-inner' });

      // phase title
      if (phase.title) {
        inner.appendChild(el('div', { className: 'results-review-phase', textContent: phase.title }));
      }

      // scenario
      inner.appendChild(el('p', { className: 'results-review-scenario', textContent: question.scenario }));

      // question
      inner.appendChild(el('p', { className: 'results-review-question', textContent: question.question }));

      // options — highlight selected
      for (var o = 0; o < question.options.length; o++) {
        var opt = question.options[o];
        var optClass = 'results-review-option';
        if (selIdx === o) optClass += ' results-review-option-selected';

        var optNode = el('div', { className: optClass }, [
          el('span', { className: 'results-review-option-marker', textContent: selIdx === o ? '▸' : '○' }),
          document.createTextNode(' ' + opt.text)
        ]);
        inner.appendChild(optNode);
      }

      // selected option feedback
      if (selectedOption && selectedOption.feedback) {
        inner.appendChild(el('div', { className: 'results-review-feedback' }, [
          el('strong', { textContent: t('review.feedbackLabel') }),
          document.createTextNode(selectedOption.feedback)
        ]));
      }

      // best practice
      if (question.best_practice) {
        inner.appendChild(el('div', { className: 'results-review-best' }, [
          el('strong', { textContent: t('review.bestPracticeLabel') }),
          document.createTextNode(question.best_practice)
        ]));
      }

      // OWASP link
      if (question.ast_source_url) {
        var link = el('a', {
          className: 'results-review-link',
          href: question.ast_source_url,
          target: '_blank',
          rel: 'noopener',
          textContent: t('review.viewOnOwasp')
        });
        inner.appendChild(link);
      }

      details.appendChild(inner);
      wrap.appendChild(details);
    }

    return wrap;
  }

  /* ── PNG Download ── */
  function buildDownloadPng(svgEl) {
    var btn = el('button', { className: 'results-download-btn', textContent: t('results.downloadPng') });
    btn.addEventListener('click', function() {
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 800;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 800);
        ctx.drawImage(img, 0, 0, 800, 800);
        canvas.toBlob(function(pngBlob) {
          URL.revokeObjectURL(url);
          if (!pngBlob) return;
          var pngUrl = URL.createObjectURL(pngBlob);
          var a = document.createElement('a');
          a.href = pngUrl;
          a.download = 'ast-risk-radar.png';
          a.click();
          setTimeout(function() { URL.revokeObjectURL(pngUrl); }, 1000);
        }, 'image/png');
      };
      img.src = url;
    });
    return btn;
  }

  /* ── Share Button ── */
  function buildShareBtn(report) {
    if (!navigator.share) return null;
    var btn = el('button', { className: 'results-share-btn', textContent: t('results.share') });
    btn.addEventListener('click', function() {
      navigator.share({
        title: t('results.shareTitle'),
        text: t('results.shareText', {
          percentage: report.percentage,
          emoji: report.title.emoji,
          name: report.title.name,
          app: t('doc.title')
        })
      }).catch(function() { /* user cancelled */ });
    });
    return btn;
  }

  /* ── Retake Button ── */
  function buildRetake() {
    var btn = el('button', { className: 'results-retake-btn', textContent: t('results.retake') });
    btn.addEventListener('click', function() {
      App.SessionStore.clear();
      App.showView('landing-view');
    });
    return btn;
  }

  /* ══════════════════════════════════════════
   *  Public API
   * ══════════════════════════════════════════ */

  /**
   * @param {object} bank    - Parsed questions.json
   * @param {object} report  - Inner report from App.Scoring.computeScores()
   */
  /* ── Review Screen ── */
  var _lastBank = null;
  var _lastReport = null;

  function populateReview() {
    var reviewView = document.getElementById('review-view');
    if (!reviewView || !_lastBank) return;
    reviewView.innerHTML = '';

    // Back control
    var header = el('div', { className: 'results-review-header' }, [
      el('button', { className: 'results-review-back-btn', textContent: t('results.reviewBack') })
    ]);
    header.querySelector('.results-review-back-btn').addEventListener('click', function() {
      if (app.showView) app.showView('results-view');
    });
    reviewView.appendChild(header);

    // Heading
    reviewView.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.reviewTitle') }));

    // Review accordion
    var stored = App.SessionStore.load(_lastBank);
    var selections = stored.ok ? stored.answers : [];
    reviewView.appendChild(buildReview(_lastBank, selections));
  }

  function buildReviewBtn() {
    var btn = el('button', { className: 'results-review-btn', textContent: t('results.reviewBtn') });
    btn.addEventListener('click', function() {
      populateReview();
      if (app.showView) app.showView('review-view');
    });
    return btn;
  }

  function renderResults(bank, report) {
    var view = document.getElementById('results-view');
    if (!view) return;
    view.innerHTML = '';

    // Cache for review screen
    _lastBank = bank;
    _lastReport = report;

    // Title Card
    view.appendChild(buildTitleCard(report));

    // Section: Risk Radar
    var radarSection = el('div', { className: 'results-section' });
    radarSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.radarTitle') }));
    var radarWrap = el('div', { className: 'results-radar-wrap' });
    var svg = buildRadar(report);
    radarWrap.appendChild(svg);
    radarSection.appendChild(radarWrap);

    // Buttons row
    var btnRow = el('div', { className: 'results-btn-row' });
    btnRow.appendChild(buildDownloadPng(svg));
    var shareBtn = buildShareBtn(report);
    if (shareBtn) btnRow.appendChild(shareBtn);
    radarSection.appendChild(btnRow);
    view.appendChild(radarSection);

    // Blind-Spot Bars
    var barsSection = el('div', { className: 'results-section' });
    barsSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.barsTitle') }));
    barsSection.appendChild(buildBars(report));
    view.appendChild(barsSection);

    // Action Plan
    var actionSection = el('div', { className: 'results-section' });
    actionSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.actionPlanTitle') }));
    actionSection.appendChild(buildActionPlan(report, bank));
    view.appendChild(actionSection);

    // Deep-Dive Prompt
    var ddSection = el('div', { className: 'results-section' });
    ddSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.deepDiveTitle') }));
    ddSection.appendChild(buildDeepDive(report));
    view.appendChild(ddSection);

    // Button row: Review + Retake
    var actionBtnRow = el('div', { className: 'results-action-btn-row' });
    actionBtnRow.appendChild(buildReviewBtn());
    actionBtnRow.appendChild(buildRetake());
    view.appendChild(actionBtnRow);

    // Switch views (hide quiz/landing, show results)
    if (app.showView) app.showView('results-view');
    view.hidden = false;
  }

  /**
   * Snapshot of what the results/review side is currently built from: the
   * Question Bank Variant and the score report it last rendered. Returns
   * null before any Completion has rendered (issue #48).
   */
  function resultsState() {
    if (!_lastBank) return null;
    return { bank: _lastBank, report: _lastReport };
  }

  /**
   * Rebuild the Review screen in place against a (possibly different) Bank
   * Variant — the same score report travels with the render so a Bank
   * Variant swap can hand both surfaces over without a page load (issue
   * #48). The Review shows no scores: the report rides along purely so the
   * caller passes one state bundle, and it is cached for a later
   * re-render of the results view.
   */
  function renderReview(bank, report) {
    if (bank) _lastBank = bank;
    if (report) _lastReport = report;
    populateReview();
    if (app.showView) app.showView('review-view');
  }

  /**
   * Re-render the results view in place from the cached state — the exact
   * report object last scored, never recomputed, so the same numbers
   * re-render under a different Bank Variant or dictionary (issue #48).
   */
  function rerenderResults() {
    if (!_lastBank || !_lastReport) return false;
    renderResults(_lastBank, _lastReport);
    return true;
  }

  /** Re-render the Review screen in place from the cached state. */
  function rerenderReview() {
    if (!_lastBank) return false;
    populateReview();
    if (app.showView) app.showView('review-view');
    return true;
  }

  // --- Exports ---
  app.renderResults    = renderResults;
  app.renderReview     = renderReview;
  app.rerenderResults  = rerenderResults;
  app.rerenderReview   = rerenderReview;
  app.resultsState     = resultsState;

  /* Test seam (tests/js/test-results-retro.js, fakeEl pattern): the pure
     DOM builders plus the two palette helpers. Not used by the page. */
  app.resultsInternals = {
    scoreColor: scoreColor,
    scoreClass: scoreClass,
    headingFont: headingFont,
    buildTitleCard: buildTitleCard,
    buildRadar: buildRadar,
    buildBars: buildBars,
    buildReview: buildReview,
    buildDeepDive: buildDeepDive,
    buildDownloadPng: buildDownloadPng
  };

  if (typeof module !== 'undefined') module.exports = app;

})(globalThis);
