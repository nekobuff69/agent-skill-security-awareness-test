# Agent Skills Security Self-assessment

## 1. Overview

A single-page web app delivering a self-assessment quiz on AI agent skill security, grounded in the [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10). Two-pass UX: answer all questions → see your profile → review with explanations.

**Design philosophy:** Self-assessment, not knowledge test. Every option reflects a real behavioral choice. Scoring reveals blind spots, not trivia gaps. There are no letter grades — results render as a shareable risk radar and a progression title ("Sentinel", "Newcomer", …), because a mirror shows where you haven't looked yet, not what you failed.

---

## 2. Data Layer

| File                | Role                                                                                           | Updated by     |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `questions.json`    | Question Bank — source of truth for scenarios, Options, scoring, Feedback, Best Practices, OWASP sources | Content author |
| `owasp-ast-full.md` | Full extracted OWASP AST content (~53 KB) — Grounding Corpus                                  | Content author |
| `docs/architecture.md` | Overview, journey, deployment + ADR index; decisions live in `docs/adr/` | Developer      |
| `docs/TESTING.md`   | Testing spec: schema validation, scoring fixtures, grounding rules                             | Developer      |
| `run_tests.py`      | Stdlib-only Python runner implementing the testing spec                                        | Developer      |

`questions.json` is the **database**. Parsed at load time. No server-side database. Multiple-choice only — nothing the Participant authors reaches the LLM. Prompt-injection surface ≈ zero.

### Runtime Data Flow

One `fetch()` on page load, parse once, use everywhere:

```
questions.json (loaded once)
     │
     ├─→ Quiz Renderer
     │     reads: meta, phases[], questions[]
     │     renders: landing stats (meta.total_questions + meta.time_estimate),
     │              phase headers, scenario cards, option buttons
     │     collects: option selections → {question_id: option_index}
     │     stores: localStorage {v: bank-content-hash, answers} (survives refresh)
     │
     ├─→ Scoring Engine
     │     reads: questions[].options[].score, questions[].severity_weight,
     │            meta.scoring.severity_values
     │     computes: per-AST aggregates, overall %, title lookup
     │
     ├─→ Results Renderer
     │     reads: meta.scoring.titles
     │     renders: Progression Title card, SVG radar (shareable hero), Blind-Spot bars
     │
     ├─→ Deep-Dive Prompt Builder (deterministic)
     │     reads: title, weak ASTs, weakest questions (choice + best_practice)
     │     emits: deep-dive kickoff prompt (≤ 3000 chars)
     │
     ├─→ LLM Recommendation (via Worker proxy)
     │     reads: title, per-AST aggregates, weakest questions
     │     reads: weak-AST excerpts from owasp-ast-full.md
     │     sends: participant profile + Grounding Excerpts
     │     renders: narrative + action plan  (validates before render)
     │
     ├─→ Deterministic Fallback
     │     reads: same bank fields as the template builder
     │     renders: action plan when the LLM Path is unavailable
     │
     └─→ Review Panel
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
│  [Scenario text]  [Question]                            │
│  ○ Option A   ○ Option B   ○ Option C   ○ Option D      │
│  [Saved ✓] → auto-advance after selection               │
│  [Progress: 3/20]                                       │
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
│                                                         │
│  ┌─ Title Card ─────────────────────┐                   │
│  │  🛡️ Sentinel — 87%               │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Risk Radar (hero, shareable) ──────┐           │
│  │        AST01                             │           │
│  │   AST10 ╱      ╲ AST02                   │           │
│  │     …    ✦    …     [Download PNG]       │           │
│  └──────────────────────────────────────────┘           │
│                                                         │
│  ┌─ Your Blind Spots (detail) ──────┐                   │
│  │  AST03 █████░░░░░░░ 38% [critical]│                  │
│  │  AST02 ███████░░░░░ 62% [high]    │                  │
│  │  …  (weakest first)              │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Action Plan ───────────────┐                   │
│  │  (LLM-generated or deterministic │                   │
│  │   fallback, OWASP-grounded)      │                   │
│  │  1. [Prioritized action]         │                   │
│  │  2. [Prioritized action]         │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Deep-Dive Prompt ──────────┐                   │
│  │  (kickoff prompt for your own    │                   │
│  │   agent app)                     │                   │
│  │  [Copy to Clipboard]             │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Review Your Answers ────────────┐                   │
│  │  ▶ Q01: You chose… (expandable)  │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

**Copy is data.** All landing page and results strings — question count, time estimate, `<title>` — derive from `questions.json` `meta` at render time.

**Key UX decisions:**

- **No per-question Feedback during the quiz.** Option saved silently. Momentum preserved.
- **Auto-advance on selection.** Select → save → transition. No "Next" button.
- **Review is voluntary and at the end.** Expand what you want; skip to the Deep-Dive Prompt otherwise.
- **The Deep-Dive Prompt is the hero artifact.** The thing the Participant takes away and uses.
- **The radar is the shareable moment.** PNG download + Web Share API — results travel without a backend.

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

---

## 5. Deployment

Static site + one proxy Worker.

```
├── index.html
├── config.js
├── questions.json
├── owasp-ast-full.md
├── css/
│   └── style.css
├── js/
│   ├── quiz.js          # rendering, option collection, localStorage
│   ├── scoring.js       # deterministic scoring + title lookup
│   ├── results.js       # Title Card, SVG radar + PNG share, Blind-Spot bars
│   ├── template.js      # Deep-Dive Prompt assembly
│   ├── llm.js           # Worker call, validation, retry, fallback routing
│   └── review.js        # answer review accordion
├── worker/
│   ├── src/index.js
│   └── wrangler.toml
├── run_tests.py
└── mock_llm_output.json
```

```bash
python3 run_tests.py                                # gate: before every deploy
python3 run_tests.py --llm mock_llm_output.json
npx wrangler pages deploy ./ --project-name=agent-security-quiz
npx wrangler deploy worker/ --name quiz-llm
```

---

## 6. Future Considerations (v2+)

Multilingual question variants, shareable result URLs, retake tracking, finer Grounding Corpus retrieval, aggregate admin dashboard, embeddable widget for agent platform marketplaces.
