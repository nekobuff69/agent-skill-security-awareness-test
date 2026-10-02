# 0018 — First-Visit Language Routing

## Status

Accepted — 2026-10-03. Supplements [0015 — Chrome Strings and Bank Variants](0015-chrome-strings-and-bank-variants.md) and [0017 — Universal Session Storage](0017-universal-session-storage.md); supersedes neither.

## Context

Two pages exist, one per language, and each carries a switch to the other. That switch is a control a Participant has to notice and choose. A reader arriving from a shared link has no such moment: if the link was the English URL, nothing on the page says a Simplified Chinese version exists.

The goal for the localization work is reaching more users, and a reader who cannot read the page cannot complete the assessment. So first contact has to answer a question the markup currently leaves open: *is this the page I can read?*

The previous position was written into the language-switcher stylesheet as a comment — deliberately no auto-detection and no redirect, on the reasoning that a visitor who does not read the current language should navigate away through the control and never watch the page flash into another language. That reasoning protects against a wrong guess and against a jarring redirect, and both concerns are real. It also means doing nothing about the arrival.

`navigator.languages` is the only signal available in a static deploy, and it is a poor one. It reports what the operating system is set to, not what the reader can read. A Participant with a Chinese primary language may read English perfectly; a Participant with an English primary language may read only Chinese. Any use of it is a guess, which is why the shape of the guess matters more than whether it is made.

## Decision

**Route on arrival, guard the guess, and never guess twice.**

**A Language Preference, stored apart from the Session.** One record under `quiz-lang` holding the chosen language and the set of dismissed prompts. It is deliberately not part of the Session: a Session is version-stamped against the Question Bank's structure and is discarded when that structure changes, so a language choice stored there would be silently reset on every assessment edit, and starting, Completing or Retaking an assessment would rewrite it. Two independent facts about a Participant, two independent records.

**Automatic routing, before the Question Bank loads.** If the browser's primary language maps to the alternate language this page declares, the Participant is taken there with `location.replace` — once. The choice is recorded before navigating, so the destination page can never send them back. It runs before the bank fetch because it needs no assessment content and should not wait on a network round trip to act.

**Otherwise, one dismissible offer.** A non-blocking prompt above the title on the Landing Page, naming the other language, linking to it, and removable for good. It never covers content and never gates Start.

**The guards, and why each exists.** A recorded Language Preference means the decision is already made. An existing Session means the Participant already started, and where they are is where they chose to be. A browser already matching the current page needs no prompt at all. A language the app does not publish is ignored rather than approximated. Every failure path — no storage, no `navigator.languages`, an unreadable preference — degrades to doing nothing, because a Participant who cannot be routed should land on a working page rather than an error.

**The page declares both halves of the relationship.** `data-lang-alt` already carries the destination; `data-lang-alt-locale` now carries its language. No path arithmetic, no parsing a locale out of a URL, and adding a language remains a matter of declaring it in the markup.

**The language switch remains the override.** It is always present, always works, and always wins. It is the only control that cannot be wrong.

**Stated plainly — how far this actually reaches.** The automatic path covers the case the whole feature exists for: a reader whose browser primary language is the other one. The dismissible offer therefore only ever appears to a visitor whose browser primary language is *neither* offered page — a reader on a third-language device who may or may not read the other language. That is a much smaller population than "everyone else", and the offer is a guess about them. It is built because it is cheap, dismissible, and never shown twice, not because it is expected to carry much traffic. Anyone who wants to know whether it earns its place should look at whether it is ever accepted, not at whether it renders.

## Consequences

- A reader arriving on the wrong-language URL is on the right one before the assessment loads, and lands on a page they can complete.
- The switch remains the escape hatch, and the automatic path cannot trap anyone: a stored preference and an in-progress Session both stop it, and a wrong guess is one click from being corrected.
- A Participant is asked once. The offer is stored as dismissed and never reappears; a redirect records the language and is never repeated.
- A Participant's language choice survives every Question Bank edit, because it is not version-stamped and not stored with the Session.
- Adding a language is still one bank file, one dictionary file, one page and a stylesheet. Routing picks up the new page from the markup it already declares.
- The language-switcher stylesheet no longer claims there is no auto-detection; the comment described the previous decision and now describes this one.
- **Using the language switch records the choice.** Without this the automatic path is a trap: a Chinese-primary reader who deliberately clicks through to English still has no stored preference, so their next arrival finds their browser language and sends them straight back to the page they just left. The switch sets the Language Preference to the language it navigated to, which is also what makes "the switch overrides the stored preference, in both directions" true rather than aspirational. The switch stays an ordinary link that works with JavaScript unavailable; the recording rides along with a normal navigation and is simply absent when scripting is absent.

## Alternatives considered

- **A server-side redirect via a Pages Function.** Rejected: it is the project's first server-side code, it makes the response depend on a header crawlers also send, and the flash it avoids is cosmetic next to the stranding it does not prevent.
- **A blocking language modal shown to every visitor.** Rejected: it taxes the majority who already landed on the right page to help a minority, and it asks for a choice before the visitor has any context to choose from.
- **Auto-detection with no visible escape.** Rejected: the failure mode is a reader who cannot read the page being moved to a second page they cannot read. The switch already exists; the guard uses it.
- **Store the preference inside the Session.** Rejected: it couples a language choice to Question Bank versioning, so editing the assessment silently resets it.
- **Remember the preference in a cookie.** Rejected: it is server-visible, expires, and adds a request-time concern to a static app that has none.
- **Do nothing and leave the switch as the only route.** Rejected: this was the previous decision. It is safe and it forfeits the arrival, which is the only moment at which the reader does not yet know whether they can use the page.

## Known limits

- Routing is inferred from `navigator.languages`, which reports an operating-system setting rather than a reading ability. Every outcome is guarded against being permanent, but none can be made correct.
- The offer's reachable population is narrow, as stated in the Decision.
- With JavaScript unavailable there is no routing at all. The switch remains the only route in that case, which is the correct degradation and the reason the switch was never removed.