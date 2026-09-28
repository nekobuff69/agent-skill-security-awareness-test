# Agent Skills Security Self-assessment

## 1. Overview

A single-page web app delivering a self-assessment quiz on AI agent skill security, grounded in the [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10). Two-pass UX: answer all questions → see your profile → review with explanations.

**Design philosophy:** Self-assessment, not knowledge test. Every option reflects a real behavioral choice. Scoring reveals blind spots, not trivia gaps. There are no letter grades — results render as a shareable risk radar and a progression title ("Sentinel", "Newcomer", …), because a mirror shows where you haven't looked yet, not what you failed.

---

## 2. Data Layer

| File                | Role                                                                                           | Updated by     |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `questions.json`    | Question Bank — source of truth for scenarios, Options, scoring, Feedback, Best Practices, OWASP sources | Content author |
| `docs/owasp-ast-full.md` | Full extracted OWASP AST content (~53 KB) — Grounding Corpus               | Content author |
| `docs/architecture.md` | Overview, journey, deployment + ADR index; decisions live in `docs/adr/` | Developer      |
| `docs/TESTING.md`   | Testing spec: schema validation, scoring fixtures, grounding rules                             | Developer      |
| `run_tests.py`      | Stdlib-only Python runner implementing the testing spec                                        | Developer      |

`questions.json` is the **database**. Parsed at load time. No server-side database. Multiple-choice only — nothing the Participant authors reaches the LLM. Prompt-injection surface ≈ zero.

### Runtime Data Flow

Two `fetch()`es on page load — the Question Bank and the Grounding Corpus — parsed once, used everywhere:

```
questions.json + docs/owasp-ast-full.md (each loaded once)
    │
    ├─→ Quiz Renderer
    │     reads: meta, phases[], questions[]
    │     renders: landing stats (meta.total_questions + meta.time_estimate),
    │              quiz chrome (Progress Fill + Question Counter + Phase Chip,
    │              all updating in place), question cards (Q-number chip,
    │              labeled Scenario/Question blocks, A–D-lettered Options),
    │              Back Navigation (← Previous, re-answer overwrites)
    │     collects: option selections → {question_id: option_index}
    │     stores: localStorage {v: bank-content-hash, answers} (survives refresh)
    │
    ├─→ Scoring Engine
    │     reads: questions[].options[].score, questions[].severity_weight,
    │            meta.scoring.severity_values
    │     computes: per-AST aggregates, overall %, title lookup,
    │              ranked views (astRanked weakest-first, blindSpotIds < 70%)
    │
    ├─→ Results Renderer
    │     reads: meta.scoring.titles
    │     renders: Progression Title card, SVG radar (shareable hero, AST-ID +
    │              percentage axis labels), Blind-Spot bars (name + percentage),
    │              Action Plan (cards + collapsed Narrative Expander),
    │              Deep-Dive Prompt, Review/Retake buttons
    │
    ├─→ Deep-Dive Prompt Builder (deterministic)
    │     reads: title, weak ASTs, weakest questions (choice + best_practice)
    │     emits: deep-dive kickoff prompt (≤ 3000 chars)
    │
    ├─→ Action Plan module (js/action-plan.js)
    │     owns the path decision and retry policy (one retry, then fallback)
    │
    │     ├─ LLM Path (via Proxy Worker)
    │     │     reads: title, ranked per-AST scores, weakest questions
    │     │     reads: weak-AST excerpts from docs/owasp-ast-full.md
    │     │     sends: participant profile + Grounding Excerpts
    │     │
    │     └─ Deterministic Fallback
    │           reads: same bank fields as the Deep-Dive Prompt Builder
    │
    │     Either path resolves {narrative, actions, path}; the Results
    │     Renderer renders action cards + Narrative in the expander.
    └─→ Review Screen (own view, reached from the results page)
          reads: questions[], Participant's saved answers
          renders: per-question accordion
                   ├ scenario, question, selected option (highlighted)
                   ├ that option's Feedback (why this choice is risky/sound)
                   ├ Best Practice text
                   └ ast_source_url (clickable OWASP link)
```

**Key:** `questions.json` serves every consumer — rendering, scoring, results, the Deep-Dive Prompt, LLM grounding, Deterministic Fallback, and Review. No secondary content source at runtime.

---

## 3. User Journey

```
┌─────────────────────────────────────────────────────────┐
│  Landing Page                                           │
│  "Based on OWASP Agentic Skills Top 10"                 │
│  "20 questions, 8-12 minutes"  ← from meta              │
│  "Not a test — a mirror."                               │
│  [Start →]                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 1: "Should I Install This?"                      │
│  7 questions — trust, verification, pre-install checks  │
│                                                         │
│  ┌─ Quiz Chrome (sticky) ─────────────┐                  │
│  │  [▓▓░░ fill]  Question 3 / 20      │                  │
│  │  [Phase 1 · Should I Install This?]│                  │
│  └────────────────────────────────────┘                  │
│  Q3 ┌ [Scenario] ──────────────┐                         │
│     └ [Question]               ┘                         │
│  [A] Option  [B] Option  [C] Option  [D] Option          │
│  select → silent save → slide+fade advance               │
│  [← Previous]  (from Q2 onward)                          │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: "What Can It Do to Me?"                       │
│  7 questions — permissions, blast radius, sandboxing    │
│  (same UX)                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: "Is It Still Safe?"                           │
│  6 questions — updates, governance, cross-platform      │
│  (same UX)                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Results Page                                           │
│  ┌─ Your Risk Radar (hero, shareable) ──────┐           │
│  │      AST01 33%                           │           │
│  │  AST10 ╱      ╲ AST02  [Download PNG]    │           │
│  │     …    ✦    …     (ID + % labels)      │           │
│  └──────────────────────────────────────────┘           │
│                                                         │
│  ┌─ Your Blind Spots (detail) ──────┐                   │
│  │  Malicious Skills █████░░░░░░░ 33%│                  │
│  │  Cross-Platform      ██░░░░░░░ 33%│                  │
│  │  …  (weakest first, name + %)    │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Action Plan ───────────────┐                   │
│  │  (LLM-generated or deterministic │                   │
│  │   fallback, OWASP-grounded)      │                   │
│  │  1. [Prioritized action card]    │                   │
│  │  2. [Prioritized action card]    │                   │
│  │  ▸ Why these actions? Read the   │                   │
│  │    analysis (collapsed)          │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Deep-Dive Prompt ──────────┐                   │
│  │  (kickoff prompt for your own    │                   │
│  │   agent app)                     │                   │
│  │  [Copy to Clipboard]             │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Review Your Answers ────────────┐                   │
│  │  [Review your answers →]         │                   │
│  └──────────────────────────────────┘                   │
│        ↓ (separate Review screen)                       │
│  ┌─ Review Screen ──────────────────┐                   │
│  │  [← Back to results]             │                   │
│  │  ▸ Q01: You chose… (expandable)  │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Copy is data.** All landing page and results strings — question count, time estimate, `<title>` — derive from `questions.json` `meta` at render time.

**Key UX decisions:**

- **Three real screens.** Landing, quiz, and results are separate views — the `hidden` attribute actually hides (styles.css enforces it over author display rules).
- **No per-question Feedback during the quiz.** Option saved silently. Momentum preserved.
- **Auto-advance on selection.** Select → save → slide+fade transition. No "Next" button; **Back Navigation** only (← Previous from Q2; re-answering overwrites).
- **The Quiz Chrome never stacks.** One sticky bar: Progress Fill + Question Counter (the question being *viewed*) + Phase Chip updating in place. No phase header cards near the Question.
- **Review is voluntary, on its own screen.** Reached from the results page; navigate back freely; skip it entirely if you want.
- **The Deep-Dive Prompt is the hero artifact.** The thing the Participant takes away and uses.
- **The radar is the shareable moment.** PNG download + Web Share API — results travel without a backend. Severity never renders on the charts; score-band colors alone encode performance.

---

## 4. ADR Index

Design decisions live in `docs/adr/`. Enforcement and invariants live in the testing spec (`docs/TESTING.md`) — never duplicated as prose here.

| # | Decision | File |
|---|---|---|
| 0001 | Vanilla static — no build step, no framework | [0001-vanilla-static-no-build.md](adr/0001-vanilla-static-no-build.md) |
| 0002 | Question Bank as single source of truth | [0002-question-bank-single-source.md](adr/0002-question-bank-single-source.md) |
| 0003 | Deterministic scoring — Option Score × Severity Weight, per-AST aggregates | [0003-deterministic-scoring.md](adr/0003-deterministic-scoring.md) |
| 0004 | Progression Titles replace letter grades | [0004-progression-titles-replace-grades.md](adr/0004-progression-titles-replace-grades.md) |
| 0005 | Risk Radar as shareable hero artifact | [0005-risk-radar-shareable-hero.md](adr/0005-risk-radar-shareable-hero.md) |
| 0006 | Deterministic Deep-Dive Prompt — same artifact on every path | [0006-deterministic-deep-dive-prompt.md](adr/0006-deterministic-deep-dive-prompt.md) |
| 0007 | LLM via Worker proxy — developer-held key, never client-side | [0007-llm-via-worker-proxy.md](adr/0007-llm-via-worker-proxy.md) |
| 0008 | OpenAI-compatible wire format — one code path, many providers | [0008-openai-compatible-single-wire.md](adr/0008-openai-compatible-single-wire.md) |
| 0009 | Deterministic Fallback from the bank when the LLM Path is unavailable | [0009-deterministic-fallback-from-bank.md](adr/0009-deterministic-fallback-from-bank.md) |
| 0010 | Two-layer grounding validation — authoring-time rule checks + runtime structural checks | [0010-two-layer-grounding-validation.md](adr/0010-two-layer-grounding-validation.md) |
| 0011 | Versioned Session storage in localStorage | [0011-versioned-session-storage.md](adr/0011-versioned-session-storage.md) |
| 0012 | Multiple-choice only — no free-text, no prompt-injection surface | [0012-multiple-choice-only.md](adr/0012-multiple-choice-only.md) |
| 0013 | AST Risk registry is a code-side table, not corpus-derived | [0013-ast-registry-code-side.md](adr/0013-ast-registry-code-side.md) |
| 0014 | No bootstrap seam for the corpus load; hand-off lives at the Action Plan interface | [0014-no-bootstrap-seam.md](adr/0014-no-bootstrap-seam.md) |

---

## 5. Deployment

├── index.html
├── config.js
├── styles.css
├── questions.json
├── AGENTS.md
├── UBIQUITOUS_LANGUAGE.md
├── css/
│   ├── quiz.css
│   └── results.css
├── js/
│   ├── analytics.js      # analytics helpers
│   ├── main.js           # app bootstrap, view router
│   ├── quiz.js           # quiz chrome, question cards, back nav, localStorage
│   ├── scoring.js        # deterministic scoring + title lookup
│   ├── session-store.js  # versioned localStorage session
│   ├── prompt-builder.js # Deep-Dive Prompt assembly
│   ├── fallback.js       # deterministic fallback from bank
│   ├── extractor.js      # OWASP excerpt extraction
│   ├── validator.js      # LLM response validation (fence-tolerant)
│   ├── llm-client.js     # Worker call, validation, retry, fallback routing
│   └── results.js        # Title Card, radar + bars, Action Plan, Deep-Dive, Review
├── tests/
│   ├── mock_llm_output.json
│   └── js/
│       ├── run-tests.js
│       ├── test-scoring.js
│       ├── test-session-store.js
│       ├── test-prompt-builder.js
│       ├── test-fallback.js
│       ├── test-extractor.js
│       ├── test-validator.js
│       └── test-grounding.js   # gates the shipped Grounding Corpus itself
├── scripts/
│   ├── preflight.sh
│   └── deploy.sh
├── worker/
│   ├── src/index.js
│   └── wrangler.toml
├── run_tests.py
├── package.json
└── docs/
    ├── architecture.md
    ├── TESTING.md
    ├── owasp-ast-full.md       # Grounding Corpus
    ├── adr/                    # 0001–0014, one decision per note
    └── agents/                 # issue-tracker, triage-labels, domain consumer rules
```

```bash
./scripts/preflight.sh                                # gate: before every deploy
./scripts/deploy.sh                                   # preflight + worker + pages in one
# or individually:
python3 run_tests.py
python3 run_tests.py --llm tests/mock_llm_output.json
node tests/js/run-tests.js
npx wrangler deploy worker/ --name quiz-llm
npx wrangler pages deploy ./ --project-name=agent-security-quiz
```

---

## 6. Future Considerations (v2+)

Multilingual question variants, shareable result URLs, retake tracking, finer Grounding Corpus retrieval, aggregate admin dashboard, embeddable widget for agent platform marketplaces.
