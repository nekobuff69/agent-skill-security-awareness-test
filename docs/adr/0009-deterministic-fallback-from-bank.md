# 0009 — Deterministic Fallback from Bank

## Status

Accepted — 2026-09-10

## Context

The recommendation system is LLM-primary. Degradation paths are real: Worker unreachable, 8-second timeout, per-IP rate limit exhausted, or LLM output failing structural validation after one retry. Every one of these leaves the Participant on the results page with scores but no Action Plan — the hero artifact vanishes exactly when the app is under stress.

A hand-authored pattern file (~20 profiles with overlap matching) was the original fallback design. It duplicated bank content at the highest authoring cost and rotted on every Question Bank edit. Two maintenance passes were already needed after minor bank changes, and the file drifted out of sync with actual Question wording.

## Decision

The Deterministic Fallback assembles its Action Plan from Question Bank fields only — no secondary content source.

1. Rank AST Risks by percentage ascending; take the 3–5 weakest.
2. Each Action = that AST Risk's Mitigations distilled from the mapped Questions' Best Practices, plus the OWASP source link.
3. Narrative = 2–3 sentences per weak AST Risk referencing the Participant's own choices (e.g. "on Question 01 you chose to trust review counts — that is the exact gap the ClawHavoc campaign exploited").

The output schema matches the LLM Path exactly: `{ narrative, actions[] }` where each action carries `priority`, `title`, `description`, and `ast_source`. This keeps the Results Renderer path-agnostic.

All assembly content is already curated in the Question Bank. Zero additional authoring. Never stale when the bank changes. Fully testable by the testing spec's scoring fixtures.

## Consequences

- Bank edits propagate to the fallback with zero extra work — the Action Plan updates automatically.
- The fallback is deterministic and identical for every Participant with the same scores, making it trivially testable.
- The Deep-Dive Prompt is already identical on both paths (ADR-0006), so the only difference between the LLM Path and the fallback is the Narrative quality.

## Alternatives considered

- **`static-recommendations.json` pattern file with overlap matching.** Rejected: duplicated bank content at the highest authoring cost, rotted on every bank edit, and required manual synchronization. The pattern file's ~20 hand-authored profiles were brittle — a Question wording change broke three of them.
- **No Action Plan on failure.** Rejected: the Action Plan is the results hero artifact. Dropping it exactly when the app is degraded leaves the Participant with scores but no guidance — the worst user experience at the worst moment.
