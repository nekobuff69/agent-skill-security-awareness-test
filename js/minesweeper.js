/**
 * Minesweeper engine (ticket #80, parent spec #79) — the pure, DOM-free
 * game state for the classic Beginner board (9x9, 10 mines), the repo's
 * third pure decision core, modelled on js/desktop-core.js: no DOM, no
 * real clock, no storage. State plus transitions plus derived queries,
 * fully headless-testable through the module seam.
 *
 * The SHELL drives time: the engine never owns a clock or a timer. The
 * controller calls tick() once per second of wall time and reads elapsed()
 * to render the LED; the counter starts counting from the first reveal and
 * freezes on win or loss. This keeps the engine deterministic and lets
 * tests advance time without a fake setInterval.
 */
(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  var COLS = 9;
  var ROWS = 9;
  var MINES = 10;

  var STATUS_READY = 'ready';
  var STATUS_PLAYING = 'playing';
  var STATUS_WON = 'won';
  var STATUS_LOST = 'lost';

  /**
   * Build an engine. opts:
   *   rng  function returning a float in [0, 1) — injectable for
   *        deterministic tests; Math.random by default.
   */
  function createEngine(opts) {
    opts = opts || {};
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;

    var status = STATUS_READY;
    var mines = [];          // [x, y] pairs, placed at the first reveal
    var detonated = null;    // [x, y] of the mine that lost the game
    var grid = [];           // grid[y][x] = { revealed, flagged, mine, adjacent }
    var flags = 0;
    var seconds = 0;

    var x;
    var y;
    for (y = 0; y < ROWS; y++) {
      grid.push([]);
      for (x = 0; x < COLS; x++) {
        grid[y].push({ revealed: false, flagged: false, mine: false, adjacent: 0 });
      }
    }

    function cell(x, y) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
      return grid[y][x];
    }

    function elapsed() {
      return seconds;
    }

    function mineCount() {
      return MINES - flags;
    }

    function neighbors(cx, cy) {
      var list = [];
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (cx + dx >= 0 && cy + dy >= 0 &&
              cx + dx < COLS && cy + dy < ROWS) {
            list.push([cx + dx, cy + dy]);
          }
        }
      }
      return list;
    }

    /** Mines are placed at the FIRST reveal, never before: the opening
     *  cell and its neighbors are excluded, so the first reveal of a
     *  fresh board can never lose (classic first-click safety). */
    function placeMines(safeX, safeY) {
      var forbidden = {};
      forbidden[safeY * COLS + safeX] = true;
      neighbors(safeX, safeY).forEach(function(n) {
        forbidden[n[1] * COLS + n[0]] = true;
      });
      var placed = 0;
      while (placed < MINES) {
        var idx = Math.floor(rng() * COLS * ROWS);
        if (forbidden[idx] || grid[Math.floor(idx / COLS)][idx % COLS].mine) continue;
        grid[Math.floor(idx / COLS)][idx % COLS].mine = true;
        placed++;
      }
      grid.forEach(function(row, ry) {
        row.forEach(function(c, rx) {
          if (c.mine) return;
          var n = 0;
          neighbors(rx, ry).forEach(function(nb) {
            if (grid[nb[1]][nb[0]].mine) n++;
          });
          c.adjacent = n;
        });
      });
    }

    /** Flood reveal: a zero-neighbor cell reveals its connected empty
     *  region (all eight directions) plus every numbered cell bordering
     *  that region; a numbered cell reveals itself alone. */
    function floodReveal(x, y) {
      var stack = [[x, y]];
      while (stack.length) {
        var at = stack.pop();
        var cx = at[0], cy = at[1];
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
        var c = grid[cy][cx];
        if (c.revealed || c.flagged) continue;
        c.revealed = true;
        if (c.adjacent === 0) {
          neighbors(cx, cy).forEach(function(n) {
            if (!grid[n[1]][n[0]].revealed) stack.push(n);
          });
        }
      }
    }

    /** Won the moment every non-mine cell is revealed — flags are
     *  irrelevant to the check (spec user story 15). */
    function allSafeRevealed() {
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          var c = grid[y][x];
          if (!c.mine && !c.revealed) return false;
        }
      }
      return true;
    }

    function checkWin() {
      if (status === STATUS_PLAYING && allSafeRevealed()) status = STATUS_WON;
    }

    function reveal(x, y) {
      if (status === STATUS_WON || status === STATUS_LOST) return false;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
      var c = grid[y][x];
      if (c.revealed || c.flagged) return false;
      if (status === STATUS_READY) {
        placeMines(x, y);
        status = STATUS_PLAYING;
      }
      if (c.mine) {
        c.revealed = true;
        detonated = [x, y];
        status = STATUS_LOST;
        return true;
      }
      floodReveal(x, y);
      checkWin();
      return true;
    }

    function toggleFlag(x, y) {
      if (status === STATUS_WON || status === STATUS_LOST) return false;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
      var c = grid[y][x];
      if (c.revealed) return false;
      c.flagged = !c.flagged;
      flags += c.flagged ? 1 : -1;
      return true;
    }

    function detonatedCell() {
      return detonated ? [detonated[0], detonated[1]] : null;
    }

    /** One second of wall time, called by the shell — the engine never
     *  owns a real clock (see the file header). Counting starts at the
     *  first reveal (status leaves ready) and freezes on win or loss. */
    function tick() {
      if (status === STATUS_PLAYING) seconds++;
      return seconds;
    }

    /** Loss bookkeeping: every mine as [x, y], fresh copies. */
    function mineList() {
      var list = [];
      grid.forEach(function(row, ry) {
        row.forEach(function(c, rx) {
          if (c.mine) list.push([rx, ry]);
        });
      });
      return list;
    }

    /** The wrongly placed flags: flagged cells that are not mines —
     *  what the shell crosses out on a loss. */
    function wrongFlagList() {
      var list = [];
      grid.forEach(function(row, ry) {
        row.forEach(function(c, rx) {
          if (c.flagged && !c.mine) list.push([rx, ry]);
        });
      });
      return list;
    }

    /** A fresh ready board from any state — the smiley's restart and the
     *  discard-on-close rule both land here. Reset IN PLACE so the
     *  shell's engine reference keeps working. */
    function restart() {
      status = STATUS_READY;
      detonated = null;
      flags = 0;
      seconds = 0;
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          grid[y][x] = { revealed: false, flagged: false, mine: false, adjacent: 0 };
        }
      }
      return true;
    }

    return {
      status: function() { return status; },
      cell: cell,
      elapsed: elapsed,
      mineCount: mineCount,
      reveal: reveal,
      toggleFlag: toggleFlag,
      tick: tick,
      detonated: detonatedCell,
      mines: mineList,
      wrongFlags: wrongFlagList,
      restart: restart
    };
  }

  var MinesweeperEngine = {
    create: createEngine,
    COLS: COLS,
    ROWS: ROWS,
    MINES: MINES
  };

  app.MinesweeperEngine = MinesweeperEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
