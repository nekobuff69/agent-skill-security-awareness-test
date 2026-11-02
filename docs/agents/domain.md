# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`UBIQUITOUS_LANGUAGE.md`** at the repo root — the glossary: canonical terms, definitions, aliases to avoid, and flagged ambiguities. Use its vocabulary in all output.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. Each records the decision, its consequences, and the rejected alternatives.
- **`docs/architecture.md`** — narrative overview: data flow, user journey, deployment, and the ADR index.
- **`docs/TESTING.md`** — the enforcement spec: the invariants each ADR points at (bank schema, scoring fixtures, grounding rules).

If a file doesn't exist, **proceed silently**. Don't flag its absence.

## Documentation surface

This tree names the documentation surface only; the shipped code and both Bank Variants (`questions.json`, `questions.zh.json`) live at the repo root beside it.

```
/
├── UBIQUITOUS_LANGUAGE.md          # glossary — single home of domain vocabulary
├── docs/
│   ├── architecture.md             # narrative + ADR index (no decisions restated)
│   ├── TESTING.md                  # enforceable checks (no decisions restated)
│   ├── adr/                        # one decision per note: 0001-vanilla-static-no-build.md, ...
│   ├── agents/                     # issue-tracker, triage-labels, domain consumer rules
│   └── owasp-ast-full.md           # grounding corpus (source material, not design)
└── questions.json                  # Question Bank — data, not docs
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `UBIQUITOUS_LANGUAGE.md`. Don't drift to synonyms the glossary explicitly avoids (grade, static-recommendations, bare "score"/"user"/"title").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (propose adding it to the glossary).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0009 (Deterministic Fallback from bank) — but worth reopening because…_
