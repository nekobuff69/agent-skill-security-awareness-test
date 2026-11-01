# 0021 — Retro-OS Skin Replaces the Editorial Skin

## Status

Accepted — 2026-11-01. Confirms and extends [0001 — Vanilla static, no build step](0001-vanilla-static-no-build.md) (the zero-dependency constraint is load-bearing and survives the redesign untouched); supplements [0005 — Risk Radar as shareable hero](0005-risk-radar-shareable-hero.md) (the radar keeps its label and score-band contract; only its rendering goes period) and [0018 — First-visit language routing](0018-first-visit-language-routing.md) (its routing semantics are unchanged; its presentation becomes a system dialog). Records the owner-approved design of spec issue #36; implements the navigation model already decided in [0020](0020-wizard-navigation-with-explicit-commit.md). Supersedes the editorial skin ("Surya") as the site's presentation layer; the editorial-skin note in `docs/architecture.md` and its design-DNA artifact describe the retired state.

## Context

The assessment shipped wearing an editorial portfolio skin — serif display type, a soft-shadowed card system, one orange accent, and a generic fade between views. It read as a template, not a product: the quiz was forgettable, the results screen shared nothing with the landing, and the only "identity" was borrowed. The owner decided to recreate the experience of running the assessment as a native program on a Windows 95/98 machine — boot, window, taskbar, radio buttons, wizard navigation, system sounds — as the site's permanent visual language.

The architecture made this a styling problem, not a rewrite: the site already layered a single override skin on top of structural stylesheets (`docs/architecture.md`), so the presentation could be swapped wholesale while the content pipeline — Question Banks, scoring, validation, the Proxy Worker — stayed byte-identical. ADR 0001's no-build rule and the static deploy narrow how far the illusion can be built: no animation libraries, no framework components, no generated assets.

## Decision

**Clean cutover, same seam.** One new override skin replaces the editorial one, linked last exactly as its predecessor was. The editorial skin file and its design-DNA artifact are deleted; a new design-DNA artifact documents the new system. The base stylesheets keep their semantic token aliases — the skin only re-points values — so no structural file ever learns the palette.

**Stock Windows 95 values, retro-inspired fidelity.** Silver `#C0C0C0` chrome with white/gray/dark-shadow bevels, navy `#000080` title bars and selection, teal `#008080` desktop, black-on-white fields; the classic 16-color system set supplies status colors — dark variants wherever a status color is text, bright tints for graphic fills only, keeping the contrast rationale the retired skin had documented. Surfaces are solid high-color; 1px dither appears only on disabled/pressed-in chrome. The editor's orange is gone. Fidelity bends to legibility: UI chrome is period, but Scenario and Feedback prose stays modern readable type at comfortable sizes with 44px touch targets.

**Self-hosted type, never fetched.** The chrome face is a metric-compatible MS Sans Serif clone (W95FA) under SIL OFL 1.1, verified for commercial web embedding, committed with its license text and provenance, pinned to a Latin `unicode-range`; body type is a readable system sans. The Chinese Bank Variant page leads with the era-accurate SimSun/宋体 stack via the existing token-swap mechanism — its chrome reads period, its prose reads clean. Zero third-party font requests at runtime.

**A thin OS shell around the old view pipeline.** New modules on the established `App.*` seam: a boot splash (once per tab via a `sessionStorage` flag, reduced-motion bypass), a window frame with live title-bar controls and a taskbar (Start menu, program button, per-minute clock, language tray chip), a window-manager state machine, a reusable system-dialog primitive (End Program confirmation, language offer), a WebAudio synth sound layer (no audio files) gated to desktop widths and armed on the first user gesture, and the wizard decision core of ADR 0020. The views themselves — landing, quiz, results, Review — are what they always were inside this shell.

**Era-mechanical motion only.** Views open with a wireframe border trace (`steps()` timing, ~200ms), cards swap with a client-area wipe, Progress Fill and Blind-Spot Bars fill as discrete segments. Every trace, wipe, and width transition is disabled under `prefers-reduced-motion` — including the two the retired skin had left ungated. No motion library is permitted; motion is CSS or nothing.

**Contracts that did not move.** Scoring, Session storage (`quiz-session`, ADR 0017), the five-event analytics contract, the radar's AST-ID + percentage labels and score-band encoding (ADR 0005), the Action Plan's LLM Path / Deterministic Fallback duality (ADRs 0007–0010), Chrome Strings with missing-id hard failure (ADR 0015), and first-visit routing behavior (ADR 0018) are unchanged. New interface copy entered the base dictionaries in both languages; new storage keys are a per-tab boot flag (sessionStorage) and the sound preference (localStorage, a preference like Language Preference, never version-stamped).

## Consequences

- The site has one identity, end to end, including the 404 page and the regenerated Open Graph share card — and it is verifiable: the presentation-layer section of `docs/architecture.md` and `design-dna-retro-os.json` describe the shipped system.
- Adding a language stays a bank + dictionary + page + stylesheet affair (ADR 0015's cost model survives); adding a component means bevel classes from the skin and strings from both dictionaries — the seam discipline continues.
- Two small, deliberate lies to the machine exist by design: the app never actually boots (the splash masks load, it does not gate it), and the window never truly closes (End Program returns to the landing and the Session survives). Both are documented in their modules.
- The headline font cannot render CJK or color emoji; the `unicode-range` pin and the system stack make that a non-issue for text, and the headless-emoji nit is an environment artifact, not a product one.
- Test surface grew where behavior lives: boot gating, wizard decisions, window state, sound gating, and shell cadence all test headless through the one existing seam; pixel-level fidelity remains browser-verified, as it always was.

## Alternatives considered

- **Keep both skins with a theme switcher.** Rejected: two design languages halve the QA surface each can trust, and the editorial skin's rounded, soft-shadowed grammar actively contradicts beveled chrome at the component level — the switcher would be a permanent reconciliation tax for nostalgia with no participant benefit.
- **Modernized "retro-flavored" palette (softer grays, brighter navy).** Rejected: the exact stock values are the identity; a tasteful approximation reads as generic dark-mode-ish, and every participant who ever used Windows 95 would sense the difference without naming it.
- **Full desktop window manager (draggable windows, z-order, taskbar switching).** Rejected in the design interview and again here: a 20-Question linear assessment has exactly one live program window; multi-window machinery buys no comprehension and costs a11y and mobile layout.
- **Period-accurate bitmap type for body prose.** Rejected: 11-12px bitmapped text is unreadable for Scenario-length prose on modern displays, and legibility of assessment content is a product requirement, not a stylistic preference.
- **Pixel-art CJK font for the zh page.** Rejected: multi-megabyte full faces cannot be subset without a build step ADR 0001 forbids; SimSun-era system stacks are the period-accurate answer on the machines Chinese participants actually use.
