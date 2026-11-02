# 0015 — Chrome Strings and Bank Variants

## Status

Accepted — 2026-10-02. Supersedes [0002 — Question Bank as Single Source](0002-question-bank-single-source.md).

## Context

ADR 0002 decided that the Question Bank is the only runtime database and that all display copy derives from bank metadata, cutting a secondary content file because a second source duplicated bank content at the highest authoring cost and rotted on every bank edit. That reasoning was correct when written.

Localization invalidates it by introducing a requirement, not by new evidence. Chinese-language delivery needs two things ADR 0002 does not permit: interface strings that are not assessment content (labels, buttons, notices, the Deterministic Fallback's prose) and cannot sensibly live in a bank, and a full Question Bank in the second language. The old rule cannot be satisfied and the capability shipped at once — so the rule has to be narrowed rather than the capability deferred.

## Decision

**The single-source rule survives for Question Bank content. Interface copy becomes a separate, explicitly-named thing: Chrome Strings.**

**Chrome Strings.** Every user-visible interface string resolves through a dictionary keyed by string id, in `i18n/en.js` and `i18n/zh.js`. `js/i18n.js` exposes `App.I18n` (`register`, `use`, `t`, `astName`, `format`, `baseLocale`); a page selects its dictionary from `document.documentElement.lang`. One id set, both languages — the two dictionaries carry identical id sets. A missing id **throws**. There is no English fallback and no empty-string fallback: the failure surfaces at one well-defined place (dictionary resolution) instead of silently rendering English into a Chinese page or blank text into either.

The dictionary also owns the AST Risk display names (`ast.AST01`…`ast.AST10`), which were duplicated in `js/ast.js` and `js/fallback.js`. `js/ast.js` now holds only the language-independent `ids` and `severity`. The Simplified Chinese names are a fixed, deliberately chosen terminology set held in `i18n/zh.js`, not text assembled per file — which is what keeps one name per AST Risk across the Risk Radar, Blind-Spot Bars, Action Plan, Deterministic Fallback, and the LLM Path prompt. A Bank Variant supplies its display names through its own locale's dictionary and never re-declares them.

**Bank Variants.** One Question Bank per language (`questions.json`, `questions.zh.json`), selected by the page's `data-bank` attribute. A Variant is structurally identical to its source bank: same Question ids, same Phase membership, same `ast_risks`, same `severity_weight`, same Option Scores, same `test` blocks, same Title Ladder thresholds and emoji. Only authored text differs — Scenario, Question, Option text, Feedback, Best Practice, Source Note, Phase title/description, app title, subtitle, time estimate, and the Progression Title names.

**What prevents drift between a Variant and its source bank.** These are the mechanisms that actually exist; none of them is a claim that translation is automatically correct.

- The deploy gate discovers every `questions*.json` in the repo root rather than one hardcoded path, so adding a bank is picked up without editing the gate, and every failure is labelled with the file it came from.
- Each discovered bank is schema-checked on its own terms.
- The scoring fixtures assert the Total Possible invariant (108) per bank, so a re-weighted or re-scored Variant fails the gate rather than silently changing the denominator.
- The Variant's Option Scores, Severity Weights, AST Risk mappings, and Phase membership are verified mechanically identical to the source bank by the gate. The Progression Title fixtures assert against the bank's own Title Ladder rungs by threshold rather than hardcoded English names.
- The translation is authored once and committed as a file, not generated at build time — so the diff of a language change is reviewable in the same way a bank's is.

**The limit, stated plainly.** Those mechanisms verify *structure*. Nothing verifies a translated Variant's *currency* — whether it still says what the English says. Whether the Chinese Source Note still matches the statistic it cites, or a Scenario still describes the same behavior, is a human reading both files. The gate cannot help there and no gate should pretend to. The honest cost of a Variant is therefore one extra authoring pass per bank edit, in every language, by a human.

## Consequences

- Bank edits must be propagated by hand to each Variant; the gate catches structural divergence, not stale prose.
- Adding a language means adding one bank file, one dictionary file, one page, and a stylesheet — no code changes, no build step. *(Amended by #51, recorded by #57: the per-language stylesheet is gone — a new language's typography is a rule set inside the shared `css/theme-retro-os.css`, gated on its `html[lang]` prefix, because the runtime Locale Swap rewrites `<html lang>` without loading a different sheet — see [0019](0019-in-page-locale-switching.md).)*
- The AST Risk display-name duplication that ADR 0013 resolved for identity is now resolved for names too, and the registry's contract is narrower: ids and severities only.
- A missing Chrome String id is a hard failure at load, which is the intended trade: a loud break in dev beats a silently English button in production.
- ADR 0002's file stays on disk. Its reasoning about content duplication still governs assessment content; its blanket "no secondary source exists" is what this decision replaces.

## Alternatives considered

- **Keep ADR 0002 intact and localize by translating at runtime.** Rejected: it needs a build step or a runtime translation dependency, which contradicts ADR 0001, and it moves reviewable committed text into generated output.
- **Generate Bank Variants from the English bank by script.** Rejected: it produces machine text nobody reviews, and it would make the Variant's currency look guaranteed when it is not.
- **Allow a missing id to fall back to English.** Rejected: it makes the failure invisible exactly where it matters — a Chinese Participant would see a partly-English app with no signal that anything was wrong.
- **Put interface strings in a bank `meta.i18n` block.** Rejected: it re-fuses interface copy with assessment content, so an interface string would need translating in every bank file and a copy change would touch a scoring artifact.
- **Allow bank structure to differ per language.** Rejected: two scoring models mean two sets of Blind Spots, and the security signal stops meaning the same thing across languages.
