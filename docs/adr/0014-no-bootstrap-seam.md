# 0014 — No Bootstrap Seam for the Corpus Load

## Status

Accepted — 2026-09-28

## Context

The 2026-09-28 architecture review flagged that `main.js` fetches the Grounding Corpus fire-and-forget into a global (`window.Corpus`), while `results.js` decides the Action Plan path by poking that global at Completion time. Whether the LLM Path runs depends on a race between the corpus fetch and the Participant answering 20 Questions — decided by ambient state no test can set.

The proposed refactor was a load module owning both fetches and exposing one interface (`App.ready()` → `{bank, corpus | null}`), making corpus availability explicit.

## Decision

Do not build the load module. The race is real in structure but negligible in practice: the corpus loads in the first seconds of an 8–12 minute quiz, and a failed corpus fetch is exactly the condition under which the Deterministic Fallback is the right answer anyway.

The load-bearing half of the proposal — handing the corpus to the path decision explicitly rather than through ambient globals — already landed as part of the Action Plan module (see the architecture review that produced `js/action-plan.js`): `assemble(report, bank, corpus, config)` receives the corpus as a parameter, so the seam that matters has an interface. What remains un-modeled is only *when* the fetch lands, which the app treats as "before Completion".

Revisit only if: a slow or offline corpus fetch ever produces a user-visible wrong-path decision (LLM Path silently skipped while the corpus was actually available), or the corpus grows beyond one file.

## Consequences

- `window.Corpus` and `window.Bank` remain ambient globals; the Action Plan interface is the only place they are consumed for path decisions.
- No test can force the race; accepted, because forcing it would require modeling a timing failure that cannot be corrected after the fact anyway.
