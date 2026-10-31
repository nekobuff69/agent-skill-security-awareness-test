# 0020 — Wizard Navigation with Explicit Commit

## Status

Accepted — 2026-11-01. Supplements [0002 — Question Bank single source](0002-question-bank-single-source.md), [0012 — Multiple-choice only](0012-multiple-choice-only.md) and [0017 — Universal Session storage](0017-universal-session-storage.md); supersedes neither. Supersedes the **Back Navigation** and **Advance Transition** rows of `UBIQUITOUS_LANGUAGE.md` (rewritten as **Wizard Navigation** and the client-area wipe) and introduces the **Finish Commit** term there.

## Context

The quiz was one-way: a pick on any Question auto-advanced to the next card, and a revisit re-answered *and* auto-advanced again. There was no way to move backwards except by reloading, and there was no deliberate end: answering the 20th Question scored and handed off by itself. Two problems follow. A Participant who tapped the wrong Option had already left the Question by the time they noticed, and Completion was indistinguishable from an ordinary tap — the results appeared whether or not the Participant had decided the assessment was done.

The bank itself already enforces one Option per Question with the pick overwritten in place (ADR 0017), so revisiting and changing a pick costs nothing structurally. What was missing was the navigation model to make revisiting a first-class gesture, and a commit point that names Completion as a decision rather than a timer.

## Decision

**Two-way wizard navigation with a single explicit commit.**

**Auto-advance is kept for the first answer.** Tapping an Option on an unanswered Question still records the pick, saves the Session, holds the designed 200 ms beat, and advances to the next Question Card on the client-area wipe. The 20 Questions flow forward at the speed of reading, unchanged.

**A re-mark never advances.** Tapping any Option on an already-answered Question — a revisit via Back or Next — overwrites the stored Option, re-marks the radio row, and leaves the card exactly where it is. Picks stay free until commit; there is no penalty and no forced motion for changing one's mind.

**The Question Cards move both ways.** Each card carries a wizard row: `[< Back]` (absent on Question 1, where there is nothing behind it), `[Next >]` between cards, and on the last card `[Finish]` replaces `[Next >]`. Bounds are owned by the pure decision module `App.WizardNav` (`js/wizard-nav.js`): `prev` before Question 1 and `next` beyond the last are "stay", never clamp-and-jump.

**The Finish Commit is the single path to Completion.** `[Finish]` is enabled exactly when all 20 Questions hold an Option (`canFinish`), and its click — only its click — runs scoring, fires the `quiz_completed` analytics event exactly once per Session (a commit gate refuses a second fire until Retake resets it), holds the Progress Fill at 100% for the designed beat, and hands off to the results view. The old auto-finish path is removed; answering the last Question focuses `[Finish]` instead of completing.

**The card swap is a client-area wipe.** The previous slide-up + fade (`card-enter`/`card-exit`) is replaced by a ~160 ms CSS wipe (`card-wipe-out`/`card-wipe-in`) that runs inside the 200 ms advance beat. Under `prefers-reduced-motion` the wipe classes are never added, the beats collapse to zero, and scroll becomes instant — every new motion has the same gate the old transitions had.

**Options are a radio group.** Each Question renders `role="radiogroup"` with `role="radio"` rows; arrows move between Options, space/enter marks through the normal tap path, and the dotted focus rectangle is the Win95 keyboard idiom. The rows keep `data-qid`/`data-opt` and the A–D letter badge, so the one-Option-per-Question invariant reads straight off `aria-checked`.

**The decision logic is a pure module.** `App.WizardNav` holds no DOM and no timers: `tapOption`, `canFinish`, `isLast`, `prev`, `next` and `createCommitGate` take state as arguments and return decisions. `js/quiz.js` consumes them; the headless test suite (`tests/js/test-wizard-nav.js`) tests them through the module seam.

**The wizard row's strings are Chrome Strings** under `wizard.*` ids, registered in the base dictionaries (`i18n/en.js` / `i18n/zh.js`), in English and Simplified Chinese; the missing-id hard failure (ADR 0015) is unchanged.

## Consequences

- A Participant who taps wrong corrects it in place: Back, different Option, the card stays. Nothing is recorded twice and nothing moves without a decision.
- Completion is now a decision, not a side effect: `quiz_completed` fires once per Session, at the click, and the results hand-off is unreachable from any other path. A double click is refused by the commit gate.
- The last Question behaves differently from the other 19 by design — first tap holds 100% and focuses `[Finish]`; the Participant presses it. A Participant who never presses never Completes, which is the honest reading of "the assessment ended when I said so."
- The glossary no longer describes back-only movement or re-advance-on-revisit; `UBIQUITOUS_LANGUAGE.md` carries the rewritten rows, the **Finish Commit** term, and the updated Relationship bullet and example dialogue. ADR text predating this note that says "auto-advances on re-answer" or "back-only" describes the superseded behavior.
- The pure module seam keeps every navigation rule testable without a browser and keeps the DOM side thin: `js/quiz.js` records, persists, and animates; `js/wizard-nav.js` decides.
- Reduced motion loses every animation added here and nothing else — the flow, beats-as-zero, and the Finish gate are identical, so no functionality is gated behind motion.

## Alternatives considered

- **Keep auto-finish on the last answer.** Rejected: it is exactly the ambiguity this ticket removes — Completion fires without a Participant decision, and the analytics event cannot distinguish "answered 20" from "finished".
- **A confirmation dialog before scoring.** Rejected: a modal question is a second interface where a button in the wizard row is the interface already there; the disabled-until-20/20 `[Finish]` carries the same information without interrupting.
- **Back/Next outside the Question Card.** Rejected: the wizard row belongs to the card it navigates, like the window chrome the skin already imitates; a fixed bar would cover the Progress Fill's job of showing where the Participant is.
- **Native `<input type=radio>` elements.** Rejected: the A–D badge, the etched dial glyph and the sunken-bevel row are one visual unit, and re-skinning native radios to that unit costs more accessibility than `role="radiogroup"`/`role="radio"` with the arrow-key contract already implemented.
