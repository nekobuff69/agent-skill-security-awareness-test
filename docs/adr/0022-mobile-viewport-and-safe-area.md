# 0022 — The Mobile Viewport Contract: Cover, Safe Area, dvh

## Status

Accepted — 2026-11-02. Amends the ≤768px paragraph of [0021 — Retro-OS skin replaces the editorial skin](0021-retro-os-skin-replaces-editorial-skin.md) (the single-program layout keeps its shape; what it is *sized against* changes) and completes the taskbar/Quiz-Chrome work of tickets #52/#68, which assumed a desktop-shaped viewport. Applies to both pages (`index.html`, `zh/index.html`); `404.html` is left alone — it renders no shell and has no bar to place.

## Context

The shell was built and reviewed on a desktop, where the CSS viewport is the whole window and `100vh` is honest. On a Pixel 7 in Chrome the same code produced two defects with one cause between them:

- **The taskbar floated above the screen's bottom edge**, leaving a 24 px band of teal desktop underneath it.
- **The quiz footer and status bar sat behind the taskbar** — a Finish button that could not be pressed, a progress fill that could not be seen.

Measured from the screenshots (1080×2400, DPR 2.625), the numbers were unambiguous. The page viewport ended at CSS y = 781.3, and the taskbar's box ended there too — `bottom: 0` was being honoured. The 24 px below it was the Android gesture-navigation band (the gesture handle measured 107.4 × 3.8 CSS px, 10 px off the screen edge): the browser had inset the viewport *itself*, because neither page ever asked it not to, and Chrome fills that band with the page's own background colour. Meanwhile the frame was 793 px tall in a 781 px viewport: `100vh` on Chrome Android is the LARGE viewport, the height with the URL bar retracted, which is ~56 px more than what the Participant can see. `.os-window` kept `height: calc(100vh − 44px)` at ≤768 px even though that block's `inset: 0 0 44px 0` was clearly intended to size the frame — an over-constrained fixed box ignores `bottom` and keeps its height, so the frame's last 56 px, which is exactly the footer plus the status bar, slid under the bar.

A headless probe at an honest 411 × 781 viewport confirmed the diagnosis rather than the code: the same stylesheets laid the footer and status bar out cleanly (frame 641 = 685 − 44, footer clear of the bar). The layout was never wrong; its assumption about the viewport was.

## Decision

**The pages opt into edge-to-edge.** Both app pages declare `viewport-fit=cover`, so the layout viewport includes the system's bottom band and the desktop can paint to the screen's edge.

**The taskbar owns that band; the frame never does.** `css/shell.css` adds three tokens:

- `--os-safe-top` / `--os-safe-bottom` — `env(safe-area-inset-*)`, with `0px` fallbacks, so a browser that never opted in (or a desktop) moves nothing.
- `--os-taskbar-total` — `calc(var(--os-taskbar-height) + var(--os-safe-bottom))`, the height the bar actually occupies.

The bar keeps `--os-taskbar-height` (36 px desktop, 44 px at ≤768 px) as its **controls'** row and takes `--os-safe-bottom` as bottom padding, so its silver face reaches the screen edge while Start, the program switches and the Language Toggle stay above the gesture handle. Every measurement derived from the bar switched to the total: the document's bottom reservation, the frame's mobile `inset`, the Start-menu anchor. One token, so the chrome's controls and the space it claims cannot disagree — and the two defects cannot come back one at a time.

**The frame is sized by the insets, never by `vh`.** At ≤768 px the frame is `inset: var(--os-safe-top) 0 var(--os-taskbar-total) 0` with `height: auto` — the four edges size it. Above 768 px the flow frame uses `calc(100dvh − var(--os-taskbar-total))` with a `calc(100vh − …)` line above it as the fallback, and the Welcome Splash's centring band does the same.

**The top inset is paid the same way.** `body` takes `--os-safe-top` as padding and the fixed shortcut column offsets by it, so a notched device does not have its title bar or its icon column slid under the status bar. On Android Chrome this is 0 (the browser chrome owns the top); on iOS Safari it is the notch.

## Consequences

- The taskbar's face reaches the screen edge on a phone, and its controls sit on the 44 px touch row above the gesture band. The band is bar, not desktop.
- A phone's URL bar can no longer move the footer: the frame's height comes from the viewport's *edges*, which do not lie, instead of from a `vh` unit that describes a viewport the Participant may not be looking at.
- `env(safe-area-inset-bottom)` is the one number here the code cannot verify — Android reports 24 px under gesture navigation, the height of a three-button bar, or 0 depending on version and mode. A 0 is not a crash: the bar keeps its 44 px at the screen edge and the gesture handle overlays the bottom of its face, which is the pre-cover look with the bar flush. Verification is a device screenshot measured against the screen edge, not a unit test.
- **Known limitation, accepted.** `js/windows.js` clamps dragged Geometry with `TASKBAR_H = 36`, the desktop token's value (the controller refuses every Geometry write at ≤768 px, so the mobile layout never reads it). On a *desktop-width* device with a non-zero bottom inset — a tablet with a home indicator — a window dragged to the floor can sit under that inset by its height. The clamp reads a constant to stay viewport-blind and headless-testable; teaching it `env()` would mean reading computed style from the controller, and no shipped desktop layout has a non-zero inset today.
- The 404 page keeps the browser's inset. It is a script-free dialog on the teal desktop with no taskbar, so there is no bar to place and nothing to gain from covering.
