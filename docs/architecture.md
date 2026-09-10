# Agent Skills Security Self-assessment

## 1. Overview

A single-page web app delivering a self-assessment quiz on AI agent skill security, grounded in the [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10). Two-pass UX: answer all questions → see score → review with explanations.

**Design philosophy:** Self-assessment, not knowledge test. Every option reflects a real behavioral choice. Scoring reveals blind spots, not trivia gaps.

---

## 2. Data Layer

| File                | Role                                                                                           | Updated by     |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `questions.json`    | Question bank — source of truth for scenarios, options, scoring, best practices, OWASP sources | Content author |
| `architecture.md`   | This document — all design decisions                                                           | Developer      |
| `owasp-ast-full.md` | Full extracted OWASP AST content — LLM grounding corpus                                        | Content author |

`questions.json` is the **database**. The site parses it at build/load time. No server-side database.

### Runtime Data Flow

One `fetch()` on page load, parse once, use everywhere:

```
questions.json (loaded once)
     │
     ├─→ Quiz Renderer
     │     reads: phases[], questions[]
     │     renders: phase headers, scenario cards, option buttons
     │     collects: user selections → {question_id: option_index}
     │     stores: localStorage (survives refresh)
     │
     ├─→ Scoring Engine
     │     reads: questions[].options[].score
     │     reads: questions[].severity_weight
     │     reads: meta.scoring.severity_values
     │     computes: per-AST aggregates, overall %, grade
     │
     ├─→ Results Renderer
     │     reads: meta.scoring.grades
     │     renders: grade card, risk profile bars
     │
     ├─→ LLM Recommendation
     │     reads: weak questions (low scores), ast_risks, source_note, best_practice
     │     reads: owasp-ast-full.md (relevant AST sections)
     │     sends to LLM: participant pattern + OWASP grounding corpus
     │     renders: narrative + composite prompt template
     │
     └─→ Review Panel
           reads: questions[], user's saved answers
           renders: per-question accordion
                    ├ scenario, selected option (highlighted)
                    ├ best_practice text
                    └ ast_source_url (clickable OWASP link)
```

**Key:** questions.json serves all five consumers — rendering, scoring, LLM prompts, results display, and answer review. No secondary data source needed at runtime.

---

## 3. User Journey

```
┌─────────────────────────────────────────────────────────┐
│  Landing Page                                           │
│  "Based on OWASP Agentic Skills Top 10"                 │
│  "19 questions, ~8 minutes"                             │
│  "Not a test — a mirror."                               │
│  [Start →]                                              │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 1: "Should I Install This?"                      │
│  7 questions — trust, verification, pre-install checks  │
│                                                         │
│  [Scenario text]                                        │
│  [Question]                                             │
│  ○ Option A                                             │
│  ○ Option B                                             │
│  ○ Option C                                             │
│  ○ Option D                                             │
│                                                         │
│  [Saved ✓] → auto-advance after selection               │
│  [Progress: 3/20]                                       │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: "What Can It Do to Me?"                       │
│  7 questions — permissions, blast radius, sandboxing    │
│  (same UX as Phase 1)                                   │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: "Is It Still Safe?"                           │
│  6 questions — updates, governance, cross-platform      │
│  (same UX as Phase 1)                                   │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Calculating...                                         │
│  (deterministic scoring, ~instant)                      │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Results Page                                           │
│                                                         │
│  ┌───────────────────────────────────┐                  │
│  │  Grade: C — Significant Blind Spots│                  │
│  │  🟡                              │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  ┌─ Your Risk Profile ──────────────┐                   │
│  │  AST01 ██████████░░ 78%          │                   │
│  │  AST02 ████████░░░░ 62%          │                   │
│  │  AST03 █████░░░░░░░ 38%  ← gap   │                   │
│  │  ...                             │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Your Action Plan ───────────────┐                   │
│  │  (LLM-generated, grounded in     │                   │
│  │   OWASP AST content)             │                   │
│  │                                  │                   │
│  │  1. [Prioritized action]         │                   │
│  │  2. [Prioritized action]         │                   │
│  │  3. [Prioritized action]         │                   │
│  │                                  │                   │
│  │  ┌─ Copy Prompt Template ──┐     │                   │
│  │  │  (composite, personalized)│   │                   │
│  │  │  [📋 Copy to Clipboard]  │   │                   │
│  │  └─────────────────────────┘    │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  ┌─ Review Your Answers ────────────┐                   │
│  │  ▶ Q01: You chose...            │                   │
│  │  ▶ Q02: You chose...            │                   │
│  │  ▶ Q03: You chose...            │                   │
│  │  ... (expandable per question)   │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

**Key UX decisions:**

- **No per-question feedback.** Answer is saved silently. Momentum preserved.
- **Auto-advance on selection.** No "Next" button click — select → save → transition.
- **Review is voluntary and at the end.** Participants who want to learn can expand each question. Those who don't can skip straight to the prompt template.
- **Prompt template is the hero artifact.** The thing they take away and actually use.

---

## 4. Scoring System (Deterministic)

No LLM needed. Pure math.

### Per-question score

```
option_score:    0, 1, 2, or 3  (from questions.json)
severity_weight: critical=3, high=2, medium=1  (from meta.scoring.severity_values)
weighted_score:  option_score × severity_weight
max_possible:    3 × severity_weight
```

### Per-AST aggregate

```python
# For each AST risk (AST01-AST10):
ast_scores[risk] = {
    "earned": sum(weighted_score for questions mapping to this risk),
    "possible": sum(max_possible for questions mapping to this risk),
    "percentage": earned / possible * 100
}
```

A question can map to multiple AST risks (e.g., q07 maps to AST03 AND AST06). Its weighted score contributes to both AST aggregates.

### Overall grade

```python
total_earned = sum of all weighted_scores
total_possible = sum of all max_possible  # = 108
percentage = total_earned / total_possible * 100

grade = lookup(percentage, [
    (90, "A", "Security-Conscious Agent User"),
    (70, "B", "Aware but Exposed"),
    (50, "C", "Significant Blind Spots"),
    (30, "D", "High Risk Profile"),
    ( 0, "F", "Critical — Act Now"),
])
```

### Weakest questions

```python
# Questions where option_score is 0 or 1, sorted by weighted_score ascending
weakest = sorted(questions, key=lambda q: q.weighted_score)[:5]
```

These feed into the LLM prompt as the primary blind-spot signals.

---

## 5. Recommendation System

### Architecture: LLM-primary with static fallback

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Score Report │────→│  LLM Call    │────→│  Narrative +     │
│  (deterministic)    │  (real-time) │     │  Prompt Template │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │ fail/timeout
                            ↓
                     ┌──────────────┐     ┌──────────────────┐
                     │ Static JSON  │────→│  Pre-generated   │
                     │ (fallback)   │     │  Recommendations │
                     └──────────────┘     └──────────────────┘
```

### 5a. LLM Generation (Primary)

**When:** Every quiz completion, if LLM is available.

**Provider:** Configurable. Support OpenAI, Anthropic, and local models (LM Studio, etc.). Website provides API key or the app falls back to static.

**API call flow:**

1. Compute deterministic scores (instant, client-side)
2. Construct prompt with participant data + OWASP grounding content
3. Call LLM API
4. Parse structured response
5. Render on results page

**LLM Prompt Structure:**

```markdown
## System Instruction

You are a security advisor analyzing a user's self-assessment results
on AI agent skill security, based on the OWASP Agentic Skills Top 10.

Your task: generate a personalized risk assessment and action plan.

RULES:

- Every factual claim MUST trace to the provided OWASP source material
- Do NOT invent attack scenarios or statistics not in the source
- Do NOT fabricate OWASP recommendations — use only what's provided
- If the source material doesn't cover a specific situation, say so
- Write for a non-technical audience — plain language, no jargon
- Tone: helpful advisor, not alarmist or condescending

## Participant Data

Grade: {grade} ({grade_name})
Overall: {percentage}%

Per-AST Scores:
{for each AST risk:}

- {risk_id} ({risk_name}, {severity}): {earned}/{possible} ({percentage}%)

Weakest Questions (lowest performance):
{for each weak question:}

- {question_id}: Chose "{selected_option_text}" (score: {score}/3)
  Scenario: {scenario}
  Best Practice: {best_practice}
  OWASP Source: {ast_source_url}

## OWASP Source Material

{retrieved content from relevant AST pages — see Section 5c}

## Output Format

Return a JSON object:
{
"narrative": "2-3 paragraph personalized risk assessment...",
"actions": [
{
"priority": 1,
"title": "Action title",
"description": "What to do and why",
"ast_source": "AST0X — Risk Name"
}
],
"prompt_template": "The composite prompt template the user can copy..."
}
```

**Why JSON output:** The app parses it directly — no regex, no "find the code block." Structured output = reliable rendering.

### 5b. Static Fallback

**When:** LLM call fails, times out (>5s), or no API key is configured.

**Strategy:** Pre-generate recommendations for the most common blind-spot patterns. Store as JSON in the app bundle.

**How many patterns?** With 20 questions and 4 options each, the raw space is enormous. But in practice:

- Most participants cluster into ~10-15 distinct weak-area profiles
- The dominant pattern is usually 2-3 AST areas where they score low
- Pre-generate the top 20 combinations (covers ~90% of likely outcomes)

**Fallback file:** `static-recommendations.json`

```json
{
  "version": "1.0",
  "patterns": [
    {
      "id": "pattern-trust-heavy",
      "match": "weak in AST01, AST02, AST04 (install trust cluster)",
      "narrative": "Your biggest gap is at the front door...",
      "actions": [...],
      "prompt_template": "..."
    },
    ...
  ]
}
```

**Matching logic:**

```python
def find_static_pattern(weak_areas):
    """Match participant's weak AST areas to the closest pre-generated pattern."""
    weak_set = set(weak_areas)
    best_match = max(patterns, key=lambda p: len(weak_set & p["weak_areas"]))
    return best_match
```

### 5c. OWASP Grounding Corpus

The LLM needs source material to stay grounded. Two strategies:

**Strategy A (v1 — simpler):** Include the full AST page content for the participant's weakest 3-5 AST risks directly in the prompt. The OWASP pages are ~2000-4000 chars each — 3-5 of them fit in a prompt comfortably.

**Strategy B (v2 — more precise):** Chunk the AST content into semantic units (description, attack scenario, evidence, mitigation per risk) and retrieve only the relevant chunks based on the participant's specific weak questions.

**For v1, use Strategy A.** The content is small enough to include directly, and it eliminates retrieval complexity.

**What gets included per relevant AST:**

- Description (1 paragraph)
- Real-world evidence (key examples)
- Mitigation recommendations from the checklist

**Source file:** `owasp-ast-full.md` (already extracted, 22K chars). The app would extract relevant sections based on the participant's weak AST risks.

---

## 6. Results Page Components

### 6a. Grade Card

- Letter grade + emoji + name
- Overall percentage
- Color coding (green/yellow/orange/red)

### 6b. Risk Profile Visualization

- Horizontal bar chart, one bar per AST risk
- Color-coded by severity (critical=red, high=orange, medium=yellow)
- Sorted by score ascending (weakest at top — draws attention)

### 6c. Action Plan (LLM-generated or static fallback)

- 3-5 prioritized actions
- Each with title, description, and AST source attribution
- "Copy Prompt Template" button with clipboard API
- Loading state while LLM generates ("Crafting your action plan...")

### 6d. Review Your Answers

- Accordion/collapsible per question
- Each shows:
  - Phase header
  - Scenario text
  - Question
  - User's selected option (highlighted)
  - Best practice text
  - OWASP source link (clickable)
- No scoring shown per question (this is a self-assessment, not a graded test)

---

## 7. Technical Stack

| Layer     | Choice                           | Rationale                                                            |
| --------- | -------------------------------- | -------------------------------------------------------------------- |
| Framework | Vanilla HTML/CSS/JS              | Zero dependencies, instant load, simple deployment                   |
| State     | localStorage                     | Persist answers across page refreshes, no backend                    |
| Styling   | Tailwind CSS (CDN)               | Fast iteration, responsive                                           |
| LLM API   | fetch() to configurable endpoint | Supports OpenAI-compatible APIs (OpenAI, Anthropic via proxy, local) |
| Hosting   | Cloudflare Pages                 | Free, instant deploy, edge caching                                   |
| Analytics | Plausible (self-hosted or cloud) | Privacy-friendly completion/fallback tracking                        |

**No build step required.** Static files served directly. The questions.json is loaded at runtime via fetch().

---

## 8. Configuration

The app needs minimal configuration, stored in a `config.js`:

```javascript
const CONFIG = {
  // LLM settings
  llm: {
    enabled: true,
    apiEndpoint: "", // OpenAI-compatible endpoint URL
    apiKey: "", // User provides at runtime or via URL param
    model: "gpt-4o-mini", // Default model
    timeoutMs: 8000, // Fall back to static after this
    maxTokens: 2000,
  },

  // Fallback
  fallback: {
    enabled: true, // Use static recommendations if LLM unavailable
    patternsFile: "static-recommendations.json",
  },

  // Branding
  branding: {
    title: "Agent Security Awareness Quiz",
    subtitle: "Based on the OWASP Agentic Skills Top 10",
    sourceUrl: "https://owasp.org/www-project-agentic-skills-top-10/top10",
  },
};
```

**API key delivery options (v1):**

- Prompt the user on the results page: "Enter your OpenAI API key to generate a personalized action plan" — key stays client-side, never sent to your server
- URL parameter: `?key=sk-...` (for personal use / bookmarking)
- Environment variable at build time (for self-hosted deployments)

---

## 9. Deployment

```
Static files only. No server.
├── index.html
├── config.js
├── questions.json
├── static-recommendations.json
├── owasp-ast-full.md (or extracted chunks)
├── css/style.css
├── js/
│   ├── quiz.js          # Question rendering, answer collection
│   ├── scoring.js       # Deterministic scoring logic
│   ├── results.js       # Results page rendering
│   ├── llm.js           # LLM API call + fallback
│   └── review.js        # Answer review accordion
└── assets/
    └── owasp-badge.svg
```

Deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy ./ --project-name=agent-security-quiz
```

---

## 10. Future Considerations (v2+)

- **Multilingual:** EN/CN question variants, LLM generates recommendations in the participant's language
- **Shareable results:** Unique URL per completion (requires lightweight backend or Cloudflare KV)
- **Retake tracking:** localStorage history to show improvement over time
- **Fine-tuned model:** Train a small model on OWASP content for faster/cheaper inference than GPT-4o
- **Admin dashboard:** Aggregate anonymized score distributions across participants
- **Integration:** Embeddable widget for agent platform marketplaces
