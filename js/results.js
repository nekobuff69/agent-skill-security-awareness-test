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

  /* ── Results header panel ── */

  /**
   * The window's first content panel under the menu bar (tickets #60, #65):
   * the Progression Title and the Overall Percentage merged into one
   * sunken-white client field. The fake Title Card window of #45 is gone —
   * the shell frame IS the window now, its navy title bar carries the
   * program title, so the tier name rides the body panel again via
   * .results-title-name (css/
   * theme-retro-os.css keeps its rule) and no second title bar exists.
   *
   * The tier data path (title.emoji / title.name / percentage) and the
   * score-band colouring are unchanged from #45: the percentage is the
   * most eye-catching element on the surface, so it carries scoreClass()
   * — without it a perfect score and a failing one rendered identically
   * in --color-accent while green bars sat beside them saying the opposite.
   * The band rules in css/results.css resolve to the --color-score-* TEXT
   * tokens (css/theme-retro-os.css), not the graphic fills, because the
   * fill values do not meet the contrast floor for text on white.
   */
  function buildResultsHeader(report) {
    var title = report.title;

    /* .results-title-card keeps its class, so the skin's sunken-white rule
       (css/theme-retro-os.css) paints the Win95 field. */
    return el('div', { className: 'results-title-card' }, [
      el('div', {
        className: 'results-title-name results-title-caption',
        textContent: title.emoji + ' ' + title.name
      }),
      el('div', { className: 'results-overall-caption', textContent: t('results.overall') }),
      el('div', {
        className: 'results-title-pct ' + scoreClass(report.percentage),
        textContent: report.percentage + '%'
      })
    ]);
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

  /* ── Report re-anchoring (issue #56) ────────────────────────────────────

     A Completion's score report is scored once against one Bank Variant
     (ADR 0002) and its numeric fields — the Overall Percentage, every AST
     Score, Total Earned/Possible — are facts, never recomputed. Two fields
     are authored prose carried across a Bank Variant swap though: the
     Progression Title (read from the scoring Bank's Title Ladder at
     scoring time) and the Weakest Questions' text (Scenario, Question,
     chosen Option, Best Practice, OWASP link — captured from the scoring
     Bank at computeScores time). Both are re-anchored here by structural
     identity (ADR 0015): the same Title Ladder threshold, the same
     Question id, the same chosen Option index. A missing structural
     anchor leaves the field untouched — a re-anchor never invents text. */

  function questionById(bank, id) {
    var questions = (bank && bank.questions) || [];
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].id === id) return questions[i];
    }
    return null;
  }

  function reanchorTitle(report, bank) {
    var ladder = bank.meta && bank.meta.scoring && bank.meta.scoring.titles;
    if (!Array.isArray(ladder) || !ladder.length) return report.title;
    var title = ladder[0];   // same rule as the Scoring Engine (ADR 0004)
    for (var i = 0; i < ladder.length; i++) {
      if (report.percentage >= ladder[i].threshold) {
        title = ladder[i];
        break;
      }
    }
    return { name: title.name, emoji: title.emoji, threshold: title.threshold };
  }

  function reanchorWeakest(report, bank, scoringBank) {
    var weakest = report.weakestQuestions;
    if (!Array.isArray(weakest)) return weakest;
    var source = scoringBank || bank;
    var reanchored = [];
    for (var i = 0; i < weakest.length; i++) {
      var wq = weakest[i];
      var q = questionById(bank, wq.id);
      if (!q) { reanchored.push(wq); continue; }
      // The chosen Option travels as an object of the Variant the report
      // was scored against; its index is recovered there by identity and
      // applied to this Variant — structural identity makes the same index
      // the same Option (ADR 0015). An object the scoring Bank no longer
      // owns keeps its own text: a re-anchor never invents.
      var index = -1;
      var sourceQ = questionById(source, wq.id);
      if (sourceQ && sourceQ.options && wq.selectedOption) {
        index = sourceQ.options.indexOf(wq.selectedOption);
      }
      var entry = {
        id: wq.id,
        scenario: q.scenario,
        question: q.question,
        selectedOption: (index >= 0 && q.options && q.options[index])
          ? q.options[index]
          : wq.selectedOption,
        bestPractice: q.best_practice,
        astSourceUrl: q.ast_source_url,
        astRisks: wq.astRisks
      };
      if (index >= 0) entry.selectedOptionIndex = index;
      reanchored.push(entry);
    }
    return reanchored;
  }

  /**
   * The score report as the active Bank Variant should show it: authored
   * prose re-anchored, every number the cached report's own (issue #56).
   * `scoringBank` is the Variant the report was scored against — it
   * defaults to the active one, because a first render scores and renders
   * the same Bank. Returns a shallow copy — the cached report is never
   * mutated. The report is returned unchanged when the active Bank
   * carries no scoring meta (headless renders and direct-caller tests).
   */
  function localizedReport(report, bank, scoringBank) {
    if (!report || !bank || !bank.meta || !bank.meta.scoring) return report;
    var shown = {};
    for (var key in report) {
      if (Object.prototype.hasOwnProperty.call(report, key)) shown[key] = report[key];
    }
    shown.title = reanchorTitle(report, bank);
    shown.weakestQuestions = reanchorWeakest(report, bank, scoringBank);
    return shown;
  }

  /* ── Action Plan ── */

  /* The Narrative slot: one per (Completion report, locale) — issue #56.
     The LLM Path prompt embeds the current dictionary, so one Completion
     needs at most one Action Plan generation per locale, never one per
     render. A completed slot re-renders instantly and locally on every
     later visit or language switch; #64 makes "every later visit" span a
     reload too: a settled plan is mirrored into the desktop Record's
     language → payload cache, and the restore render refills the slot from
     it without a request. An in-flight slot keeps the localized
     `results.planLoading` shown until its own resolution lands. Late
     resolutions from superseded renders are dropped by the render id — a
     language switch can neither paint the old language's Narrative into
     the new view nor duplicate the generation. */
  var _planSlots = {};        // locale → { report, promise, narrative, actions }
  var _planRenderId = 0;      // the live Action Plan render; 0 = none

  /* Ticket #64 — the desktop restore bracket. js/desktop-store.js opens it
     with the Record's trusted language → payload map (beginPlanRestore),
     draws the restored desktop inside it, and closes it (finishPlanRestore)
     the moment the restore has completed. Inside the bracket a cached
     payload for the render's language seeds the slot and renders at once —
     no request, no loading state — while a language without a payload
     queues the restore's ONE request, fired by the close, so a reloaded
     desktop never carries an Action Plan window stuck on loading and never
     renders a payload cached for another language. Outside the bracket —
     a live Finish or a language switch — the presenter behaves as before:
     exactly one request per (report, locale), and the only regeneration
     trigger is the switch itself. This replaces #63's hold seam. */
  var _planRestoreCache = null;   // language → payload, or null outside a restore
  var _planRestoreQueued = null;  // the restore render's deferred first request

  /* The Completion the last Action Plan render showed: a settling request
     caches into the Record only while its report is still the live one
     (#64) — a late resolution of a dead Completion, outlasted by a Retake
     or a quit, must never paint its payload into a new desktop's cache. */
  var _planLiveReport = null;

  function planSlot(locale) {
    var slot = _planSlots[locale];
    if (!slot) {
      slot = { report: null, promise: null, narrative: null, actions: null };
      _planSlots[locale] = slot;
    }
    return slot;
  }

  function buildActionPlan(report, bank, scoringBank) {
    var wrap = el('div', { className: 'results-action-plan' });
    var corpus = window.Corpus;
    _planLiveReport = report;

    var locale = app.I18n.locale;
    var slot = planSlot(locale);
    var renderId = ++_planRenderId;

    if (slot.report === report && slot.narrative !== null) {
      // This Completion's plan for this locale already exists — re-render
      // from the slot: no generation, no fetch. The content settles inside
      // this very render, and the settle IS the arrival: the Action Plan
      // window appears (or stays) with it (ticket #61).
      renderPlanContent(wrap, slot.narrative, slot.actions);
      actionPlanSettled();
      return wrap;
    }

    // #64 restore: the Record carries this language's settled plan. The
    // cached payload seeds the slot and renders inside this very render —
    // no request, no loading state, no flicker — and the settle is the
    // same arrival. A payload cached for ANOTHER language is never looked
    // at: the lookup is keyed by the locale the desktop renders in.
    if (_planRestoreCache &&
        Object.prototype.hasOwnProperty.call(_planRestoreCache, locale)) {
      var cached = _planRestoreCache[locale];
      if (cached && typeof cached.narrative === 'string' &&
          Array.isArray(cached.actions)) {
        slot.report = report;
        slot.promise = null;
        slot.narrative = cached.narrative;
        slot.actions = cached.actions;
        renderPlanContent(wrap, slot.narrative, slot.actions);
        actionPlanSettled();
        return wrap;
      }
    }

    // #64 restore with no cached payload for this language: the desktop
    // comes back with NO Action Plan window — the window is an arrival,
    // and an arrival waits for content. finishPlanRestore() fires the
    // restore's one queued request when the restore has completed; from
    // there the LLM Path and the Deterministic Fallback follow the exact
    // rule every other render already uses.
    if (_planRestoreCache) {
      _planRestoreQueued = function() {
        _planRestoreQueued = null;
        requestPlanRender(slot, locale, report, bank, scoringBank, corpus,
          wrap, renderId);
      };
      return wrap;
    }

    requestPlanRender(slot, locale, report, bank, scoringBank, corpus,
      wrap, renderId);
    return wrap;
  }

  /** Issue (or reuse) this slot's single generation and paint it into the
   *  render when it settles — the one request path for a live Finish, a
   *  language switch and a restore's queued request alike (#64). */
  function requestPlanRender(slot, locale, report, bank, scoringBank,
    corpus, wrap, renderId) {
    if (slot.report !== report || !slot.promise) {
      // A new Completion, or this locale's first request for it. The
      // Action Plan module owns the path decision and the retry policy:
      // the LLM Path and the Deterministic Fallback settle through one
      // promise, cache through one rule and arrive through one gesture.
      slot.report = report;
      slot.promise = null;
      slot.narrative = null;
      slot.actions = null;
      slot.promise = App.ActionPlan.assemble(
        localizedReport(report, bank, scoringBank), bank, corpus,
        window.APP_CONFIG);
    }

    // Loading indicator, owned by the in-flight request only: a render
    // that already has settled content never builds it, and on the
    // fallback path assemble resolves in a microtask so this never
    // visibly paints.
    wrap.appendChild(el('p', { className: 'results-action-narrative results-loading', textContent: t('results.planLoading') }));

    var mine = slot.promise;
    mine.then(function(plan) {
      if (slot.promise !== mine) return;  // a newer Completion took the slot
      slot.narrative = plan.narrative;
      slot.actions = plan.actions;
      // #64: mirror the settled payload into the desktop Record, keyed by
      // this request's own language — the language captured when the
      // request was issued, not whatever dictionary is active when it
      // lands. A Record a Retake or quit has already cleared is never
      // rewritten (the store's savePlan no-ops without one).
      persistPlan(locale, report, plan);
      // A newer render superseded this one (another language switch, a
      // Retake, a Bank refresh): the late resolution must not paint into
      // an evicted view.
      if (_planRenderId !== renderId) return;
      renderPlanContent(wrap, plan.narrative, plan.actions);
      // Content settled → the window arrives. The Deterministic Fallback
      // lands here on its microtask too, and that is the SAME rule with
      // the same consequence: the LLM Path and the fallback are not two
      // arrival paths (ticket #61).
      actionPlanSettled();
    });
  }

  /** Persist one settled plan into the desktop Record under the language
   *  that generated it — while its Completion is still the live desktop.
   *  Guarded end to end: no desktop store, superseded report, or a store
   *  that refuses, and the render never notices. */
  function persistPlan(locale, report, plan) {
    if (_planLiveReport !== report) return false;
    var store = app.DesktopStore;
    if (!store || typeof store.savePlan !== 'function') return false;
    try {
      return store.savePlan(locale, plan) === true;
    } catch (e) {
      return false;
    }
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

  /* ── PNG export composition (ticket #65) ──────────────────────────────

     The export sheet shows the Quiz window's BODY only: the score header,
     the Risk Radar and the Blind-Spot Bars. The window chrome (title bar
     and menu bar) and the taskbar are never part of it — no snapshot of
     the window is taken; the body content is RE-DRAWN from the report
     through the same pure builders the window itself uses (buildRadar,
     scoreColor, the localized AST names, the heading token stack), so the
     exported sheet and the window cannot drift apart. SVG graphics inside
     an <img>-decoded export render through their palette constants and the
     font-family attribute, the same rule the radar already follows. */

  /* The sheet is one layout, and the numbers ARE the design: an 800-wide
     column, the radar centred at its natural 400×400, the Blind-Spot rows
     ruled on a fixed pitch under it. */
  var EXPORT_W = 800;
  var EXPORT_X = 20;               // text column
  var EXPORT_NAME_Y = 56;          // Progression Title
  var EXPORT_OVERALL_Y = 82;       // Overall caption
  var EXPORT_PCT_Y = 122;          // Overall Percentage
  var EXPORT_RADAR_TITLE_Y = 164;
  var EXPORT_RADAR_Y = 184;        // the 400×400 chart, centred
  var EXPORT_BARS_TITLE_Y = 626;
  var EXPORT_ROW_FIRST = 658;      // first Blind-Spot row's text baseline
  var EXPORT_ROW_PITCH = 24;       // one Blind-Spot row's height
  var EXPORT_ROW_BOX = 12;         // one Blind-Spot track's height
  var EXPORT_TRACK_X = 330;
  var EXPORT_TRACK_W = 370;
  var EXPORT_BOTTOM = 24;          // pad under the last row

  /** The sheet's raster size for a report: 800 wide, one row pitch per
   *  ranked AST below the header and radar blocks. */
  function exportMetrics(report) {
    var rows = ((report && report.astRanked) || []).length;
    return {
      w: EXPORT_W,
      h: EXPORT_ROW_FIRST + Math.max(rows - 1, 0) * EXPORT_ROW_PITCH +
         EXPORT_ROW_BOX + EXPORT_BOTTOM
    };
  }

  /** The full body sheet as one SVG document: score header, Risk Radar,
   *  Blind-Spot Bars — body content only, no chrome. */
  function buildExportSvg(report) {
    var ns = 'http://www.w3.org/2000/svg';
    var m = exportMetrics(report);
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(m.w));
    svg.setAttribute('height', String(m.h));
    svg.setAttribute('viewBox', '0 0 ' + m.w + ' ' + m.h);

    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(m.w));
    bg.setAttribute('height', String(m.h));
    bg.setAttribute('fill', '#FFFFFF');
    svg.appendChild(bg);

    var font = headingFont();

    function text(x, y, size, content, fill) {
      var n = document.createElementNS(ns, 'text');
      n.setAttribute('x', String(x));
      n.setAttribute('y', String(y));
      n.setAttribute('font-size', String(size));
      n.setAttribute('font-family', font);
      n.setAttribute('font-weight', '400');
      n.setAttribute('fill', fill);
      n.textContent = content;
      svg.appendChild(n);
      return n;
    }

    function rect(x, y, w, h, fill, stroke) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(h));
      r.setAttribute('fill', fill);
      if (stroke) r.setAttribute('stroke', stroke);
      return r;
    }

    // Score header — the tier name, the Overall caption, the band-coloured
    // percentage: the same three fields .results-title-card shows.
    text(EXPORT_X, EXPORT_NAME_Y, 20, report.title.emoji + ' ' + report.title.name, '#000000');
    text(EXPORT_X, EXPORT_OVERALL_Y, 14, t('results.overall'), '#000000');
    text(EXPORT_X, EXPORT_PCT_Y, 38, report.percentage + '%', scoreColor(report.percentage));

    // Risk Radar — a fresh data-viz snapshot, embedded 1:1 at 400×400.
    text(EXPORT_X, EXPORT_RADAR_TITLE_Y, 16, t('results.radarTitle'), '#000000');
    var radar = buildRadar(report);
    radar.setAttribute('x', String((EXPORT_W - 400) / 2));
    radar.setAttribute('y', String(EXPORT_RADAR_Y));
    radar.setAttribute('width', '400');
    radar.setAttribute('height', '400');
    svg.appendChild(radar);

    // Blind-Spot Bars — weakest first, the localized full names, the same
    // band colours: the sheet's mirror of .results-bars.
    text(EXPORT_X, EXPORT_BARS_TITLE_Y, 16, t('results.barsTitle'), '#000000');
    var ranked = ((report && report.astRanked) || []);
    for (var i = 0; i < ranked.length; i++) {
      var pct = ranked[i].percentage || 0;
      var rowY = EXPORT_ROW_FIRST + i * EXPORT_ROW_PITCH;
      text(EXPORT_X, rowY, 11, app.I18n.astName(ranked[i].id), '#000000');
      svg.appendChild(rect(EXPORT_TRACK_X, rowY - 11, EXPORT_TRACK_W,
        EXPORT_ROW_BOX, '#FFFFFF', '#808080'));
      svg.appendChild(rect(EXPORT_TRACK_X, rowY - 11, EXPORT_TRACK_W * pct / 100,
        EXPORT_ROW_BOX, scoreColor(pct)));
      text(EXPORT_TRACK_X + EXPORT_TRACK_W + 8, rowY, 11, pct + '%', scoreColor(pct));
    }

    return svg;
  }

  /* ── PNG Download ── */
  function buildDownloadPng(report) {
    var btn = el('button', {
      className: 'results-download-btn results-menu-item',
      textContent: t('results.downloadPng'),
      role: 'menuitem'
    });
    btn.addEventListener('click', function() {
      var svg = buildExportSvg(report);
      var svgStr = new XMLSerializer().serializeToString(svg);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        var m = exportMetrics(report);
        var canvas = document.createElement('canvas');
        canvas.width = m.w;
        canvas.height = m.h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, m.w, m.h);
        ctx.drawImage(img, 0, 0, m.w, m.h);
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
    var btn = el('button', {
      className: 'results-share-btn results-menu-item',
      textContent: t('results.share'),
      role: 'menuitem'
    });
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
    var btn = el('button', {
      className: 'results-retake-btn results-menu-item',
      textContent: t('results.retake'),
      role: 'menuitem'
    });
    btn.addEventListener('click', function() {
      App.SessionStore.clear();
      // Ticket #63: the desktop Record describes the run this Retake ends —
      // a reload after it must land on the fresh run, not on the old
      // desktop. Guarded so a page without js/desktop-store.js is unchanged.
      if (app.DesktopStore && typeof app.DesktopStore.clear === 'function') {
        app.DesktopStore.clear();
      }
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
  // The Variant the current report was SCORED against — kept across the
  // Bank Variant swaps of an in-place language switch (#56), because the
  // report embeds authored text (chosen Option objects) from that Variant
  // and a re-anchor recovers their index there by identity.
  var _scoredBank = null;

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
    var btn = el('button', {
      className: 'results-review-btn results-menu-item',
      textContent: t('results.reviewBtn'),
      role: 'menuitem'
    });
    btn.addEventListener('click', function() {
      populateReview();
      if (app.showView) app.showView('review-view');
    });
    return btn;
  }

  /* ── Window menu bar (ticket #65) ─────────────────────────────────────

     The Quiz window's four commands — Download PNG, Share, Review answers,
     Retake — live in ONE menu bar at the head of the window body, so the
     body below it carries only the score header, the Risk Radar and the
     Blind-Spot Bars. The bar is built by the Quiz presenter and mounted
     into the Quiz body alone: the Action Plan and the Deep-Dive Prompt are
     sections of their own windows and own no commands, and the Deep-Dive
     Copy control stays in that window's body.

     Keyboard: the bar is a `menubar` of `menuitem`s with a roving tabindex,
     so Arrow/Home/End move the command focus and Enter/Space (native button
     activation) runs it. Tabbing into the bar lands on the remembered
     command; nothing here reaches into the window chrome (js/shell.js owns
     the frame, and the frame owns focus-in/raise on pointer interaction).

     The command labels are the existing `results.*` Chrome Strings — the
     menu speaks with the same words the buttons used, so no second copy of
     each label exists to drift. Only the bar's own accessible name is new
     (`results.menuBar`), and it resolves in both dictionaries like every
     other id (ADR 0015). */
  function buildMenuBar(shown) {
    var items = [buildDownloadPng(shown)];
    var share = buildShareBtn(shown);
    if (share) items.push(share);
    items.push(buildReviewBtn());
    items.push(buildRetake());

    var bar = el('div', {
      className: 'results-menu-bar',
      role: 'menubar',
      'aria-label': t('results.menuBar')
    });

    // The four builders arrive as menu items already (role and class); the
    // bar owns how they enter the page's tab order: one tab stop, and the
    // bar's own key handler moves it.
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('type', 'button');
      items[i].setAttribute('tabindex', i === 0 ? '0' : '-1');
      bar.appendChild(items[i]);
    }

    bar.addEventListener('keydown', function(event) {
      var key = event && event.key;
      var at = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i] === event.target) { at = i; break; }
      }
      if (at < 0) return;
      var next = -1;
      if (key === 'ArrowRight') next = (at + 1) % items.length;
      else if (key === 'ArrowLeft') next = (at - 1 + items.length) % items.length;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = items.length - 1;
      else return;
      if (event.preventDefault) event.preventDefault();
      items[at].setAttribute('tabindex', '-1');
      items[next].setAttribute('tabindex', '0');
      if (typeof items[next].focus === 'function') items[next].focus();
    });

    return bar;
  }

  /* ── Section mount points (tickets #59, #61) ────────────────────────── */

  /**
   * Stable hosts for the two sections the desktop tickets render into
   * their own windows: the Action Plan and the Deep-Dive Prompt. The id
   * rides on the host — the results view wrapper while the section is
   * mounted in place, the program frame's BODY once the shell has built
   * that frame (js/shell.js gives the body the same id and marks it with
   * data-results-mount) — so nothing about a mount point is cached and
   * resultsMount() keeps resolving the LIVE element on every call.
   *
   * renderResults() rebuilds everything it renders from scratch, including
   * the in-place language-switch re-render of issue #56: the section
   * subtree is re-MOUNTED (the host is cleared, then the fresh subtree is
   * appended) so an in-place re-render neither duplicates a section nor
   * leaves an orphan of the previous one behind.
   */
  var MOUNT_IDS = {
    'action-plan': 'results-mount-action-plan',
    'deep-dive': 'results-mount-deep-dive'
  };

  /** The current host element for a section mount point, or null when the
   *  results view has not been rendered (or no document is available). */
  function resultsMount(name) {
    var id = MOUNT_IDS[name];
    if (!id) return null;
    if (typeof document === 'undefined' || !document ||
        typeof document.getElementById !== 'function') return null;
    return document.getElementById(id);
  }

  /** The desktop controller the shell wired in (null on a bare page). */
  function desktop() {
    return (app.Windows && app.Windows.controller) || null;
  }

  /**
   * The host a movable section renders into, resolved through the Section
   * Mount Point contract: the program frame's body when the desktop built
   * it (the section then lives in ITS OWN window, not in the Quiz body),
   * or null when there is no window — the flow stages and the headless
   * renders, where the section mounts in place under its own id.
   */
  function programHost(name) {
    var host = resultsMount(name);
    if (!host || typeof host.getAttribute !== 'function') return null;
    return host.getAttribute('data-results-mount') === name ? host : null;
  }

  /**
   * Mount one section subtree: into its program window when that window
   * exists, otherwise in place in the results view. Either way the host
   * carries the mount id, so App.resultsMount(name) resolves the live node
   * right after this returns.
   */
  function mountSection(name, section, view) {
    var host = programHost(name);
    if (host) {
      host.innerHTML = '';
      host.appendChild(section);
      return host;
    }
    section.id = MOUNT_IDS[name];
    view.appendChild(section);
    return section;
  }

  /**
   * The Action Plan window arrives when its content settles — the same
   * rule on the LLM Path and on the Deterministic Fallback, and the same
   * rule when the fallback settles inside the current render. The window
   * manager owns the consequence: cascaded from the focused window, below
   * it in the stacking order, no focus and no raise.
   */
  function actionPlanSettled() {
    var win = desktop();
    if (win && typeof win.actionPlanArrived === 'function') {
      return win.actionPlanArrived();
    }
    return false;
  }

  /**
   * The Deep-Dive Prompt arrives at the Finish Commit, minimized: a
   * taskbar button and nothing else until the Participant opens it.
   */
  function deepDiveCommitted() {
    var win = desktop();
    if (win && typeof win.deepDiveArrived === 'function') {
      return win.deepDiveArrived();
    }
    return false;
  }

  function renderResults(bank, report) {
    var view = document.getElementById('results-view');
    if (!view) return;
    view.innerHTML = '';

    // Cache for review screen
    // A fresh Completion was scored against this Variant; a re-render of
    // the same report (a language swap, #56) keeps the Variant it was
    // scored against so authored prose re-anchors by structural identity.
    if (bank && report && report !== _lastReport) _scoredBank = bank;
    _lastBank = bank;
    _lastReport = report;

    // Issue #56: prose-bearing fields re-anchored to this Bank Variant;
    // every number is the cached report's own, so a language switch can
    // never drift the Overall Percentage or an AST Score.
    var scoringBank = _scoredBank || bank;
    var shown = localizedReport(report, bank, scoringBank);

    // The window menu bar owns the four commands (ticket #65); the body
    // under it is the score header, the Risk Radar and the Blind-Spot Bars.
    view.appendChild(buildMenuBar(shown));

    // Results header panel (ticket #60)
    view.appendChild(buildResultsHeader(shown));

    // Section: Risk Radar
    var radarSection = el('div', { className: 'results-section' });
    radarSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.radarTitle') }));
    var radarWrap = el('div', { className: 'results-radar-wrap' });
    var svg = buildRadar(report);
    radarWrap.appendChild(svg);
    radarSection.appendChild(radarWrap);
    view.appendChild(radarSection);

    // Blind-Spot Bars
    var barsSection = el('div', { className: 'results-section' });
    barsSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.barsTitle') }));
    barsSection.appendChild(buildBars(report));
    view.appendChild(barsSection);

    // Action Plan — mounted on its stable section host. The host is the
    // Action Plan WINDOW's body when the desktop built that frame, and the
    // section no longer renders inside the Quiz window's body (ticket #61).
    // The raw report is the slot identity; the localized prose and the
    // scoring Variant travel with it for the plan's prompt (#56).
    var actionSection = el('div', { className: 'results-section' });
    actionSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.actionPlanTitle') }));
    actionSection.appendChild(buildActionPlan(report, bank, scoringBank));
    mountSection('action-plan', actionSection, view);

    // Deep-Dive Prompt — mounted on its stable section host, which is the
    // Deep-Dive Prompt window's body on the desktop (#61). Its content is
    // built synchronously (the Deterministic Prompt Builder), so the Finish
    // Commit below is also its arrival.
    var ddSection = el('div', { className: 'results-section' });
    ddSection.appendChild(el('h2', { className: 'results-section-title', textContent: t('results.deepDiveTitle') }));
    ddSection.appendChild(buildDeepDive(shown));
    mountSection('deep-dive', ddSection, view);

    // Review and Retake left the body with ticket #65: they are menu-bar
    // commands now, mounted once at the head of the window.

    // Switch views (hide quiz/landing, show results) FIRST: the desktop
    // stage is what the arriving windows stand on, and the Window Manager
    // reads the stage off this DOM on every render (js/windows.js syncView).
    if (app.showView) app.showView('results-view');
    view.hidden = false;

    // The Finish Commit: the desktop comes into being with this render, so
    // this is where the Deep-Dive Prompt window opens — minimized, a
    // taskbar button only (ticket #61). The Action Plan window arrives on
    // its own settle, which is where a Narrative is known to be real.
    deepDiveCommitted();
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
    // Same scoring-Variant bookkeeping as renderResults (#56): only a
    // fresh report moves the anchor; a swap re-renders the same one.
    if (bank && report && report !== _lastReport) _scoredBank = bank;
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
  app.resultsMount     = resultsMount;
  app.resultsMountIds  = MOUNT_IDS;

  /* Ticket #64 seam — js/desktop-store.js brackets the one restore render:
     beginPlanRestore(plans) arms the Record's language → payload map for
     exactly the render inside the bracket, and finishPlanRestore() closes
     it, firing the restore's ONE queued request (if the bracketed render
     found no cached payload for the language it rendered in). Returns true
     when a request was fired — the page never reads that; the tests do. */
  app.beginPlanRestore = function(plans) {
    _planRestoreQueued = null;
    _planRestoreCache = (plans && typeof plans === 'object' &&
      !Array.isArray(plans)) ? plans : {};
  };
  app.finishPlanRestore = function() {
    _planRestoreCache = null;
    var queued = _planRestoreQueued;
    _planRestoreQueued = null;
    if (queued) queued();
    return !!queued;
  };

  /* Test seam (tests/js/test-results-retro.js, fakeEl pattern): the pure
     DOM builders plus the two palette helpers, and #64's Action Plan
     builder — its request/cache behaviour is asserted through it. Not
     used by the page. */
  app.resultsInternals = {
    scoreColor: scoreColor,
    scoreClass: scoreClass,
    headingFont: headingFont,
    buildResultsHeader: buildResultsHeader,
    buildRadar: buildRadar,
    buildBars: buildBars,
    buildReview: buildReview,
    buildDeepDive: buildDeepDive,
    buildDownloadPng: buildDownloadPng,
    buildMenuBar: buildMenuBar,
    buildExportSvg: buildExportSvg,
    exportMetrics: exportMetrics,
    localizedReport: localizedReport,
    buildActionPlan: buildActionPlan
  };

  if (typeof module !== 'undefined') module.exports = app;

})(globalThis);
