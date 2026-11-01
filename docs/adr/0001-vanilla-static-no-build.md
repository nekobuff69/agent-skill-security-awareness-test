# 0001 — Vanilla Static, No Build

## Status

Accepted — 2026-09-10

## Context

The app targets instant load and hobby-tier deployment. A build step adds latency to every edit cycle and introduces a dependency graph that must be maintained. The site delivers a single quiz — no SSR, no routing, no component tree. The hosting target (Cloudflare Pages) serves static files natively.

## Decision

Vanilla HTML, CSS, and JavaScript — zero package dependencies, no build step. The stylesheet is handwritten (~200 lines). All runtime state lives in localStorage, versioned by the Question Bank's content hash. Hosting is Cloudflare Pages with a companion Worker for the LLM proxy.

Analytics is Plausible, privacy-friendly, emitting exactly four events: `quiz_completed`, `llm_success`, `llm_fallback`, `template_copied`. No PII is collected.

_Amended 2026-09-10: five events — `quiz_started` added on quiz Start (drop-off signal). The "exactly four" contract is superseded; the PRD's story 34 needs the same amendment._

Note: the gate suite is now two runners — `run_tests.py` (stdlib Python, bank + grounding) and `tests/js/run-tests.js` (zero-dependency Node, JS module contracts) — executed together by `scripts/preflight.sh`.

_Amended 2026-11-02 (ticket #51, recorded by #57): "no build step" still means no page build. The Chinese pixel face ships as a subset produced by an offline, repo-side script (`scripts/subset-fusion-pixel.py`, FontTools + Brotli in a throwaway venv) whose outputs — the woff2 and its codepoint inventory — are committed under `fonts/` beside the license. Nothing runs at deploy or at page load, and no font is fetched over the network; the procedure and its rationale live in `fonts/PROVENANCE.md`._

## Consequences

- Any text editor deploys the app; no node_modules, no bundler config, no transpiler.
- The zero-dependency constraint is load-bearing: every dependency must justify its weight against the simplicity budget.
- A bank content change triggers a fresh parse on next page load — no rebuild required.
- `run_tests.py` (stdlib Python) is the deploy gate, not a build artifact.

## Alternatives considered

**Tailwind Play CDN.** Runtime JIT adds ~100 KB, causes FOUC, and is officially not recommended for production. Contradicts the zero-dependency promise and introduces a runtime external to the author's control. Rejected.
