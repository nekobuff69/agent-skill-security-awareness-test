# 0018 — First-Visit Language Routing

## Status

Accepted — 2026-10-03. Amended — 2026-11-02 (ticket #54): the dismissible offer and its dismissal bookkeeping are removed; the system language now decides the first visit alone. Amended again — 2026-11-02 (tickets #55–#56, recorded by #57): the language switch this record leans on no longer navigates — it swaps the page in place, per [0019 — In-Page Locale Switching](0019-in-page-locale-switching.md); the routing decision itself is unchanged. Supplements [0015 — Chrome Strings and Bank Variants](0015-chrome-strings-and-bank-variants.md) and [0017 — Universal Session Storage](0017-universal-session-storage.md); supersedes neither.

## Context

Two pages exist, one per language, and each carries a switch to the other. That switch is a control a Participant has to notice and choose. A reader arriving from a shared link has no such moment: if the link was the English URL, nothing on the page says a Simplified Chinese version exists.

The goal for the localization work is reaching more users, and a reader who cannot read the page cannot complete the assessment. So first contact has to answer a question the markup currently leaves open: *is this the page I can read?*

The previous position was written into the language-switcher stylesheet as a comment — deliberately no auto-detection and no redirect, on the reasoning that a visitor who does not read the current language should navigate away through the control and never watch the page flash into another language. That reasoning protects against a wrong guess and against a jarring redirect, and both concerns are real. It also means doing nothing about the arrival.

`navigator.languages` is the only signal available in a static deploy, and it is a poor one. It reports what the operating system is set to, not what the reader can read. A Participant with a Chinese primary language may read English perfectly; a Participant with an English primary language may read only Chinese. Any use of it is a guess, which is why the shape of the guess matters more than whether it is made.

The original decision paired automatic routing with a dismissible offer so neither shipped alone: routing without an escape stranded a reader whose browser language was not the one they read, and the offer gave a third-language visitor a way to the other page. The offer's presentation has since been retired with the rebuilt landing screen (ticket #53), and this amendment removes the remaining machinery — the offer dialog, its copy, and the dismissal record. What stands is a single, one-way decision made from the system language, with the language switch as the always-available correction.

## Decision

**Route on arrival from the system language, guard the guess, and never guess twice.**

**A Language Preference, stored apart from the Session.** One record under `quiz-lang` holding the chosen language. It is deliberately not part of the Session: a Session is version-stamped against the Question Bank's structure and is discarded when that structure changes, so a language choice stored there would be silently reset on every assessment edit, and starting, Completing or Retaking an assessment would rewrite it. Two independent facts about a Participant, two independent records.

**The system language decides once, before the Question Bank loads.** On arrival, the precedence is fixed:

1. **A stored Language Preference always wins.** The decision is already made; routing never runs.
2. **An in-progress Session stops the routing.** The Participant already started, and where they are is where they chose to be.
3. **Otherwise the browser's primary language decides, once:**
   - a system language matching the alternate page → the Participant is taken there with `location.replace`, and the choice is recorded *before* navigating, so the destination page can never send them back;
   - a system language matching the current page → the choice is recorded and the Participant stays;
   - any other system language → the linked page is kept and nothing is recorded.

It runs before the bank fetch because it needs no assessment content and should not wait on a network round trip to act. Recording on both English and Chinese outcomes is what makes the decision one-way: the first arrival is the only time the system language is consulted.

**The guards, and why each exists.** A recorded Language Preference means the decision is already made. An existing Session means the Participant already started, and where they are is where they chose to be. A language the app does not publish is ignored rather than approximated — no redirect, no record, and the visitor stays a first-time visitor for a later arrival whose system language does match. Every failure path — no storage, no `navigator.languages`, an unreadable preference — degrades to doing nothing, because a Participant who cannot be routed should land on a working page rather than an error.

**The page declares both halves of the relationship.** `data-lang-alt` carries the destination and `data-lang-alt-locale` its language. No path arithmetic, no parsing a locale out of a URL, and adding a language remains a matter of declaring it in the markup. *(The in-page switch later widened the same declaration — `data-lang-alt-lang`, `-dict` and `-bank` — still declarative, still no path arithmetic; see [0019](0019-in-page-locale-switching.md).)*

**The language switch remains the override.** It is always present, always works, and always wins. It is the only control that cannot be wrong, and it is the correction for a wrong guess: the switch sets the Language Preference to the language it moves to, so the corrected page becomes the recorded choice. *(Amended by #55–#57: moving to it is now an in-page Locale Swap, not a navigation — see [0019](0019-in-page-locale-switching.md). The override's authority is untouched.)*

**Stated plainly — how far this actually reaches.** The routing only ever fires for a reader whose browser primary language is one of the two offered pages: they are either sent to the matching page or recorded on the page they are already reading. A reader on a third-language device is left completely untouched — no prompt, no record, no redirect — and the language switch is their route to the other language.

## Consequences

- A reader arriving on the wrong-language URL is on the right one before the assessment loads, and lands on a page they can complete.
- The switch remains the escape hatch, and the automatic path cannot trap anyone: a stored preference and an in-progress Session both stop it, and a wrong guess is one click from being corrected.
- The decision is made exactly once. A redirect or a matching page records the Language Preference, and every later arrival stops at the stored preference.
- A Participant's language choice survives every Question Bank edit, because it is not version-stamped and not stored with the Session.
- Adding a language is still one bank file, one dictionary file and one page. Routing picks up the new page from the markup it already declares, and the new language's typography is a gated rule set in the shared skin, not a stylesheet only that page links (#51).
- The reasoning behind the decision no longer lives in a stylesheet comment. The language-switcher stylesheet is gone — its CJK typography consolidated into `css/theme-retro-os.css` (#51) and the routing and switch reasoning now sit as comments in `js/lang-routing.js` and `js/lang-switch.js`.
- **Using the language switch records the choice.** Without this the automatic path is a trap: a Chinese-primary reader who deliberately clicks through to English still has no stored preference, so their next arrival finds their browser language and sends them straight back to the page they just left. The switch sets the Language Preference to the language it moved to, which is also what makes "the switch overrides the stored preference, in both directions" true rather than aspirational. The switch began life as an ordinary link whose recording rode along with a normal navigation; since #55–#56 it is the taskbar Language Toggle performing an in-place Locale Swap, recording without reloading ([0019](0019-in-page-locale-switching.md)). With scripting absent there is neither toggle nor routing — the other page's URL, and the script-free 404 dialog's two plain links, remain the way across.
- No prompt, dialog or dismissal state remains: the offer copy ids are removed from both dictionaries, and the Language Preference record now holds only the choice.

## Alternatives considered

- **Keep a dismissible offer for system languages the app does not publish.** Rejected: the offer's rendering was retired with the rebuilt landing screen (#53), leaving its dialog, copy and dismissal record as dead machinery; the prompt reached only third-language devices and asked them to choose between two links the switch already offers. The offer is gone rather than repaired (ticket #54).
- **A server-side redirect via a Pages Function.** Rejected: it is the project's first server-side code, it makes the response depend on a header crawlers also send, and the flash it avoids is cosmetic next to the stranding it does not prevent.
- **A blocking language modal shown to every visitor.** Rejected: it taxes the majority who already landed on the right page to help a minority, and it asks for a choice before the visitor has any context to choose from.
- **Auto-detection with no visible escape.** Rejected: the failure mode is a reader who cannot read the page being moved to a second page they cannot read. The switch already exists; the guards — stored preference, in-progress Session, the switch itself — use it.
- **Store the preference inside the Session.** Rejected: it couples a language choice to Question Bank versioning, so editing the assessment silently resets it.
- **Remember the preference in a cookie.** Rejected: it is server-visible, expires, and adds a request-time concern to a static app that has none.
- **Do nothing and leave the switch as the only route.** Rejected: this was the previous decision. It is safe and it forfeits the arrival, which is the only moment at which the reader does not yet know whether they can use the page.

## Known limits

- Routing is inferred from `navigator.languages`, which reports an operating-system setting rather than a reading ability. Every outcome is guarded against being permanent, but none can be made correct.
- A reader whose system language is neither offered page is told nothing about the other language; the switch is the only discovery path for them.
- With JavaScript unavailable there is no routing at all, and since #55–#56 the Language Toggle is a scripted control as well: a no-script visitor crosses between the pages only by URL — or by the script-free 404 dialog's two plain links. That is the correct degradation for a static deploy, and the reason the automatic path was never made the only one.
