# 0005 — 🛡️ Risk Radar as Shareable Hero

## Status

Accepted — 2026-09-10

## Context

Results must be legible and shareable without a backend. Severity-colored charts are misread as performance — a Participant seeing red bars assumes poor results, not a critical risk category. The Risk Radar needs to travel: screenshots, downloads, native sharing.

## Decision

Hand-rolled, zero-dependency SVG radar across the ten AST Risks as the results hero. Axis color encodes the Participant's AST Score: red below 50%, amber 50–70%, green 70% or above — color means "your gap." Severity appears only as a text Severity Chip beside each axis label, never as fill color.

Sharing: Download PNG (SVG → canvas → blob) and Web Share API where supported.

Blind-Spot Bars are the detail readout: horizontal bars, weakest first, same score-based coloring and Severity Chips as the radar.

_Amended 2026-09-11 (owner decision): Severity Chips removed from BOTH visuals — they described the threat's severity, not the Participant's performance, and still invited the exact misreading this ADR warns against. Radar axis labels are now short `AST01…AST10` + the Participant's percentage (which also fixed label clipping at phone width); Blind-Spot Bars carry the full AST name + percentage. Score-band colors alone encode performance._

## Consequences

- Severity remains visible without distorting the score message.
- The radar is self-contained: no charting library, no build step, ~120 lines in the results renderer.
- PNG export and native share cover every sharing surface the Participant needs.
- Blind-Spot Bars reinforce the same color language and sort order as the Action Plan, giving the Participant a consistent reading path.

## Alternatives considered

- **Severity-colored bars:** rejected — participants consistently misread critical-risk severity as poor performance.
- **Shareable per-completion URLs:** out of scope for v1; requires a backend or KV store. Deferred to v2 future considerations.
