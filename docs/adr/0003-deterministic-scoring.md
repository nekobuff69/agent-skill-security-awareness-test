# 0003 — Deterministic Scoring

## Status

Accepted — 2026-09-10

## Context

Results must be instant (no network round-trip), offline-safe (no LLM dependency), and fully testable. Scoring drives the Progression Title, the Risk Radar, Blind-Spot Bars, and the Action Plan — an error here cascades to every results component.

## Decision

Weighted Score = Option Score × Severity Weight. Severity Weights are critical 3, high 2, medium 1. Max Possible uses the Question's actual best Option Score, not a fixed 3 — two Questions cap at 2. Total Possible across the bank is 108.

Multi-Mapping Questions contribute their Weighted Score fully to every mapped AST aggregate. Per-AST possible values therefore sum to more than 108 by design.

Invalid, empty, short, or non-integer selections produce a typed error state — never a crash.

## Consequences

- Scoring is pure math with no external dependencies — every edge case is deterministic and testable.
- Enforcement lives in the testing spec (fixtures and invariants). This ADR states the decision; the testing spec holds the formulas and regression fixtures. Do not restate formulas as spec text here.
- Total Possible remains stable as long as the bank schema is validated before deploy.

## Alternatives considered

**Fixed denominator (3 × question count).** Two Questions lack a score-3 option; a fixed denominator inflates the Maximum Possible and deflates overall percentages. Rejected because the actual best-option denominator is accurate and testable.

**LLM-scored outputs.** Adds latency, cost, and non-determinism to a path that must be instant and reproducible. Rejected.
