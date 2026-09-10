# 0006 — Deterministic Deep-Dive Prompt

## Status

Accepted — 2026-09-10

## Context

The takeaway artifact must be high-quality even when the LLM Path is down. It must not nudge Participants into pasting unverifiable rules into their own Agent config — that is a trust decision the app should not make for them.

## Decision

The Deep-Dive Prompt is assembled deterministically in-app, never LLM output. Four sections:

1. **Framing** — self-assessment context and intent.
2. **Profile** — Progression Title, overall percentage, per-AST percentages (weakest first).
3. **Choices** — each Weakest Question: what the Participant chose, the Best Practice, and the linked OWASP page.
4. **Session rules for the receiving Agent** — ground explanations in the linked OWASP pages, adapt depth to the Participant's answers, take one area at a time, end each area with one concrete habit.

Budget: 3000 characters max, enforced as a builder invariant in the testing spec. The artifact is identical on both the LLM Path and the Deterministic Fallback — only the Narrative and Action Plan differ between paths.

## Consequences

- Consistent quality regardless of LLM availability.
- Works offline and on the deterministic fallback without degradation.
- The Participant decides what to do with the prompt — no implicit endorsement of pasting rules into Agent config.
- Testable by the same rule-based suite that validates scoring and schema.

## Alternatives considered

- **LLM-generated template:** rejected — variable quality, fragile offline, and the LLM might hallucinate instructions that a security-aware Participant would not want to follow.
- **Standing rules block for Agent config:** rejected — conflicts with a security-aware Participant's judgment; pasting unverifiable rules into an Agent is a trust decision the app must not encourage.
