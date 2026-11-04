exports.name = 'Minesweeper engine: DOM-free game state (ticket #80)';

/**
 * Pure-core tests for js/minesweeper.js: the board rules and lifecycle are
 * driven DIRECTLY (no DOM, no timers, no storage), the way
 * tests/js/test-desktop-core.js drives the Desktop Core. Only external
 * behavior is asserted — never internal representation.
 */
exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var Mines = require('../../js/minesweeper.js').MinesweeperEngine;

  /* ── Exposure and the fixed board ─────────────────────────────────── */

  check('the engine is exposed on the App.* seam with a create() factory',
    Mines && typeof Mines.create === 'function',
    Object.keys(Mines || {}).join(','));
  check('the board is the fixed Beginner layout: 9 columns, 9 rows, 10 mines',
    Mines.COLS === 9 && Mines.ROWS === 9 && Mines.MINES === 10,
    Mines.COLS + 'x' + Mines.ROWS + ',' + Mines.MINES);

  var e = Mines.create();
  check('a fresh board is ready, not playing, with zero elapsed seconds',
    e.status() === 'ready' && e.elapsed() === 0);
  check('every cell of the fresh board is unrevealed and unflagged',
    (function() {
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          var c = e.cell(x, y);
          if (!c || c.revealed || c.flagged) return false;
        }
      }
      return true;
    })());
  check('cells outside the board do not exist',
    e.cell(9, 0) === null && e.cell(0, 9) === null && e.cell(-1, 4) === null);
  check('the fresh counter reads mines minus zero flags',
    e.mineCount() === Mines.MINES);

  /* ── First-click safety (spec user story 4) ────────────────────────── */

  check('the first reveal of a fresh board is never a mine, over many fresh boards and every opening cell',
    (function() {
      for (var trial = 0; trial < 200; trial++) {
        for (var fy = 0; fy < Mines.ROWS; fy++) {
          for (var fx = 0; fx < Mines.COLS; fx++) {
            var g = Mines.create();
            g.reveal(fx, fy);
            if (g.status() === 'lost') return 'lost on opening ' + fx + ',' + fy;
            if (g.cell(fx, fy).mine) return 'opening cell ' + fx + ',' + fy + ' is a mine';
            if (!g.cell(fx, fy).revealed) return 'opening cell ' + fx + ',' + fy + ' not revealed';
          }
        }
      }
      return true;
    })());
  check('the board always ends up carrying exactly MINES mines after the first reveal',
    (function() {
      for (var trial = 0; trial < 50; trial++) {
        var g = Mines.create();
        g.reveal(4, 4);
        var found = 0;
        for (var y = 0; y < Mines.ROWS; y++) {
          for (var x = 0; x < Mines.COLS; x++) {
            if (g.cell(x, y).mine) found++;
          }
        }
        if (found !== Mines.MINES) return 'trial ' + trial + ' placed ' + found;
      }
      return true;
    })());
  check('the first reveal starts the game: ready becomes playing',
    (function() {
      var g = Mines.create();
      g.reveal(0, 0);
      return g.status() === 'playing';
    })());

  /* ── Reveal semantics ──────────────────────────────────────────────── */

  // A small seeded LCG so every run of the suite sees the same boards —
  // the engine still gets its rng injected; the tests only use it to pick
  // reproducible boards, never to predict internal placement.
  function lcg(seed) {
    var s = seed >>> 0;
    return function() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Find a seed whose opening reveal at the center lands on a zero cell,
  // so the flood rule can be exercised. Returns { engine, seed } or null.
  function zeroOpening() {
    for (var seed = 1; seed < 500; seed++) {
      var g = Mines.create({ rng: lcg(seed) });
      g.reveal(4, 4);
      if (g.cell(4, 4).adjacent === 0) return { engine: g, seed: seed };
    }
    return null;
  }

  // The expected flood region, computed INDEPENDENTLY from the public
  // per-cell data and the stated rule: zero-neighbor cells connect in all
  // eight directions; the region is the connected zero cells plus every
  // numbered cell bordering one.
  function expectedFloodFrom(g, sx, sy) {
    var region = {};
    var queue = [[sx, sy]];
    region[sy * Mines.COLS + sx] = true;
    var seenZero = {};
    seenZero[sy * Mines.COLS + sx] = true;
    while (queue.length) {
      var at = queue.shift();
      var ax = at[0], ay = at[1];
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = ax + dx, ny = ay + dy;
          if (nx < 0 || ny < 0 || nx >= Mines.COLS || ny >= Mines.ROWS) continue;
          var idx = ny * Mines.COLS + nx;
          region[idx] = true;
          if (g.cell(nx, ny).adjacent === 0 && !seenZero[idx]) {
            seenZero[idx] = true;
            queue.push([nx, ny]);
          }
        }
      }
    }
    return region;
  }

  // Drive a board to a win by revealing every non-mine cell (the public
  // rule itself). The first reveal is the center; returns the engine.
  function winGame() {
    var g = Mines.create({ rng: lcg(7) });
    g.reveal(4, 4);
    var guard = Mines.COLS * Mines.ROWS;
    while (g.status() === 'playing' && guard-- > 0) {
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          var c = g.cell(x, y);
          if (!c.revealed && !c.mine) {
            g.reveal(x, y);
            y = Mines.ROWS;
            break;
          }
        }
      }
    }
    return g;
  }

  check('revealing a mine ends the game as lost and records the detonated cell',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).mine && !g.cell(x, y).revealed) {
            var hit = g.reveal(x, y);
            return hit === true && g.status() === 'lost' &&
              g.cell(x, y).revealed === true &&
              g.detonated() && g.detonated()[0] === x && g.detonated()[1] === y;
          }
        }
      }
      return 'no mine found on the board';
    })());
  check('revealing a zero-neighbor cell flood-reveals exactly its region',
    (function() {
      var z = zeroOpening();
      if (!z) return 'no zero opening found';
      var g = z.engine;
      var expected = expectedFloodFrom(g, 4, 4);
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).revealed !== !!expected[y * Mines.COLS + x]) {
            return 'seed ' + z.seed + ' mismatch at ' + x + ',' + y;
          }
        }
      }
      return true;
    })());
  check('revealing a numbered cell reveals just that cell',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      var before = 0;
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).revealed) before++;
        }
      }
      var target = null;
      for (var yy = 0; yy < Mines.ROWS && !target; yy++) {
        for (var xx = 0; xx < Mines.COLS && !target; xx++) {
          var c = g.cell(xx, yy);
          if (!c.revealed && !c.flagged && c.adjacent > 0) target = [xx, yy];
        }
      }
      if (!target) return 'no numbered cell found';
      g.reveal(target[0], target[1]);
      var after = 0;
      for (var y2 = 0; y2 < Mines.ROWS; y2++) {
        for (var x2 = 0; x2 < Mines.COLS; x2++) {
          if (g.cell(x2, y2).revealed) after++;
        }
      }
      return after === before + 1 && g.cell(target[0], target[1]).revealed === true;
    })());
  check('revealing an already-revealed or flagged cell does nothing',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      if (g.reveal(4, 4) !== false) return 're-reveal was accepted';
      // flag something unrevealed, then try to reveal it
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (!g.cell(x, y).revealed && g.toggleFlag(x, y) === true) {
            if (g.reveal(x, y) !== false) return 'revealing a flagged cell was accepted';
            if (!g.cell(x, y).flagged) return 'the reveal cleared the flag';
            return g.status() === 'playing';
          }
        }
      }
      return 'no cell to flag';
    })());
  check('revealing a cell outside the board does nothing',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      return g.reveal(9, 0) === false && g.reveal(0, 9) === false &&
        g.reveal(-1, 0) === false && g.status() === 'ready';
    })());

  /* ── Flag semantics and the LED counter (spec user stories 7, 10) ──── */

  check('toggleFlag flips a flag on an unrevealed cell and back off',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (!g.cell(x, y).revealed) {
            var on = g.toggleFlag(x, y);
            var flagged = g.cell(x, y).flagged;
            var off = g.toggleFlag(x, y);
            var cleared = !g.cell(x, y).flagged;
            return on === true && flagged === true && off === true && cleared;
          }
        }
      }
      return 'no unrevealed cell';
    })());
  check('toggleFlag is refused on a revealed cell',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      return g.toggleFlag(4, 4) === false && g.cell(4, 4).flagged === false;
    })());
  check('the counter reads mines minus flags and may go negative',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      var flagged = 0;
      for (var y = 0; y < Mines.ROWS && flagged < Mines.MINES + 1; y++) {
        for (var x = 0; x < Mines.COLS && flagged < Mines.MINES + 1; x++) {
          if (!g.cell(x, y).revealed && g.toggleFlag(x, y)) flagged++;
        }
      }
      return g.mineCount() === Mines.MINES - flagged && g.mineCount() < 0;
    })());
  check('the counter falls back as flags are removed',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      var spot = null;
      for (var y = 0; y < Mines.ROWS && !spot; y++) {
        for (var x = 0; x < Mines.COLS && !spot; x++) {
          if (!g.cell(x, y).revealed) spot = [x, y];
        }
      }
      g.toggleFlag(spot[0], spot[1]);
      var withFlag = g.mineCount();
      g.toggleFlag(spot[0], spot[1]);
      return withFlag === Mines.MINES - 1 && g.mineCount() === Mines.MINES;
    })());

  /* ── The timer: the shell drives time through tick() (user story 11) ── */

  check('tick() does nothing before the first reveal — the clock starts on reveal',
    (function() {
      var g = Mines.create();
      g.tick(); g.tick(); g.tick();
      return g.elapsed() === 0;
    })());
  check('tick() advances the elapsed seconds while the game is playing',
    (function() {
      var g = Mines.create();
      g.reveal(4, 4);
      g.tick(); g.tick(); g.tick();
      return g.elapsed() === 3;
    })());
  check('tick() freezes on loss',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      g.tick(); g.tick();
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).mine && !g.cell(x, y).revealed) { g.reveal(x, y); break; }
        }
        if (g.status() === 'lost') break;
      }
      g.tick(); g.tick(); g.tick();
      return g.status() === 'lost' && g.elapsed() === 2;
    })());
  check('tick() freezes on win',
    (function() {
      var g = winGame();
      var at = g.elapsed();
      g.tick(); g.tick(); g.tick();
      return g.status() === 'won' && g.elapsed() === at;
    })());

  /* ── Win detection (spec user story 15) ────────────────────────────── */

  check('the game is won the moment every non-mine cell is revealed',
    (function() {
      var g = winGame();
      if (g.status() !== 'won') return 'status ' + g.status();
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          var c = g.cell(x, y);
          if (!c.mine && !c.revealed) return 'non-mine ' + x + ',' + y + ' unrevealed';
        }
      }
      return true;
    })());
  check('flags are irrelevant to the win: mines stay hidden on a won board',
    (function() {
      var g = winGame();
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).mine && g.cell(x, y).revealed) return 'mine ' + x + ',' + y + ' revealed';
        }
      }
      return true;
    })());
  check('a won game refuses further moves',
    (function() {
      var g = winGame();
      return g.reveal(0, 0) === false && g.toggleFlag(0, 0) === false;
    })());

  /* ── Loss bookkeeping (spec user story 14) ─────────────────────────── */

  check('a lost game records the full mine list, the detonated cell and the wrong flags',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      // flag two cells known to be safe and one known to be a mine
      var safe = [], mine = null;
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          var c = g.cell(x, y);
          if (!c.revealed && !c.mine && safe.length < 2) safe.push([x, y]);
          if (!c.revealed && c.mine && !mine) mine = [x, y];
        }
      }
      g.toggleFlag(safe[0][0], safe[0][1]);
      g.toggleFlag(safe[1][0], safe[1][1]);
      g.reveal(mine[0], mine[1]);
      if (g.status() !== 'lost') return 'status ' + g.status();
      var mines = g.mines();
      if (!Array.isArray(mines) || mines.length !== Mines.MINES) {
        return 'mine list ' + JSON.stringify(mines);
      }
      for (var i = 0; i < mines.length; i++) {
        if (!g.cell(mines[i][0], mines[i][1]).mine) {
          return 'mine list names a non-mine: ' + JSON.stringify(mines[i]);
        }
      }
      var wrong = g.wrongFlags();
      if (wrong.length !== 2) return 'wrong flags ' + JSON.stringify(wrong);
      var got = {};
      wrong.forEach(function(w) { got[w[0] + ',' + w[1]] = true; });
      if (!got[safe[0].join(',')] || !got[safe[1].join(',')]) {
        return 'wrong flags ' + JSON.stringify(wrong) + ' vs safe ' + JSON.stringify(safe);
      }
      return g.detonated()[0] === mine[0] && g.detonated()[1] === mine[1];
    })());

  /* ── Restart (spec user stories 13, 18) ────────────────────────────── */

  check('restart returns a fresh ready board from a lost game',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      for (var y = 0; y < Mines.ROWS; y++) {
        for (var x = 0; x < Mines.COLS; x++) {
          if (g.cell(x, y).mine && !g.cell(x, y).revealed) { g.reveal(x, y); break; }
        }
        if (g.status() === 'lost') break;
      }
      g.restart();
      var fresh = g.status() === 'ready' && g.elapsed() === 0 &&
        g.mineCount() === Mines.MINES && g.detonated() === null;
      for (var y2 = 0; y2 < Mines.ROWS && fresh; y2++) {
        for (var x2 = 0; x2 < Mines.COLS && fresh; x2++) {
          var c = g.cell(x2, y2);
          if (c.revealed || c.flagged) fresh = false;
        }
      }
      return fresh;
    })());
  check('restart returns a fresh ready board from a won game',
    (function() {
      var g = winGame();
      g.restart();
      return g.status() === 'ready' && g.elapsed() === 0 &&
        g.mineCount() === Mines.MINES && g.cell(4, 4).revealed === false;
    })());
  check('restart returns a fresh ready board mid-game, and the new game plays',
    (function() {
      var g = Mines.create({ rng: lcg(7) });
      g.reveal(4, 4);
      g.toggleFlag(0, 0);
      g.tick();
      g.restart();
      var fresh = g.status() === 'ready' && g.elapsed() === 0 &&
        g.mineCount() === Mines.MINES;
      g.reveal(2, 2);
      return fresh && g.status() === 'playing';
    })());

  return results;
};
