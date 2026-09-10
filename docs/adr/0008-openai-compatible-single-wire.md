# 0008 — OpenAI-Compatible Single Wire Format

## Status

Accepted — 2026-09-10

## Context

Three provider-specific client code paths is scope creep for one app. The Worker proxy already exists (see 0007); the client should not need to know which LLM provider is behind it.

## Decision

One wire format, OpenAI-compatible. The Worker environment's endpoint, key, and model selection covers OpenAI, Anthropic (compat endpoint), OpenRouter, LM Studio, and Ollama. Client config carries only the proxy URL, a client-side timeout (25s, kept above the Worker's 20s upstream abort), and token budget — the model name lives server-side.

## Consequences

- Provider switches require no client changes; only the Worker env is updated.
- Runtime validation stays structural (see 0010) — it checks JSON shape and valid AST references, not provider-specific quirks.
- The client remains thin: one `fetch()` to the proxy, one validation pass, one fallback route.

## Alternatives considered

- **Multiple provider-specific code paths:** rejected — triple the maintenance surface for zero user-facing benefit; the proxy already abstracts the provider.
- **GraphQL or custom wire format:** rejected — adds a schema layer for a single endpoint; OpenAI-compatible JSON is already the de facto standard and works with every listed provider.
