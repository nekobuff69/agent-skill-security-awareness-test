# 0004 — Progression Titles Replace Grades

## Status

Accepted — 2026-09-10

## Context

The design philosophy states the app is "not a test — a mirror." A letter grade (A–F) frames the result as pass/fail, which contradicts the mirror metaphor. Participants need a framing that says "here is where you haven't looked yet" rather than "here is how you performed."

## Decision

The A–F grade ladder is retired. Results lead with a Progression Title from the Title Ladder, stored as data in the bank's metadata (`meta.scoring.titles`). Thresholds: 90/70/50/30/0 map to Sentinel 🛡️ / Practitioner 🛠️ / Aware 🔍 / Newcomer 🌱 / Uncharted 🧭.

Editing the bank retitles results without application changes. The Title Card shows the Progression Title, its emoji, and the Overall Percentage — never a letter grade.

## Consequences

- No letter grade appears anywhere in the app, test fixtures, or copy. Swept before ship.
- Fixture fields use `expected_title` and `expected_title_boundary` rather than grade assertions.
- The Title Ladder is bank data — changing thresholds or names requires only a bank edit.

## Alternatives considered

**Keep grades with softened copy.** A letter grade with apologetic framing still carries the pass/fail connotation. The vocabulary clash with the mirror metaphor was not fixable by copy alone. Rejected.

**Named profiles only (no ladder).** Without thresholds, title assignment becomes ambiguous at boundary cases. The ladder provides deterministic, testable boundaries. Rejected.
