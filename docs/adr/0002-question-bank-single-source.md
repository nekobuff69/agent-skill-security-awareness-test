# 0002 — Question Bank as Single Source

## Status

Accepted — 2026-09-10

## Context

Many consumers need the same content: quiz rendering, scoring, results display, the Deep-Dive Prompt, the Deterministic Fallback, and the LLM Path all read from the Question Bank. Duplicate content across consumers creates drift — every edit must propagate to multiple locations, and stale copy surfaces as incorrect data.

## Decision

The Question Bank (`questions.json`) is the only runtime database, fetched once per page load. All display copy — question count, time estimate, Phase headings, titles, subtitles — derives from bank metadata at render time. Scoring fixtures (Severity Weights, Title Ladder thresholds) are embedded in the bank. The client config carries no strings that also live in the bank.

This principle is **copy-is-data**: tightening the bank updates the entire site without code changes.

## Consequences

- A single bank edit propagates to every consumer on the next load — no code changes required for content updates.
- Schema validation by the testing spec before deploy enforces bank integrity; stale or malformed fields fail the gate.
- Client config is limited to infrastructure concerns (proxy URL, timeout, max tokens) — display copy is the bank's domain.

## Alternatives considered

A secondary content file (separate strings, separate rendering config) was considered early and cut: it duplicated bank content at the highest authoring cost and rotted on every bank edit. No secondary source exists.
