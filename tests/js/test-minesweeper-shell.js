exports.name = 'Minesweeper shell integration: menu item, game dialog, surface (ticket #81)';

/**
 * The shell seam (prior art: tests/js/test-shell.js's faked page) — the
 * Minesweeper easter egg is asserted exactly where the About window is:
 * through the built controller's DOM and state methods. The engine behind
 * the surface is the real js/minesweeper.js, injected with a rigged rng at
 * the module seam (App.MinesweeperEngine is stubbed for the loss/win
 * rounds) so mine positions are deterministic.
 */
exports.run = function() {
  var fs = require('fs');
  var path = require('path');
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── fakeEl DOM stub (pattern from test-shell.js) ───────────────────────

  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      textContent: '', type: '', href: '',
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
      insertBefore: function(node, ref) {
        if (!ref) { el.children.push(node); }
        else {
          var i = el.children.indexOf(ref);
          el.children.splice(i < 0 ? el.children.length : i, 0, node);
        }
        node.parentNode = el;
        return node;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;               // disabled buttons don't fire
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; }
    };
    // Unlike the plain test-shell.js stub, className and classList stay in
    // sync here, the way a real element's do: the game surface paints by
    // writing className strings, and the tests read classList.contains.
    Object.defineProperty(el, 'className', {
      get: function() {
        return Object.keys(el.classes).join(' ');
      },
      set: function(v) {
        el.classes = {};
        String(v).split(/\s+/).forEach(function(c) {
          if (c) el.classes[c] = true;
        });
      }
    });
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    return el;
  }

  function fakeDoc() {
    var doc = {
      body: fakeEl('body'),
      createElement: function(tag) { return fakeEl(tag); }
    };
    return doc;
  }

  // ── Modules ─────────────────────────────────────────────────────────────
  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  var I18n = globalThis.App.I18n;
  require('../../js/minesweeper.js');
  require('../../js/minesweeper-ui.js');
  var Shell = require('../../js/shell.js');
  var MinesUI = globalThis.App.MinesweeperUI;

  // ── Fake timers ─────────────────────────────────────────────────────────
  // The shell's 1-second game interval and the long-press timer are
  // injectable so no real clock runs during a suite.
  function fakeTimers() {
    var t = { intervalFns: [], intervalMs: [], cleared: [], timeouts: [], clearedTimeouts: [] };
    t.interval = function(fn, ms) {
      t.intervalFns.push(fn);
      t.intervalMs.push(ms);
      return t.intervalFns.length;          // 1-based id
    };
    t.clearInterval = function(id) { t.cleared.push(id); };
    t.timeout = function(fn, ms) {
      t.timeouts.push({ fn: fn, ms: ms, fired: false,
        fire: function() { this.fired = true; fn(); } });
      return t.timeouts.length;
    };
    t.clearTimeout = function(id) { t.clearedTimeouts.push(id); };
    return t;
  }

  function mount(locale, extra) {
    I18n.use(locale);
    var doc = fakeDoc();
    var appEl = fakeEl('div');
    appEl.setAttribute('id', 'app');
    doc.body.appendChild(appEl);
    var deps = {
      doc: doc,
      appEl: appEl,
      strings: Shell.resolveStrings(I18n, Shell.STRING_IDS)
    };
    var timers = null;
    if (extra && extra.timers) { timers = extra.timers; deps.minesTimers = timers; }
    var ctl = Shell.build(deps);
    return { doc: doc, appEl: appEl, ctl: ctl, timers: timers };
  }

  /* ── Chrome Strings (ticket #81, ADR 0015): every label resolves from
     both dictionaries; a missing id throws, so mere resolution is the test */

  var MINES_IDS = ['mines.menuItem', 'mines.windowTitle', 'mines.counterLabel',
    'mines.timerLabel', 'mines.boardLabel', 'mines.boardHint', 'mines.smileyRestart'];

  check('every mines.* Chrome String resolves in the en dictionary',
    (function() {
      I18n.use('en');
      try {
        return MINES_IDS.every(function(id) {
          return typeof I18n.t(id) === 'string' && I18n.t(id).length > 0;
        });
      } catch (e) { return false; }
    })());

  check('every mines.* Chrome String resolves in the zh dictionary',
    (function() {
      I18n.use('zh');
      try {
        return MINES_IDS.every(function(id) {
          return typeof I18n.t(id) === 'string' && I18n.t(id).length > 0;
        });
      } catch (e) { return false; }
    })());

  check('the menu item and window title are the era names (en/zh)',
    (function() {
      I18n.use('en');
      var en = I18n.t('mines.menuItem') + '|' + I18n.t('mines.windowTitle');
      I18n.use('zh');
      var zh = I18n.t('mines.menuItem') + '|' + I18n.t('mines.windowTitle');
      return en === 'Minesweeper…|Minesweeper' && zh === '扫雷……|扫雷';
    })( ), I18n.t('mines.menuItem'));

  /* ── Start menu: the plain item between About and Quit ────────────────── */

  var en = mount('en');
  var zh = mount('zh');

  function menuTags(ctl) {
    return ctl.menu.children.map(function(c) {
      return c.getAttribute('data-os-menu') || c.textContent;
    });
  }

  check('the Start menu reads About, Minesweeper, Quit in that order (en)',
    menuTags(en.ctl).join(',') === 'about,mines,quit' &&
    en.ctl.menu.children.length === 3,
    menuTags(en.ctl).join(','));

  check('the Start menu reads About, Minesweeper, Quit in that order (zh)',
    menuTags(zh.ctl).join(',') === 'about,mines,quit' &&
    zh.ctl.menu.children.length === 3,
    menuTags(zh.ctl).join(','));

  check('the Minesweeper item is a menuitem button with the Chrome String label (en)',
    (function() {
      I18n.use('en');
      var item = en.ctl.minesItem;
      return item.tagName === 'BUTTON' && item.type === 'button' &&
        item.getAttribute('role') === 'menuitem' &&
        item.getAttribute('data-os-menu') === 'mines' &&
        item.textContent === I18n.t('mines.menuItem');
    })(), en.ctl.minesItem.textContent);

  check('the Minesweeper item resolves its zh label',
    zh.ctl.minesItem.textContent === '扫雷……', zh.ctl.minesItem.textContent);

  check('refreshLang re-resolves the Minesweeper item in place',
    (function() {
      I18n.use('zh');
      en.ctl.refreshLang();
      var ok = en.ctl.minesItem.textContent === '扫雷……';
      I18n.use('en');
      en.ctl.refreshLang();
      return ok && en.ctl.minesItem.textContent === 'Minesweeper…';
    })(), en.ctl.minesItem.textContent);

  /* ── The game dialog: About-window pattern ─────────────────────────────── */

  check('the game dialog starts closed',
    !en.ctl.isMinesOpen() &&
    !en.ctl.minesBackdrop.classList.contains('open'));

  en.ctl.openMenu();
  en.ctl.minesItem.click();
  check('activating the menu item closes the menu and opens the game dialog',
    !en.ctl.isMenuOpen() && en.ctl.isMinesOpen() &&
    en.ctl.minesBackdrop.classList.contains('open'));

  check('the game dialog is a modal dialog over its own backdrop',
    en.ctl.minesEl.getAttribute('role') === 'dialog' &&
    en.ctl.minesEl.getAttribute('aria-modal') === 'true' &&
    en.ctl.minesEl.getAttribute('aria-labelledby') === 'os-mines-title' &&
    en.ctl.minesBackdrop.children.indexOf(en.ctl.minesEl) === 0);

  check('the game dialog title is the Chrome String (en/zh)',
    en.ctl.minesTitle.textContent === 'Minesweeper' &&
    zh.ctl.minesTitle.textContent === '扫雷',
    en.ctl.minesTitle.textContent + '/' + zh.ctl.minesTitle.textContent);

  check('the title bar close control is a live, named button',
    en.ctl.minesCloseBtn.tagName === 'BUTTON' &&
    en.ctl.minesCloseBtn.getAttribute('aria-label') === 'Close' &&
    en.ctl.minesCloseBtn.getAttribute('data-os-button') === 'close' &&
    en.ctl.minesCloseBtn.disabled === false &&
    typeof en.ctl.minesCloseBtn.innerHTML === 'string' &&
    en.ctl.minesCloseBtn.innerHTML.indexOf('<svg') === 0);

  en.ctl.minesCloseBtn.click();
  check('the close control dismisses the game dialog',
    !en.ctl.isMinesOpen() && !en.ctl.minesBackdrop.classList.contains('open'));

  check('the game dialog enters the body after the About backdrop (paints above it)',
    en.doc.body.children.indexOf(en.ctl.minesBackdrop) >
      en.doc.body.children.indexOf(en.ctl.aboutBackdrop));

  // Escape tier: the game owns Escape above About.
  en.ctl.openMines();
  en.ctl.openAbout();
  en.ctl.handleKeydown('Escape');
  check('with the game and About both open, Escape closes the GAME, not About',
    !en.ctl.isMinesOpen() && en.ctl.isAboutOpen());
  en.ctl.handleKeydown('Escape');
  check('with only About left, Escape closes About',
    !en.ctl.isAboutOpen() && !en.ctl.isMinesOpen());

  en.ctl.openMines();
  en.ctl.handleKeydown('Escape');
  check('Escape dismisses the game dialog when it is the only surface open',
    !en.ctl.isMinesOpen());
  en.ctl.handleKeydown('Escape');
  check('a second Escape falls through to the tiers below (menu closes, window tier untouched)',
    (function() {
      en.ctl.openMenu();
      en.ctl.handleKeydown('Escape');
      return !en.ctl.isMenuOpen();
    })());

  check('the keydown report carries the mines tier',
    (function() {
      en.ctl.openMines();
      var state = en.ctl.handleKeydown('Enter');
      var ok = state.mines === true;
      en.ctl.closeMines();
      return ok;
    })());

  check('refreshLang re-resolves the open game dialog title',
    (function() {
      en.ctl.openMines();
      I18n.use('zh');
      en.ctl.refreshLang();
      var ok = en.ctl.minesTitle.textContent === '扫雷';
      I18n.use('en');
      en.ctl.refreshLang();
      return ok && en.ctl.minesTitle.textContent === 'Minesweeper';
    })());

  check('opening the game disturbs neither the About window nor the program frames',
    (function() {
      var probe = mount('en');
      probe.ctl.openAbout();
      // Snapshot every body child's class EXCEPT the game backdrop's own —
      // opening the game toggles .open on its backdrop and nothing else.
      function snapshot() {
        return JSON.stringify(probe.doc.body.children.map(function(c) {
          return c === probe.ctl.minesBackdrop ? '(game)' : c.className;
        }));
      }
      var before = snapshot();
      probe.ctl.openMines();
      return probe.ctl.isAboutOpen() && snapshot() === before &&
        probe.doc.body.children[probe.doc.body.children.length - 1] === probe.ctl.minesBackdrop;
    })());

  check('destroy() removes the game backdrop',
    (function() {
      var probe = mount('en');
      probe.ctl.openMines();
      probe.ctl.destroy();
      return probe.doc.body.children.indexOf(probe.ctl.minesBackdrop) === -1;
    })());

  /* ── The game surface: the board reflects the engine ────────────────────
     The engine is the REAL js/minesweeper.js, injected with a rigged rng at
     the module seam so the ten mines land on known cells: row 0 even
     columns plus row 2 even columns (indices 0,2,4,6,8,20,22,24,26,28).
     Each placement draws exactly (idx + 0.5) / 81, and the first-click
     safety zone around (4,4) never covers those indices. The row-2 mine
     line matters: the opening flood from (4,4) stops above it, so row 0–1
     safe cells stay UNREVEALED for the wrong-flag and loss rounds. */

  var RealEngine = globalThis.App.MinesweeperEngine;
  var MINE_CELLS = [0, 2, 4, 6, 8, 18, 20, 22, 24, 26];

  function useRiggedEngine(mineIndices) {
    var seq = mineIndices.map(function(idx) { return (idx + 0.5) / 81; });
    var i = 0;
    globalThis.App.MinesweeperEngine = {
      create: function() {
        return RealEngine.create({ rng: function() {
          return i < seq.length ? seq[i++] : 0.999;
        }});
      }
    };
  }

  function cellAt(g, x, y) { return g.ctl.minesSurface.cellEls[y * 9 + x]; }

  function mountGame(locale, mineIndices) {
    var prev = globalThis.App.MinesweeperEngine;
    useRiggedEngine(mineIndices || MINE_CELLS);
    var timers = fakeTimers();
    var g = mount(locale, { timers: timers });
    g.ctl.openMines();
    globalThis.App.MinesweeperEngine = prev;   // the surface holds its engine
    return g;
  }

  function flagged(g, x, y) {
    cellAt(g, x, y).handlers.contextmenu({ preventDefault: function() {} });
  }

  check('a fresh open presents a fresh board: 010 mines, zeroed timer, smiling, all covered',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      var allCovered = s.cellEls.every(function(c) {
        return c.className === 'ms-cell' && c.innerHTML === '';
      });
      return s.counterEl.textContent === '010' && s.timerEl.textContent === '000' &&
        s.smileyEl.getAttribute('data-face') === 'smile' &&
        s.cellEls.length === 81 && allCovered;
    })());

  check('the surface carries accessible names from the dictionaries (en)',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      return s.counterEl.getAttribute('aria-label') === 'Mines remaining' &&
        s.timerEl.getAttribute('aria-label') === 'Timer' &&
        s.boardEl.getAttribute('role') === 'grid' &&
        s.boardEl.getAttribute('aria-label') === 'Minefield' &&
        s.boardEl.getAttribute('aria-description') ===
          'Click to reveal a square. Right-click or long-press to flag one.' &&
        s.smileyEl.getAttribute('aria-label') === 'New game';
    })());

  check('the surface carries accessible names from the dictionaries (zh) and refreshLang re-resolves them',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      I18n.use('zh');
      g.ctl.refreshLang();
      var zh = s.counterEl.getAttribute('aria-label') === '剩余雷数' &&
        s.boardEl.getAttribute('aria-label') === '雷区' &&
        s.smileyEl.getAttribute('aria-label') === '新开一局';
      I18n.use('en');
      g.ctl.refreshLang();
      return zh && s.counterEl.getAttribute('aria-label') === 'Mines remaining';
    })());

  check('the board is a grid of located cells: rows, gridcells, data-x/data-y',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      var rows = s.boardEl.children;
      if (rows.length !== 9) return false;
      return rows.every(function(row, ry) {
        return row.getAttribute('role') === 'row' && row.children.length === 9 &&
          row.children.every(function(cell, rx) {
            return cell.getAttribute('role') === 'gridcell' &&
              cell.getAttribute('data-x') === String(rx) &&
              cell.getAttribute('data-y') === String(ry);
          });
      });
    })());

  check('the LED mine counter reads mines minus flags, negative included',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      flagged(g, 8, 8);                       // 10 − 1
      var one = s.counterEl.textContent === '009';
      for (var i = 0; i < 11; i++) flagged(g, i % 9, 6 + Math.floor(i / 9));
      var minus = s.counterEl.textContent;    // 10 − 12
      flagged(g, 8, 8);                       // unflag: 10 − 11
      var back = s.counterEl.textContent;
      return one && minus === '-02' && back === '-01';
    })(), (function() {
      var g = mountGame('en');
      for (var i = 0; i < 12; i++) flagged(g, i % 9, 6 + Math.floor(i / 9));
      return g.ctl.minesSurface.counterEl.textContent;
    })());

  check('right-click flags through a guarded contextmenu (the browser menu is refused)',
    (function() {
      var g = mountGame('en');
      var prevented = 0;
      cellAt(g, 4, 7).handlers.contextmenu({ preventDefault: function() { prevented++; } });
      return prevented === 1 && cellAt(g, 4, 7).classList.contains('is-flagged');
    })());

  check('the first reveal starts the shell 1-second interval and the timer counts',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      cellAt(g, 4, 4).click();
      var started = g.timers.intervalFns.length === 1 &&
        g.timers.intervalMs[0] === MinesUI.TICK_MS;
      g.timers.intervalFns[0]();
      var one = s.timerEl.textContent === '001';
      g.timers.intervalFns[0]();
      return started && one && s.timerEl.textContent === '002' &&
        s.engine().elapsed() === 2;
    })());

  check('a fresh board runs no clock — the timer starts on the FIRST reveal',
    (function() {
      var g = mountGame('en');
      return g.timers.intervalFns.length === 0;
    })());

  check('the first reveal floods the connected region and the board paints it',
    (function() {
      var g = mountGame('en');
      cellAt(g, 4, 4).click();
      var s = g.ctl.minesSurface;
      var revealed = s.cellEls.filter(function(c) {
        return c.classList.contains('is-revealed');
      }).length;
      // First-click safety: the engine is playing and (4,4) was not a mine.
      return s.engine().status() === 'playing' && revealed > 40 &&
        cellAt(g, 4, 4).classList.contains('is-revealed');
    })());

  check('revealed numbers wear their classic class (ms-n1…ms-n8)',
    (function() {
      var g = mountGame('en');
      cellAt(g, 4, 4).click();
      // With mines on rows 0 and 2 (even columns), the cell at (0,3)
      // neighbors exactly one mine — (0,2) — and borders the zero at
      // (0,4), so the flood reveals it as a 1.
      return cellAt(g, 0, 3).classList.contains('is-revealed') &&
        cellAt(g, 0, 3).classList.contains('ms-n1') &&
        cellAt(g, 0, 3).innerHTML === '1';
    })());

  check('revealing the last safe cell wins: sunglasses, frozen clock',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      cellAt(g, 4, 4).click();
      for (var i = 0; i < 81; i++) {
        if (MINE_CELLS.indexOf(i) === -1) s.cellEls[i].click();
      }
      return s.engine().status() === 'won' &&
        s.smileyEl.getAttribute('data-face') === 'won' &&
        s.smileyEl.innerHTML.indexOf('data-ms-face="won"') !== -1 &&
        g.timers.cleared.indexOf(1) !== -1;
    })());

  check('a loss shows every mine, marks the detonated cell and crosses wrong flags',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      flagged(g, 1, 0);                 // a wrong flag, before mines exist
      cellAt(g, 4, 4).click();          // safe opening; the flag stops the
                                        // flood short of row 0 — still playing
      cellAt(g, 0, 0).click();          // a mine: lost
      var detonated = cellAt(g, 0, 0).classList;
      var otherMine = cellAt(g, 2, 0).classList;
      var wrong = cellAt(g, 1, 0).classList;
      return s.engine().status() === 'lost' &&
        s.smileyEl.getAttribute('data-face') === 'lost' &&
        detonated.contains('is-mine') && detonated.contains('is-detonated') &&
        otherMine.contains('is-mine') && !otherMine.contains('is-revealed') &&
        wrong.contains('is-flagged') && wrong.contains('is-wrong') &&
        s.counterEl.textContent === '009' &&
        g.timers.cleared.indexOf(1) !== -1;
    })());

  check('holding a cell wears the pressed face; letting go returns it',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      var cell = cellAt(g, 8, 8);
      cell.handlers.pointerdown({ pointerType: 'mouse', preventDefault: function() {} });
      var held = s.smileyEl.getAttribute('data-face') === 'pressed';
      cell.handlers.pointerup({ pointerType: 'mouse' });
      return held && s.smileyEl.getAttribute('data-face') === 'smile';
    })());

  check('a touch long-press flags the cell and swallows the tap that follows',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      var cell = cellAt(g, 8, 8);
      cell.handlers.pointerdown({ pointerType: 'touch', preventDefault: function() {} });
      var scheduled = g.timers.timeouts.length === 1 &&
        g.timers.timeouts[0].ms === MinesUI.LONG_PRESS_MS;
      g.timers.timeouts[0].fire();
      var flaggedNow = cell.classList.contains('is-flagged') &&
        s.counterEl.textContent === '009';
      cell.click();                     // the synthetic tap after the hold
      return scheduled && flaggedNow &&
        !cell.classList.contains('is-revealed');
    })());

  check('a touch tap reveals: the long-press is cancelled on pointerup',
    (function() {
      var g = mountGame('en');
      var cell = cellAt(g, 8, 8);
      cell.handlers.pointerdown({ pointerType: 'touch', preventDefault: function() {} });
      cell.handlers.pointerup({ pointerType: 'touch' });
      cell.click();
      return g.timers.clearedTimeouts.length === 1 &&
        cell.classList.contains('is-revealed');
    })());

  check('moving the pointer cancels the long-press without flagging',
    (function() {
      var g = mountGame('en');
      var cell = cellAt(g, 8, 8);
      cell.handlers.pointerdown({ pointerType: 'touch', preventDefault: function() {} });
      cell.handlers.pointermove({ pointerType: 'touch' });
      return g.timers.clearedTimeouts.length === 1 &&
        !cell.classList.contains('is-flagged');
    })());

  check('the smiley doubles as the restart button: a fresh board in place',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      cellAt(g, 4, 4).click();
      g.timers.intervalFns[0]();
      g.timers.intervalFns[0]();
      s.smileyEl.click();
      var covered = s.cellEls.every(function(c) {
        return c.className === 'ms-cell';
      });
      return s.engine().status() === 'ready' &&
        s.counterEl.textContent === '010' && s.timerEl.textContent === '000' &&
        s.smileyEl.getAttribute('data-face') === 'smile' &&
        covered && g.timers.intervalFns.length === 1;   // no second clock
    })());

  check('closing the dialog discards the game: the reopen is a fresh board',
    (function() {
      var g = mountGame('en');
      var s = g.ctl.minesSurface;
      cellAt(g, 4, 4).click();
      g.timers.intervalFns[0]();
      g.ctl.closeMines();
      g.ctl.openMines();
      return g.ctl.isMinesOpen() &&
        s.counterEl.textContent === '010' && s.timerEl.textContent === '000' &&
        s.engine().status() === 'ready' &&
        s.smileyEl.getAttribute('data-face') === 'smile' &&
        s.cellEls.every(function(c) { return c.className === 'ms-cell'; });
    })());

  check('a game that never started holds no clock after close, either',
    (function() {
      var g = mountGame('en');
      g.ctl.closeMines();
      return g.timers.cleared.length === 0 && g.timers.intervalFns.length === 0;
    })());

  return results;
};
