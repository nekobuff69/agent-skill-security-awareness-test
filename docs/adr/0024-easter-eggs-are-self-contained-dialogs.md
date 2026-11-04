# 0024 — Easter eggs are self-contained dialogs

## Status

Accepted — 2026-11-05. Keeps [0001 — Vanilla static, no build step](0001-vanilla-static-no-build.md) intact and keeps the three-Program invariant of the desktop rounds (#59–#68) exactly as it was; the Window Manager, the taskbar and the Desktop Record are untouched by the Minesweeper easter egg (ticket #81, spec #79).

## Context

The era's operating systems shipped with a game, and the shell's Start menu carried only utility commands. Adding Minesweeper meant deciding what the game IS in the desktop's own vocabulary — and the desktop already has a precise one: a Program is one of three fixed applications, a Program Window is its single surface, and every Window carries a Record with a Mode, a Geometry and a stacking order in the Desktop Core.

Making the game a **fourth Program Window** would have paid for a place in that vocabulary everywhere at once:

- The three-Program invariant is load-bearing: the taskbar paints permanent switches at ≤768px (ticket #68) from the fixed Program order, the Desktop Shortcut column carries one icon per Program, the Desktop Restore replays "every Window Record", and tests pin the stable order in several suites. A fourth Program touches all of it — or gets special-cased in all of it.
- A Program's state is supposed to survive: Minimize, Put Away and the Desktop Restore path all keep a Window's Record and its content. A game that outlives its window is the wrong lifecycle — it would need explicit unwinding from Retake and Quit, or it would resurrect a stale board after a Desktop Restore.
- The game must not disturb the assessment (spec #79 story 19): no re-render, no focus change, no taskbar repaint. Joining the Window Manager means joining Raise, the keyboard floor's inert repainting, and the active-window title-bar swap — all mechanisms the spec says the game must not trigger.

None of that buys anything the spec wants. The game is a diversion: it opens, it is played, it is closed, and nothing about the Participant's desktop or Session is different afterwards.

## Decision

**The game is a self-contained dialog — a sibling of the About window, outside the Program/Window model entirely.**

1. **About-window pattern.** The shell builds a fixed-size dialog over its own dimmed backdrop (`.os-mines-backdrop`, the same 1200 rung as the About backdrop; DOM order lifts it above About when both are open), exactly like the About window it sits beside. No Window Record, no taskbar entry, no Desktop Shortcut, no drag, no resize, no minimize or maximize, no Keyboard Floor participation, no Desktop Record presence.
2. **The Window Manager is untouched.** `js/desktop-core.js` and `js/windows.js` learn nothing new: opening the game writes no Record, repaints nothing, and moves no focus but its own close control. The three-Program invariant, the stable Program order and the Desktop Restore path are unchanged byte for byte.
3. **State dies with the window.** The game state lives inside the dialog — a pure engine instance created by the shell's surface module — and closing the dialog (close control, Escape, or reopening after a close) restarts it in place. Nothing reaches the Session, the Language Preference, the Desktop Record or the analytics contract; the game's only persistence is none.
4. **Escape owns its own tier.** The game dialog joins the shell's existing Escape stack as the topmost floating surface — above About, below a system dialog — so the topmost surface consumes the key. It adds a tier; it does not add a participant to the window tier's logic.
5. **The engine stays DOM-free.** The board rules live in `js/minesweeper.js` (ticket #80), headless-tested like the Desktop Core; the dialog's surface only renders what the engine says. The easter egg therefore adds one pure module and one rendering module — no new seam inside the shell's own state.

## Consequences

- **Closing is trivially total.** A dialog with no Record cannot be stranded: there is nothing to Put Away, nothing to restore, nothing for Quit or Retake to unwind. Reversing the feature is deleting two modules, one menu item and one backdrop.
- **The game has no window chrome beyond a title bar.** It cannot be moved, sized or minimized — acceptable for a fixed Beginner board, and the same trade the About window already made. On the ≤768px layout it behaves like every dialog: it floats over whatever is on screen and its board sizes itself to the viewport.
- **The desktop does not know the game exists.** A windowed desktop behind the dialog shows through the dimmed backdrop but never repaints for the game — which is exactly the isolation spec #79 story 19 demands.
- **One rung, two dialogs.** The About and Minesweeper backdrops share the 1200 rung and are ordered by DOM position, not z-index; a future dialog that must paint above About should follow the same sibling rule rather than inventing a new rung between 1200 and the system dialog's 1300.
- **Tests keep the old shape.** The dialog is asserted through the existing shell seam (the faked page) and the engine through the existing headless seam; no Window-Manager stub is needed to test the game, which is the structural proof that it never became one.
