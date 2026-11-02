# 0023 — The PNG Export Captures the Live Window

## Status

Accepted — 2026-11-03. Supersedes the PNG-export rules of [0021 — Retro-OS skin replaces the editorial skin](0021-retro-os-skin-replaces-editorial-skin.md) (the "body-only sheet" of #65 and the "unfolded, no chrome copied" reading of #74): the artifact is no longer a re-composition of the report. Keeps [0001 — Vanilla static, no build step](0001-vanilla-static-no-build.md) intact — this is hand-written, dependency-free code, not `html2canvas`.

## Context

The export was a **re-composition**: `buildExportSvg()` re-drew the score header, Risk Radar and Blind-Spot Bars from the report through the same pure builders the window used, then rasterised that SVG. It was chosen because it cannot drift from the window and needs no library, and the drift argument was true of the *data* — the numbers and the labels always matched.

What it could not carry was the **surface**. Every attempt to close the gap was a new parallel renderer to maintain:

- **#65** drew an 800-wide sheet, body only. Every bevel, every dither and the title bar were simply absent.
- **The second pass** wrapped that sheet in a hand-drawn window frame and title bar, and had to re-implement the 98.css bevel rings, the navy ramp, the three control glyphs — and still had no dither in the bars, no segmented fill, and a 320px radar where the window shows its own size.
- **Both** exported text in the system face without anyone noticing: an SVG rasterised through an `<img>` cannot reach the page's webfonts, so the pixel face silently vanished at export time while looking perfect on screen.

Two rounds of "make it match" produced the same conclusion — a second drawing of the same UI is a second thing to keep in sync, and it is always one detail behind. The rule the repo already lives by says the opposite of what the exporter was doing: the window's own builders (`buildRadar`, the CSS) are the single source, and the exporter was the only place that restated them.

## Decision

**The export is a capture of the live DOM.**

1. **Clone the window.** `quizWindowEl()` takes the `.os-window` that is not a program window; `cloneNode(true)` copies it.
2. **Unclip it.** `prepareClone()` sets the clone to this device's **width**, `height: auto`, `overflow: visible`, and does the same to `#app`, the program bodies and the view sections — so the sheet is the whole report, not one screen of it, even on a phone whose window scrolls. The **menu bar is removed** from the clone: its commands would be painted dead controls in a file someone else opens. The desktop taskbar is not part of the window and never was.
3. **Inline the page's own CSS.** `collectCssText()` reads every same-origin `cssRules` list and concatenates it. `@font-face` blocks are **kept and their `url(fonts/…)` rewritten to data URIs** — keeping them preserves the family names, the weights and the `unicode-range` pins that split Latin from Han, which re-declaring them by hand would have to restate. A sheet that throws on read is skipped, not fatal.
4. **Rasterise through `<svg><foreignObject>`.** The clone is serialised inside a foreignObject sized in CSS pixels and drawn to a canvas at the screen's density, capped at 2×.
5. **Hand the rasteriser a `data:` URL, never a `blob:` one.** Chrome marks a canvas **tainted** when the SVG it drew came from a blob URL and carries a `foreignObject`; `toBlob` and `toDataURL` then throw `SecurityError`. The failure is silent in the worst way: the catch fires, the `.svg` is downloaded, and everything looks like it worked — which is exactly how the first ship of this decision passed a probe and failed on a phone with a file the gallery could not open.
6. **Immobilise the clone.** A clone is a *fresh* element, so every CSS animation on it restarts from its 0% frame — and the view's entrance (`os-view-pop` in the skin) starts at `opacity: 0`. Rasterised in the same tick, the sheet came out as a correct title bar over an empty silver body, which is what a phone reported first: the most convincing kind of wrong, because the frame looked perfect. `CAPTURE_RESET_CSS` is appended **after** the page's rules and collapses animations and transitions to their finished state, the same end state the skin's `prefers-reduced-motion` contract specifies.
7. **Re-scope `html` selectors.** The clone lives in an SVG document that has no `<html>`, so `html[lang^="zh"] …` — the block that repairs Han typography — would silently match nothing. `collectCssText()` rewrites `html[lang` to `[lang` and the clone carries the page's `lang`, so the Chinese sheet keeps its pixel-Han rules.
8. **Crop to the ink.** An SVG rasterised through an `<img>` lays out in *its own* document viewport, which is not the page's: the same tree measures a few dozen pixels shorter there. So the sheet is authored with slack and the canvas is cropped to its last non-white row — the image ends at the window's bottom bevel, never at a band of white under the last Blind-Spot row.
9. **Fall back to the SVG.** If the rasteriser still refuses the document, the same markup is downloaded as `.svg` — the capture is never lost, and there is still no library.

The artifact is therefore **the window as the Participant sees it**: this phone's portrait column, or the window they dragged, with its dithered fills, its segmented bars, its bevels and its pixel face — at the window's own width, where its media queries already answer as they do on screen.

## Consequences

- **Fidelity is structural.** Nothing about the surface is restated anywhere: change a bevel, a dither or a bar's fill in CSS and the export follows. Roughly 130 lines of composition, and the constants that encoded it, are deleted.
- **Size follows the device, by rule.** A phone exports a portrait column as wide as its window; a desktop window exports at whatever size it was dragged to. The height is the content's, so the report is never cropped and never scaled to a canonical sheet.
- **The export is slower and heavier than a composition.** The first export of a page fetches the self-hosted faces (≈8 KB Latin, +34 KB Han) and embeds them; later exports reuse the cache. The PNG is up to 2× the CSS pixels.
- **One layout caveat, accepted and documented.** Inside the image the clone is laid out at its own width, so a **desktop** window dragged narrower than 768 px exports in the ≤768 px branch while the screen shows the desktop one. On a phone the frame *is* the viewport, so the two agree, and above 768 px on the desktop they agree as well.
- **A downloaded SVG is not a viewable fallback.** Opened as a document, the `foreignObject` content re-evaluates its media queries against *that document's* viewport — so a capture laid out at 411 px can re-lay-out at the browser's default width, overflow its own frame and clip. The fallback exists so the artifact is not lost, not so it can be read inline; the PNG is the deliverable.
- **Browser support is the real risk.** `foreignObject` rasterisation is solid in Chrome and Chromium-based browsers, uneven in Safari. The fallback (download the SVG, which every browser can open) keeps the feature from failing outright; a device check, not a unit test, is the pixel proof.
- **The suites test the seams, not the pixels.** The fake DOM has no layout engine, so `tests/js/test-results-retro.js` asserts the CSS collection and its font rewrite, the clone's layout overrides, the one-foreignObject SVG, the save, and the rasteriser's canvas size. The pixel proof lives in the device check recorded in `docs/TESTING.md`.
- **`ast-risk-radar.png` is gone.** The file is `agent-security-quiz-window.png`; it is a window now, and naming it after the chart repeats exactly the mistake this ADR corrects.
