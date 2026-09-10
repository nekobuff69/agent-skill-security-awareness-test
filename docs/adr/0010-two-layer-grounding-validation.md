# 0010 — Two-Layer Grounding Validation

## Status

Accepted — 2026-09-10

## Context

The LLM Path sends Participant data and OWASP Grounding Excerpts through the Worker proxy to a language model. The model's output — Narrative and Action Plan — reaches the Participant on the results page. LLMs hallucinate: inventing statistics, citing nonexistent campaigns, fabricating tool names, or referencing OWASP content that was never in the prompt. A naive solution is LLM-as-judge validation, but that trades one hallucination source for another and adds latency and cost.

The Deterministic Fallback (ADR 0009) removes the LLM from the equation when degraded, but the LLM Path is the primary route and must be bounded.

## Decision

Two validation layers, applied at different lifecycle points:

1. **Authoring-time** (the testing spec's grounding suite): rule-based checks trace every statistic in model output to a Source Note. Campaign names, tools, and URLs are checked against allowlists derived from the Question Bank. This is the layer that bounds hallucination — it runs before deploy, on model outputs produced during test fixtures, and any untraceable claim fails the gate.

2. **Runtime** (client-side, structural only): the app verifies the JSON parses, every `actions[].ast_source` references an AST Risk ID present in the Question Bank, and the Narrative is non-empty. One retry on failure, then route to the Deterministic Fallback.

The client never re-verifies facts against the Grounding Corpus at runtime. Grounding is enforced by prompt rules combined with the authoring-time suite; the deploy gate runs both the structural and grounding test suites before any release.

The prompt itself is an enforcement instrument: its rules block instructs the model to trace every claim to provided material. The full prompt contract lives in the testing spec's grounding section, next to the mock output it is validated against.

## Consequences

- Hallucination is bounded at authoring time, not at render time — a deliberate choice to keep the client fast and the validation deterministic.
- The runtime check catches structural breakage (bad JSON, phantom AST references) but intentionally does not audit factual claims. Trust in factual accuracy rests on the prompt design and the authoring-time gate.
- The Deterministic Fallback (ADR 0009) is always available as the safety net: if runtime validation fails after one retry, the Participant gets a bank-assembled Action Plan instead.

## Alternatives considered

- **LLM-as-judge validation (second model call).** Rejected: trades one hallucination source for another, adds latency and cost, and provides false confidence. A second model cannot reliably bound the first model's factual errors.
- **Client-side corpus verification.** Rejected: the Grounding Corpus is ~53 KB; matching model output against it in the browser is slow, fragile, and would require shipping the full corpus to every Participant. The authoring-time suite already does this deterministically.
