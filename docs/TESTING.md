# Testing Pipeline — Agent Security Quiz

Rule-based validation only. No LLM-as-judge, no external API calls, no network requests.

---

## 1. Overview

**Purpose:** Validate `questions.json` integrity, scoring math, and LLM output grounding before deployment.

**Approach:** Every check is deterministic. A single Python script reads `questions.json` and a mock LLM output, runs all checks, and exits 0 (all pass) or 1 (any fail).

**Script:** `run_tests.py` (stdlib only — `json`, `re`, `sys`, `os`)

**Usage:**
```bash
python run_tests.py                          # validates questions.json
python run_tests.py --llm mock_llm_output.json  # also validates LLM grounding
```

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

Title thresholds (from `meta.scoring.titles`):
- Sentinel: ≥ 90%
- Practitioner: ≥ 70%
- Aware: ≥ 50%
- Newcomer: ≥ 30%
- Uncharted: < 30%

**Critical detail:** `max_possible` uses the actual maximum option score per question, not a fixed `3`. Two questions (q06, q13) have no score=3 option — their max is 2. This keeps total_possible = 108.

### 3b. Fixture Tests

For each entry in `test_fixtures.scoring_cases`:

| Case | Expected | How to verify |
|---|---|---|
| `all-zero` | 2.8%, title Uncharted | All answers select the lowest-scoring option per question (ties → lowest index). q19 has no score-0 option, so the floor is 3 weighted points (1 × critical weight 3), not zero |
| `all-best` | 100%, title Sentinel | Answers select highest-scoring option per question. `null` answers resolve to the index of the highest-scoring option |
| `common-user` | Title in {Uncharted, Newcomer} | Compute percentage, check title falls in boundary |
| `security-aware` | Title in {Aware, Practitioner} | Compute percentage, check title falls in boundary |

**Null answer resolution:** When an answer is `null`, find the option with the highest `score` and use that. If multiple options tie for highest, use the lowest index.

### 3c. Edge Cases

| Input | Expected behavior |
|---|---|
| Empty answers array `[]` | Scoring engine must raise an error or return an error state (not crash with unhandled exception) |
| Answers shorter than questions (e.g., 10 answers for 20 questions) | Same — must error gracefully |
| Invalid option index (e.g., `5` for a 4-option question) | Same — must error gracefully |
| Non-integer answer (e.g., `"2"`, `2.5`) | Same — must error gracefully |

These are behavioral checks: call the scoring logic with bad input and assert it does not return a valid score.

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

### The prompt the Worker sends

The Worker assembles this prompt (contract, not copy — the app builds it from bank data):

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

{full content for the Participant's weakest 3-5 AST risks — Grounding Excerpts, ADR-0009's corpus strategy}

## Output Format

Return a JSON object matching the schema above.
```

### Rules

#### Rule 1 — No Phantom Statistics

Extract all numbers from the LLM output (regex: `\b\d[\d,\.]*\b`). For each number found:

- Check if it appears (as a substring) in at least one `source_note` field from `questions.json`
- If a number is a common structural value (year like `2026`, single digit, percentage format `%`), allow it without source verification
- Flag any statistic (e.g., `1,184`, `13.4%`, `280+`, `135,000`) not traceable to a `source_note`

**Numbers to allow without source check:** 2, 3, 4, 5, 10, 20 (quiz structural numbers); years `2026`, `2025`; any number followed by `%` if it appears in a title range string.

#### Rule 2 — No Phantom Campaigns

Extract capitalized multi-word proper nouns (regex: `\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b`). Check each against:

**Known valid campaigns** (from `source_note` fields):
- `ClawHavoc`
- `ClawJacked`
- `SkillJacking`
- `ToxicSkills`

Any proper-noun attack campaign name not in this list and not appearing in any `source_note` field → FAIL.

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

- **CLI:** `python run_tests.py` validates the bank; `--llm mock_llm_output.json` additionally validates grounding.
- **Stdlib only** (`json`, `re`, `sys`, `os`, `argparse`); single file in the project root alongside the bank.
- **Exit code:** 0 = all pass, 1 = any failure.
- **Output:** one line per check (`[PASS]` / `[FAIL]`), then a summary line.
- The implementation in `run_tests.py` is the source of truth for mechanics — this spec catalogs the checks, not the code.

### Constraints

- **Stdlib only:** `json`, `re`, `sys`, `os`, `argparse`
- **No imports** beyond stdlib
- **Single file:** `run_tests.py`, placed in the project root alongside `questions.json`
- **Exit code:** 0 = all pass, 1 = any failure
- **Output format:** One line per check with `[PASS]` or `[FAIL]`, then summary

### Expected Check Count (approximate)

- Section 2: ~40 checks (20 questions × ~2 field checks each, plus ~10 global checks)
- Section 3: ~8 checks (4 fixture cases + 4 edge cases)
- Section 4: ~5 checks (one per grounding rule)
- **Total: ~53 checks**

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
| LLM Rule 1 (phantom stat) fails | LLM cited a number not in any `source_note` | Add source_note coverage or remove the claim from the prompt |
| LLM Rule 3 (phantom tool) fails | LLM recommended a tool not in the allowlist | Add to allowlist or remove from prompt |
| Scoring fixture mismatch | Questions reordered but fixture answers not updated | Reorder fixture answers to match questions array order |
| Total possible ≠ 108 | Options modified (score changed or option added/removed) | Recompute max_possible per question; update fixtures |
