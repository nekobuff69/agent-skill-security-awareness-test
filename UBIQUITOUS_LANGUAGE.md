# Ubiquitous Language

Domain vocabulary for the Agent Skills Security Self-assessment — extracted from the design session, `docs/architecture.md`, `docs/TESTING.md`, `questions.json`, and the OWASP Agentic Skills Top 10 corpus.

## Assessment content

| Term                 | Definition                                                                                          | Aliases to avoid                    |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Question Bank**    | The single source of truth for all assessment content, parsed at load; the app's only runtime database | Database, question set              |
| **Question**         | One assessed decision point: a Scenario, four Options, a Severity, a Best Practice, one or more AST Risks | Item, quiz question                 |
| **Phase**            | One of the three thematic stages of the quiz (install trust / permissions / lifecycle)               | Section, part, step                 |
| **Scenario**         | The realistic situation a Question presents before its Options                                      | Story, prompt (collides with LLM prompt) |
| **Option**           | One of the four answer choices on a Question                                                        | Choice, answer                      |
| **Feedback**         | The per-Option explanation of why that choice is risky or sound                                     | Explanation, rationale              |
| **Best Practice**    | The recommended behavior attached to a Question                                                     | Recommendation, guideline           |
| **Mitigation**       | An OWASP countermeasure for an AST Risk, carried in the corpus — risk-level, never question-level    | Fix, defense                        |

## Participant & session

| Term            | Definition                                                                          | Aliases to avoid           |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| **Participant** | The person taking the assessment                                                     | User, user, quiz-taker, respondent |
| **Agent**       | The Participant's own AI coding app, where the Deep-Dive Prompt is pasted             | Assistant, bot             |
| **Session**     | One quiz attempt persisted locally, versioned by the bank's content hash             | Saved answers, localStorage state |
| **Completion**  | The moment all Questions are answered; triggers scoring and the Action Plan request  | Finish, submission         |

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
| **Progression Title** | The game-style tier a Completion yields: Sentinel, Practitioner, Aware, Newcomer, or Uncharted    | Grade, rank, level, badge     |
| **Title Ladder**      | The five thresholds-and-names table in the bank's meta (`meta.scoring.titles`)                    | Grades table, grading curve   |
| **Title Card**        | The results header showing the Progression Title, its emoji, and the Overall Percentage           | Score card, grade card        |
| **Risk Radar**        | The ten-axis shareable SVG chart of AST Scores; the results hero                                 | Radar chart, spider chart, infogram |
| **Blind-Spot Bars**   | The horizontal AST Scores sorted weakest-first; the detail readout under the radar               | Gap bars, risk profile bars   |
| **Severity Chip**     | The text label (critical / high / medium) beside a radar axis or bar — never the fill color       | Color tag                     |
| **Review**            | The post-Completion accordion revealing each Question's chosen Option, Feedback, Best Practice, and OWASP link | Review panel, review page |

## Recommendation & grounding

| Term                        | Definition                                                                                      | Aliases to avoid             |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Action Plan**             | The 3–5 prioritized Actions on the results page, OWASP-grounded                                   | Recommendations, advice       |
| **Action**                  | One prioritized improvement in the Action Plan, citing exactly one AST Risk                      | Action item, task             |
| **Narrative**               | The 2–3 paragraph personalized risk assessment atop the Action Plan                               | Summary, story                |
| **Deep-Dive Prompt**        | The deterministic kickoff prompt a Participant pastes into their Agent to open a tutoring session on their Blind Spots | Prompt template, composite prompt, hero artifact |
| **LLM Path**                | The recommendation route: score report + Grounding Excerpts sent through the proxy to the LLM    | Live generation, AI path      |
| **Deterministic Fallback**  | The in-app assembly of an Action Plan from bank content when the LLM Path is unavailable         | Static fallback, static recommendations |
| **Grounding Corpus**        | `owasp-ast-full.md` — the extracted OWASP content from which excerpts are drawn                  | Source material, OWASP dump   |
| **Grounding Excerpt**       | The full corpus content for one AST Risk, included in the LLM prompt for the weakest risks       | Chunk, section                |
| **Source Note**             | The Question's evidence string that authoring-time validation traces every statistic to          | Source material, citation     |
| **Authoring-Time Validation** | The rule-based grounding gate in `run_tests.py` applied to model outputs before deploy         | Grounding check, QA           |
| **Runtime Validation**      | The structural pre-render checks in the app: JSON shape, valid AST references, retry → fallback | Client-side validation        |

## OWASP AST Risks

Canonical names and severities as titled in the Grounding Corpus (`owasp-ast-full.md`). A Question's Severity inherits from the AST Risks it maps to.

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
- An **Option** belongs to exactly one **Question** and carries exactly one **Option Score** and one **Feedback**.
- A **Session** records exactly one **Option** per **Question**; a bank change version-stamps stale Sessions.
- A **Completion** consumes one **Session** and produces exactly one **Progression Title** and one **Action Plan** request.
- A **Blind Spot** is one **Participant**'s low **AST Score** on one **AST Risk**; a Multi-Mapping Question feeds every mapped **AST Score**, so one bad answer can open two Blind Spots.
- A **Best Practice** is Question-level; a **Mitigation** is AST-Risk-level (corpus). The **Deterministic Fallback** distills Best Practices into Actions; **Grounding Excerpts** carry Mitigations.
- The **Deep-Dive Prompt** is deterministic and identical on the **LLM Path** and the **Deterministic Fallback** — only the Narrative and Actions differ between paths.
- A **Source Note** bounds what the LLM may claim; **Authoring-Time Validation** enforces it, **Runtime Validation** checks structure only.

## Example dialogue

> **Dev:** "When the **Participant** answers question 20, when exactly does the **Progression Title** get computed?"

> **Domain expert:** "At **Completion**. The Scoring Engine sums every **Weighted Score** into the **Overall Percentage**, and the first title on the **Title Ladder** whose threshold it clears wins. No letter grades — that vocabulary is retired."

> **Dev:** "And a **Blind Spot** is any **AST Score** below… what?"

> **Domain expert:** "Below 50% is where we color the radar red. But a **Blind Spot** isn't a category — it's this **Participant**'s weakness in one **AST Risk**. q07 maps to two risks, so one bad answer there opens two Blind Spots at once."

> **Dev:** "Does the **Deep-Dive Prompt** include the scores?"

> **Domain expert:** "No. Scores never leave the Scoring Engine except into the results visuals. The prompt carries the **Weakest Questions** — what they chose, the **Best Practice**, the OWASP link — and the receiving **Agent** teaches from those links."

> **Dev:** "Same prompt if the **LLM Path** is down?"

> **Domain expert:** "Yes — the prompt is deterministic, same artifact either way. Only the **Narrative** and **Actions** differ between the LLM Path and the **Deterministic Fallback**."

> **Dev:** "What stops the LLM inventing statistics?"

> **Domain expert:** "**Source Notes**. Authoring-time validation traces every number in a model output to a Source Note; anything untraceable fails the gate before deploy."

## Flagged ambiguities

- **"title" carried three meanings** — the app title (`meta.title`), the Phase heading (`phases[].title`), and the tier name (`meta.scoring.titles[]`). The domain term is **Progression Title**; say "app title" and "Phase heading" for the others, never bare "title".
- **"user" meant two people** — the quiz-taker and the audience of the quiz content. Canonical: **Participant** for the person assessed; **Agent** for their AI app.
- **"score" was never bare** — Option Score, Weighted Score, AST Score, and Overall Percentage are four distinct numbers. Always qualify.
- **"grade" is retired** — the A–F ladder was replaced by Progression Titles. The term must not reappear; sweep code and copy for stragglers before shipping.
- **"prompt template" vs "deep-dive prompt"** — the conversation drifted between "composite prompt template", "deep-dive template", and "template". Canonical: **Deep-Dive Prompt**; "template" collides with code templates and hides that the artifact is a briefing for a conversation.
- **AST name drift between docs** — RESOLVED: `TESTING.md`'s mock output now uses the corpus headings ("Malicious Skills", "Over-Privileged Skills", "Insecure Metadata", "Weak Isolation"). Any future copy should quote the corpus, not invent variants.
- **Data smell: duplicated severity maps** — RESOLVED: the redundant `meta.scoring.severity_weight` map is cut; `severity_values` is the single severity map. The per-Question field named `severity_weight` (which holds a Severity *label*) stays until the app ships, then renames to `severity`.
- **"static-recommendations" is dead vocabulary** — the cut pattern-file and "static fallback" phrasing describe a removed design. Use **Deterministic Fallback**.
