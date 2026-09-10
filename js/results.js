(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── constants ── */
  var AST = (global.App && global.App.AST) || { ids: [], names: {}, severity: {} };

  /* ── helpers ── */

  function scoreColor(pct) {
    if (pct < 50) return '#F44336';
    if (pct < 70) return '#FFC107';
    return '#4CAF50';
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
  function buildTitleCard(report) {
    var title = report.title;
    var frag = document.createDocumentFragment();

    frag.appendChild(el('div', { className: 'results-title-card' }, [
      el('div', { className: 'results-title-emoji', textContent: title.emoji }),
      el('div', { className: 'results-title-name', textContent: title.name }),
      el('div', { className: 'results-title-pct', textContent: report.percentage + '%' })
    ]));

    return frag;
  }

  /* ── Risk Radar (hand-rolled SVG) ── */
  function buildRadar(report, svgEl) {
    var cx = 200, cy = 200;
    var maxR = 140;         // outer ring
    var gridLevels = 4;     // 25%, 50%, 75%, 100%
    var step = 36;          // 360/10 degrees
    var svg = svgEl || document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.setAttribute('class', 'results-radar-svg');

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
      tspan.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
      tspan.setAttribute('font-weight', '600');
      tspan.setAttribute('fill', '#333');
      tspan.textContent = astId;

      var tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan2.setAttribute('x', lx);
      tspan2.setAttribute('y', ly + 6);
      tspan2.setAttribute('text-anchor', anchor);
      tspan2.setAttribute('font-size', '8');
      tspan2.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
      tspan2.setAttribute('fill', scoreColor(pct));
      tspan2.textContent = pct + '%';

      var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.appendChild(tspan);
      lbl.appendChild(tspan2);
      svg.appendChild(lbl);
    }

    // polygon fill
    var polyPts = points.map(function(p) { return p.x + ',' + p.y; }).join(' ');
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', polyPts);
    poly.setAttribute('fill', 'rgba(237, 104, 43, 0.15)');
    poly.setAttribute('stroke', '#ED682B');
    poly.setAttribute('stroke-width', '2');
    svg.appendChild(poly);

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

    // weakest-first order comes from the report (Scoring Engine owns ranking)
    var astRanked = report.astRanked || [];

    for (var i = 0; i < astRanked.length; i++) {
      var astId = astRanked[i].id;
      var pct = astRanked[i].percentage || 0;
      var row = el('div', { className: 'results-bar-row' }, [
        el('div', { className: 'results-bar-label' }, [
          document.createTextNode(AST.names[astId] || astId)
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
    wrap.appendChild(el('p', { className: 'results-action-narrative results-loading', textContent: 'Crafting your action plan\u2026' }));

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
        document.createTextNode('Why these actions? Read the analysis')
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
    wrap.appendChild(el('h3', { className: 'results-deep-dive-heading', textContent: 'Want to go deeper?' }));
    wrap.appendChild(el('p', { className: 'results-deep-dive-sub', textContent: 'Copy this into your agent chat: it turns your agent into a private security tutor for your exact blind spots.' }));

    var details = el('details', { className: 'results-prompt-details' });
    var summary = el('summary', { className: 'results-prompt-summary' }, [
      document.createTextNode('Show Deep-Dive Prompt')
    ]);
    details.appendChild(summary);

    var pre = el('pre', { className: 'results-prompt-pre', textContent: promptText });
    details.appendChild(pre);

    var btn = el('button', { className: 'results-copy-btn', textContent: 'Copy to Clipboard' });
    btn.addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).then(function() {
          window.Analytics.track('template_copied');
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 2000);
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
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 2000);
    } catch (e) {
      btn.textContent = 'Copy failed';
      setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 2000);
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
        el('span', { className: 'results-review-qnum', textContent: 'Q' + (q + 1) }),
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
          el('strong', { textContent: 'Feedback: ' }),
          document.createTextNode(selectedOption.feedback)
        ]));
      }

      // best practice
      if (question.best_practice) {
        inner.appendChild(el('div', { className: 'results-review-best' }, [
          el('strong', { textContent: 'Best Practice: ' }),
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
          textContent: 'View on OWASP ↗'
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
    var btn = el('button', { className: 'results-download-btn', textContent: 'Download PNG' });
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
          var pngUrl = URL.createObjectURL(pngBlob);
          var a = document.createElement('a');
          a.href = pngUrl;
          a.download = 'ast-risk-radar.png';
          a.click();
          setTimeout(function() { URL.revokeObjectURL(pngUrl); }, 1000);
        }, 'image/png');
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
    return btn;
  }

  /* ── Share Button ── */
  function buildShareBtn(report) {
    if (!navigator.share) return null;
    var btn = el('button', { className: 'results-share-btn', textContent: 'Share Results' });
    btn.addEventListener('click', function() {
      navigator.share({
        title: 'AST Quiz Results',
        text: 'I scored ' + report.percentage + '% as ' + report.title.emoji + ' ' + report.title.name + ' on the Agent Security Awareness Quiz.'
      }).catch(function() { /* user cancelled */ });
    });
    return btn;
  }

  /* ── Retake Button ── */
  function buildRetake() {
    var btn = el('button', { className: 'results-retake-btn', textContent: 'Retake Assessment' });
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
      el('button', { className: 'results-review-back-btn', textContent: '\u2190 Back to results' })
    ]);
    header.querySelector('.results-review-back-btn').addEventListener('click', function() {
      if (app.showView) app.showView('results-view');
    });
    reviewView.appendChild(header);

    // Heading
    reviewView.appendChild(el('h2', { className: 'results-section-title', textContent: 'Review Your Answers' }));

    // Review accordion
    var stored = App.SessionStore.load(_lastBank);
    var selections = stored.ok ? stored.answers : [];
    reviewView.appendChild(buildReview(_lastBank, selections));
  }

  function buildReviewBtn() {
    var btn = el('button', { className: 'results-review-btn', textContent: 'Review your answers \u2192' });
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
    radarSection.appendChild(el('h2', { className: 'results-section-title', textContent: 'Risk Radar' }));
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
    barsSection.appendChild(el('h2', { className: 'results-section-title', textContent: 'Blind-Spot Bars' }));
    barsSection.appendChild(buildBars(report));
    view.appendChild(barsSection);

    // Action Plan
    var actionSection = el('div', { className: 'results-section' });
    actionSection.appendChild(el('h2', { className: 'results-section-title', textContent: 'Action Plan' }));
    actionSection.appendChild(buildActionPlan(report, bank));
    view.appendChild(actionSection);

    // Deep-Dive Prompt
    var ddSection = el('div', { className: 'results-section' });
    ddSection.appendChild(el('h2', { className: 'results-section-title', textContent: 'Deep-Dive Prompt' }));
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

  // --- Exports ---
  app.renderResults = renderResults;

})(globalThis);
