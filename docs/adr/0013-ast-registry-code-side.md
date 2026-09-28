# 0013 — AST Risk Registry Is a Code-Side Table

## Status

Accepted — 2026-09-28

## Context

The canonical AST Risk names and severities are defined by the OWASP Agentic Skills Top 10 and "as titled in the Grounding Corpus" (see the domain glossary). Before the 2026-09-28 architecture review, the tables were hardcoded twice in code (`results.js` and `fallback.js`), plus a severity table — an OWASP renaming edited two files or drifted silently.

The review considered sourcing the registry from the Grounding Corpus (`docs/owasp-ast-full.md`) at load time, since that file already carries canonical names and severities and is gate-tested.

## Decision

One registry module, `js/ast.js`, holds the canonical id/name/severity tables. Every consumer reads through its interface (`App.AST.ids` / `names` / `severity`) — no consumer keeps its own table.

Sourcing the registry from the Grounding Corpus at load time was considered and rejected:

- The corpus is load-bearing only for the LLM Path (ADR 0007) and may be absent — the Deterministic Fallback must render AST names without it. A corpus-derived registry would couple core rendering to an optional fetch.
- The corpus is prose for grounding, not structured data for identity; parsing identity out of prose adds a fragile extraction step.
- An OWASP renaming is a rare, deliberate event that already touches the corpus, the glossary, and possibly the bank — one code table alongside those edits is not a real cost.

## Consequences

- An OWASP renaming is a one-file edit in code, plus the corpus/glossary updates that any option would require anyway.
- Core rendering (radar, bars, fallback) never depends on the corpus fetch.
- If AST Risks ever number more than ten or change frequently, revisit: that would be the signal that the table wants to be generated data.
