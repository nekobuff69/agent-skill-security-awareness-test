# 0016 — Language-Scoped Session Storage

## Status

Accepted — 2026-10-02. Supersedes [0011 — Versioned Session Storage](0011-versioned-session-storage.md).

## Context

ADR 0011 versioned every Session by the Question Bank's content hash, so that a Session saved against a stale bank produces a soft-reset rather than silently wrong scores. That reasoning is unaffected by localization and survives this decision intact.

What localization changed is that there is now more than one bank. `js/session-store.js` used a single `quiz-session` key, so the first bank to load on a given browser owned that key. A Participant who answered three Questions in English, switched to Chinese, and came back would have found their English Session overwritten by Chinese answers — or the reverse — with the content-hash check then reading the two banks as unrelated versions of each other. Progress was lost by navigating between pages, not by any bank edit.

## Decision

**The storage key is language-scoped: `quiz-session:<language>`.** This is the only thing that changes. Everything else in ADR 0011 is unchanged:

- The content hash is computed exactly as before, at parse time, from the full bank content.
- The stored shape is unchanged: `{ v: bank-content-hash, answers }`.
- The stale-soft-reset behavior is unchanged: hash match renders normally, mismatch clears the stored answers, shows the non-blocking notice, and restarts from the Landing Page.
- `hashBank` is untouched.

Each Bank Variant therefore keeps its own Session under its own key, and the hash inside each key version-stamps that Variant independently.

## Consequences

- Switching language never discards an in-progress Session. A Participant who answers three Questions in English, answers two in Chinese, and switches back finds the English Session exactly as they left it.
- A bank edit still resets that bank's own Sessions — the correctness guarantee from ADR 0011 is intact. Editing the English bank does not disturb a Chinese Participant's in-progress Session, and vice versa.
- The key is derived from the page's language, normalized the same way the dictionary locale is (`zh-Hans` and `zh` both resolve to `zh`), so a language tag variant cannot silently split one language's Sessions across two keys.
- Retake clears the current language's Session only. Clearing the other language's is not offered; that is a deliberate consequence of scoping, not an oversight.
- ADR 0011's file stays on disk. Its versioning mechanism is still the live one; only the key shape it implied for a single-bank app is replaced.

## Alternatives considered

- **Store both languages in one Session record.** Rejected: it makes every load depend on every bank, and answering in one language would keep re-versioning the other's stale key.
- **Leave the key unscoped and accept the overwrite.** Rejected: switching language is ordinary navigation for a multilingual Participant, and it silently destroys work.
- **Key by bank content hash instead of language.** Rejected: it collides with the versioning field — the hash inside the value is the staleness check, and putting the same information in the key invites the two to disagree.
- **Scope by bank file name.** Rejected: it couples storage identity to a filename that can be renamed without changing what it means, whereas the language is the actual dimension.
