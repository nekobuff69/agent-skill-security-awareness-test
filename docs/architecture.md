# Agent Skills Security Self-assessment

## 1. Overview

A no-build web app delivering a self-assessment quiz on AI agent skill security, grounded in the [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10). Two-pass UX: answer all questions → see your profile → review with explanations. One codebase serves both shipped languages — an English page and a Simplified Chinese page — each declaring its own Question Bank and its own locale dictionary at the page level (ADR 0015).

**Design philosophy:** Self-assessment, not knowledge test. Every option reflects a real behavioral choice. Scoring reveals blind spots, not trivia gaps. There are no letter grades — results render as a shareable risk radar and a progression title ("Sentinel", "Newcomer", …), because a mirror shows where you haven't looked yet, not what you failed.

---

## 2. Data Layer

| File                | Role                                                                                           | Updated by     |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `questions.json`    | Question Bank (English) — source of truth for scenarios, Options, scoring, Feedback, Best Practices, OWASP sources | Content author |
| `questions.zh.json` | Bank Variant (Simplified Chinese) — structurally identical to the English bank; authored text only (ADR 0015) | Content author |
| `i18n/en.js`<br>`i18n/zh.js` | Chrome String dictionaries — every user-visible interface string by id, plus the AST Risk display names. A missing id throws (ADR 0015) | Content author |
| `docs/owasp-ast-full.md` | Full extracted OWASP AST content (~53 KB) — Grounding Corpus               | Content author |
| `docs/architecture.md` | Overview, journey, deployment + ADR index; decisions live in `docs/adr/` | Developer      |
| `docs/TESTING.md`   | Testing spec: schema validation, scoring fixtures, grounding rules                             | Developer      |
| `run_tests.py`      | Stdlib-only Python runner implementing the testing spec; discovers every `questions*.json`      | Developer      |

Each page's bank is the **database**, declared by the page itself via `data-bank` on `<html>` and parsed at load. No server-side database. Multiple-choice only — nothing the Participant authors reaches the LLM. Prompt-injection surface ≈ zero.

### Runtime Data Flow

Two `fetch()`es on page load — the page's declared Question Bank and the Grounding Corpus — parsed once, used everywhere. The locale dictionary is not fetched: it is loaded as a `<script>` alongside the other modules and registers itself, so interface copy resolves at render time with no network round-trip:

```
<html lang="…" data-bank="questions.json" data-corpus="…" data-lang-alt="…">
    │  the page declares its own bank, its corpus, and its language route
    ├─→ App.I18n (js/i18n.js + i18n/<lang>.js)
    │     selects the dictionary from document.documentElement.lang
    │     resolves Chrome Strings by id — interface copy and AST Risk
    │     display names; a missing id throws (no English fallback)
    │
questions.json — or a Bank Variant, e.g. questions.zh.json (each loaded once)
    │
    ├─→ Quiz Renderer
    │     reads: meta, phases[], questions[]
    │     renders: landing stats (meta.total_questions + meta.time_estimate),
    │              quiz status bar (phase name + Progress Fill + Question
    │              Counter, all updating in place), question cards (Q-number
    │              chip, labeled Scenario/Question blocks, A–D-lettered
    │              Options), pinned window footer ([< Back]/[Next >];
    │              [Finish] on the last, re-answer overwrites in place)
    │              — ADR-0020
    │     collects: option selections → answers: option_index, one per Question
    │     stores: localStorage quiz-session {v: structural-hash, answers} —
    │            one Session per Participant, shared by every Bank Variant,
    │            so switching language resumes in place (ADR 0017)
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

**Key:** each page's Question Bank serves every consumer — rendering, scoring, results, the Deep-Dive Prompt, LLM grounding, Deterministic Fallback, and Review. Interface copy is not in the bank: it is Chrome Strings resolved from the page's locale dictionary. There is no secondary source of assessment content (ADR 0015).

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
│  Q3 ┌ [Scenario] ──────────────┐                         │
│     └ [Question]               ┘                         │
│  [A] Option  [B] Option  [C] Option  [D] Option          │
│  select → silent save → card wipe advance               │
│  ┌─ footer (pinned) ────────────┐                        │
│  │  [< Back] [Next >]  ([Finish] on the last card)       │
│  └──────────────────────────────┘                        │
│  ┌─ status bar (pinned) ─────────────────────┐           │
│  │  Phase 1 · Should I Install This? [▓▓░░] 3 / 20       │
│  └───────────────────────────────────────────┘           │
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

**Copy is data — and copy is split.** Assessment content (question count, time estimate, app title, subtitle, Phase heading, Progression Title names) still derives from the page's Question Bank `meta` at render time, so a bank edit updates the whole page. Everything else the interface says — button labels, Quiz Chrome text, the soft-reset notice, Deterministic Fallback prose, AST Risk display names — is a **Chrome String** resolved by id from `i18n/<lang>.js`. Neither source is a code literal, and the client config still carries only infrastructure values (ADR 0015).

**Key UX decisions:**

- **Three real screens.** Landing, quiz, and results are separate views — the `hidden` attribute actually hides (styles.css enforces it over author display rules).
- **No per-question Feedback during the quiz.** Option saved silently. Momentum preserved.
- **Auto-advance on the first answer only (ADR 0020).** Select → save → the **Advance Transition** (client-area card wipe, ~160 ms inside the 200 ms beat; instant under prefers-reduced-motion). A revisit re-marks in place and never moves the card. The **pinned window footer** moves both ways: [< Back] from Q2, [Next >] between cards, and [Finish] — enabled exactly at 20/20 — is the sole Completion trigger.
- **The Quiz Chrome never stacks.** One status bar, pinned inside the window below the scrolling body: Progress Fill + Question Counter (the question being *viewed*) + phase name updating in place. No phase header cards near the Question.
- **Review is voluntary, on its own screen.** Reached from the results page; navigate back freely; skip it entirely if you want.
- **The Deep-Dive Prompt is the hero artifact.** The thing the Participant takes away and uses.
- **The radar is the shareable moment.** PNG download + Web Share API — results travel without a backend. Severity never renders on the charts; score-band colors alone encode performance.

### Presentation layer: the retro-OS skin

The interface is a Windows 95 desktop, delivered as a pure CSS override skin (`css/theme-retro-os.css`, linked last on every page) plus a small set of OS shell modules it drives with:

| Module | File | Role |
| ------ | ---- | ---- |
| Boot | `js/boot.js` | Splash gate: a sessionStorage flag (`quiz-os-booted`) decides whether a tab sees the boot splash (1350ms, then a 200ms fade) or an instant load; reduced motion or a prior visit answers "already booted". The overlay masks but never gates data fetching — only rendering waits. |
| Shell | `js/shell.js` + `css/shell.css` | Wraps `#app` in the `.os-window` frame (navy title bar, drawn [—][□][×] marks) and mounts the taskbar: Start button, program button, clock. Owned window controls (minimize/restore/zoom, ticket #43) live here. |
| Windows | `js/windows.js` | The dialog primitive: `App.Windows.openSystemDialog` renders a Win95 system dialog — red warn / navy info circles, beveled command buttons, closes only via its buttons or Escape. One dialog at a time; the backdrop dims the desktop. The shell controller and the state machine are pure modules, testable headlessly. |
| Sound | `js/sound.js` | Period system sounds (e.g. the click that marks an Option). Purely additive — every interaction works silently. |
| WizardNav | `js/wizard-nav.js` | The pure decision core behind the quiz's wizard row (`tapOption`, `canFinish`, `next`, `prev`, the one-fire commit gate behind [Finish], ADR 0020). |

Non-theming contract kept deliberately: the skin only re-points token values and repaints components; the semantic aliases (`--color-bg`, `--color-accent`, `--color-score-*`, `--color-success/--color-warning/--color-error`) keep their names, so the base stylesheets never learn the skin's palette. Motion is era-mechanical or none: the view trace, the card wipes and the Progress Fill run as `steps()` animations and are each disabled under `prefers-reduced-motion` (disjoint selector gates, no `!important`). On mobile (≤480px) the policy is "maximize": the app window fills the viewport above the taskbar, like a foregrounded program; dialog anatomy stacks and buttons wrap. The chrome typefaces are self-hosted (OFL 1.1, `fonts/` with provenance record): W95FA for Latin UI chrome, Silkscreen for display headlines, and a Fusion Pixel 12 SC subset for Han chrome/headings — each pinned by `unicode-range` (W95FA/Silkscreen to Latin + typographic marks, the Fusion subset to CJK ranges) so Han text never lands on a Latin pixel face and Latin runs never land on a CJK one. On the Chinese page the `--font-heading` cascade leads with the Fusion subset (SimSun → 宋体 → Microsoft YaHei → PingFang SC behind it), prose stays on the SimSun-first system stack, and all of the CJK typography overrides are gated on `html[lang^="zh"]` inside `theme-retro-os.css` — both pages link the same stylesheet list. Every visual value is extracted and recorded in the root `design-dna-retro-os.json`; `404.html` restates the dialog idiom script-free (its system-error dialog is plain links) rather than loading app JS.

---

## 4. ADR Index

Design decisions live in `docs/adr/`. Enforcement and invariants live in the testing spec (`docs/TESTING.md`) — never duplicated as prose here.

| # | Decision | File |
|---|---|---|
| 0001 | Vanilla static — no build step, no framework | [0001-vanilla-static-no-build.md](adr/0001-vanilla-static-no-build.md) |
| 0002 | Question Bank as single source of truth — **superseded by 0015** (survives for content) | [0002-question-bank-single-source.md](adr/0002-question-bank-single-source.md) |
| 0003 | Deterministic scoring — Option Score × Severity Weight, per-AST aggregates | [0003-deterministic-scoring.md](adr/0003-deterministic-scoring.md) |
| 0004 | Progression Titles replace letter grades | [0004-progression-titles-replace-grades.md](adr/0004-progression-titles-replace-grades.md) |
| 0005 | Risk Radar as shareable hero artifact | [0005-risk-radar-shareable-hero.md](adr/0005-risk-radar-shareable-hero.md) |
| 0006 | Deterministic Deep-Dive Prompt — same artifact on every path | [0006-deterministic-deep-dive-prompt.md](adr/0006-deterministic-deep-dive-prompt.md) |
| 0007 | LLM via Worker proxy — developer-held key, never client-side | [0007-llm-via-worker-proxy.md](adr/0007-llm-via-worker-proxy.md) |
| 0008 | OpenAI-compatible wire format — one code path, many providers | [0008-openai-compatible-single-wire.md](adr/0008-openai-compatible-single-wire.md) |
| 0009 | Deterministic Fallback from the bank when the LLM Path is unavailable | [0009-deterministic-fallback-from-bank.md](adr/0009-deterministic-fallback-from-bank.md) |
| 0010 | Two-layer grounding validation — authoring-time rule checks + runtime structural checks | [0010-two-layer-grounding-validation.md](adr/0010-two-layer-grounding-validation.md) |
| 0011 | Versioned Session storage in localStorage — **superseded by 0017** (the version stamp is now structural, and the key is unscoped) | [0011-versioned-session-storage.md](adr/0011-versioned-session-storage.md) |
| 0012 | Multiple-choice only — no free-text, no prompt-injection surface | [0012-multiple-choice-only.md](adr/0012-multiple-choice-only.md) |
| 0013 | AST Risk registry is a code-side table, not corpus-derived | [0013-ast-registry-code-side.md](adr/0013-ast-registry-code-side.md) |
| 0014 | No bootstrap seam for the corpus load; hand-off lives at the Action Plan interface | [0014-no-bootstrap-seam.md](adr/0014-no-bootstrap-seam.md) |
| 0015 | Chrome Strings and Bank Variants — narrow the single-source rule to content; interface copy is a dictionary, a missing id throws | [0015-chrome-strings-and-bank-variants.md](adr/0015-chrome-strings-and-bank-variants.md) |
| 0016 | Language-scoped Session storage — `quiz-session:<language>` — **superseded by 0017** | [0016-language-scoped-session-storage.md](adr/0016-language-scoped-session-storage.md) |
| 0017 | Universal Session storage — one `quiz-session` record shared by every Bank Variant; the version stamp hashes bank structure, never authored text | [0017-universal-session-storage.md](adr/0017-universal-session-storage.md) |
| 0018 | First-visit language routing — a Language Preference stored apart from the Session, automatic routing on a strong browser-language signal, and a dismissible offer otherwise | [0018-first-visit-language-routing.md](adr/0018-first-visit-language-routing.md) |
| 0020 | Wizard navigation with explicit commit — one Option per Question, auto-advance only on a first answer, [Finish] as the single Completion path | [0020-wizard-navigation-with-explicit-commit.md](adr/0020-wizard-navigation-with-explicit-commit.md) |
| 0021 | Retro-OS skin replaces the editorial skin — Windows 95 presentation layer with an OS shell, zero-dependency constraint kept | [0021-retro-os-skin-replaces-editorial-skin.md](adr/0021-retro-os-skin-replaces-editorial-skin.md) |

---

## 5. Deployment

├── index.html               # English page — declares data-bank / data-lang-alt
├── zh/
│   └── index.html           # Simplified Chinese page — same app, Bank Variant
├── config.js
├── styles.css
├── 404.html                 # system error dialog — script-free, links the skin's tokens
├── og-card.png              # 1200×630 share card, browser capture of the retro results view
├── design-dna-retro-os.json # design-DNA record for the retro-OS skin (values traced to its CSS)
├── fonts/                  # self-hosted chrome typeface + license + provenance
├── questions.json           # Question Bank (English)
├── questions.zh.json        # Bank Variant (Simplified Chinese)
├── i18n/
│   ├── en.js                # Chrome String dictionary — English
│   └── zh.js                # Chrome String dictionary — Simplified Chinese
├── AGENTS.md
├── UBIQUITOUS_LANGUAGE.md
├── css/
│   ├── quiz.css
│   ├── results.css
│   ├── theme-retro-os.css  # retro-OS (Win95) skin + CJK typography gated on html[lang^="zh"], linked last as override layer
│   ├── boot.css        # splash overlay — sunken groove, stepped navy fill, fade handoff
│   └── shell.css        # retro-OS window frame, taskbar, tray chip, dialogs
├── js/
│   ├── analytics.js      # analytics helpers
│   ├── ast.js            # AST Risk registry — canonical ids + severities; display names are Chrome Strings (ADR-0013, ADR-0015)
│   ├── i18n.js          # Chrome String resolution — dictionary select by lang, t(), throws on missing id (ADR-0015)
│   ├── main.js           # app bootstrap, view router
│   ├── quiz.js           # quiz status bar + pinned footer, question cards, back nav, localStorage
│   ├── scoring.js        # deterministic scoring, title lookup, ranked views
│   ├── session-store.js  # one Session per Participant, structural-hash versioned (ADR-0017)
│   ├── lang-pref.js      # remembered language choice + prompt dismissals (ADR-0018)
│   ├── lang-routing.js   # first-visit routing decision + offer dialog (ADR-0018)
│   ├── boot.js           # splash gate — sessionStorage flag, masked fetches, one-trace handoff (tickets #39/#42)
│   ├── shell.js          # os-window wrap, taskbar, Start menu + About window (tickets #38/#43)
│   ├── windows.js        # window controls state machine + system dialog primitive (ticket #43)
│   ├── sound.js          # period system sounds, Start-menu mute toggle (ticket #41)
│   ├── wizard-nav.js     # pure wizard decisions + Finish commit gate (ADR-0020, ticket #40)
│   ├── prompt-builder.js # Deep-Dive Prompt assembly
│   ├── fallback.js       # deterministic fallback from bank
│   ├── extractor.js      # OWASP excerpt extraction
│   ├── validator.js      # LLM response validation (fence-tolerant)
│   ├── llm-client.js     # Worker call + response validation
│   ├── action-plan.js    # path decision, retry policy, LLM prompt assembly
│   └── results.js        # Title Card, radar + bars, Deep-Dive, Review (pure view)
├── tests/
│   ├── mock_llm_output.json
│   └── js/
│       ├── run-tests.js
│       ├── test-scoring.js
│       ├── test-session-store.js
│       ├── test-prompt-builder.js
│       ├── test-fallback.js
│       ├── test-action-plan.js
│       ├── test-extractor.js
│       ├── test-validator.js
│       ├── test-i18n.js            # dictionary contract — missing id throws, no English fallback
│       ├── test-action-plan-budget.js  # Action Plan prompt stays within llm.budget, trim ladder deterministic
│       ├── test-boot.js            # splash gate — decide(landedFirst, hasFlag, reducedMotion), exactly-once flag, storage fail-open
│       ├── test-wizard-nav.js      # tapOption/canFinish/prev/next decisions + the one-fire Finish commit gate (ADR-0020)
│       ├── test-shell.js           # clock/tick cadence, title-bar button delegation, program button, Start menu via DOM stubs
│       ├── test-windows.js         # window state machine (minimize/restore/zoom/close confirm), dialog primitive, trace classes
│       ├── test-sound.js           # audible() matrix, voice table, mute persistence
│       ├── test-results-retro.js   # retro results: Title Card window frame, radar SVG + dither, review disclosures
│       ├── test-theme-retro-os.js  # static skin/token/integration checks for every entry point
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
    ├── adr/                    # one decision per note — 0001–0018 + 0020–0021
    └── agents/                 # issue-tracker, triage-labels, domain consumer rules
```

```bash
./scripts/preflight.sh                                # gate: before every deploy
./scripts/deploy.sh                                   # preflight + worker + pages in one
# or individually:
python3 run_tests.py
python3 run_tests.py --llm tests/mock_llm_output.json
node tests/js/run-tests.js
npx wrangler deploy --config worker/wrangler.toml   # Worker name `llm-proxy`, declared in that file — no --name override
npx wrangler pages deploy ./ --project-name=agent-security-quiz
```

---

## 6. Future Considerations (v2+)

Multilingual delivery is built (ADR 0015, ADR 0017), so it is no longer an item here. What localization makes possible next, and what remains open:

- **More languages.** Adding a language is now one bank file, one dictionary file, one page, and a stylesheet — no code changes and no build step. The gate picks up the new bank automatically. The open question is which language, and whether the Simplified Chinese AST Risk and Progression Title terminology sets are reviewed by a native speaker before a third set is coined (ADR 0015 verifies structure, not currency).
- **Translation currency.** The one gap localization did not close: no check can tell whether a Bank Variant still says what its source bank says. A shared diff-review step or a per-language freshness signal is the candidate.
- **Shareable result URLs**, retake tracking (ADR 0017 notes the storage shape can extend without changing the versioning mechanism), finer Grounding Corpus retrieval, an aggregate admin dashboard, and an embeddable widget for agent platform marketplaces.
