(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Minesweeper game surface (ticket #81, spec #79) — the DOM half of the
   * easter egg, built and owned by the shell's game dialog the way the
   * About window is. It renders FROM the engine (js/minesweeper.js) and
   * never keeps game state of its own: every paint() reads the engine's
   * public queries, so the surface cannot drift from the rules the engine
   * tests pin.
   *
   * The shell drives time on the surface's behalf: the engine owns no
   * clock, so this module owns the 1-second interval that calls tick()
   * (started on the first reveal, stopped on win or loss, cleared when the
   * dialog closes or the board restarts). The interval and the long-press
   * timer are injectable (opts.timers) so tests and headless runs never
   * touch a real clock.
   *
   * Input (spec stories 8–9, 12): left-click reveals, right-click toggles
   * a flag (the contextmenu default is guarded), a touch long-press flags
   * and a tap reveals. The long-press suppresses the click that follows
   * it, so a flag is never revealed. While a cell is held the smiley wears
   * its pressed face (story 12); the smiley doubles as the restart button
   * (story 13).
   *
   * No display text is hardcoded: every label resolves from the mines.*
   * Chrome Strings through App.I18n (refresh() re-resolves after a Locale
   * Swap, exactly like the shell's refreshLang). Glyphs — flag, mine and
   * the four faces — are drawn inline SVG, currentColor/flat fills, so no
   * new codepoint enters either dictionary and the CJK subset stays put.
   */

  /** Touch long-press duration (ms) before a press becomes a flag. */
  var LONG_PRESS_MS = 500;
  /** The shell's game-clock period (ms): one engine tick per second. */
  var TICK_MS = 1000;

  var COLS = 9;
  var ROWS = 9;

  /** Classic per-number palette: 1 blue … 8 gray (css/shell.css .ms-n1…). */
  var NUMBER_CLASSES = ['ms-n1', 'ms-n2', 'ms-n3', 'ms-n4',
                        'ms-n5', 'ms-n6', 'ms-n7', 'ms-n8'];

  /**
   * Drawn glyphs (ADR 0001: no image assets, no extra fonts). Geometry is
   * the era's: a 16×16 face, a 10×10 cell glyph. Each face carries its
   * state in the markup so a test can tell them apart without reading
   * pixels.
   */
  var GLYPHS = {
    flag:
      '<svg class="ms-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
      '<path d="M3 1V9" stroke="currentColor"/>' +
      '<path d="M3 1L8 3.5L3 6Z" fill="#FF0000"/></svg>',
    mine:
      '<svg class="ms-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
      '<circle cx="5" cy="5" r="3" fill="currentColor"/>' +
      '<path d="M5 0.5V2M5 8V9.5M0.5 5H2M8 5H9.5M2 2L3 3M8 2L7 3M2 8L3 7M8 8L7 7" ' +
      'stroke="currentColor"/></svg>',
    smile:
      '<svg class="ms-glyph ms-face" data-ms-face="smile" width="16" height="16" ' +
      'viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="7" fill="#FFFF00" stroke="currentColor"/>' +
      '<circle cx="5.5" cy="6" r="0.9" fill="currentColor"/>' +
      '<circle cx="10.5" cy="6" r="0.9" fill="currentColor"/>' +
      '<path d="M5 10c1 1.2 5 1.2 6 0" fill="none" stroke="currentColor"/></svg>',
    pressed:
      '<svg class="ms-glyph ms-face" data-ms-face="pressed" width="16" height="16" ' +
      'viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="7" fill="#FFFF00" stroke="currentColor"/>' +
      '<circle cx="5.5" cy="6" r="0.9" fill="currentColor"/>' +
      '<circle cx="10.5" cy="6" r="0.9" fill="currentColor"/>' +
      '<circle cx="8" cy="10.5" r="1.4" fill="none" stroke="currentColor"/></svg>',
    lost:
      '<svg class="ms-glyph ms-face" data-ms-face="lost" width="16" height="16" ' +
      'viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="7" fill="#FFFF00" stroke="currentColor"/>' +
      '<path d="M4.5 4.5L6.5 6.5M6.5 4.5L4.5 6.5M9.5 4.5L11.5 6.5M11.5 4.5L9.5 6.5" ' +
      'stroke="currentColor"/>' +
      '<path d="M5 11.5c1-1.2 5-1.2 6 0" fill="none" stroke="currentColor"/></svg>',
    won:
      '<svg class="ms-glyph ms-face" data-ms-face="won" width="16" height="16" ' +
      'viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="7" fill="#FFFF00" stroke="currentColor"/>' +
      '<path d="M2.5 5.5H13.5V7.5H11L10 6.5H6L5 7.5H2.5Z" fill="currentColor"/>' +
      '<path d="M5 10.5c1 1.2 5 1.2 6 0" fill="none" stroke="currentColor"/></svg>'
  };

  /**
   * The 3-digit LED: classic left-padded decimal; the mine counter may go
   * NEGATIVE (mines − flags), which the era's LED showed as a minus sign
   * in the first digit position — "-09" — clamped at −99. Anything past
   * 999 saturates instead of growing a fourth digit.
   */
  function led3(n) {
    var neg = n < 0;
    var a = Math.abs(n);
    if (neg && a > 99) a = 99;
    if (a > 999) a = 999;
    var s = String(a);
    while (s.length < 3) s = '0' + s;
    return neg ? '-' + s.slice(1) : s;
  }

  /**
   * Build the game surface into `opts.bodyEl` (the game dialog's body).
   *   opts.doc      - document or fakeEl document
   *   opts.bodyEl   - the dialog body the panel and board mount into
   *   opts.timers   - optional { interval, clearInterval, timeout,
   *                   clearTimeout }; defaults to the globals
   */
  function createSurface(opts) {
    var doc = opts.doc;
    var bodyEl = opts.bodyEl;
    var timers = opts.timers || {};
    var intervalFn = timers.interval ||
      (typeof setInterval === 'function' ? setInterval : null);
    var clearIntervalFn = timers.clearInterval ||
      (typeof clearInterval === 'function' ? clearInterval : null);
    var timeoutFn = timers.timeout ||
      (typeof setTimeout === 'function' ? setTimeout : null);
    var clearTimeoutFn = timers.clearTimeout ||
      (typeof clearTimeout === 'function' ? clearTimeout : null);

    var engine = app.MinesweeperEngine.create();
    var timerId = null;
    var longPress = null;      // { id, x, y }
    var suppressClick = false; // the click that follows a long-press flag

    // ── DOM ──────────────────────────────────────────────────────────────
    var panel = doc.createElement('div');
    panel.className = 'ms-panel';

    var counterEl = doc.createElement('div');
    counterEl.className = 'ms-led ms-counter';

    var smileyEl = doc.createElement('button');
    smileyEl.type = 'button';
    smileyEl.className = 'ms-smiley';

    var timerEl = doc.createElement('div');
    timerEl.className = 'ms-led ms-timer';

    panel.appendChild(counterEl);
    panel.appendChild(smileyEl);
    panel.appendChild(timerEl);

    var boardEl = doc.createElement('div');
    boardEl.className = 'ms-board';
    boardEl.setAttribute('role', 'grid');

    var cellEls = [];
    for (var y = 0; y < ROWS; y++) {
      var rowEl = doc.createElement('div');
      rowEl.className = 'ms-row';
      rowEl.setAttribute('role', 'row');
      for (var x = 0; x < COLS; x++) {
        var cell = doc.createElement('div');
        cell.className = 'ms-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('data-x', String(x));
        cell.setAttribute('data-y', String(y));
        rowEl.appendChild(cell);
        cellEls.push(cell);
        wireCell(cell, x, y);
      }
      boardEl.appendChild(rowEl);
    }

    bodyEl.appendChild(panel);
    bodyEl.appendChild(boardEl);

    // ── Labels (Chrome Strings; refresh() re-resolves after a swap) ─────
    function label(id) {
      var I18n = app.I18n;
      return I18n ? I18n.t(id) : id;
    }

    function paintLabels() {
      counterEl.setAttribute('aria-label', label('mines.counterLabel'));
      timerEl.setAttribute('aria-label', label('mines.timerLabel'));
      boardEl.setAttribute('aria-label', label('mines.boardLabel'));
      boardEl.setAttribute('aria-description', label('mines.boardHint'));
      smileyEl.setAttribute('aria-label', label('mines.smileyRestart'));
    }
    paintLabels();

    // ── Painting ─────────────────────────────────────────────────────────
    function paintLEDs() {
      counterEl.textContent = led3(engine.mineCount());
      timerEl.textContent = led3(engine.elapsed());
    }

    function paintFace() {
      var status = engine.status();
      var face = status === 'won' ? GLYPHS.won
        : status === 'lost' ? GLYPHS.lost
        : GLYPHS.smile;
      // A held covered cell wears the pressed face whether the clock has
      // started (playing) or not (ready) — the board feels alive from the
      // very first press.
      if (pressedCell && status !== 'won' && status !== 'lost') {
        face = GLYPHS.pressed;
      }
      if (smileyEl.getAttribute('data-face') !== faceName(face)) {
        smileyEl.innerHTML = face;
      }
      smileyEl.setAttribute('data-face', faceName(face));
    }

    function faceName(svg) {
      var m = /data-ms-face="(\w+)"/.exec(svg);
      return m ? m[1] : 'smile';
    }

    function paintCell(x, y) {
      var el = cellEls[y * COLS + x];
      var c = engine.cell(x, y);
      var lost = engine.status() === 'lost';
      var cls = 'ms-cell';
      var content = '';
      if (c.revealed) {
        cls += ' is-revealed';
        if (c.mine) {
          cls += ' is-mine';
          if (engine.detonated() && engine.detonated()[0] === x &&
              engine.detonated()[1] === y) {
            cls += ' is-detonated';
          }
          content = GLYPHS.mine;
        } else if (c.adjacent > 0) {
          cls += ' ' + NUMBER_CLASSES[c.adjacent - 1];
          content = String(c.adjacent);
        }
      } else if (c.flagged) {
        cls += ' is-flagged';
        if (lost && !c.mine) cls += ' is-wrong';
        content = GLYPHS.flag;
      } else if (lost && c.mine) {
        // Loss shows EVERY mine, revealed or not (spec story 14).
        cls += ' is-mine';
        content = GLYPHS.mine;
      }
      el.className = cls;
      el.innerHTML = content;
    }

    function paint() {
      paintLEDs();
      paintFace();
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) paintCell(x, y);
      }
    }

    // ── The shell's game clock ───────────────────────────────────────────
    function startTimer() {
      if (timerId !== null || !intervalFn) return;
      timerId = intervalFn(function() {
        engine.tick();
        paintLEDs();
      }, TICK_MS);
    }

    function stopTimer() {
      if (timerId === null) return;
      if (clearIntervalFn) clearIntervalFn(timerId);
      timerId = null;
    }

    function syncClock() {
      var status = engine.status();
      if (status === 'playing') startTimer();
      else stopTimer();                 // won or lost: the LED freezes
    }

    // ── Input ────────────────────────────────────────────────────────────
    var pressedCell = null;

    function clearLongPress() {
      if (longPress && clearTimeoutFn) clearTimeoutFn(longPress.id);
      longPress = null;
    }

    function releaseFace() {
      if (pressedCell) {
        pressedCell = null;
        paintFace();
      }
    }

    function toggleFlagAt(x, y) {
      if (engine.status() === 'won' || engine.status() === 'lost') return;
      engine.toggleFlag(x, y);
      paint();
    }

    function wireCell(cell, x, y) {
      cell.addEventListener('click', function() {
        if (suppressClick) {          // the tap after a long-press flag
          suppressClick = false;
          return;
        }
        if (engine.status() === 'won' || engine.status() === 'lost') return;
        engine.reveal(x, y);
        syncClock();
        paint();
      });
      cell.addEventListener('contextmenu', function(ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        toggleFlagAt(x, y);
      });
      cell.addEventListener('pointerdown', function(ev) {
        var type = ev && ev.pointerType;
        if (engine.status() === 'won' || engine.status() === 'lost') return;
        if (engine.cell(x, y).revealed) return;
        pressedCell = cell;
        paintFace();
        if (type === 'touch' && timeoutFn && !longPress) {
          var id = timeoutFn(function() {
            longPress = null;
            suppressClick = true;
            toggleFlagAt(x, y);
          }, LONG_PRESS_MS);
          longPress = { id: id, x: x, y: y };
        }
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      });
      ['pointerup', 'pointermove', 'pointercancel'].forEach(function(evt) {
        cell.addEventListener(evt, function() {
          clearLongPress();
          releaseFace();
        });
      });
    }

    function wireSmiley() {
      smileyEl.addEventListener('click', function() {
        restart();
      });
    }

    // ── Lifecycle ────────────────────────────────────────────────────────
    /** A fresh board from any state: the smiley's restart and the
     *  discard-on-close rule both land here (the engine resets in place,
     *  so the shell's reference stays valid). */
    function restart() {
      stopTimer();
      clearLongPress();
      pressedCell = null;
      suppressClick = false;
      engine.restart();
      paint();
    }

    /** Re-resolve every label after an in-place language switch. */
    function refresh() {
      paintLabels();
    }

    /** Stop the clock and release handlers' transient state (close). */
    function destroy() {
      stopTimer();
      clearLongPress();
    }

    wireSmiley();
    paint();

    return {
      paint: paint,
      refresh: refresh,
      restart: restart,
      destroy: destroy,
      counterEl: counterEl,
      timerEl: timerEl,
      boardEl: boardEl,
      smileyEl: smileyEl,
      cellEls: cellEls,
      engine: function() { return engine; }
    };
  }

  var MinesweeperUI = {
    create: createSurface,
    LONG_PRESS_MS: LONG_PRESS_MS,
    TICK_MS: TICK_MS,
    GLYPHS: GLYPHS,
    led3: led3
  };

  app.MinesweeperUI = MinesweeperUI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
