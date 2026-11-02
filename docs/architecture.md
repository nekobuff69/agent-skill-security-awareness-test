# Agent Skills Security Self-assessment

## 1. Overview

A no-build web app delivering a self-assessment quiz on AI agent skill security, grounded in the [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10). Two-pass UX: answer all questions → see your profile → review with explanations. One codebase serves both shipped languages — an English page and a Simplified Chinese page — each declaring its own Question Bank and its own locale dictionary at the page level (ADR 0015). The taskbar's **Language Toggle** moves a Participant between the two without a page load: it swaps the Chrome String dictionary and the Bank Variant in place and re-renders the live view (ADR 0019).

**Design philosophy:** Self-assessment, not knowledge test. Every option reflects a real behavioral choice. Scoring reveals blind spots, not trivia gaps. There are no letter grades — results render as a shareable risk radar and a progression title ("Sentinel", "Newcomer", …), because a mirror shows where you haven't looked yet, not what you failed.

---

## 2. Data Layer

| File                | Role                                                                                           | Updated by     |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `questions.json`    | Question Bank (English) — source of truth for scenarios, Options, scoring, Feedback, Best Practices, OWASP sources | Content author |
| `questions.zh.json` | Bank Variant (Simplified Chinese) — structurally identical to the English bank; authored text only (ADR 0015) | Content author |
| `i18n/en.js`<br>`i18n/zh.js` | Chrome String dictionaries — every user-visible interface string by id, plus the AST Risk display names. A missing id throws (ADR 0015) | Content author |
| `docs/owasp-ast-full.md` | Full extracted OWASP AST content (~53 KB) — Grounding Corpus               | Content author |
| `docs/architecture.md` | Overview, journey, deployment + ADR index; decisions live in `docs/adr/` | Developer      |
| `docs/TESTING.md`   | Testing spec: schema validation, scoring fixtures, grounding rules                             | Developer      |
| `run_tests.py`      | Stdlib-only Python runner implementing the testing spec; discovers every `questions*.json`      | Developer      |

Each page's bank is the **database**, declared by the page itself via `data-bank` on `<html>` and parsed at load. No server-side database. Multiple-choice only — nothing the Participant authors reaches the LLM. Prompt-injection surface ≈ zero.

### Runtime Data Flow

Two `fetch()`es on page load — the page's declared Question Bank and the Grounding Corpus — parsed once, used everywhere. The locale dictionary is not fetched: it is loaded as a `<script>` alongside the other modules and registers itself, so interface copy resolves at render time with no network round-trip:

```
<html lang="…" data-bank="questions.json" data-corpus="…"
      data-lang-alt="zh/" data-lang-alt-locale="zh" data-lang-alt-lang="zh-Hans"
      data-lang-alt-dict="i18n/zh.js" data-lang-alt-bank="questions.zh.json">
    │  the page declares its own bank, its corpus, and the whole alternate
    ├─→ App.LangRouting + App.LangPref (js/lang-routing.js, js/lang-pref.js)
    │     first visit only: a stored Language Preference (`quiz-lang`) or an
    │     in-progress Session stops routing; otherwise the system language
    │     decides once and is recorded — never a second time (ADR 0018)
    │
    ├─→ App.LangSwitch (js/lang-switch.js) — the Language Toggle's action
    │     idle-prefetches the alternate dictionary + Bank Variant, then on a
    │     click swaps both in place: dictionary, bank, <html lang>, title,
    │     re-render of the live view, one pushState entry per language; a
    │     failed load keeps the language and shows a dismissible notice
    │     (ADR 0019)
    │
    ├─→ App.I18n (js/i18n.js + i18n/<lang>.js)
    │     selects the dictionary from document.documentElement.lang
    │     resolves Chrome Strings by id — interface copy and AST Risk
    │     display names; a missing id throws (no English fallback)
    │
questions.json — or a Bank Variant, e.g. questions.zh.json (each loaded once)
    │
    ├─→ Quiz Renderer
    │     reads: meta, phases[], questions[]
    │     renders: landing stats (meta.total_questions + meta.time_estimate),
    │              quiz status bar (phase name + Progress Fill + Question
    │              Counter, all updating in place), question cards (Q-number
    │              chip, labeled Scenario/Question blocks, A–D-lettered
    │              Options), pinned window footer ([< Back]/[Next >];
    │              [Finish] on the last, re-answer overwrites in place)
    │              — ADR-0020
    │     collects: option selections → answers: option_index, one per Question
    │     stores: localStorage quiz-session {v: structural-hash, answers} —
    │            one Session per Participant, shared by every Bank Variant,
    │            so switching language resumes in place (ADR 0017)
    │
    ├─→ Scoring Engine
    │     reads: questions[].options[].score, questions[].severity_weight,
    │            meta.scoring.severity_values
    │     computes: per-AST aggregates, overall %, title lookup,
    │              ranked views (astRanked weakest-first, blindSpotIds < 70%)
    │
    ├─→ Results Renderer
    │     reads: meta.scoring.titles
    │     renders into the Quiz window's body, under ONE menu bar that owns
    │              the four commands (Download PNG / Share Results /
    │              Review your answers → / Retake Assessment — ADR-0021 as
    │              amended by #65): the score header panel (Progression
    │              Title + Overall Percentage as plain body content, never a
    │              second fake title bar), the SVG radar (shareable hero,
    │              AST-ID + percentage axis labels) and the Blind-Spot bars
    │              (name + percentage)
    │     arranges: on the desktop stage the Action Plan and the Deep-Dive
    │              Prompt are separate Program Windows, each rendering into
    │              its own Section Mount Point; where no window exists the
    │              same section subtrees render in place
    │     persists: the Finish Commit writes the per-tab desktop Record
    │              (sessionStorage `quiz-desktop`, ticket #63) and every
    │              settled Action Plan caches into it under its language
    │              (ticket #64)
    │
    ├─→ Deep-Dive Prompt Builder (deterministic)
    │     reads: title, weak ASTs, weakest questions (choice + best_practice)
    │     emits: deep-dive kickoff prompt (≤ 3000 chars)
    │
    ├─→ Action Plan module (js/action-plan.js)
    │     owns the path decision and retry policy (one retry, then fallback)
    │
    │     ├─ LLM Path (via Proxy Worker)
    │     │     reads: title, ranked per-AST scores, weakest questions
    │     │     reads: weak-AST excerpts from docs/owasp-ast-full.md
    │     │     sends: participant profile + Grounding Excerpts
    │     │
    │     └─ Deterministic Fallback
    │           reads: same bank fields as the Deep-Dive Prompt Builder
    │
    │     Either path resolves {narrative, actions, path}; the Action Plan
    │     presenter renders action cards + Narrative in the expander inside
    │     the Action Plan's own Program Window (or in place where no window
    │     exists), and caches the settled payload in the desktop Record
    │     under the language that issued the request — one payload per
    │     (report, language), never a resurrected cache (#64/#66).
    └─→ Review Screen (own view, reached from the Quiz window's menu bar)
          reads: questions[], Participant's saved answers
          renders: per-question accordion
                   ├ scenario, question, selected option (highlighted)
                   ├ that option's Feedback (why this choice is risky/sound)
                   ├ Best Practice text
                   └ ast_source_url (clickable OWASP link)
```

**Key:** each page's Question Bank serves every consumer — rendering, scoring, results, the Deep-Dive Prompt, LLM grounding, Deterministic Fallback, and Review. Interface copy is not in the bank: it is Chrome Strings resolved from the page's locale dictionary. There is no secondary source of assessment content (ADR 0015).

---

## 3. User Journey

```
┌─────────────────────────────────────────────────────────┐
│  Welcome Splash (compact wizard card, issue #53)        │
│  eye icon · two-line display headline                   │
│  Bank title as subtitle · rule · one body line          │
│  "20 questions, 8-12 minutes"  ← from meta              │
│  [Start]   (the only language affordance is the         │
│            taskbar Language Toggle, on every view)      │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 1: "Should I Install This?"                      │
│  7 questions — trust, verification, pre-install checks  │
│                                                         │
│  Q3 ┌ [Scenario] ──────────────┐                         │
│     └ [Question]               ┘                         │
│  [A] Option  [B] Option  [C] Option  [D] Option          │
│  select → silent save → card wipe advance               │
│  ┌─ footer (pinned) ────────────┐                        │
│  │  [< Back] [Next >]  ([Finish] on the last card)       │
│  └──────────────────────────────┘                        │
│  ┌─ status bar (pinned) ─────────────────────┐           │
│  │  Phase 1 · Should I Install This? [▓▓░░] 3 / 20       │
│  └───────────────────────────────────────────┘           │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: "What Can It Do to Me?"                       │
│  7 questions — permissions, blast radius, sandboxing    │
│  (same UX)                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: "Is It Still Safe?"                           │
│  6 questions — updates, governance, cross-platform      │
│  (same UX)                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  The Finish Commit hands off to the desktop stage — the  │
│  three Program Windows, on the teal desktop, above the   │
│  taskbar (spec #58; ADR-0021 as amended by #59–#68)      │
│                                                          │
│  [Quiz]  [Action Plan]  [Deep-Dive Prompt]  ← taskbar,   │
│  listing exactly the running windows (and, at ≤768px,    │
│  the three PERMANENT switches — the only route between   │
│  programs, ticket #68)                                   │
│  ┌─ ⌂ desktop shortcuts (top-left column, desktop only) ┐│
│  │  Quiz · Action Plan · Deep-Dive Prompt                ││
│  └───────────────────────────────────────────────────────┘│
│  ┌▓▓▓ Agent Security Awareness Quiz ─────── [—][□][×] ▓▓▓┐│
│  │ Quiz window · navy title bar is the ONE chrome        ││
│  │ ┌─ menu bar: [Download PNG][Share Results]           ││
│  │ │            [Review your answers →][Retake Assessment]││
│  │ ├─ score header: X Sentinel · Overall 47.2%           ││
│  │ ├─ Your Risk Radar (hero, shareable, AST-ID + % labels)││
│  │ ├─ Your Blind Spots (weakest first, name + %)          ││
│  │ └─ (the body scrolls; the Action Plan and the Deep-Dive ││
│  │     Prompt are NOT in this window)                     ││
│  └────────────────────────────────────────────────────────┘│
│         ┌▓▓▓ Action Plan ─────────────────── [—][□][×] ▓▓▓┐│
│         │ arrives when its content settles, cascaded 24px  ││
│         │ off the focused window and stacked BELOW it      ││
│         │ 1. [Prioritized action card]  2. [… card]        ││
│         │ ▸ Why these actions? Read the analysis           ││
│         └───────────────────────────────────────────────────┘│
│    ┌▓▓▓ Deep-Dive Prompt ───────────── [—][□][×] ▓▓▓┐       │
│    │ arrives MINIMIZED at the Finish Commit          │       │
│    │ (kickoff prompt for your own agent app)         │       │
│    │ [Copy to Clipboard]                             │       │
│    └──────────────────────────────────────────────────┘      │
│                                                          │
│  Any pointer interaction inside a frame raises it; [×]     │
│  puts a window away (its Record, report and arrangement    │
│  survive; the shortcut — or the mobile switch — brings it  │
│  back), and only the confirmed Quit or Retake ends the run │
│        ↓ (menu-bar "Review your answers →")               │
│  ┌─ Review Screen (the Quiz window's own stage) ─────┐      │
│  │  [← Back to results]                             │      │
│  │  ▸ Q01: You chose… (expandable)                  │      │
│  └───────────────────────────────────────────────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Copy is data — and copy is split.** Assessment content (question count, time estimate, app title, subtitle, Phase heading, Progression Title names) still derives from the page's Question Bank `meta` at render time, so a bank edit updates the whole page. Everything else the interface says — button labels, Quiz Chrome text, the soft-reset notice, Deterministic Fallback prose, AST Risk display names — is a **Chrome String** resolved by id from `i18n/<lang>.js`. Neither source is a code literal, and the client config still carries only infrastructure values (ADR 0015).

**Key UX decisions:**

- **Four real screens.** Landing, quiz, results and Review are separate views — the `hidden` attribute actually hides (styles.css enforces it over author display rules). Results and Review are the desktop's windowed stages; landing and quiz are the flow stages that keep the one layout-flow window.
- **No per-question Feedback during the quiz.** Option saved silently. Momentum preserved.
- **Auto-advance on the first answer only (ADR 0020).** Select → save → the **Advance Transition** (client-area card wipe, ~160 ms inside the 200 ms beat; instant under prefers-reduced-motion). A revisit re-marks in place and never moves the card. The **pinned window footer** moves both ways: [< Back] from Q2, [Next >] between cards, and [Finish] — enabled exactly at 20/20 — is the sole Completion trigger.
- **The Quiz Chrome never stacks.** One status bar, pinned inside the window below the scrolling body: Progress Fill + Question Counter (the question being *viewed*) + phase name updating in place. No phase header cards near the Question.
- **Review is voluntary, on its own screen.** Reached from the **Quiz window's menu bar** (the "Review your answers →" command, #65), not from a results-page button; navigate back freely; skip it entirely if you want.
- **The results stage is a desktop of three programs (ADR-0021 as amended by #59–#68).** The Quiz window keeps the score header, the Risk Radar and the Blind-Spot Bars under its menu bar; the Action Plan and the Deep-Dive Prompt are their own Program Windows, arriving on their own rules (the plan when its content settles, the prompt minimized at the Finish Commit) and never sharing a scroll with the numbers that explain them. Landing and quiz stay the one layout-flow window — the desktop does not exist before the Finish Commit.
- **Closing puts a window away; only Quit and Retake end a run.** [×] on the desktop stage is `hide`: the Record, its report and its arrangement survive, and the desktop shortcut — or, at ≤768px, the program's permanent taskbar switch — brings it back at its Last Mode and Last Geometry. Minimize traces the window down to a taskbar entry that still restores it. The flow stages (landing, quiz) have no desktop, so their [×] keeps the End Program question, and the Start-menu **Quit** and the menu-bar **Retake** are the two destructive paths, each behind a confirmation, each running the one tail `App.Windows.endRun()` — Session cleared, desktop Record cleared, landing shown, program Records destroyed (#66).
- **One Tab order, no modal windows.** Only the focused window's controls are reachable — `inert` is painted on every region of a background frame except its two pointer handles, so a press there raises the window instead of tabbing into it. Frames are labelled groups and never `aria-modal`; there is no Alt+Tab interception and no focus trap. Escape's tiers run system dialog > About > Start menu > focused window (#67).
- **The Language Toggle never navigates (ADR 0019).** One click on the taskbar's EN/中文 control swaps the Chrome String dictionary and the Bank Variant in place on any view the app knows — the current Question, every recorded answer, the score report and the scroll position survive — updates `<html lang>`, `document.title` and the URL with one history entry per switch, and records the Language Preference. A failed load keeps the current language and says so in a dismissible, non-blocking notice.
- **The Deep-Dive Prompt is the hero artifact.** The thing the Participant takes away and uses.
- **The radar is the shareable moment.** PNG download + Web Share API — results travel without a backend. Severity never renders on the charts; score-band colors alone encode performance.

### Presentation layer: the retro-OS skin

The interface is a Windows 95 desktop, delivered as a pure CSS override skin (`css/theme-retro-os.css`, linked last on every page) plus a small set of OS shell modules it drives with:

| Module | File | Role |
| ------ | ---- | ---- |
| Boot | `js/boot.js` | Boot-splash gate — the load animation, distinct from the **Welcome Splash**, which is the landing view itself: a sessionStorage flag (`quiz-os-booted`) decides whether a tab sees the boot splash (1350ms, then a 200ms fade) or an instant load; reduced motion or a prior visit answers "already booted". The overlay masks but never gates data fetching — only rendering waits. Ticket #63 adds one more answer to the same decision: a committed desktop Record (`App.DesktopStore.exists()`, presence only, read before the bank has landed) suppresses the splash outright and takes the landing out of the first paint, because the entry view is the restored desktop; a store that cannot answer is not a Record, and with no Record the boot is exactly as it was. |
| Shell | `js/shell.js` + `css/shell.css` | Wraps `#app` in the Quiz `.os-window` frame — a navy title bar whose [—][□][×] controls draw real glyphs (#49) and a corner resize grip, over a window of fixed height so only the client area scrolls and the quiz's status bar stays pinned inside the window (#52) — and mounts the taskbar: Start button, the program buttons, and the two-segment EN/中文 **Language Toggle** that replaced the tray clock (#50). Since #61 the same frame chrome is a factory: the Action Plan and the Deep-Dive Prompt get their own `.os-window` frames, each with its own body marked `data-results-mount` (the Section Mount Point host) and its own taskbar button. Owned window controls (minimize/restore/zoom, ticket #43) live here, and so does the ONE title bar per program — the results header (ticket #60) is body content, never a second fake chrome. Ticket #62 adds the desktop's **Shortcut** column: one keyboard-reachable icon per program (glyph over the program's own Chrome String), built once so it exists whether or not the program runs, launched by double-click or Enter/Space through the controller's `launchProgram`, and removed by the ≤768px media block with the rest of the desktop presentation. Ticket #66 adds the Start menu's **Quit** entry beneath About — the destructive exit: it opens the same End Program confirmation the Quiz [×] uses, and only its Yes ends the run through `App.Windows.endRun`; with no Windows module to host the question the entry asks nothing and destroys nothing. |
| Windows | `js/windows.js` | The dialog primitive: `App.Windows.openSystemDialog` renders a Win95 system dialog — red warn / navy info circles, beveled command buttons, closes only via its buttons or Escape. One dialog at a time; the backdrop dims the desktop. The window controller renders control enablement, trace state and the taskbar list out of the desktop core and owns no window state itself — including the ticket #60 desktop regime: it paints each Record's Geometry onto its frame on the results and review views, drags and resizes through `applyGeometry` under its own clamp (min size, title bar never under the taskbar, mobile layout refuses), raises a frame on any pointer interaction inside it, and decides what [×] means: `hide()` on the desktop stage, the End Program dialog on the flow stages. Ticket #61 adds the arrivals (`actionPlanArrived`, `deepDiveArrived`), the taskbar focus/restore switcher and the rule that leaving the desktop stage puts the program windows away. Ticket #62 adds `launchProgram` — the desktop shortcut's one gesture (Arrive an unarrived program, restore a minimized or hidden one at its Last Mode and Last Geometry, otherwise Raise) — and completes the taskbar rule: a hidden window has no button, for the Quiz window exactly as for the other two. Because the shortcut is the way back and the ≤768px layout has no shortcut column, ticket #62 first confined the put-away gesture to the desktop. **Ticket #68 replaced that rule:** at ≤768px the desktop is single-program — the stylesheet maximizes every frame above the slim taskbar and the controller refuses every Geometry write there — the chrome reduces to [×] alone ([—] and [□] are dead controls on that viewport), and the taskbar's **three program switches are permanent** (running, put away, or not yet arrived), so [×] puts any window away on either layout and the switch is the route back; one switch reads pressed, and a switch click runs the same one `launchProgram` gesture as a desktop shortcut. Crossing 768px re-renders the controls and re-lays the frames without losing a Record, a mode or a Geometry. Ticket #67 adds the **inert keyboard floor**: `paintFrame` puts `inert` on every region of a frame that is not the active window — body, mounted sections, and the three title-bar buttons — except the two pointer handles, so Tab reaches only the focused window while a press on an inert control retargets to the live root and raises it; frames are labelled groups and never `aria-modal`, there is no Alt+Tab interception and no focus trap, and `escapeFocused()` is Escape's window tier — it hides the focused window on the desktop stage (mobile included) and hands focus back to the permanent switch, the shortcut, or the program button that opened it, refusing off the flow stages and while a dialog owns the desktop. Ticket #66 adds `App.Windows.endRun()` — the ONE destructive tail the Quit entry and the menu-bar Retake share: it clears the Session and the per-tab desktop Record, shows the landing page, and takes the desktop down through the controller's `resetPrograms`, reporting what went away; the window [×] keeps its promise never to touch persistence. |
| Desktop core | `js/desktop-core.js` | The DOM-free state model behind the desktop (tickets #59/#61): the Window Record — mode, geometry, last geometry, last mode, stacking order — keyed per program (Quiz, Action Plan, Deep-Dive Prompt), the mode transitions with their refused impossible moves, the arrival transition `open` (a designed default, the 24px cascade off the focused window, a stack placement below the active window, never a focus change), the landing-view and End Program gates, and the mode-derived consequences (visible, taskbar membership, focus participation) the controller renders from. Ticket #63 adds `snapshot()` / `loadSnapshot()` — the all-or-nothing restore hook that lets a committed desktop be written back into this one state model before the first paint (a snapshot carrying the dialog open is refused outright, and a program missing from the snapshot keeps no Record). Ticket #66 adds `resetPrograms()` — the teardown the destructive paths run: every program Record is destroyed (not hidden) and the desktop rewinds to the one it was born with, the sole Quiz Record at its designed arrangement, the active Id and z-counter back at the start and the End Program gate closed. No DOM, no timers, no storage; tested headlessly through the module seam. |
| Desktop store | `js/desktop-store.js` | The per-tab desktop Record (ticket #63) plus its Action Plan cache (ticket #64): `quiz-desktop` in **sessionStorage** — never inside `quiz-session`, never in localStorage — because the desktop stage belongs to the tab, not to the Participant. ONE write, `captureAtCommit(bank, answers)`, called only from the Finish Commit in `js/quiz.js`, holding the structural bank hash, the answers, the language, every Window Record, the active program, the z-counter and the committed stage (always the results desktop — the Review stage is never captured, so a restore comes back to the report), with the plan cache started empty. `restore(bank)` runs before the first paint from `js/main.js`: a Record whose hash matches the current bank and whose answers are all present puts the Records back through the controller's `restoreSnapshot`, recomputes the report through `App.Scoring` under the page's Bank Variant, selects the stored language's dictionary when it differs, and renders the results directly — no `quiz_completed`, no re-write of the Record, no landing flash. `savePlan(lang, plan)` is the one later touch, merging a settled payload under its language and no-opping against a Record that a Retake or Quit has already cleared; `beginPlanRestore` / `finishPlanRestore` in `js/results.js` bracket the single restore render so a cached language paints with no request and a miss queues exactly one. A stale hash, incomplete or malformed payload, or unavailable storage discards the key quietly — the page boots exactly as it would with no Record. |
| Results presenter | `js/results.js` | The retro results view, presented as window **body** content: the score header (Progression Title + Overall Percentage in one sunken field, never a second fake title bar, #60), the Risk Radar and the Blind-Spot Bars. Ticket #65 gathers the four commands into ONE **menu bar** at the head of the Quiz body — a `menubar` of `menuitem`s with a roving tabindex and one tab stop (Download PNG / Share Results / Review your answers → / Retake Assessment) — so the body below carries only the report, and Review and Retake left the body with it. The PNG export is body-only: it re-draws the score header, radar and bars onto a freshly composed sheet through the same pure builders, never a snapshot of the live window and never its chrome. The Action Plan and the Deep-Dive Prompt render into their own **Section Mount Points** — the program window's body when that window exists, the results view in place when it does not — so an in-place re-render re-mounts a section without duplicating or orphaning it, and #64's per-language plan cache hangs off the same presenter. |
| Sound | `js/sound.js` | Period system sounds (e.g. the click that marks an Option). Purely additive — every interaction works silently. |
| WizardNav | `js/wizard-nav.js` | The pure decision core behind the quiz's wizard row (`tapOption`, `canFinish`, `next`, `prev`, the one-fire commit gate behind [Finish], ADR 0020). |
| Language | `js/lang-pref.js` + `js/lang-routing.js` + `js/lang-switch.js` | The locale pair of modules plus its switch: first-visit routing decides once from the system language and records the **Language Preference** (`quiz-lang`, ADR 0018); after that the taskbar **Language Toggle** performs the **Locale Swap** — alternate dictionary + Bank Variant prefetched while idle, applied in place, the live view rebuilt through the issue #48 `App.activateBank` seam, URL and history kept in sync, failure degraded to a notice (ADR 0019). |

Non-theming contract kept deliberately: the skin only re-points token values and repaints components; the semantic aliases (`--color-bg`, `--color-accent`, `--color-score-*`, `--color-success/--color-warning/--color-error`) keep their names, so the base stylesheets never learn the skin's palette. Motion is era-mechanical or none: the view trace, the card wipes and the Progress Fill run as `steps()` animations and are each disabled under `prefers-reduced-motion` (disjoint selector gates, no `!important`). On the ≤768px layout (ticket #68) the policy is a **single-program desktop**: every `.os-window` is fixed full-screen above the slim 44px taskbar, the chrome reduces to [×], the title bar stops being a drag handle and the corner grip is hidden, the three program switches share the bar permanently, and the shortcut column and the desktop's positioned regime are removed entirely — while the shell's own buttons keep the 44px touch minimum. Below 480px the Start menu spans the bar (the ≤768px block already gives every taskbar, menu and dialog command its 44px touch height); below 400px the page margins tighten. Crossing 768px in either direction is an instant state switch: no Record, mode or Geometry is lost and nothing animates twice. The chrome typefaces are self-hosted (OFL 1.1, `fonts/` with provenance record): W95FA for Latin UI chrome, Silkscreen for the Welcome Splash's display catchphrase, and a Fusion Pixel 12 SC subset for Han chrome/headings — each pinned by `unicode-range` (W95FA/Silkscreen to Latin + typographic marks, the Fusion subset to CJK ranges) so Han text never lands on a Latin pixel face and Latin runs never land on a CJK one. On the Chinese page the `--font-heading` cascade leads with the Fusion subset (SimSun → 宋体 → Microsoft YaHei → PingFang SC behind it), prose stays on the SimSun-first system stack, and all of the CJK typography overrides are gated on `html[lang^="zh"]` inside `theme-retro-os.css` — both pages link the same stylesheet list. Every visual value is extracted and recorded in the root `design-dna-retro-os.json`; `404.html` restates the dialog idiom script-free (its system-error dialog is plain links) rather than loading app JS.

---

## 4. ADR Index

Design decisions live in `docs/adr/`. Enforcement and invariants live in the testing spec (`docs/TESTING.md`) — never duplicated as prose here.

| # | Decision | File |
|---|---|---|
| 0001 | Vanilla static — no build step, no framework | [0001-vanilla-static-no-build.md](adr/0001-vanilla-static-no-build.md) |
| 0002 | Question Bank as single source of truth — **superseded by 0015** (survives for content) | [0002-question-bank-single-source.md](adr/0002-question-bank-single-source.md) |
| 0003 | Deterministic scoring — Option Score × Severity Weight, per-AST aggregates | [0003-deterministic-scoring.md](adr/0003-deterministic-scoring.md) |
| 0004 | Progression Titles replace letter grades | [0004-progression-titles-replace-grades.md](adr/0004-progression-titles-replace-grades.md) |
| 0005 | Risk Radar as shareable hero artifact | [0005-risk-radar-shareable-hero.md](adr/0005-risk-radar-shareable-hero.md) |
| 0006 | Deterministic Deep-Dive Prompt — same artifact on every path | [0006-deterministic-deep-dive-prompt.md](adr/0006-deterministic-deep-dive-prompt.md) |
| 0007 | LLM via Worker proxy — developer-held key, never client-side | [0007-llm-via-worker-proxy.md](adr/0007-llm-via-worker-proxy.md) |
| 0008 | OpenAI-compatible wire format — one code path, many providers | [0008-openai-compatible-single-wire.md](adr/0008-openai-compatible-single-wire.md) |
| 0009 | Deterministic Fallback from the bank when the LLM Path is unavailable | [0009-deterministic-fallback-from-bank.md](adr/0009-deterministic-fallback-from-bank.md) |
| 0010 | Two-layer grounding validation — authoring-time rule checks + runtime structural checks | [0010-two-layer-grounding-validation.md](adr/0010-two-layer-grounding-validation.md) |
| 0011 | Versioned Session storage in localStorage — **superseded by 0017** (the version stamp is now structural, and the key is unscoped) | [0011-versioned-session-storage.md](adr/0011-versioned-session-storage.md) |
| 0012 | Multiple-choice only — no free-text, no prompt-injection surface | [0012-multiple-choice-only.md](adr/0012-multiple-choice-only.md) |
| 0013 | AST Risk registry is a code-side table, not corpus-derived | [0013-ast-registry-code-side.md](adr/0013-ast-registry-code-side.md) |
| 0014 | No bootstrap seam for the corpus load; hand-off lives at the Action Plan interface | [0014-no-bootstrap-seam.md](adr/0014-no-bootstrap-seam.md) |
| 0015 | Chrome Strings and Bank Variants — narrow the single-source rule to content; interface copy is a dictionary, a missing id throws | [0015-chrome-strings-and-bank-variants.md](adr/0015-chrome-strings-and-bank-variants.md) |
| 0016 | Language-scoped Session storage — `quiz-session:<language>` — **superseded by 0017** | [0016-language-scoped-session-storage.md](adr/0016-language-scoped-session-storage.md) |
| 0017 | Universal Session storage — one `quiz-session` record shared by every Bank Variant; the version stamp hashes bank structure, never authored text | [0017-universal-session-storage.md](adr/0017-universal-session-storage.md) |
| 0018 | First-visit language routing — a Language Preference stored apart from the Session, and one one-way routing decision made from the system language (the dismissible offer is retired) | [0018-first-visit-language-routing.md](adr/0018-first-visit-language-routing.md) |
| 0019 | In-page locale switching — the Language Toggle swaps dictionary and Bank Variant in place, with idle prefetch, one history entry per switch, and a notice on failure | [0019-in-page-locale-switching.md](adr/0019-in-page-locale-switching.md) |
| 0020 | Wizard navigation with explicit commit — one Option per Question, auto-advance only on a first answer, [Finish] as the single Completion path | [0020-wizard-navigation-with-explicit-commit.md](adr/0020-wizard-navigation-with-explicit-commit.md) |
| 0021 | Retro-OS skin replaces the editorial skin — Windows 95 presentation layer with an OS shell, zero-dependency constraint kept; **amended by #59–#68** — the results stage is a three-program desktop, and Quit/Retake, not End Program, are the destructive paths | [0021-retro-os-skin-replaces-editorial-skin.md](adr/0021-retro-os-skin-replaces-editorial-skin.md) |

---

## 5. Deployment

├── index.html               # English page — declares data-bank + the five data-lang-alt* attributes (ADR-0019)
├── zh/
│   └── index.html           # Simplified Chinese page — same app, Bank Variant
├── config.js
├── styles.css
├── 404.html                 # system error dialog — script-free, links the skin's tokens
├── og-card.png              # 1200×630 share card, browser capture of the retro results view
├── design-dna-retro-os.json # design-DNA record for the retro-OS skin (values traced to its CSS)
├── fonts/                  # self-hosted faces + licenses + provenance: W95FA, Silkscreen, the Fusion Pixel 12 SC subset and its codepoint inventory (fonts/PROVENANCE.md)
├── questions.json           # Question Bank (English)
├── questions.zh.json        # Bank Variant (Simplified Chinese)
├── i18n/
│   ├── en.js                # Chrome String dictionary — English
│   └── zh.js                # Chrome String dictionary — Simplified Chinese
├── AGENTS.md
├── UBIQUITOUS_LANGUAGE.md
├── css/
│   ├── quiz.css
│   ├── results.css
│   ├── theme-retro-os.css  # retro-OS (Win95) skin + CJK typography gated on html[lang^="zh"], linked last as override layer
│   ├── boot.css        # splash overlay — sunken groove, stepped navy fill, fade handoff
│   ├── shell.css        # retro-OS window frame + taskbar with the two-segment Language Toggle, dialogs, the desktop shortcut column, and the ≤768px single-program layout (full-screen frame, chrome reduced to [×], three permanent switches, no shortcuts) (#62/#68)
├── js/
│   ├── analytics.js      # analytics helpers
│   ├── ast.js            # AST Risk registry — canonical ids + severities; display names are Chrome Strings (ADR-0013, ADR-0015)
│   ├── i18n.js          # Chrome String resolution — dictionary select by lang, t(), throws on missing id (ADR-0015)
│   ├── main.js           # app bootstrap + view router; on load it asks the desktop store to restore a committed Record before the first paint and skips the landing paint when one restores (#63)
│   ├── quiz.js           # quiz status bar + pinned footer, question cards, wizard row and Back/Next; the Finish Commit is the single Completion path and the ONLY writer of the desktop Record (#63)
│   ├── scoring.js        # deterministic scoring, title lookup, ranked views
│   ├── session-store.js  # one Session per Participant, structural-hash versioned (ADR-0017)
│   ├── desktop-store.js  # the per-tab desktop Record under `quiz-desktop` — sessionStorage, written only at the Finish Commit, restored before first paint, and carrier of the per-language Action Plan cache (tickets #63/#64)
│   ├── lang-pref.js      # remembered Language Preference under `quiz-lang`, stored apart from the Session (ADR-0018)
│   ├── lang-routing.js   # first-visit routing decision — system language decides once, then is never consulted again (ADR-0018)
│   ├── lang-switch.js    # the Locale Swap — idle prefetch, in-place dictionary + Bank Variant swap, view re-render, pushState/popstate sync, failure notice (ADR-0019)
│   ├── boot.js           # splash gate — sessionStorage flag, masked fetches, one-trace handoff (tickets #39/#42)
│   ├── shell.js          # os-window wrap + the frame-chrome factory, taskbar with the Language Toggle, Start menu (About + Quit), shortcut column, system dialogs, Escape ordering dialog > About > menu > window (tickets #38/#43/#61/#62/#66/#67/#68)
│   ├── windows.js        # window controller rendering the desktop core: geometry paint + clamp, raise-on-interaction, the two taskbar rules, put-away close, `launchProgram`, `endRun()`, the inert keyboard floor (tickets #43/#60/#61/#62/#66/#67/#68)
│   ├── desktop-core.js   # DOM-free desktop state core: Window Records, mode transitions, arrival + cascade, stacking, derived consequences, landing + End Program gates, snapshot/loadSnapshot, resetPrograms (tickets #59/#61/#63/#66)
│   ├── sound.js          # period system sounds, Start-menu mute toggle (ticket #41)
│   ├── wizard-nav.js     # pure wizard decisions + Finish commit gate (ADR-0020, ticket #40)
│   ├── prompt-builder.js # Deep-Dive Prompt assembly
│   ├── fallback.js       # deterministic fallback from bank
│   ├── extractor.js      # OWASP excerpt extraction
│   ├── validator.js      # LLM response validation (fence-tolerant)
│   ├── llm-client.js     # Worker call + response validation
│   ├── action-plan.js    # path decision, retry policy, LLM prompt assembly
│   └── results.js        # Results header panel — the window's first body (Progression Title + Overall Percentage), radar + bars, Deep-Dive, Review (pure view); Action Plan and Deep-Dive Prompt section mount points (#59)
├── tests/
│   ├── mock_llm_output.json
│   └── js/
│       ├── run-tests.js
│       ├── test-scoring.js
│       ├── test-session-store.js
│       ├── test-prompt-builder.js
│       ├── test-fallback.js
│       ├── test-action-plan.js
│       ├── test-extractor.js
│       ├── test-validator.js
│       ├── test-i18n.js            # dictionary contract — missing id throws, no English fallback
│       ├── test-lang-pref.js       # Language Preference roundtrip + tag normalization; independence from the Session lifecycle (ADR-0018)
│       ├── test-lang-routing.js    # first-visit routing: stored preference / in-progress Session / unknown language / single-language page all suppress it; no offer machinery remains (ADR-0018)
│       ├── test-lang-switch.js     # the Locale Swap: state preservation on every view, URL/pushState sync, popstate reconcile, idle prefetch, failure notice, markup contract (ADR-0019)
│       ├── test-action-plan-budget.js  # Action Plan prompt stays within llm.budget, trim ladder deterministic
│       ├── test-boot.js            # splash gate — decide(landedFirst, hasFlag, reducedMotion), exactly-once flag, storage fail-open
│       ├── test-quiz.js            # Welcome Splash render, Question Cards, the in-window status bar and pinned footer, and the gates that keep the retired floating chrome and the retired language offer from coming back (ADR-0020)
│       ├── test-rerender.js        # the issue #48 seam — bank swap re-renders the live view from current state, one rebuild per activation
│       ├── test-wizard-nav.js      # tapOption/canFinish/prev/next decisions + the one-fire Finish commit gate (ADR-0020)
│       ├── test-shell.js           # taskbar build, title-bar glyph delegation, program button, Start menu (About + Quit), shortcut column, Escape tiers, the no-aria-modal frame contract, mobile switcher CSS via DOM stubs (#62/#66/#67/#68)
│       ├── test-windows.js         # window controller rendering (delegating to the desktop core), desktop regime (Geometry paint, drag/resize clamp, put-away close), three-program arrivals and raise-on-interaction, the mobile single-program switcher (#68), the inert keyboard floor and Escape's window tier (#67), the destructive tail (#66), dialog primitive, trace classes
│       ├── test-program-windows.js # the three-program desktop through the REAL presenter seam: arrival rules, one host per Section Mount Point, the Quiz menu bar's four commands, in-place re-render remounting, the plan cache's request counts, Retake's confirmation (#61/#64/#65/#66)
│       ├── test-desktop-core.js    # DOM-free desktop core: Window Record transitions, mode-derived consequences, End Program gate, section mount points (ticket #59)
│       ├── test-desktop-store.js   # the per-tab desktop Record: the one write at the Finish Commit, restore-before-paint, the Record round-trip through the core, quiet invalidation and unavailable storage (ticket #63)
│       ├── test-sound.js           # audible() matrix, voice table, mute persistence
│       ├── test-results-retro.js   # retro results as window BODY with NO fake chrome (the shell's title bar is the only one), radar SVG + dither, the Quiz menu bar's four commands, body-only PNG sheet, review disclosures, #56 re-anchor, the per-language plan cache (#64), Retake's confirmation (#66)
│       ├── test-cjk-font-subset.js # the committed Fusion Pixel subset covers every Han codepoint the Chinese dictionary and Bank Variant render (fonts/PROVENANCE.md)
│       ├── test-theme-retro-os.js  # static skin/token/integration checks for every entry point
│       └── test-grounding.js   # gates the shipped Grounding Corpus itself
├── scripts/
│   ├── preflight.sh
│   ├── deploy.sh
│   └── subset-fusion-pixel.py   # offline, repo-side regeneration of the Chinese subset face + its codepoint inventory (fonts/PROVENANCE.md, ADR-0001 amendment)
├── worker/
│   ├── src/index.js
│   └── wrangler.toml
├── run_tests.py
├── package.json
└── docs/
    ├── architecture.md
    ├── TESTING.md
    ├── owasp-ast-full.md       # Grounding Corpus
    ├── adr/                    # one decision per note — 0001–0021
    └── agents/                 # issue-tracker, triage-labels, domain consumer rules
```

```bash
./scripts/preflight.sh                                # gate: before every deploy
./scripts/deploy.sh                                   # preflight + worker + pages in one
# or individually:
python3 run_tests.py
python3 run_tests.py --llm tests/mock_llm_output.json
node tests/js/run-tests.js
npx wrangler deploy --config worker/wrangler.toml   # Worker name `llm-proxy`, declared in that file — no --name override
npx wrangler pages deploy ./ --project-name=agent-security-quiz
```

---

## 6. Future Considerations (v2+)

Multilingual delivery is built (ADR 0015, ADR 0017), so it is no longer an item here. What localization makes possible next, and what remains open:

- **More languages.** Adding a language is now one bank file, one dictionary file, one page, and the page's five `data-lang-alt*` declarations — no code changes and no build step (ADR 0019 reads the declaration; the in-page toggle handles exactly two locales per page today, so a third language also needs the switch widened to more than "the other one"). The gate picks up the new bank automatically. The open question is which language, and whether the Simplified Chinese AST Risk and Progression Title terminology sets are reviewed by a native speaker before a third set is coined (ADR 0015 verifies structure, not currency).
- **Translation currency.** The one gap localization did not close: no check can tell whether a Bank Variant still says what its source bank says. A shared diff-review step or a per-language freshness signal is the candidate.
- **Shareable result URLs**, retake tracking (ADR 0017 notes the storage shape can extend without changing the versioning mechanism), finer Grounding Corpus retrieval, an aggregate admin dashboard, and an embeddable widget for agent platform marketplaces.
