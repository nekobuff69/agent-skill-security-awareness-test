# 0019 — In-Page Locale Switching

## Status

Accepted — 2026-11-02 (recorded by ticket #57; behaviour shipped in tickets #55 and #56). Amends [0018 — First-visit language routing](0018-first-visit-language-routing.md): the language switch it kept as the override no longer navigates — on every view the app knows, it swaps the page in place. Supplements [0015 — Chrome Strings and Bank Variants](0015-chrome-strings-and-bank-variants.md) (the swap depends on structural identity), [0017 — Universal Session Storage](0017-universal-session-storage.md) (the Session survives the swap), and the bank-load re-render seam of issue #48 (`App.activateBank`).

## Context

Two static pages — one per language — previously travelled between each other by full navigation. Switching mid-quiz therefore cost a page load: a blank beat while the second document fetched its Bank Variant, a re-render from scratch, scroll and focus lost, and momentum gone from a run the Participant had already started. After ADR 0017 made the Session universal and ADR 0018 decided the first visit once from the system language, the switch was the one language control left, and it could fire at any moment of the run — including on the results page and the Review, where a reload re-reads a report that has not changed and still pays the full price.

The switch's navigation also contradicted something the project had already built: issue #48's re-render seam rebuilds whichever view is visible from current state whenever the Bank is re-pointed. Every ingredient for an in-page swap — shared Session, structural identity across Bank Variants, a view rebuild from state — already existed; only the navigation was left over.

## Decision

**The language toggle never navigates on a known view: it swaps the dictionary and the Bank Variant in place.**

**Precedence is unchanged and reinforced.** The toggle is the override [0018](0018-first-visit-language-routing.md) gave it: it always wins over the stored Language Preference, because every successful swap writes that preference (`LangPref.setLanguage`) for the language it lands on — by in-page swap or by the unknown-view navigation fallback. A swap therefore outranks the first-visit guess permanently: the next arrival stops at the stored preference and routing never runs. What changed is only the *action*, never the *authority*.

**Everything the swap needs comes from the markup.** `<html>` declares the alternate with five hand-authored attributes — `data-lang-alt` (the alternate page's URL), `data-lang-alt-locale`, `data-lang-alt-lang` (the `<html lang>` value after switching), `data-lang-alt-dict` (the Chrome String dictionary script), `data-lang-alt-bank` (the Bank Variant JSON). The page's own locale, bank URL and URL are captured at boot. No path arithmetic, no URL parsing, no derivations — adding a language is still declaring it in the markup (ADR 0015's cost model). The two HTML files mirror these attributes by hand, and `tests/js/test-lang-switch.js` pins that both pages declare the same five-attribute family.

**Swap order is fixed: dictionary, then Bank Variant, then document, then view.** The alternate dictionary is registered by injecting its declared `<script>` (the same idiom `js/shell.js` uses for `js/sound.js`); the Bank Variant loads through the #48 fetch seam. Only when both land does the toggle apply: `App.I18n.use` re-points the Chrome Strings, `document.title` and `<html lang>` follow, and `App.activateBank` re-renders whichever view is visible — the Welcome Splash, the Answering Screen, the results page or the Review screen — from current state. No view is rebuilt twice, and the Session is untouched: every answer is re-attributed by the structural identity ADR 0015 guarantees.

**One swap at a time, and only after the first bank has landed.** The toggle is gated on `App.LangSwitch.ready` — called from `js/main.js` both when the first Bank Variant loads and when it fails — and a `busy` flag serializes swaps; a second click during an in-flight swap is refused. The busy flag is released *before* `apply()` so a loud render failure (a missing Chrome String id, ADR 0015) can never leave the toggle wedged.

**Idle prefetch, once, silent.** After the page settles, the alternate dictionary and Bank Variant load while the browser is idle — `requestIdleCallback` with a 2 s timeout where offered, a 1200 ms timeout otherwise — so the first toggle shows no loading stall. A prefetch failure is silent: the toggle retries on demand, and only an on-demand failure surfaces anything.

**The URL follows the language, one history entry per swap.** Each switch updates `<html lang>` and `document.title` and pushes exactly one `pushState` entry for the chosen language's page carrying its locale in state. `popstate` reconciles the in-place language with the current entry: the entry's stored locale decides when it has one, otherwise the URL path decides (the declared alternate's pathname or the page's own). A `popstate` arriving mid-swap is queued and reconciled after the swap settles. Back and Forward therefore walk the languages as they happened — without a single reload.

**In-flight Action Plan prose is per locale, never cancelled, never duplicated.** The Narrative slot in `js/results.js` is one per (Completion report, locale): a completed slot re-renders locally on every switch with no fetch, an in-flight slot keeps showing the localized loading Chrome String until *its own* resolution paints, and the watching render never duplicates the generation or paints its result into the wrong language. The switch therefore never cancels a request and never re-generates one the page already holds; the Overall Percentage and every AST Score are untouched by any of it — the same score report re-rendered with its Progression Title and Weakest Question prose re-anchored to the active Bank Variant.

**Failure keeps the current language and says so, without blocking.** An on-demand load failure leaves the page byte-identical in state — language, view, answers, scroll — and surfaces a dismissible, non-blocking notice (`lang.switchUnavailable`, `role=status`, auto-dismissed after 8 s) naming the other language. A failed resource leaves no poisoned cache: its entry is dropped so the next attempt fetches afresh. A stale "can't switch" banner must not survive a later successful swap.

**An unknown view keeps the old action.** If no known view is visible, the toggle records the Language Preference and navigates to the declared alternate URL — the pre-#55 record-and-navigate action, identical to `js/shell.js`'s `recordChoice` — so no impossible in-page state can strand the control.

## Consequences

- Switching is state-preserving by construction: the current Question, every recorded answer, the Completion's score report and the scroll position survive, because nothing reloads and the view is rebuilt from current state.
- Back and Forward swap languages correctly: one history entry per switch, reconciled from entry state or URL path.
- Two pages still exist and remain directly linkable; the URL always names the language the Participant is reading.
- Adding a language stays a markup declaration plus a bank, a dictionary and a page; the switch module reads all five attributes and nothing else.
- The alternate dictionary and Bank Variant are cached per locale after first load, so repeated toggling costs no further requests.
- The five `data-lang-alt*` attributes are hand-mirrored across the two HTML files — the one manual contract this decision accepts; `tests/js/test-lang-switch.js` pins the authored markup against the swap.
- [0018](0018-first-visit-language-routing.md)'s "the switch stays an ordinary link" reasoning is retired along with the navigation: the toggle is the scripted taskbar control, every successful swap records the Language Preference just as the navigating switch did, and with JavaScript unavailable neither routing nor the toggle exists — a direct URL, or the script-free 404 dialog's two links, remain the route between the pages.

## Alternatives considered

- **Keep navigation as the switch action.** Rejected: a full document load loses momentum mid-quiz, re-renders from scratch, and pays a fresh network round trip for the alternate bank — all to reach a state the #48 seam can already rebuild in place.
- **A query-string language parameter (`?lang=zh`) on one page.** Rejected: it breaks the two-page, directly-linkable contract of ADR 0015, and every consumer of the URL (shares, crawlers, the 404's plain links) would have to understand the parameter.
- **Decode both languages into one document up front.** Rejected: it doubles the delivered bank and dictionary on a page whose alternate the Participant may never choose, against the simplicity budget ADR 0001 keeps.
- **A service worker that intercepts the alternate navigation.** Rejected: first machinery of its kind for a static app, gates the first visit on an install step, and buys nothing the in-place swap does not already give.

## Known limits

- Views outside the four known ones still navigate — the switch is honest about not understanding the view rather than guessing.
- The failure notice needs JavaScript; with scripting absent the degradation matches [0018](0018-first-visit-language-routing.md)'s — no routing and no toggle — and the pages stay reachable: the other page's URL directly, or the script-free 404 dialog's two links.
- A failed prefetch is retried only on demand; until a toggle is clicked the page gives no hint the prefetch failed. This is deliberate — silent until it matters.
- Only one alternate locale is supported per page: the swapped-to locale is always "the other one of the two the page knows about", and a third language is future work (ADR 0015's cost model covers what a third page would declare).
