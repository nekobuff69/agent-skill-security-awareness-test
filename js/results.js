(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /* ── constants ── */
  var AST_IDS = [
    'AST01','AST02','AST03','AST04','AST05',
    'AST06','AST07','AST08','AST09','AST10'
  ];

  var AST_NAMES = {
    AST01: 'Malicious Skills',
    AST02: 'Supply Chain Compromise',
    AST03: 'Over-Privileged Skills',
    AST04: 'Insecure Metadata',
    AST05: 'Untrusted External Instructions',
    AST06: 'Weak Isolation',
    AST07: 'Update Drift',
    AST08: 'Poor Scanning',
    AST09: 'No Governance',
    AST10: 'Cross-Platform Reuse'
  };

  var AST_SEVERITY = {
    AST01: 'critical', AST02: 'critical',
    AST03: 'high', AST04: 'high', AST05: 'high', AST06: 'high',
    AST07: 'medium', AST08: 'medium', AST09: 'medium', AST10: 'medium'
  };

  /* ── helpers ── */

  function scoreColor(pct) {
    if (pct < 50) return '#d32f2f';
    if (pct < 70) return '#f57c00';
    return '#388e3c';
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

  /* ── severity chip ── */
  function severityChip(astId) {
    var sev = AST_SEVERITY[astId] || 'medium';
    return el('span', { className: 'results-severity results-sev-' + sev }, [sev]);
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
      var astId = AST_IDS[i];
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

      // axis label — staggered around polygon
      var labelR = maxR + 28;
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
      tspan.setAttribute('fill', '#333');
      tspan.textContent = AST_NAMES[astId] || astId;

      var tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan2.setAttribute('x', lx);
      tspan2.setAttribute('y', ly + 6);
      tspan2.setAttribute('text-anchor', anchor);
      tspan2.setAttribute('font-size', '8');
      tspan2.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
      tspan2.setAttribute('fill', '#888');
      tspan2.textContent = AST_SEVERITY[astId] || '';

      var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.appendChild(tspan);
      lbl.appendChild(tspan2);
      svg.appendChild(lbl);
    }

    // polygon fill
    var polyPts = points.map(function(p) { return p.x + ',' + p.y; }).join(' ');
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', polyPts);
    poly.setAttribute('fill', 'rgba(25, 118, 210, 0.15)');
    poly.setAttribute('stroke', '#1976d2');
    poly.setAttribute('stroke-width', '2');
    svg.appendChild(poly);

    // re-append dots on top of polygon
    for (var i = 0; i < points.length; i++) {
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', points[i].x);
      dot.setAttribute('cy', points[i].y);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('fill', scoreColor((astScores[AST_IDS[i]] && astScores[AST_IDS[i]].percentage != null) ? astScores[AST_IDS[i]].percentage : 0));
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '1');
      svg.appendChild(dot);
    }

    return svg;
  }

  /* ── Blind-Spot Bars ── */
  function buildBars(report) {
    var wrap = el('div', { className: 'results-bars' });

    // sort weakest-first
    var astIds = Object.keys(report.astScores);
    astIds.sort(function(a, b) {
      return (report.astScores[a].percentage || 0) - (report.astScores[b].percentage || 0);
    });

    for (var i = 0; i < astIds.length; i++) {
      var astId = astIds[i];
      var pct = report.astScores[astId].percentage || 0;
      var row = el('div', { className: 'results-bar-row' }, [
        el('div', { className: 'results-bar-label' }, [
          document.createTextNode(AST_NAMES[astId] + ' '),
          severityChip(astId)
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

    // Fallback-only path: no proxy or no corpus → render deterministic plan immediately
    if (!proxyUrl || !corpus) {
      renderFallbackPlan(wrap, report, bank);
      return wrap;
    }

    // LLM path: show loading, then attempt LLM with one retry
    wrap.appendChild(el('p', { className: 'results-action-narrative results-loading', textContent: 'Crafting your action plan\u2026' }));
    attemptLlmPlan(wrap, report, bank, corpus);
    return wrap;
  }

  function renderFallbackPlan(wrap, report, bank) {
    var plan = App.FallbackAssembler.assemble(report, bank);
    renderPlanContent(wrap, plan.narrative, plan.actions);
  }

  function renderPlanContent(wrap, narrative, actions) {
    wrap.innerHTML = '';

    if (narrative) {
      var paras = narrative.split(/\n\n+/);
      for (var i = 0; i < paras.length; i++) {
        if (paras[i].trim()) {
          wrap.appendChild(el('p', { className: 'results-action-narrative', textContent: paras[i].trim() }));
        }
      }
    }

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
  }

  function buildLlmPrompt(report, bank, excerpts) {
    var title = report.title || { name: 'Unknown', emoji: '?' };
    var percentage = report.percentage != null ? report.percentage : 0;

    // --- System Instruction ---
    var prompt =
      '## System Instruction\n\n' +
      'You are a security advisor analyzing a user\'s self-assessment results\n' +
      'on AI agent skill security, based on the OWASP Agentic Skills Top 10.\n\n' +
      'Your task: generate a personalized risk assessment and action plan.\n\n' +
      'RULES:\n\n' +
      '- Every factual claim MUST trace to the provided OWASP source material\n' +
      '- Do NOT invent attack scenarios or statistics not in the source\n' +
      '- Do NOT fabricate OWASP recommendations \u2014 use only what\'s provided\n' +
      '- If the source material doesn\'t cover a specific situation, say so\n' +
      '- Write for a non-technical audience \u2014 plain language, no jargon\n' +
      '- Tone: helpful advisor, not alarmist or condescending\n\n';

    // --- Participant Data ---
    prompt +=
      '## Participant Data\n\n' +
      'Title: ' + title.emoji + ' ' + title.name + '\n' +
      'Overall: ' + percentage + '%\n\n';

    // Per-AST scores, weakest first
    var astKeys = Object.keys(report.astScores || {});
    astKeys.sort(function(a, b) {
      return (report.astScores[a].percentage || 0) - (report.astScores[b].percentage || 0);
    });

    prompt += 'Per-AST Scores:\n';
    for (var i = 0; i < astKeys.length; i++) {
      var astId = astKeys[i];
      var ast = report.astScores[astId];
      var riskName = AST_NAMES[astId] || astId;
      prompt += '- ' + astId + ' (' + riskName + ', ' + (AST_SEVERITY[astId] || 'medium') + '): ' +
        ast.earned + '/' + ast.possible + ' (' + ast.percentage + '%)\n';
    }

    // Weakest questions with chosen option / best practice / OWASP link
    var weakQs = report.weakestQuestions || [];
    if (weakQs.length > 0) {
      prompt += '\nWeakest Questions (lowest performance):\n';
      for (var j = 0; j < weakQs.length; j++) {
        var wq = weakQs[j];
        // Resolve option text from bank if selectedOption not present
        var selectedText = '';
        if (wq.selectedOption && wq.selectedOption.text) {
          selectedText = wq.selectedOption.text;
        } else if (wq.selectedOptionIndex != null) {
          // find question in bank to get option text
          for (var q = 0; q < bank.questions.length; q++) {
            if (bank.questions[q].id === wq.id) {
              var opt = bank.questions[q].options[wq.selectedOptionIndex];
              if (opt) selectedText = opt.text;
              break;
            }
          }
        }

        prompt += '- ' + wq.id + ': Chose "' + selectedText + '" (score: ' +
          (wq.weightedScore != null ? wq.weightedScore : 'N/A') + '/3)\n';
        if (wq.scenario) prompt += '  Scenario: ' + wq.scenario + '\n';
        if (wq.bestPractice) prompt += '  Best Practice: ' + wq.bestPractice + '\n';
        if (wq.astSourceUrl) prompt += '  OWASP Source: ' + wq.astSourceUrl + '\n';
      }
    }

    // --- OWASP Source Material ---
    prompt += '\n## OWASP Source Material\n\n';
    var excerptKeys = Object.keys(excerpts);
    for (var e = 0; e < excerptKeys.length; e++) {
      var ex = excerpts[excerptKeys[e]];
      prompt += '### ' + excerptKeys[e] + '\n\n';
      if (ex.description) prompt += ex.description + '\n\n';
      if (ex.evidence) prompt += '**Evidence:**\n' + ex.evidence + '\n\n';
      if (ex.mitigations) prompt += '**Mitigations:**\n' + ex.mitigations + '\n\n';
    }

    // --- Output Format ---
    prompt +=
      '## Output Format\n\n' +
      'Return a JSON object matching the schema above.';

    return prompt;
  }

  function attemptLlmPlan(wrap, report, bank, corpus) {
    // Sort AST scores ascending (weakest first), take top 3\u20135
    var astKeys = Object.keys(report.astScores || {});
    astKeys.sort(function(a, b) {
      return (report.astScores[a].percentage || 0) - (report.astScores[b].percentage || 0);
    });
    var weakAstIds = astKeys.slice(0, Math.min(5, astKeys.length));

    // Extract OWASP excerpts for weakest AST risks
    var excerpts = App.Extractor.extract(corpus, weakAstIds);

    // Build the LLM prompt
    var prompt = buildLlmPrompt(report, bank, excerpts);

    var config = window.APP_CONFIG || {};

    App.LLMClient.generate(prompt, config, bank)
      .then(function(res) {
        if (res && res.ok) {
          renderPlanContent(wrap, res.narrative, res.actions);
          window.Analytics.track('llm_success');
          return null; // success — no retry
        }
        // First attempt failed — one retry
        return App.LLMClient.generate(prompt, config, bank);
      })
      .then(function(res) {
        if (!res) return; // first attempt already succeeded
        if (res.ok) {
          renderPlanContent(wrap, res.narrative, res.actions);
          window.Analytics.track('llm_success');
        } else {
          renderFallbackPlan(wrap, report, bank);
          window.Analytics.track('llm_fallback');
        }
      })
      .catch(function() {
        renderFallbackPlan(wrap, report, bank);
        window.Analytics.track('llm_fallback');
      });
  }

  /* ── Deep-Dive Prompt ── */
  function buildDeepDive(report) {
    var promptText = App.PromptBuilder.build(report);
    var wrap = el('div', { className: 'results-deep-dive' });

    var details = el('details', { className: 'results-prompt-details' });
    var summary = el('summary', { className: 'results-prompt-summary' }, [
      document.createTextNode('Copy Deep-Dive Prompt')
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
  function renderResults(bank, report) {
    var view = document.getElementById('results-view');
    if (!view) return;
    view.innerHTML = '';

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

    // Review Accordion — selections from session store
    var reviewSection = el('div', { className: 'results-section' });
    reviewSection.appendChild(el('h2', { className: 'results-section-title', textContent: 'Review Your Answers' }));
    var stored = App.SessionStore.load(bank);
    var selections = stored.ok ? stored.answers : [];
    reviewSection.appendChild(buildReview(bank, selections));
    view.appendChild(reviewSection);

    // Retake
    var retakeWrap = el('div', { className: 'results-retake-wrap' });
    retakeWrap.appendChild(buildRetake());
    view.appendChild(retakeWrap);

    // Switch views (hide quiz/landing, show results)
    if (app.showView) app.showView('results-view');
    view.hidden = false;
  }

  // --- Exports ---
  app.renderResults = renderResults;

})(globalThis);
