# 0011 — Versioned Session Storage

## Status

Accepted — 2026-09-10

## Context

A Session records one Option per Question and persists in localStorage so the Participant can refresh without losing progress. The Question Bank evolves: Questions are added, removed, reworded, or re-scored. A Session saved against bank version N may reference Question IDs that no longer exist or Options whose scores have changed. Rendering results computed against a different bank version produces silently wrong scores and misleading Blind Spots — worse than losing the Session entirely.

## Decision

Every Session is versioned by the Question Bank's content hash. The storage shape is `{ v: bank-content-hash, answers: { question_id: option_index } }`.

On load, the app compares the stored hash against the current bank's hash:

- **Match:** answers render normally; the Session survives page refreshes within the same bank version.
- **Mismatch:** soft-reset — clear the stored answers, display a notice ("The assessment has been updated. Your previous progress could not be carried over."), and restart from the Landing Page. The Participant begins a fresh Session against the current bank.

The content hash is computed at parse time from the full `questions.json` content. Any change to Questions, Options, Severity values, or scoring metadata changes the hash.

## Consequences

- Bank edits may reset in-flight Sessions. This is accepted: a stale Session produces wrong results, and correctness outranks convenience for a security-awareness tool.
- The soft-reset notice is non-blocking and non-alarming — it acknowledges the update without treating it as an error.
- Answers persist across page refreshes and browser restarts within a single bank version, which covers the common case (the Participant refreshes mid-quiz and picks up where they left).
- Future retake tracking (architecture.md, Future Considerations) can extend this storage shape without changing the versioning mechanism.

## Alternatives considered

- **Migrate stale Sessions on bank change.** Rejected: mapping old Question IDs to new ones, handling removed Questions, and reconciling changed Option Scores is complex and error-prone. The bank's evolution is not constrained by a migration contract.
- **Store full Question Bank alongside Session.** Rejected: ~50 KB per Session bloats localStorage. The hash comparison achieves the same correctness guarantee at negligible cost.
