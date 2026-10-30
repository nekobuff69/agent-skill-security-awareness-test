# 0007 — LLM via Worker Proxy

## Status

Accepted — 2026-09-10

## Context

The developer pays; hobby scale is fine. But any key shipped client-side is extractable — from the bundle or network tab — and public Pages URLs are crawlable. `?key=` URL parameters leak into browser history, server logs, and referrers. For a security-awareness app, shipping a key to the browser is the one unacceptable failure mode.

## Decision

A thin proxy Worker (~40 lines) holds `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` in environment secrets. CORS allow-list is the Pages origin only, deny-until-configured by default. In-memory per-IP rate limit at roughly 10 requests per hour. Upstream budget defaults to 20 seconds (env-configurable via `UPSTREAM_TIMEOUT_MS` for slower providers). Provider failures pass through as a structured `{error}` so the client routes to the Deterministic Fallback. No request logging that could capture prompt content.

_Amended 2026-09-10: upstream budget 8s → 20s default (owner decision — hosted inference latency needs headroom; local providers per ADR-0008 are slower still). Client-side timeout (config.js) sits above the upstream abort at 25s so the Worker's structured error reaches the client before the client aborts._

_Amended 2026-10-30: budgets 20s/25s → 30s/35s. First live completions against `deepseek-flash` (a reasoning model) aborted at the 20s upstream budget — 502, retry, fallback — even after pinning `reasoning_effort` server-side (an ADR-0008 provider knob), because tail latency still reached ~20s. The ordering invariant (client above upstream) is unchanged._

## Consequences

- The API key never appears in any client-visible artifact — bundle, network request, URL bar, or logs.
- Rate limiting is coarse but adequate at hobby scale; a single Worker isolate suffices.
- Structured error pass-through keeps the fallback path clean — no special-casing of HTTP status codes.
- No prompt content logging means the app stays privacy-respecting by default.

## Alternatives considered

- **Client-side key prompt:** rejected — every Participant would need their own key; friction kills adoption, and the key still lives in browser memory.
- **`?key=` URL parameter:** rejected — leaks into history, logs, and referrers; unacceptable for a security-awareness app.
- **Build-time key injection:** rejected — the key ends up in the served bundle and is extractable.
- **Key in bundle behind Cloudflare Access:** rejected — authorized users can still extract it from the network tab or bundle source.
