# Content authoring rules — assessment copy

Confirmed during the 2026-11-03 content refresh (OWASP AST10 Whitepaper V1
alignment + Action Plan / Narrative / Deep-Dive rewrite). Read this before
touching `questions*.json`, `i18n/*.js`, `js/fallback.js`,
`js/prompt-builder.js`, `js/scoring.js`, or `docs/owasp-ast-full.md`.

## 1. Ownership boundaries — what lives where

| Surface | Carries | Must never carry |
| --- | --- | --- |
| **Narrative** (Action Plan, `js/fallback.js` buildNarrative) | Answer analysis: the participant's own choices quoted **in full**, which area is weak, what it means | To-do lists; best practices (they duplicate the actions); judgment labels |
| **Actions** (Action Plan rows, `js/fallback.js` buildActions) | Concrete advice only: one mapped best practice per action | Quotes of the participant's answers; backstory ("why you scored this"); boilerplate tails (the per-action "Refer to OWASP…" line is retired) |
| **Action titles** (i18n `action.AST01`…`action.AST10`) | Curated per-risk imperative labels that **paraphrase** the practice | Verbatim prefixes of the description's first sentence — the title must never repeat the description's opening words |
| **Deep-Dive Prompt** (`js/prompt-builder.js`) | Teaching material per weakest question: scored choice (`scored X out of Y`), the stronger answer with its feedback reason, best practice, OWASP link | — |

Best practices live in the actions; answer analysis lives in the narrative;
never blend the two. Risks without a standout miss merge into one closing
narrative line (`fallback.narrative.others`) so paragraph shapes never repeat.

## 2. Copy style — locked by review 2026-11-03

- Plain, friendly, second person, short sentences. No lecturing labels —
  "limited security awareness" / 「安全意识有限」 are banned phrasing.
  Describe the choice and where it lands ("the option that lands exactly
  where attackers aim first" / 「攻击者最希望你就这么选」), never the person.
- Quote the participant verbatim and in full — the 60-char quote truncation
  is retired on purpose.
- One point per paragraph. Percentages stay: they are the only objective
  anchor in the narrative.
- EN and ZH copy change together, same tone. zh avoids 「请注意」「建议您」
  register; en avoids corporate filler ("reduce your exposure" survived only
  where it states a fact, not as filler).

## 3. Factual grounding rules

- The Grounding Corpus (`docs/owasp-ast-full.md`) is aligned to the **OWASP
  AST10 Whitepaper V1** — the newest upstream revision (content through July
  2026). The web pages are older (March 2026); when they disagree, the
  whitepaper wins. Provenance note lives in `docs/TESTING.md`.
- Every statistic, campaign name and CVE in user-visible copy must trace to
  the corpus. Known upstream corrections already carried: ClawJacked is
  **CVE-2026-32025 / CVSS 7.5** (superseding CVE-2026-28363 / 9.9), the
  135,000-instance exposure is Bitdefender's (Feb 12, 2026), the
  SecurityScorecard patch-lag study is 40,000+ instances / 35.4% RCE, and the
  AST01 "100% combined vectors" claim is softened.
- OWASP checklist item numbers cited in copy (e.g. "checklist 8.6") must
  match the live `checklist.html`.
- Every rendered URL must resolve (HTTP 200). Bank `ast_source_url` values
  flow into the Deep-Dive Prompt and LLM prompts — 10 fixed URLs, verified.
- EN/ZH numerals must agree in substance (write "Jul 2026" vs 「2026 年 7 月」
  freely; the numbers must match).

## 4. Verification discipline

- The LLM grounding gate runs **both directions** in preflight:
  `tests/mock_llm_output.json` must PASS and
  `tests/mock_llm_output_negative.json` must FAIL. The negative fixture is
  the regression that keeps the gate honest — update it if the rules change.
- The Python gate does **not** validate bank-authored copy against the corpus
  (only LLM output). When editing question/feedback copy, trace numbers with
  a script: extract `\d[\d,.]*` from user-visible bank text and check
  membership in the corpus; whitelist structural values (0–5, years, `%`).
- After editing any zh-rendered text (i18n/zh.js or questions.zh.json):
  re-run `python scripts/subset-fusion-pixel.py` — the subset test fails on
  new glyphs. The upstream zip is cached in `$TMP/fusion-pixel-cache`; on a
  proxy 502, pre-warm it with curl (same URL, same filename).
- Structural freeze: question ids, Phase membership, AST mappings, Option
  Scores and severities are version-relevant (Session structural hash).
  Authored-text changes never invalidate a Session; remapping does.

## 5. Architecture invariants touched by copy work

- Action titles and AST display names are Chrome Strings (`i18n/*.js`), not
  bank content and not code constants (ADR 0013/0015). A hardcoded title or
  risk name in any `js/` module is a regression.
- The Deterministic Fallback assembles from bank `best_practice` fields plus
  dictionary templates — it must stay free of statistics and URLs so it
  cannot drift from the corpus.
- The Deep-Dive Prompt is deterministic and identical on both plan paths;
  only the Action Plan (narrative + actions) differs between LLM Path and
  Deterministic Fallback.
- `tests/mock_llm_output.json` is the exemplar of the desired LLM output
  style: concrete first step + verification habit, every statistic
  corpus-traceable. Keep it current when the corpus grows.
