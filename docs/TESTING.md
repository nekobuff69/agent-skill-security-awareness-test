# Testing Pipeline — Agent Security Quiz

Rule-based validation only. No LLM-as-judge, no external API calls, no network requests.

---

## 1. Overview

**Purpose:** Validate every Bank Variant's integrity, scoring math, LLM output grounding, and the JS module contracts before deployment.

**Approach:** Every check is deterministic. The Python runner (`run_tests.py`) discovers every Bank Variant in the repo root (`questions*.json`), validates each one's schema, scoring fixtures, and grounding rules, and prints every failure with the file it came from. The Node runner (`tests/js/run-tests.js`) executes the JS module tests (pure functions, no browser) — including a gate on the shipped Grounding Corpus itself. Both must pass; `scripts/preflight.sh` runs both as the single pre-deploy gate and exits 0 (all pass) or 1 (any fail).

**Scripts:** `run_tests.py` (stdlib only — `json`, `re`, `sys`, `os`, `glob`, `argparse`) and `tests/js/run-tests.js` (Node, zero dependencies)

**Usage:**
```bash
python3 run_tests.py                          # validates every questions*.json Bank Variant
python3 run_tests.py --llm tests/mock_llm_output.json  # also validates LLM grounding, per Bank Variant
node tests/js/run-tests.js                    # JS module contracts + grounding corpus gate
./scripts/preflight.sh                        # both suites, the pre-deploy gate
```


## 1a. Multi-Bank Discovery

The gate opens **every** Bank Variant in the repository, not one hardcoded path. A second Variant that is malformed — missing Feedback metadata, a broken Option Score, a dangling Phase reference — fails the gate by name instead of shipping silently.

| Concern | Rule |
|---|---|
| Convention | `questions*.json` in the repo root — `questions.json` is the source-language bank, `questions.<tag>.json` is a translated or derived Variant |
| Ordering | Sorted by path, so output is deterministic across runs |
| Empty discovery | Zero Banks found is a gate failure, not a silent pass |
| Per-Bank labelling | Every check message is prefixed with the Bank Variant's filename, e.g. `[FAIL] questions.zh.json Q q06 opt 2: score int 0-3` |
| Sections | Sections 2 and 3 run per Bank Variant; Section 4 runs per Bank Variant too (one LLM output, validated against each) |
| Unreadable Bank | A Bank that will not parse as JSON fails the gate with its filename in the message; other Banks still run |
| `--bank-dir` | Override the discovery directory (default: repo root) |
| `--grounding-source` | Override which bank's `source_note` fields feed the grounding vocabulary (default: `questions.json`) |

---

## 2. Content QA — Schema Validation

### 2a. Per-Question Field Checks

For every object in `questions[]`:

| Check | Rule |
|---|---|
| Required fields present | `id`, `phase`, `ast_risks`, `severity_weight`, `scenario`, `question`, `options`, `best_practice`, `ast_source_url`, `source_note`, `test` |
| Options length | `len(options) == 4` |
| Option structure | Each option has `text` (non-empty string) and `score` (integer 0–3) |
| Score distribution | At least one option has `score == 3`. If `test.canonical_answer_index` is `null`, no option has score 3 (highest is 2); otherwise exactly one option has score 3 |
| ast_risks values | Every element matches `AST0[1-9]` or `AST10` |
| severity_weight | One of `"critical"`, `"high"`, `"medium"` |
| ast_source_url format | Starts with `https://owasp.org/www-project-agentic-skills-top-10/ast` and ends with `.html` |
| best_practice | Non-empty string, ≥ 20 characters |
| scenario | Non-empty string |
| question | Non-empty string |
| source_note | Non-empty string |
| test.canonical_answer_index | If not `null`, equals the index of the option with `score == 3`. If `null`, verify no option has `score == 3` |
| test.expected_weighted_max | Equals `3 × severity_values[severity_weight]` (metadata invariant, not the runtime max_possible) |

### 2b. Global Structural Checks

| Check | Rule |
|---|---|
| meta.scoring.severity_values | `{critical: 3, high: 2, medium: 1}` |
| meta.scoring.titles length | Exactly 5 entries |
| Title thresholds | Strictly descending numeric values, unique (90, 70, 50, 30, 0); each entry has numeric `threshold`, non-empty `name`, `emoji` |
| meta.total_questions | Equals `len(questions)` |
| phases length | Exactly 3 entries |
| Phase structure | Each phase has `id`, `title`, `description`, `question_ids` (array) |
| Phase question count | phase1 has 7, phase2 has 7, phase3 has 6 |
| Phase-question mapping | Every ID in a phase's `question_ids` exists in `questions[]` |
| Reverse mapping | Every question's `phase` field matches the phase whose `question_ids` contains its `id` |
| No orphan questions | Every question ID appears in exactly one phase's `question_ids` |
| No duplicate question IDs | All 20 IDs are unique |
| No duplicate phase IDs | All 3 phase IDs are unique |

---

## 3. Scoring Verification

### 3a. Scoring Formula

```
severity_values = {critical: 3, high: 2, medium: 1}

For each question q with selected option index i:
  option_score      = q.options[i].score
  severity_weight   = severity_values[q.severity_weight]
  weighted_score    = option_score × severity_weight
  max_possible      = max(opt.score for opt in q.options) × severity_weight

total_earned    = Σ weighted_score across all questions
total_possible  = Σ max_possible across all questions
percentage      = (total_earned / total_possible) × 100
title = first title where percentage ≥ title.threshold
```

Title thresholds (from `meta.scoring.titles`): ≥ 90%, ≥ 70%, ≥ 50%, ≥ 30%, < 30% — five rungs, strictly descending. In the source-language bank those rungs are named Sentinel, Practitioner, Aware, Newcomer, and Uncharted; the gate never hardcodes those names (see §3b).

**Critical detail:** `max_possible` uses the actual maximum option score per question, not a fixed `3`. Two questions (q06, q13) have no score=3 option — their max is 2. This keeps total_possible = 108.

### 3b. Fixture Tests

For each entry in `test_fixtures.scoring_cases`:

| Case | Expected | How to verify |
|---|---|---|
| `all-zero` | Percentage matches the bank; Progression Title is the lowest ladder rung | All answers select the lowest-scoring Option per Question (ties → lowest index). q19 has no score-0 Option, so the floor is 3 weighted points (1 × critical Severity Weight 3), not zero |
| `all-best` | 100%; Progression Title is the highest ladder rung | Answers select the highest-scoring Option per Question. `null` answers resolve to the index of the highest-scoring Option |
| `common-user` | Progression Title is one of the two lowest ladder rungs | Compute the percentage, resolve the rung, check it is a bottom-of-ladder rung |
| `security-aware` | Progression Title is one of the middle ladder rungs | Compute the percentage, resolve the rung, check it is a middle rung |

**Language independence:** every title assertion compares *which rung of `meta.scoring.titles`* the percentage resolves to — by threshold, not by name — so a Bank Variant carrying a translated Title Ladder passes the same fixtures the source-language bank passes. `all-zero` and `all-best` additionally cross-check the bank's own declared `expected_title` against the resolved rung, so a mistranslated or reordered ladder still fails.

**Length independence:** edge-case inputs are sized from `len(questions)` rather than a hardcoded 20, so a Variant with a different Question count neither spuriously fails nor false-passes.

**Null answer resolution:** When an answer is `null`, find the Option with the highest `score` and use that. If multiple Options tie for highest, use the lowest index.

### 3c. Edge Cases

| Input | Expected behavior |
|---|---|
| Empty answers array `[]` | Scoring engine must raise an error or return an error state (not crash with unhandled exception) |
| Answers shorter than questions (e.g., 10 answers for 20 questions) | Same — must error gracefully |
| Invalid option index (e.g., `5` for a 4-option question) | Same — must error gracefully |
| Non-integer answer (e.g., `"2"`, `2.5`) | Same — must error gracefully |

These are behavioral checks: call the scoring logic with bad input and assert it does not return a valid score.

### 3d. Variant Equivalence

Schema validation runs each Bank Variant **on its own terms**. That is necessary but not sufficient: a translated file can satisfy every schema rule and still have drifted, because a Variant that re-weights one Question and compensates elsewhere still sums to Total Possible. Section 3d compares every language-independent field of each Variant against the source-language bank, so scoring drift is named rather than absorbed.

| Compared | Rule |
|---|---|
| Question ids | The Variant covers exactly the source bank's set |
| Question array order | Identical, position for position. **The one structural field no id-keyed comparison can see.** Scoring resolves a stored Session against `questions[i]` and never looks a Question up by id, so a Variant that reorders the array silently re-attributes every answer a Participant gave in that language. The failure names the first index where the two orders diverge. Ordering both banks identically is not a mismatch |
| `phase`, `severity_weight`, `ast_source_url` | Identical per Question |
| `ast_risks` | Same set per Question |
| Option `score` list | Identical **and in the same order** — the index is what an answer selects |
| `test` block | Identical per Question |
| `question_ids` per Phase | Identical membership, not merely the same set of ids |
| `severity_values` | Identical |
| `titles[].threshold`, `titles[].emoji` | Identical — a Variant may rename its Progression Title rungs, never move them |
| `test_fixtures` | Same fixture ids, answers, and expected percentages. `expected_title` is **excluded**: renaming the ladder is what a Variant is for, so a translated fixture's `expected_title` legitimately differs from the source's |

Authored text is the one thing a Variant may differ on. Its **currency** — whether it still says what the English says — is not mechanically checkable, and this section makes no attempt to fake it; that limit is recorded in ADR-0015.

---

## 4. LLM Output Grounding

Validate a mock LLM output JSON against rule-based constraints. This ensures the LLM recommendation system can't hallucinate beyond the OWASP source material.

### Input Format

The mock LLM output (`mock_llm_output.json`) matches the structure the app validates against (ADR-0010, runtime layer):

```json
{
  "narrative": "string — 2-3 paragraph risk assessment",
  "actions": [
    {
      "priority": 1,
      "title": "string",
      "description": "string",
      "ast_source": "AST0X — Risk Name"
    }
  ]
}
```

### The prompt the client sends (via the Worker)

The client's Action Plan module (`js/action-plan.js`) assembles this prompt (contract, not copy — built from bank data); the Proxy Worker forwards it to the Provider (ADR-0007):

```markdown
## System Instruction

You are a security advisor analyzing a user's self-assessment results
on AI agent skill security, based on the OWASP Agentic Skills Top 10.

Your task: generate a personalized risk assessment and action plan.

RULES:

- Every factual claim MUST trace to the provided OWASP source material
- Do NOT invent attack scenarios or statistics not in the source
- Do NOT fabricate OWASP recommendations — use only what's provided
- If the source material doesn't cover a specific situation, say so
- Write for a non-technical audience — plain language, no jargon
- Tone: helpful advisor, not alarmist or condescending

## Participant Data

Title: {title_name} ({emoji})
Overall: {percentage}%

Per-AST Scores:
{for each AST risk:}
- {risk_id} ({risk_name}, {severity}): {earned}/{possible} ({percentage}%)

Weakest Questions (lowest performance):
{for each weak question:}
- {question_id}: Chose "{selected_option_text}" (score: {score}/3)
  Scenario: {scenario}
  Best Practice: {best_practice}
  OWASP Source: {ast_source_url}
## OWASP Source Material

{Description + Real-World Evidence + Preventive Mitigations for the
Participant's weakest 3-5 AST risks — Grounding Excerpts, ADR-0009's corpus
strategy}

## Output Format

Return ONLY a JSON object, no markdown fences, no commentary:

{
  "narrative": "2-4 sentence plain-language analysis of the Participant's
    blind spots, referencing their own choices and the OWASP evidence above",
  "actions": [
    {
      "priority": 1,
      "title": "short imperative action title",
      "description": "1-2 sentences: what to do and why, grounded in the
        source material",
      "ast_source": "AST01"
    }
  ]
}

Rules: 3-5 actions, most important first (priority 1 = first). Each action
must be grounded in the provided material: its ast_source must be an AST ID
covered by the OWASP Source Material or Weakest Questions sections, and its
description must trace to that material.
```

### Rules

#### The Grounding Corpus

Rules 1 and 2 compare the LLM output against a single **source-language** vocabulary, not against the Bank Variant under test:

```
grounding text = docs/owasp-ast-full.md
              + every source_note field of the source-language bank
```

`GROUNDING_CORPUS_PATH` names the corpus and it is loaded once per run, then reused for every Bank Variant (`--grounding-source` overrides which bank contributes the `source_note` fields). This matters because a translated Bank Variant's `source_note` fields are prose in another language: an English campaign name like `ClawHavoc` in an LLM output would otherwise be rejected as phantom, and translated numerals could raise spurious phantom-statistic hits. Every Bank Variant, in any language, is validated against the same source-language vocabulary. If the corpus or the source-language bank cannot be read, the gate fails rather than comparing against an empty string.

#### Rule 1 — No Phantom Statistics

Extract all numbers from the LLM output (regex: `\b\d[\d,\.]*\b`). For each number found:

- Check if it appears (as a substring) in the Grounding Corpus — see the source-language corpus note above
- If a number is a common structural value (year like `2026`, single digit, percentage format `%`), allow it without source verification
- Flag any statistic (e.g., `1,184`, `13.4%`, `280+`, `135,000`) not traceable to that corpus

**Numbers to allow without source check:** 2, 3, 4, 5, 10, 20 (quiz structural numbers); years `2026`, `2025`; any number followed by `%` if it appears in a title range string.

#### Rule 2 — No Phantom Campaigns

Extract capitalized multi-word proper nouns (regex: `\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b`). Check each against:

**Known valid campaigns** (from the Grounding Corpus):
- `ClawHavoc`
- `ClawJacked`
- `SkillJacking`
- `ToxicSkills`

Any proper-noun attack campaign name not in this list and not appearing in the Grounding Corpus → FAIL. The corpus is source-language, so this rule behaves identically for a translated Bank Variant.

#### Rule 3 — No Phantom Tools

Extract tool/product names from the output. Check against allowlist:

```
OWASP, Snyk, NVIDIA SkillSpector, Semgrep, Bandit, Gitleaks,
TruffleHog, Caterpillar, Pipelock, OpenClaw, Claude Code, Cursor,
ClawHub, skills.sh, Microsoft Defender, Anthropic
```

Any tool name not in the allowlist → FAIL. Use case-insensitive matching.

#### Rule 4 — URL Validation

Extract all URLs from the output (regex: `https?://[^\s\)"'>]+`). Each must satisfy at least one:

- Matches an `ast_source_url` from `questions.json`
- Domain is in: `owasp.org`, `github.com`
- Is a fragment/anchor of a valid OWASP URL

Any URL not meeting these criteria → FAIL.

#### Rule 5 — Actions Reference AST

For each item in `actions[]`:

- `ast_source` field must be present and non-empty
- Must match pattern `AST\d{2}` (e.g., `AST01`, `AST10`)
- Must be a valid AST ID that exists in the question bank's `ast_risks` fields

#### Rule 6 (moved) — Deep-Dive Prompt Budget

`prompt_template` is no longer LLM output. The app assembles the deep-dive prompt
deterministically (ADR-0006), so the 200-3000 character budget is now a
**builder invariant** covered by fixture tests, not an LLM-output rule. Section 4
has five grounding rules.

---

## 5. Test Runner — `run_tests.py`

### Runner contract

- **CLI:** `python run_tests.py` validates every discovered Bank Variant; `--llm mock_llm_output.json` additionally validates grounding, once per Bank Variant; `--bank-dir` and `--grounding-source` override discovery and the source-language bank.
- **Stdlib only** (`json`, `re`, `sys`, `os`, `glob`, `argparse`); single file in the project root alongside the banks.
- **Exit code:** 0 = all pass, 1 = any failure. Zero Bank Variants discovered is a failure.
- **Output:** one line per check (`[PASS]` / `[FAIL]`), each prefixed with the Bank Variant it came from, then a bank list and a summary line.
- The implementation in `run_tests.py` is the source of truth for mechanics — this spec catalogs the checks, not the code.

### Constraints

- **Stdlib only:** `json`, `re`, `sys`, `os`, `glob`, `argparse`
- **No imports** beyond stdlib
- **Single file:** `run_tests.py`, placed in the project root alongside the banks
- **Exit code:** 0 = all pass, 1 = any failure
- **Output format:** One line per check with `[PASS]` or `[FAIL]` and the Bank Variant's filename, then bank list and summary

### Expected Check Count (per Bank Variant, drifts with content)

Counted on the banks as shipped (ticket #57):

- Section 2: 660 checks per Bank Variant (per-field expansion across 20 Questions and their 80 Options, plus global checks)
- Section 3: 12 checks per Bank Variant (4 fixture cases + 4 edge cases + sub-assertions)
- Section 3d: 129 checks **per non-source Variant** (the source-language bank is its own reference and is skipped) — 6 per Question (120) plus Question-id coverage, Question array order, one per Phase membership (3), Severity Weights, Title Ladder thresholds, Title Ladder emoji, and the fixture shapes. The runner prints this section under the label `Section 3b: Variant Equivalence`
- Section 4: 7 checks per Bank Variant (the five grounding rules)
- **Two banks as shipped: 1473 checks** without `--llm` (660 + 660 schema, 12 + 12 scoring, 129 equivalence) and **1487 with** (those 1473 plus 7 + 7 grounding). With *n* discovered Banks the total scales with *n*, and every check carries its Bank Variant's filename.


---

## 6. Node Module Gate — `tests/js/run-tests.js`

Zero-dependency runner over the JS modules (pure functions, no browser). Discovers `tests/js/test-*.js`; each file exports `name` + `run()` returning `[{pass, message}]`, or a Promise of that list for the async suites (`test-action-plan.js`, `test-rerender.js`, `test-lang-switch.js`). Exit 0/1. **As shipped at ticket #57 the gate runs 23 module tests and 757 checks** — `node tests/js/run-tests.js` ends with `757 passed, 0 failed, 757 total`. Covered:

| Module test | Checks | Asserts |
|---|---|---|
| `test-scoring.js` | 43 | Fixtures (all-zero 2.8%/Uncharted, all-best 100%/Sentinel, common-user, security-aware), 108 Total Possible, Multi-Mapping aggregation, graceful error states, weakest questions, ranked views (`astRanked` weakest-first with AST-ID tie-break, `blindSpotIds` = AST Risks below 70%) |
| `test-session-store.js` | 30 | Save/load roundtrip; the structural hash is identical across Bank Variants and changes on Question reorder / Option re-score / Severity Weight change but not on rewording; stale-hash soft reset; corrupt/empty storage; answer-payload validation; migration from the ADR-0016 language-scoped keys (most-advanced record wins, legacy keys deleted, live record never overwritten); `exists()` reports a Session without a bank |
| `test-lang-pref.js` | 21 | Language Preference roundtrip and tag normalization, pinned against the dictionary normalizer on every tag; no dismissal operation and no dismissal bookkeeping anywhere, with a legacy record keeping only the language choice; independence from the Session lifecycle and survival of a stale-Session reset; corrupt and wrongly-typed stored data degrade to a usable shape; every operation survives unavailable storage (ADR-0018 as amended by #54) |
| `test-lang-routing.js` | 24 | Automatic routing on the browser's primary language, including tag variants and the mirror-image page; a recorded preference, an in-progress Session, an unknown browser language and a single-language page each suppress it; a failure degrades silently; the decision is recorded once and can never route back; no offer entry point, offer code path or offer copy id survives in either module or either dictionary (ADR-0018 as amended by #54) |
| `test-lang-switch.js` | 74 | The Locale Swap (ADR-0019): in-place dictionary + Bank Variant swap on the splash, answering, results and review views with the Question, answers, score report and scroll position preserved; `<html lang>`, `document.title` and URL sync with one `pushState` entry per switch and `popstate` reconciliation; the per-locale Action Plan Narrative slot — an in-flight request waits behind its own localized loading string, never paints into the other language, and never generates twice; idle prefetch and its silent failure; the dismissible non-blocking notice and its auto-dismiss; one swap at a time; the unknown-view record-and-navigate fallback; the authored `data-lang-alt*` markup contract |
| `test-i18n.js` | 35 | Dictionary contract — the required Chrome String ids resolve in both locales (including `lang.switchUnavailable`), a missing id throws, no English fallback, `baseLocale` normalization |
| `test-prompt-builder.js` | 6 | Four sections in order, ≤ 3000 chars, Weakest Questions carried, weakest-first profile order from `astRanked` |
| `test-fallback.js` | 7 | Schema parity with LLM output, weakest-first ordering from `blindSpotIds`, valid AST attribution |
| `test-action-plan.js` | 21 | Path decision and retry policy at the module seam: no proxy / no corpus → fallback, LLM success → pass-through, one retry then fallback (ADR-0009), thrown adapter → fallback |
| `test-action-plan-budget.js` | 32 | Action Plan prompt stays within `t('llm.budget')` in both locales, worst-case and real-report sizing, the trim ladder is deterministic, the budget is read from the dictionary as a number |
| `test-extractor.js` | 21 | Per-AST slicing (description / evidence / mitigations) |
| `test-validator.js` | 25 | Accepts valid output; rejects malformed JSON, unknown AST refs, short narrative; tolerates one markdown fence |
| `test-grounding.js` | 13 | The shipped `docs/owasp-ast-full.md` yields all 10 AST Risks with non-empty Description/Evidence/Mitigations — a corpus edit that breaks extraction fails the gate |
| `test-boot.js` | 24 | Splash gate — `decide(landedFirst, hasFlag, reducedMotion)` across fresh landing, flagged tab, mid-quiz/review restore and reduced motion; the `quiz-os-booted` flag is namespaced and written exactly once; throwing or missing storage fails open to an instant boot; a committed desktop Record suppresses the splash and takes the landing out of the first paint even with no Session present, no Record leaves the boot exactly as before, and a store that cannot answer is not a Record (tickets #39/#63) |
| `test-desktop-store.js` | 33 | The per-tab desktop Record (ticket #63): `quiz-desktop` in sessionStorage and never localStorage, the one write at the Finish Commit with the structural hash, answers, language, every Window Record and the active program; restore recomputes the report through `App.Scoring` under the page's Bank Variant, re-renders with no `quiz_completed` and the Action Plan request held off, and puts the Records back through the core before the render; stale hash / incomplete answers / malformed / unparsable payloads and an unavailable store all discard quietly; the Record round-trips through `App.Desktop.createCore`, whose `loadSnapshot` is all-or-nothing |
| `test-quiz.js` | 64 | The Welcome Splash renders the compact card with no language offer wired in; Question Card scaffolding; the in-window status bar (phase pane, Progress Fill, Question Counter) and pinned footer in order, with the retired floating chrome kept out of the DOM; `quiz.css` keeps exactly one scrolling element; wizard row behavior on revisit; the desktop Record asked for exactly once at the Finish Commit and never by the load path, with a complete but uncommitted Session still resuming on the last Question with `[Finish]` live (ticket #63) |
| `test-rerender.js` | 32 | The issue #48 seam: `activateBank` rebuilds the visible view — splash, answering, results, Review — from current state after a bank swap, keeping the Question position, every recorded answer, the viewed counter, the answered fill and the same cached score report (never recomputed); `loadBankFrom` swaps a caller-supplied bank and re-renders in place; `fetchBank` surfaces HTTP failures to the caller |
| `test-wizard-nav.js` | 33 | `tapOption`/`canFinish`/`prev`/`next` decisions + the one-fire Finish commit gate (ADR-0020) |
| `test-shell.js` | 56 | Taskbar build and refresh (Start button, program button, the two-segment Language Toggle that replaced the tray clock), title-bar button delegation and its real glyphs, Start menu, `recordChoice`'s record-then-navigate fallback (tickets #43/#49/#50), and the desktop shortcut column (#62): one keyboard-reachable icon per program in the stable order, labels from both dictionaries, re-resolved by the Locale Swap, double-click/Enter/Space launching through the ONE launch action, a single click launching nothing, and the stylesheet rule that the column exists only above 768px |
| `test-windows.js` | 130 | Window state machine (minimize/restore/zoom/close confirm), the system-dialog primitive (one at a time, button/Escape only), trace classes |
| `test-sound.js` | 27 | `audible()` matrix, voice table, mute persistence |
| `test-results-retro.js` | 46 | Retro results: Title Card rendered as a window frame with the shell's drawn [—][□][×] marks and localized aria-labels, radar SVG geometry + score-band dither + AST-ID/percentage labels with no severity anywhere, Blind-Spot bars, Review disclosures with square [+]/[-] glyphs, PNG export sizing, and #56's re-anchor — the Progression Title and Weakest Question prose re-anchor to the active Bank Variant while every number stays the cached report's own and the report itself is never mutated |
| `test-cjk-font-subset.js` | 8 | The committed Fusion Pixel subset and its codepoint inventory exist; every CJK-range codepoint `i18n/zh.js` and `questions.zh.json` render is in the inventory, and no unused codepoint is left in it — both directions say "re-run `scripts/subset-fusion-pixel.py`" (`fonts/PROVENANCE.md`) |
| `test-theme-retro-os.js` | 79 | Static skin/token/integration checks for every entry point: the linked stylesheet list, token re-pointing, bevel and dialog anatomy, `prefers-reduced-motion` gates, `unicode-range` pins |
| `test-desktop-core.js` | The DOM-free Desktop Core (ticket #59) driven directly at the pure seam: the Window Record transitions (minimize/restore to Last Mode and Last Geometry, maximize toggle, hide, the End Program Gate that refuses every other transition, geometry writes refused while maximized), the mode-derived consequences (visible, taskbar membership, focus participation), fresh-copy snapshots, and the fact that the Window Manager's machine delegates to the core rather than owning state; plus the results presenter's Action Plan and Deep-Dive Prompt Section Mount Points resolving live across the in-place language-switch re-render |
| `test-windows.js` | The Window Manager over DOM stubs: landing/quiz/results gating of [—][□][×], the minimize/restore/maximize trace classes, the mobile (≤768px) gate, the reusable system-dialog keyboard contract, and the Desktop Regime (ticket #60) — the Geometry painted on the frame only on results/review, title-bar drag and corner-grip resize written through the core's geometry seam, the clamp (minimum size, title bar never under the taskbar, walls and back inside one gesture), writes refused while maximized and on the mobile layout, [×] = hide() with the put-away window leaving the taskbar for every program (the #61 Quiz button bridge is retired, #62) and the minimized window still restored by its button, the desktop-shortcut launch (`launchProgram`) restoring a hidden window at its Last Mode and Last Geometry, raising a running one, and opening an unarrived program exactly once, and [×] = the End Program dialog on the flow stages |

---

## Appendix A — `mock_llm_output.json`

A valid mock output for testing Section 4. Every claim traces to `source_note` fields.

```json
{
  "narrative": "Your results reveal significant blind spots in three critical areas of agent skill security. Most concerning is your pattern around skill installation trust — you scored lowest on questions about verifying publishers before installing skills. The ClawHavoc campaign in January 2026 exploited exactly this trust gap, publishing 1,184 malicious skills across 12 accounts on a major marketplace. Five of the top seven most-downloaded skills were confirmed malware.\n\nYour second area of concern is permission management. You tended to accept broad permissions without scoping them to the skill's actual function. OWASP research found 280+ skills exposing API keys and PII beyond their declared function. A calendar skill requesting shell execution and full file system access is a red flag that marketplaces won't catch for you.\n\nYour strongest area is post-installation awareness — you show good instincts about update verification and runtime monitoring. Building on this strength, consider applying the same scrutiny to the pre-installation phase where most damage originates.",
  "actions": [
    {
      "priority": 1,
      "title": "Verify publisher identity before every skill install",
      "description": "Check the publisher's account history, other published skills, and cross-reference with known attack campaigns. In the ClawHavoc campaign, 12 accounts that looked legitimate published malware. Don't trust download counts or reviews as safety signals.",
      "ast_source": "AST01 — Malicious Skills"
    },
    {
      "priority": 2,
      "title": "Scope permissions to match the skill's stated function",
      "description": "Review each permission request against what the skill actually needs. A calendar skill needs network access for syncing — it doesn't need shell execution or full file system access. Deny permissions that exceed the skill's purpose.",
      "ast_source": "AST03 — Over-Privileged Skills"
    },
    {
      "priority": 3,
      "title": "Run SKILL.md through a security scanner",
      "description": "Human eyes can't see hidden instructions embedded via ASCII control characters, zero-width Unicode, or base64 encoding. Use a scanning tool that checks for these patterns — OWASP specifically recommends this in the AST04 checklist.",
      "ast_source": "AST04 — Insecure Metadata"
    },
    {
      "priority": 4,
      "title": "Enable sandboxing for all installed skills",
      "description": "Skills execute in your full user permission context by default. Microsoft Defender warned that agents should be treated as untrusted code execution with persistent credentials. Enable sandboxing to limit what any single skill can reach.",
      "ast_source": "AST06 — Weak Isolation"
    }
  ]
}
```

---

## Appendix B — Common Failure Modes

| Failure | Likely cause | Fix |
|---|---|---|
| `canonical_answer_index` check fails | Options were reordered; score=3 option moved | Reorder or update index |
| `expected_weighted_max` check fails | severity_weight changed without updating test metadata | Sync `test.expected_weighted_max` with `3 × severity_values[severity_weight]` |
| Phase-question mapping fails | Question added/removed without updating phase `question_ids` | Sync phase arrays |
| Failures name only a `questions.<tag>.json` file | That Bank Variant is malformed while the source-language bank is fine | Fix the named Variant; check messages always carry the Bank Variant's filename |
| `No Bank Variant found matching questions*.json` | The bank was renamed or moved out of the discovery directory | Restore the `questions*.json` naming convention, or point `--bank-dir` at the right directory |
| LLM Rule 1 (phantom stat) fails for every Bank Variant | The Grounding Corpus or source-language bank is unreadable | The gate already fails loudly in that case; check `docs/owasp-ast-full.md` exists and `--grounding-source` points at a readable bank |
| LLM Rule 1 (phantom stat) fails | LLM cited a number not in any `source_note` | Add source_note coverage or remove the claim from the prompt |
| LLM Rule 3 (phantom tool) fails | LLM recommended a tool not in the allowlist | Add to allowlist or remove from prompt |
| Scoring fixture mismatch | Questions reordered but fixture answers not updated | Reorder fixture answers to match questions array order |
| Total possible ≠ 108 | Options modified (score changed or option added/removed) | Recompute max_possible per question; update fixtures |
