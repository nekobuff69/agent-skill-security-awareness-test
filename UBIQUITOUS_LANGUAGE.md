# Ubiquitous Language

Domain vocabulary for the Agent Skills Security Self-assessment — extracted from the design session, `docs/architecture.md`, `docs/TESTING.md`, `questions.json`, the OWASP Agentic Skills Top 10 corpus, the post-redesign implementation rounds (UX redesign #13–#18, LLM pipeline hardening), the localization round (Bank Variants and Chrome Strings), and the retro-OS shell and locale rounds (#38–#56: window chrome, faces, one-way first-visit routing, the in-page Locale Swap).

## Assessment content

| Term                 | Definition                                                                                          | Aliases to avoid                    |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Question Bank**    | The source of truth for assessment *content* in one language, parsed at load; the app's only runtime content database | Database (bare), question set, secondary content source |
| **Bank Variant**     | A Question Bank for one language, structurally identical to its sibling banks — same Question ids, Phase membership, AST Risk mappings, Option Scores, Severity Weights, and Title Ladder thresholds — differing only in authored text; the only content duplication the project permits (ADR 0015) | Translation file, locale bank, secondary content source, duplicate bank |
| **Question**         | One assessed decision point: a Scenario, four Options, a Severity, a Best Practice, one or more AST Risks | Item, quiz question                 |
| **Phase**            | One of the three thematic stages of the quiz (install trust / permissions / lifecycle)               | Section, part, step                 |
| **Scenario**         | The realistic situation a Question presents before its Options                                      | Story, prompt (collides with LLM prompt) |
| **Option**           | One of the four answer choices on a Question, presented with an A–D letter badge                     | Choice, answer                      |
| **Feedback**         | The per-Option explanation of why that choice is risky or sound                                     | Explanation, rationale              |
| **Best Practice**    | The recommended behavior attached to a Question                                                     | Recommendation, guideline           |
| **Mitigation**       | An OWASP countermeasure for an AST Risk, carried in the corpus — risk-level, never question-level    | Fix, defense                        |

## Participant & session

| Term            | Definition                                                                          | Aliases to avoid           |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| **Participant** | The person taking the assessment                                                     | User, quiz-taker, respondent |
| **Agent**       | The Participant's own AI coding app, where the Deep-Dive Prompt is pasted             | Assistant, bot             |
| **Session**     | One quiz attempt persisted locally under the single key `quiz-session`, shared by every Bank Variant and versioned by the bank's structural hash — Question order, Option Scores, Severity Weights, AST Risk mappings, Phase membership — never by authored text | Saved answers, localStorage state, per-language Session |
| **Completion**  | The hand-off to results, committed by the Finish Commit once every Question has an Option selected; triggers scoring and the Action Plan request | Submission (bare), auto-completion    |
| **Retake**      | The results-page control that clears the Session and returns to the landing view     | Restart, redo              |
| **Language Preference** | The Participant's remembered language choice, held under `quiz-lang` independently of their Session — never version-stamped, never reset by a Question Bank change, written by first-visit routing and by every Locale Swap | Locale setting, language cookie, per-language state, dismissed-prompt record (retired by #54) |

## Quiz experience

| Term                 | Definition                                                                                     | Aliases to avoid                     |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Quiz Chrome**      | The status bar pinned inside the window during the quiz (ticket #52): phase name in the left pane, segmented Progress Fill + Question Counter in the right pane. The window has a fixed height, so only the client area scrolls and this bar, the Question Card and the pinned wizard footer are the window's three parts — the counter counts the Question being *viewed*, the Fill counts Questions *answered*; they are two different signals | Header (overloaded), toolbar, HUD, floating/sticky chrome (retired pre-#52) |
| **Question Counter** | The "N / 20" text showing the question currently being viewed, 1-indexed                         | Progress text, answered count        |
| **Progress Fill**    | The thin bar showing answered questions / 20; reaches 100% before the results hand-off           | Progress bar (bare)                  |
| **Phase Chip**       | The phase name in the Quiz Chrome's left pane showing the current Phase; swaps text, never appends | Phase header (retired card), badge   |
| **Question Card**    | The one-at-a-time card: Q-number chip, labeled Scenario and Question blocks, A–D-lettered Options | Quiz card, quiz page                 |
| **Wizard Navigation**| Two-way movement through the Question Cards: [< Back] from the second Question onward, [Next >] between Cards, [Finish] on the last; re-answering overwrites the pick in place without advancing | Back-only navigation (retired), pager, stepper |
| **Finish Commit**    | The [Finish] click on the last Question Card — the single trigger for Completion: enabled only when all 20 Questions are answered, `quiz_completed` fires exactly there, never automatically | Auto-finish, submit button, implicit completion |
| **Advance Transition** | The client-area card wipe (~160ms CSS) replacing the outgoing Question Card on advance and Back; instant under prefers-reduced-motion | Animation, transition effect, slide-up + fade (retired) |
| **Chrome String** | A translatable interface string, resolved by id from the locale dictionary (`i18n/<lang>.js`) and kept strictly separate from Question Bank content; a missing id throws rather than falling back | Copy (bare), localized string, bank copy, display data, title (bare) |
| **Welcome Splash** | The compact title screen of the Landing Page (ticket #53): eye icon, two-line display headline, the Bank's title as subtitle, a rule, one body line with the Question count and time estimate from `meta`, and a single default [Start] — a wizard card inside the window, not a full-height editorial page | Landing hero, title screen (vague), start page |
| **Language Toggle** | The taskbar's two-segment EN/中文 control (#50, replaced the tray clock) — the app's only language affordance on every view; pressing either segment performs a **Locale Swap** to that language, records the **Language Preference**, and keeps the current view and state | Language tray chip (retired name), switch link (retired mechanism), offer (retired dialog) |
| **Locale Swap** | The in-place language change (#55/#56, ADR 0019): register the alternate Chrome String dictionary, load its Bank Variant, update `<html lang>`, `document.title` and the URL with one history entry, then re-render the visible view from current state — no navigation, no reload, no lost answers, and a dismissible notice instead when the alternate cannot be loaded | Language switch (bare — it no longer switches pages), redirect, reload |

## Scoring

| Term                      | Definition                                                                             | Aliases to avoid       |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| **Option Score**          | An Option's 0–3 value for security of behavior                                                         | Score (unqualified), points |
| **Severity**              | A Question's risk tier label: critical, high, or medium                                                | Severity tier          |
| **Severity Weight**       | The numeric multiplier for a Severity: critical 3, high 2, medium 1                                    | Weight                 |
| **Weighted Score**        | Option Score × Severity Weight, computed for the chosen Option                                          | Earned points          |
| **Max Possible**          | A Question's best Option Score × its Severity Weight (q06 and q13 cap at 2)                            | Full marks             |
| **Total Possible**        | Σ Max Possible across the bank — 108                                                                    | Max score, denominator |
| **AST Score**             | One AST Risk's earned / possible / percentage aggregate for a Participant                               | Risk score, per-AST score |
| **Overall Percentage**    | Total earned over Total Possible                                                                       | Grade %                |
| **Multi-Mapping Question**| A Question mapped to two or more AST Risks; its Weighted Score counts in every mapped aggregate          | Dual-tagged question   |
| **Weakest Questions**     | The (up to 5) Questions scored 0 or 1, worst first — the primary blind-spot signal                      | Low scorers, failures  |
| **Blind Spot**            | A Participant's weakness in one AST Risk — a low AST Score, revealed by the assessment                   | Weak area, risk gap    |

## Results presentation

| Term                  | Definition                                                                                       | Aliases to avoid              |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Progression Title** | The game-style tier a Completion yields — Sentinel, Practitioner, Aware, Newcomer, or Uncharted in English; 守望者, 实干者, 觉察者, 新手, 未开垦 in Simplified Chinese | Grade, rank, level, badge |
| **Title Ladder**      | The five thresholds-and-names table carried in each Bank Variant's meta (`meta.scoring.titles`); thresholds and emoji are identical across Variants, only the names are localized | Grades table, grading curve |
| **Title Card**        | The results header showing the Progression Title, its emoji, and the Overall Percentage — since #60 the real window's first body panel, never a second fake title bar | Score card, grade card        |
| **Risk Radar**        | The ten-axis shareable SVG chart of AST Scores with AST-ID + percentage axis labels               | Radar chart, spider chart, infogram |
| **Blind-Spot Bars**   | The horizontal AST Scores sorted weakest-first, full AST names + percentage                       | Gap bars, risk profile bars   |
| **Review**            | The post-Completion screen (reached from the results page) revealing each Question's chosen Option, Feedback, Best Practice, and OWASP link — no scores | Review panel, review page, results review |

## Desktop shell

| Term                  | Definition                                                                                       | Aliases to avoid              |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Desktop Core**      | The DOM-free state module (`js/desktop-core.js`, tickets #59/#61) that owns every Window Record, the transitions between them, and the desktop gates; the codebase's only window state model — the Window Manager renders what it says | Window manager (that is the controller), state machine (bare), desktop state |
| **Program Window**    | One of the desktop's three programs in its own window — the **Quiz**, the **Action Plan** and the **Deep-Dive Prompt** (#61). Each is a Window Record keyed by its program Id; only the Quiz window exists from boot, the other two are born by Arrival | Panel, modal, popup, sub-window |
| **Running Window**    | A program with a Window Record that is not hidden. EXACTLY the running windows are listed in the taskbar, in the stable program order (Quiz, Action Plan, Deep-Dive Prompt); a program that has not arrived has no Record and no button | Active window (that is the focused one), open window |
| **Arrival**           | The transition that creates a Window Record (`open`): the program's designed Geometry, cascaded 24px down-right when another window is focused, stacked below the active window when it must not disturb the reading, and NEVER a focus call, a raise or a scroll. The Action Plan arrives when its content settles; the Deep-Dive Prompt arrives minimized at the Finish Commit | Spawn, popup, mount, show |
| **Window Record**     | One program's window state: Mode, Geometry, Last Geometry, Last Mode and stacking order (z) | Window object, window model, window snapshot (bare) |
| **Window Mode**       | `normal`, `maximized`, `minimized` or `hidden`. The mode is the contract: whether the window is visible on the desktop, whether it belongs in the taskbar, and whether it participates in focus are all DERIVED from it, never stored | Window flags, open/closed, minimized-boolean |
| **Geometry**          | A Window Record's `{x, y, w, h}` in desktop coordinates (the taskbar is excluded). **Last Geometry** is the arrangement a restore returns to. Each program also has a **Designed Default Geometry**, and a window born while another is focused takes the focused window's origin plus a 24px down-right **Cascade** | Position, rect, bounds |
| **End Program Gate**  | The desktop-wide condition set by `requestClose` and cleared by `confirmClose`/`cancelClose`: while the End Program dialog owns the desktop, every other transition is refused | Modal lock, busy flag |
| **Desktop Regime**    | The layout rule (spec #58, tickets #60/#61): the results and review views present each program as a positioned, draggable, resizable window drawn from its Geometry, while the landing and quiz views keep the layout-flow frame and leave no program window running — the desktop does not exist before the Finish Commit. On the ≤768px layout the Window Manager refuses every Geometry write and every frame goes full-screen, so the viewport-blind Desktop Core never models a mode the stylesheet overrides | Windowed mode, floating panel, desktop (bare) |
| **Put Away**          | What [×] means on the Desktop Regime: the core's `hide` — the window leaves the screen, the bare desktop and taskbar stay, and the hidden window LEAVES the taskbar (every program, Quiz included — #62 retired the button bridge #61 left). Its **Desktop Shortcut** is the way back: the launch restores the Record's Last Mode and Last Geometry; a program window with no Record comes back with its next Arrival. Only where a shortcut exists: on the ≤768px layout there is no desktop to put a window away on, so the Quiz [×] asks the **End Program Gate** question and a program frame's [×] is gray (#62) | Close (bare), quit, destroy, kill |
| **Desktop Shortcut**  | One of the three icons in the desktop's fixed top-left column — Quiz, Action Plan, Deep-Dive Prompt — labelled by the SAME Chrome String the program's title bar carries and drawn as an era glyph. Always present whether or not the program is running, and never duplicated: a launch (double-click, Enter or Space) Arrives an unarrived program, restores a Minimized or Put-Away one at its Last Mode and Last Geometry, or Raises a running window. The column is desktop-only: it does not exist on the ≤768px layout, where the taskbar is the only switcher | Icon (bare), launcher, tile, start-menu entry |
| **Chrome Handles**    | The two pointer affordances of a windowed frame: the title bar drags it and the bottom-right corner grip sizes it; both move the window by writing Geometry through the Desktop Core, never by touching the frame directly. Any pointer interaction inside a frame **Raises** it and makes it the active window | Drag area, resize border, gripper |
| **Section Mount Point** | The named host a results section renders into — `action-plan` and `deep-dive` — resolved live through `App.resultsMount(name)`. On the desktop the host IS the program window's body (the shell builds it with the mount id and a `data-results-mount` mark), so the presenter renders the same section subtree into its own window or, with no window, into the results view in place; an in-place re-render re-mounts it, never duplicating or orphaning it | Slot, container, placeholder |

## Recommendation & grounding

| Term                        | Definition                                                                                      | Aliases to avoid             |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Action Plan**             | The 3–5 prioritized Actions on the results page, OWASP-grounded; the only always-visible plan content | Recommendations, advice       |
| **Action**                  | One prioritized improvement in the Action Plan, citing exactly one AST Risk via its AST source    | Action item, task             |
| **Narrative**               | The personalized risk assessment that lives collapsed in the Narrative Expander beneath the action cards | Summary, story, intro text    |
| **Narrative Expander**      | The collapsed "Why these actions? Read the analysis" disclosure holding the Narrative on both paths | Collapsible, details block    |
| **Deep-Dive Prompt**        | The deterministic kickoff prompt a Participant pastes into their Agent to open a tutoring session on their Blind Spots | Prompt template, composite prompt, hero artifact |
| **LLM Path**                | The recommendation route: score report + Grounding Excerpts sent through the Proxy Worker to the Provider | Live generation, AI path      |
| **Deterministic Fallback**  | The in-app assembly of an Action Plan from bank content when the LLM Path is unavailable          | Static fallback, static recommendations |
| **Proxy Worker**            | The small server that holds the Provider endpoint, API key, and model name as server-side secrets; enforces CORS allow-list, per-IP rate limit, and structured error pass-through | LLM proxy, backend            |
| **Provider**                | The OpenAI-compatible LLM service behind the Proxy Worker (OpenAI, Anthropic-compat, OpenRouter, LM Studio, Ollama) | Upstream (infra phrasing), cloud LLM |
| **Grounding Corpus**        | `docs/owasp-ast-full.md` — the extracted OWASP content from which excerpts are drawn; one file, not per-AST files | Source material, OWASP dump   |
| **Grounding Excerpt**       | One AST Risk's Description, Real-World Evidence, and Preventive Mitigations from the corpus, included in the LLM prompt for the weakest risks | Chunk, section, full corpus content |
| **Grounding Material**      | What the LLM may claim: the union of the Grounding Excerpts and the Weakest Questions (Best Practices + OWASP links) in the prompt | Provided text, knowledge base |
| **Source Note**             | The Question's evidence string that authoring-time validation traces every statistic to           | Source material, citation     |
| **Authoring-Time Validation** | The rule-based grounding gate in `run_tests.py` applied to model outputs before deploy         | Grounding check, QA           |
| **Runtime Validation**      | The structural pre-render checks in the app: JSON shape, valid AST references, one retry → fallback | Client-side validation        |

## OWASP AST Risks

Canonical names and severities as titled in the Grounding Corpus (`docs/owasp-ast-full.md`). In code, the **ids** and **severities** live once in the AST Risk registry (`js/ast.js`) — see ADR 0013; the **display names** are Chrome Strings resolved from the locale dictionary, so each surface reads them from one place rather than keeping its own table. A Question's Severity inherits from the AST Risks it maps to. Severity is metadata and prompt data — it never renders in the Risk Radar or Blind-Spot Bars.

The ten names are a fixed terminology set per language, not text assembled per file. The Simplified Chinese set — 恶意技能 / 供应链入侵 / 权限过度的技能 / 不安全的元数据 / 不可信的外部指令 / 隔离不严 / 更新漂移 / 扫描不力 / 缺乏治理 / 跨平台复用 — is the deliberately chosen translation held in `i18n/zh.js` under ids `ast.AST01`…`ast.AST10`, and it is the single source for those terms. That is what keeps the Risk Radar, Blind-Spot Bars, Action Plan, Deterministic Fallback, and LLM Path prompt showing one consistent name per AST Risk: a **Bank Variant** supplies its own display names through its locale's dictionary and never re-declares them.

| Term                              | Severity | Definition                                                       |
| --------------------------------- | -------- | ---------------------------------------------------------------- |
| **AST01 — Malicious Skills**      | Critical | Attackers publish trojan skills through trusted channels and marketplaces |
| **AST02 — Supply Chain Compromise** | Critical | Compromise of dependencies or upstream components a skill relies on |
| **AST03 — Over-Privileged Skills**| High     | Skills request permissions beyond their stated function           |
| **AST04 — Insecure Metadata**     | High     | Skill metadata (SKILL.md) conceals or smuggles instructions       |
| **AST05 — Untrusted External Instructions** | High | Skills ingest remote content that steers agent behavior |
| **AST06 — Weak Isolation**        | High     | Insufficient sandboxing lets a skill reach beyond its scope       |
| **AST07 — Update Drift**          | Medium   | Installed skills change or degrade silently across updates        |
| **AST08 — Poor Scanning**         | Medium   | Invisible payloads (Unicode, base64) evade human review unscanned |
| **AST09 — No Governance**         | Medium   | No policy or process for approving and managing skills            |
| **AST10 — Cross-Platform Reuse**  | Medium   | A skill safe in one agent context misbehaves when reused elsewhere |

## Relationships

- A **Question** belongs to exactly one **Phase** and maps to one or more **AST Risks**.
- An **Option** belongs to exactly one **Question** and carries exactly one **Option Score**, one **Feedback**, and one letter badge (A–D).
- A **Session** records exactly one **Option** per **Question**; a structural bank change version-stamps stale Sessions while authored-text changes do not; **Wizard Navigation** moves both ways — re-answers overwrite in place and the card stays put (no advance on a revisit), and **Finish Commit** is the single path to **Completion**. One **Participant** has one Session for the whole assessment — every **Bank Variant** reads and writes the same record, so switching language resumes in place rather than starting a second run, and rewriting prose never costs anyone their progress (ADR 0017).
- The **Quiz Chrome** updates in place: the **Question Counter** shows the question being viewed, the **Progress Fill** shows answered/20, the **Phase Chip** swaps the Phase title — nothing stacks, nothing appends, and the bar stays pinned inside the fixed-height window while only the client area scrolls (#52).
- The **Language Toggle** performs a **Locale Swap**: dictionary, then Bank Variant, then `<html lang>`, `document.title` and the URL with one history entry, then a rebuild of the visible view from current state. The **Session**, the current **Question**, the **Completion**'s score report and the scroll position all survive it; a swap that cannot load its alternate leaves the language alone and says so in a dismissible notice (ADR 0019). Every successful swap writes the **Language Preference**, which is what keeps the swap the override over first-visit routing (ADR 0018).
- A **Completion** consumes one **Session**, produces exactly one **Progression Title** and one Action Plan request; the **Progress Fill** holds 100% for a beat before the hand-off.
- A **Blind Spot** is one **Participant**'s low **AST Score** on one **AST Risk**; a Multi-Mapping Question feeds every mapped **AST Score**, so one bad answer can open two Blind Spots.
- A **Best Practice** is Question-level; a **Mitigation** is AST-Risk-level (corpus). The **Deterministic Fallback** distills Best Practices into Actions; **Grounding Excerpts** carry Mitigations.
- On the **LLM Path**, every **Action** and the **Narrative** must trace to the **Grounding Material** — an **Action**'s AST Risk must be covered by the Grounding Excerpts or the Weakest Questions' Best Practices; the model name never reaches the client.
- The **Deep-Dive Prompt** is deterministic and identical on the **LLM Path** and the **Deterministic Fallback** — the **Narrative** (collapsed in the **Narrative Expander**) and the **Actions** differ between paths.
- A **Source Note** bounds what the LLM may claim; **Authoring-Time Validation** enforces it, **Runtime Validation** checks structure only. The shipped **Grounding Corpus** itself is gate-tested (all 10 AST Risks must extract cleanly).
- **Review** is its own screen, reached from the results page; it never shows scores or percentages.
- The **Desktop Core** owns exactly one **Window Record** per program; the **Window Mode** alone decides whether that window is visible, in the taskbar and eligible for focus, and the Window Manager renders from those derived answers instead of keeping a copy. Every movable results section sits on its own **Section Mount Point** so the same content can be rendered in place or inside a window (ticket #59).

## Example dialogue

> **Dev:** "The Participant is on question 20 and the counter says 20/20, but the results aren't showing — bug?"

> **Domain expert:** "No — that's the designed gate. The first time an Option is tapped the card auto-advances on the beat; at the last answer the **Question Counter** holds 20/20 with the **Progress Fill** at 100% for a beat and **Finish** becomes enabled. **Completion** fires only on the **Finish Commit** — the old counter counted *answered* questions, which is why people thought the quiz ended at 19."

> **Dev:** "They went back and changed their answer on question 3 — does the **Session** keep both answers?"

> **Domain expert:** "One **Option** per **Question**, always — the new pick overwrites the stored one, the radio re-marks, and the card stays put: re-answering never auto-advances. Picks stay free until the **Finish Commit**."

> **Dev:** "Mid-quiz they hit 中文 in the **Language Toggle** and the page jumped back to the **Welcome Splash** — reload bug?"

> **Domain expert:** "There is no reload any more. A **Locale Swap** registers the other Chrome String dictionary, loads the other **Bank Variant**, updates `<html lang>`, the title and the URL, then rebuilds the view they were looking at — same **Question**, same answers, same scroll (ADR 0019). If you saw the Splash, they pressed it from the Splash; the toggle acts on whatever view is visible. And if it ever *appears* to navigate, that is the one deliberate case left: a view the swap module does not know, which keeps the old record-and-navigate action."

> **Dev:** "Where did the **Review** go? It used to sit right under the Action Plan."

> **Domain expert:** "It's its own screen now — the results page keeps the **Title Card**, **Risk Radar**, **Blind-Spot Bars**, **Action Plan**, and **Deep-Dive Prompt**, plus a Review button. The Review never shows scores."

> **Dev:** "And where's the plan's **Narrative**? I don't see it above the action cards."

> **Domain expert:** "Collapsed in the **Narrative Expander** beneath the cards — same behavior on the **LLM Path** and the **Deterministic Fallback**, same schema either way."

> **Dev:** "What stops the Provider inventing a breach statistic?"

> **Domain expert:** "**Grounding Material**. The prompt carries the **Grounding Excerpts** for the weakest risks and the **Weakest Questions**' Best Practices, and instructs the model to trace every claim there — **Runtime Validation** checks structure only, and the corpus itself is gate-tested so a format edit can't silently empty the grounding."

## Flagged ambiguities

- **"title" still carries three meanings** — the app title (`meta.title`), the Phase heading (`phases[].title`), and the tier name (`meta.scoring.titles[]`). Domain term: **Progression Title**; say "app title" and "Phase heading" for the others, never bare "title".
- **"copy is data" narrowed** — the retired blanket claim no longer holds. Assessment *content* is still the Bank's; interface copy is a **Chrome String** resolved from the locale dictionary, and "no secondary content source" now means no secondary *source of assessment content*. A **Bank Variant** is not a second source — it is the same content in another language (ADR 0015).
- **"language" vs "locale" vs "translation"** — a **Bank Variant** is a whole Question Bank per language; the Chrome String dictionary is the per-language string table. Never call either a "translation file": the Variant is content, the dictionary is interface copy, and neither is generated at build time.
- **AST Risk display names are not code and not bank content** — ids and severities are code (`js/ast.js`), display names are Chrome Strings. A hardcoded AST name in any `js/` module is a regression (ADR 0013 as narrowed by ADR 0015).
- **"user" still forbidden** — **Participant** for the person assessed, **Agent** for their AI app.
- **"score" is never bare** — Option Score, Weighted Score, AST Score, and Overall Percentage are four distinct numbers. Always qualify.
- **"grade" is retired** — Progression Titles replaced it. Must not reappear.
- **"header" became overloaded after the redesign** — three surfaces: the landing header (title, subtitle, Start button), the retired **phase header card**, and the **Quiz Chrome**. The phase header card is retired vocabulary: the Phase now appears only as the **Phase Chip** inside the Quiz Chrome. Never re-add a phase block near the Question card.
- **"switching language" is a Locale Swap, not a navigation** — no document, comment or test may claim the language switch reloads or navigates: the two pages still exist and stay directly linkable, but the **Language Toggle** changes the language in place (ADR 0019), with the unknown-view record-and-navigate fallback as its single exception.
- **Retired interface vocabulary** — the first-visit **offer** dialog and its dismissal record (#54), the taskbar tray **clock** the **Language Toggle** replaced (#50), the "language tray chip" name for that toggle (#50), the floating/sticky quiz chrome bar the pinned **Quiz Chrome** replaced (#52), and the separate Chinese stylesheet `css/cjk.css` (#51 — Chinese typography is now a rule set inside `css/theme-retro-os.css`, gated on `html[lang^="zh"]`, because a runtime Locale Swap rewrites `<html lang>`). Say **Language Toggle**, **Locale Swap**, **Welcome Splash**, **Quiz Chrome**.
- **"progress bar" vs "counter"** — two different signals: the **Question Counter** shows the question being *viewed*; the **Progress Fill** shows answered/20. They were conflated before the redesign (the "quiz ended at 19/20" confusion) — never use bare "progress".
- **Severity Chip is retired from visuals** — owner decision: severity (critical / high / medium) no longer renders in the Risk Radar or Blind-Spot Bars; it lives only as bank/corpus metadata and as prompt data. Score-band colors alone encode the Participant's performance.
- **"upstream" vs "provider"** — ADR text says "upstream LLM endpoint"; in domain conversation say **Provider**. "Upstream" is acceptable only as infrastructure phrasing inside the Proxy Worker's code and ADRs.
- **Analytics event contract drift** — RESOLVED 2026-09-10: the contract is now **five events** (`quiz_started`, `quiz_completed`, `llm_success`, `llm_fallback`, `template_copied`), recorded as an amendment comment on PRD issue #1. `quiz_started` fires once on Start.
- **"prompt template" vs "deep-dive prompt"** — canonical: **Deep-Dive Prompt**; "template" collides with code templates.
- **"static-recommendations" and "grade" remain dead vocabulary** — use **Deterministic Fallback** and **Progression Title**.
