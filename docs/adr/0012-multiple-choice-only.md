# 0012 — Multiple Choice Only

## Status

Accepted — 2026-09-10

## Context

A security-awareness app must not itself become an attack surface. Free-text input anywhere in the assessment creates a path for prompt injection: a Participant could craft a Question response that, if forwarded to the LLM, manipulates the model's output. Even without LLM forwarding, free-text fields invite phishing-like patterns (fake forms, credential harvesting) that undermine the app's credibility on security topics.

The LLM payload must contain only data the app controls — never Participant-authored text.

## Decision

The assessment has no free-text field anywhere. Every Quiz interaction is multiple choice — one of four Options per Question. The LLM payload contains only:

- Participant profile (Progression Title, Overall Percentage, per-AST Scores)
- Selections (Option indices, which map back to bank-controlled Option text)
- Question Bank content (Scenarios, Best Practices, Grounding Excerpts)

Prompt injection has no attack surface by construction: the Participant never writes text that reaches the model. The receiving model processes only bank-authored content and deterministic score data.

The site never asks for API keys, payment information, or account credentials. No authentication flow exists. This is intentional — a security-awareness tool that collects credentials would contradict its own message.

## Consequences

- The assessment is simpler to build and test: no input sanitization, no escape logic, no free-text-to-LLM pipeline.
- Safety compounds with the Worker proxy holding key custody (ADR 0007): no key ships client-side, and no Participant text reaches the model.
- Safety compounds with the two-layer grounding validation (ADR 0010): even bank content forwarded to the model is bounded by authoring-time checks.
- The trade-off is expressiveness — Participants cannot describe custom scenarios or ask free-form questions during the quiz. This is acceptable: the assessment's job is to reveal blind spots through curated Questions, not to collect open-ended input.

## Alternatives considered

- **Optional free-text "notes" field per Question.** Rejected: even if notes never reach the LLM, they create a false expectation of interactivity and add rendering/storage complexity with no assessment value.
- **Chat-style LLM interaction during the quiz.** Rejected: transforms a 10-minute self-assessment into an open-ended conversation, removes the deterministic scoring guarantee, and opens prompt injection as a first-class concern.
