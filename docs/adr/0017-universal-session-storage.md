# 0017 — Universal Session Storage

## Status

Accepted — 2026-10-03. Supersedes [0016 — Language-Scoped Session Storage](0016-language-scoped-session-storage.md).

## Context

ADR 0016 scoped the Session key by language so that switching language mid-assessment would not discard in-progress answers. That fixed the bug it was written for — one bank overwriting another's Session — and the mechanism it introduced (a key suffix derived from the page's language) was correct for the problem as then understood.

What it did not survive is the conclusion this project has since reached about what a language *is*. ADR 0015 settled that a Bank Variant is "the same content in another language", structurally identical and differing only in authored text, and that allowing bank structure to differ per language was rejected because "two scoring models mean two sets of Blind Spots, and the security signal stops meaning the same thing across languages". A Participant is one person taking one assessment. Language is the page they read it on, not a second attempt.

Under that reading, language-scoped storage does not merely fail to help — it contradicts the invariant above. One human who answered Questions in both languages ended up with two independent runs, two Progress Fills, and two Blind-Spot sets describing the same skill profile. That is precisely the split the security signal is supposed to not have.

It also carried a cost that only appeared once a second Bank Variant shipped: every language switch mid-assessment silently reset the Participant to Question 1 of an assessment they had partly taken, which is a poor thing to do to someone arriving from a shared link in the language they actually read.

## Decision

**One Session per Participant. The storage key is `quiz-session`, unscoped.** The `locale` parameter is removed from `storageKey`, `load`, `save`, and `clear`; every call site is updated.

**The content hash covers structure, not text.** This is the change that makes the rest possible, and it is not optional. `hashBank` previously hashed the serialized bank, which includes every authored string, so the two Bank Variants could never produce the same hash. Dropping the key suffix alone would have made every Chinese load read the shared record as stale and discard it — the bug would have shipped looking like the original problem was still unfixed.

`hashBank` now hashes the structural signature of the bank: the Question ids **in array order**, each Question's `phase`, `ast_risks`, `severity_weight` and ordered Option Scores, each Phase's `id` and `question_ids`, and `meta.scoring.severity_values`. Authored text is excluded, because it is the one thing a Variant is allowed to differ on. The result is identical across Variants — verified: `questions.json` and `questions.zh.json` both hash to `b7a11c28` — and changed by anything that would re-attribute a stored answer.

That field set is exactly the set ADR 0015 declares language-independent and the deploy gate enforces across Variants. The runtime hash is that same boundary, applied at load. Nothing new is being asserted; the guard is now simply able to see across languages, which is what it needed to do.

**Question order is hashed deliberately.** The deploy gate compares Variants as id-keyed dictionaries (`run_tests.py`, `validate_variant_equivalence`) and so never compares the order of the `questions[]` array, while scoring resolves `answers[i]` purely positionally against `bank.questions[i]` and never looks a Question up by id. A zh-only reorder therefore passed the gate, which was harmless while each language had its own Session and is silent answer corruption once one record serves both. Hashing the ids in array order closes that gap at runtime; the arrays are grouped by Phase rather than sorted by id, so a naive sort would break the mapping without changing anything visible.

**Migration from the ADR 0016 keys.** On any load that finds no usable shared record, the store enumerates keys under the `quiz-session:` prefix and folds them in. Legacy records carry `v` = the old whole-bank text hash, which is not comparable with the structural hash, so they are not re-stamped on faith: each candidate is shape-checked against the current bank, and the **most-advanced** survivor wins, since a Participant with three Answers in one language and five in the other has eight Answers of work rather than two Sessions to choose between. Legacy keys are deleted either way, including ones that fail the shape check, so they cannot linger and be reconsidered on every load.

The stated limit: shape survives a Question reorder or an Option re-score, so a bank edit that landed while a legacy Session sat in storage is not detectable. That window is one deploy wide, the affected population is only Participants who were partway through on deploy day, and the alternative — leaving them to restart anyway — is the outcome this decision exists to remove.

**Returning with a complete Session shows the results.** A Participant who finishes in one language and returns in the other is taken straight to their report, rendered from the bank of the language they are reading. This falls out of the mechanism rather than being added to it: `renderQuiz` already treats a fully-answered record as a Completion. It is stated here because it is user-visible and was previously unreachable. **Retake** clears the one shared record — the same run, so nothing is lost by clearing it in either language.

## Consequences

- A Participant has one Progress Fill, one Blind-Spot set, and one Action Plan regardless of which language they took the assessment in.
- Switching language mid-assessment resumes at the first unanswered Question with every prior answer intact. The language switch is a full page navigation, which it already was — the page's `data-bank` attribute chooses the bank — so this costs nothing that was not already being paid.
- Rewording, reformatting, or retranslating authored text costs nobody their progress. Previously any text edit reset every Session for that bank.
- A Question added, removed, reordered, re-scored, re-weighted, or re-mapped to AST Risks still soft-resets the Session and shows the non-blocking notice, in every language at once. That is ADR 0011's guarantee, intact and now consistent across Variants.
- A shared record whose hash matches but whose payload cannot be trusted is treated as corruption rather than a version drift: it is discarded quietly, without telling the Participant their bank changed.
- **Retake is now destructive in a way it was not before** — not across languages, but in the sense that there is only one thing to clear. The results-page control says nothing about this and does not need to: there is one attempt.
- ADR 0016's file stays on disk. Its reasoning — never destroy work by navigating between pages — is what this decision completes rather than reverses; only its answer to "scoped by what" is replaced.

## Alternatives considered

- **Keep the language-scoped key.** Rejected: it produces two runs and two Blind-Spot sets for one Participant, contradicting ADR 0015's ruling that the security signal must mean the same thing across languages.
- **Keep the key unscoped and leave `hashBank` hashing all text.** Rejected: the two Variants can then never hash equal, so every cross-language load reads as stale and resets. This is the failure mode that makes the hash change load-bearing rather than tidying.
- **Store answers as `{questionId: optionIndex}`.** Rejected for now: it makes the record immune to Question reordering by construction, which is a real advantage, but it requires a resolve step in `scoring.js` and departs from ADR 0003's positional contract to fix a case the structural hash already catches with a soft reset. Worth revisiting if a structural edit ever needs to preserve progress rather than reset it.
- **Accept a set of known hashes, one per Variant.** Rejected: it reintroduces the language dimension into the record to solve a problem the structural signature removes, and every new language would need its hash enrolled by hand.
- **Drop the hash and rely on the deploy gate.** Rejected: the gate does not compare Question array order, and it does not run in the browser. A gate that cannot see the failure is not a substitute for a guard that can.
- **Leave the legacy Sessions to expire.** Rejected: it discards real work for every Participant who was mid-assessment on deploy day, in exchange for about ten lines of migration code.