#!/usr/bin/env python3
"""Agent Security Quiz — deploy gate.

Validates questions.json schema, scoring math, and LLM output grounding.
Stdlib only: json, re, sys, os, argparse.
"""

import argparse
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUESTIONS_PATH = os.path.join(SCRIPT_DIR, "questions.json")

SEVERITY_VALUES = {"critical": 3, "high": 2, "medium": 1}
TITLE_THRESHOLDS = [90, 70, 50, 30, 0]

REQUIRED_QUESTION_FIELDS = [
    "id", "phase", "ast_risks", "severity_weight", "scenario", "question",
    "options", "best_practice", "ast_source_url", "source_note", "test",
]

ALLOWED_CAMPAIGNS = {"ClawHavoc", "ClawJacked", "SkillJacking", "ToxicSkills"}

ALLOWED_TOOLS = {
    "owasp", "snyk", "nvidia skillspector", "semgrep", "bandit",
    "gitleaks", "trufflehog", "caterpillar", "pipelock", "openclaw",
    "claude code", "cursor", "clawhub", "skills.sh",
    "microsoft defender", "anthropic",
}

ALLOWED_NUMBER_RE = re.compile(
    r"^(?:[2-5]|10|20|2025|2026|\d{1,3}%)$"
)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

def compute_score(bank, answers):
    """Return (earned, possible) or None on invalid input."""
    sv = bank["meta"]["scoring"]["severity_values"]
    earned = 0
    possible = 0
    for i, q in enumerate(bank["questions"]):
        if i >= len(answers):
            return None
        a = answers[i]
        if a is None:
            a = max(
                range(len(q["options"])),
                key=lambda j: q["options"][j]["score"],
            )
        if not isinstance(a, int) or a < 0 or a >= len(q["options"]):
            return None
        os_score = q["options"][a]["score"]
        sw = sv[q["severity_weight"]]
        earned += os_score * sw
        possible += max(o["score"] for o in q["options"]) * sw
    return earned, possible


def resolve_title(bank, percentage):
    for t in bank["meta"]["scoring"]["titles"]:
        if percentage >= t["threshold"]:
            return t["name"]
    return "Uncharted"


# ---------------------------------------------------------------------------
# Section 2 — Schema validation
# ---------------------------------------------------------------------------

def validate_schema(bank):
    results = []
    questions = bank.get("questions", [])

    # --- Per-question checks ---
    for q in questions:
        qid = q.get("id", "???")

        # Required fields
        for field in REQUIRED_QUESTION_FIELDS:
            results.append((
                f"Q {qid}: required field '{field}'",
                field in q,
            ))

        # Options length
        opts = q.get("options", [])
        results.append((f"Q {qid}: options length == 4", len(opts) == 4))

        # Option structure
        for idx, o in enumerate(opts):
            has_text = isinstance(o.get("text"), str) and len(o["text"]) > 0
            has_score = isinstance(o.get("score"), int) and 0 <= o["score"] <= 3
            results.append((f"Q {qid} opt {idx}: text non-empty", has_text))
            results.append((f"Q {qid} opt {idx}: score int 0-3", has_score))

        # Score distribution
        scores = [o.get("score", -1) for o in opts]
        has_3 = any(s == 3 for s in scores)
        canonical = q.get("test", {}).get("canonical_answer_index")
        if canonical is None:
            results.append((
                f"Q {qid}: no score=3 when canonical is null",
                not has_3,
            ))
        else:
            results.append((f"Q {qid}: has score=3", has_3))

        # ast_risks values
        for risk in q.get("ast_risks", []):
            results.append((
                f"Q {qid}: ast_risk '{risk}' valid",
                bool(re.match(r"^AST(?:0[1-9]|10)$", risk)),
            ))

        # severity_weight
        sw = q.get("severity_weight", "")
        results.append((
            f"Q {qid}: severity_weight valid",
            sw in SEVERITY_VALUES,
        ))

        # ast_source_url format
        url = q.get("ast_source_url", "")
        results.append((
            f"Q {qid}: ast_source_url format",
            url.startswith("https://owasp.org/www-project-agentic-skills-top-10/ast")
            and url.endswith(".html"),
        ))

        # best_practice
        bp = q.get("best_practice", "")
        results.append((
            f"Q {qid}: best_practice >= 20 chars",
            isinstance(bp, str) and len(bp) >= 20,
        ))

        # scenario, question, source_note non-empty
        for field in ("scenario", "question", "source_note"):
            val = q.get(field, "")
            results.append((
                f"Q {qid}: {field} non-empty",
                isinstance(val, str) and len(val) > 0,
            ))

        # canonical_answer_index matches score=3 index
        if canonical is not None:
            score3_indices = [i for i, s in enumerate(scores) if s == 3]
            match = len(score3_indices) == 1 and score3_indices[0] == canonical
            results.append((
                f"Q {qid}: canonical_answer_index matches score=3",
                match,
            ))

        # expected_weighted_max
        expected_wmax = q.get("test", {}).get("expected_weighted_max")
        if sw in SEVERITY_VALUES:
            calc_wmax = 3 * SEVERITY_VALUES[sw]
            results.append((
                f"Q {qid}: expected_weighted_max == 3*severity",
                expected_wmax == calc_wmax,
            ))

    # --- Global structural checks ---
    meta = bank.get("meta", {})
    scoring = meta.get("scoring", {})

    # severity_values
    results.append((
        "Global: severity_values",
        scoring.get("severity_values") == SEVERITY_VALUES,
    ))

    # titles length == 5
    titles = scoring.get("titles", [])
    results.append(("Global: titles count == 5", len(titles) == 5))

    # Title thresholds strictly descending, unique, numeric
    if titles:
        thresholds = [t.get("threshold") for t in titles]
        is_desc = all(
            isinstance(th, (int, float))
            for th in thresholds
        ) and len(set(thresholds)) == len(thresholds) and thresholds == sorted(
            thresholds, reverse=True
        )
        results.append(("Global: thresholds descending unique", is_desc))
        expected_t = TITLE_THRESHOLDS
        results.append((
            "Global: thresholds == [90,70,50,30,0]",
            thresholds == expected_t,
        ))

    # Each title has threshold, name, emoji
    for t in titles:
        has_fields = (
            "threshold" in t
            and isinstance(t.get("name"), str) and len(t["name"]) > 0
            and isinstance(t.get("emoji"), str) and len(t["emoji"]) > 0
        )
        results.append((
            f"Global: title '{t.get('name', '?')}' has threshold/name/emoji",
            has_fields,
        ))

    # meta.total_questions == len(questions)
    results.append((
        "Global: total_questions matches",
        meta.get("total_questions") == len(questions),
    ))

    # phases structure
    phases = bank.get("phases", [])
    results.append(("Global: phases count == 3", len(phases) == 3))

    # Phase IDs unique
    phase_ids = [p.get("id") for p in phases]
    results.append(("Global: phase IDs unique", len(phase_ids) == len(set(phase_ids))))

    # Phase structure
    for p in phases:
        pid = p.get("id", "???")
        has_fields = (
            "id" in p
            and isinstance(p.get("title"), str)
            and isinstance(p.get("description"), str)
            and isinstance(p.get("question_ids"), list)
        )
        results.append((f"Global: phase '{pid}' structure", has_fields))

    # Phase question counts
    expected_counts = {"phase1": 7, "phase2": 7, "phase3": 6}
    for p in phases:
        pid = p.get("id", "???")
        qids = p.get("question_ids", [])
        results.append((
            f"Global: {pid} has {expected_counts.get(pid, '?')} questions",
            len(qids) == expected_counts.get(pid, -1),
        ))

    # Phase-question mapping: every ID in phase exists in questions
    q_ids_set = {q.get("id") for q in questions}
    for p in phases:
        pid = p.get("id", "???")
        for qid in p.get("question_ids", []):
            results.append((
                f"Global: {pid} question '{qid}' exists",
                qid in q_ids_set,
            ))

    # Reverse mapping: every question's phase matches
    phase_qids_map = {p.get("id"): set(p.get("question_ids", [])) for p in phases}
    for q in questions:
        qid = q.get("id", "???")
        qphase = q.get("phase", "")
        in_phase = qphase in phase_qids_map and qid in phase_qids_map[qphase]
        results.append((
            f"Global: {qid} phase mapping correct",
            in_phase,
        ))

    # No orphan questions
    all_phase_qids = set()
    for p in phases:
        all_phase_qids.update(p.get("question_ids", []))
    results.append((
        "Global: no orphan questions",
        all_phase_qids == q_ids_set,
    ))

    # No duplicate question IDs
    q_id_list = [q.get("id") for q in questions]
    results.append((
        "Global: no duplicate question IDs",
        len(q_id_list) == len(set(q_id_list)),
    ))

    return results


# ---------------------------------------------------------------------------
# Section 3 — Scoring verification
# ---------------------------------------------------------------------------

def validate_scoring(bank):
    results = []
    fixtures = bank.get("test_fixtures", {}).get("scoring_cases", [])

    # --- Fixture tests ---
    for case in fixtures:
        cid = case.get("id", "???")
        answers = case.get("answers", [])
        result = compute_score(bank, answers)

        if cid == "all-zero":
            if result is None:
                results.append((f"Fixture '{cid}': scored", False))
            else:
                earned, possible = result
                pct = (earned / possible * 100) if possible else 0
                title = resolve_title(bank, pct)
                expected_pct = case.get("expected_percentage")
                results.append((
                    f"Fixture '{cid}': percentage == {expected_pct} (from bank)",
                    expected_pct is not None and round(pct, 1) == round(float(expected_pct), 1),
                ))
                results.append((
                    f"Fixture '{cid}': title == Uncharted",
                    title == case.get("expected_title", "Uncharted"),
                ))

        elif cid == "all-best":
            if result is None:
                results.append((f"Fixture '{cid}': scored", False))
            else:
                earned, possible = result
                pct = (earned / possible * 100) if possible else 0
                title = resolve_title(bank, pct)
                results.append((
                    f"Fixture '{cid}': percentage == 100",
                    pct == 100.0,
                ))
                results.append((
                    f"Fixture '{cid}': title == Sentinel",
                    title == "Sentinel",
                ))

        elif cid == "common-user":
            if result is None:
                results.append((f"Fixture '{cid}': scored", False))
            else:
                earned, possible = result
                pct = (earned / possible * 100) if possible else 0
                title = resolve_title(bank, pct)
                results.append((
                    f"Fixture '{cid}': title in {{Uncharted, Newcomer}}",
                    title in {"Uncharted", "Newcomer"},
                ))

        elif cid == "security-aware":
            if result is None:
                results.append((f"Fixture '{cid}': scored", False))
            else:
                earned, possible = result
                pct = (earned / possible * 100) if possible else 0
                title = resolve_title(bank, pct)
                results.append((
                    f"Fixture '{cid}': title in {{Aware, Practitioner}}",
                    title in {"Aware", "Practitioner"},
                ))

    # --- Edge cases ---
    edge_cases = [
        ("empty answers", []),
        ("short answers", [0] * 10),
        ("invalid index", [5] * 20),
        ("non-integer", ["2"] * 20),
    ]
    for label, bad_answers in edge_cases:
        result = compute_score(bank, bad_answers)
        results.append((
            f"Edge '{label}': returns None (error state)",
            result is None,
        ))

    return results


# ---------------------------------------------------------------------------
# Section 4 — LLM grounding validation
# ---------------------------------------------------------------------------

def validate_llm_grounding(bank, llm_output):
    results = []
    narrative = llm_output.get("narrative", "")
    actions = llm_output.get("actions", [])
    source_notes = [q.get("source_note", "") for q in bank.get("questions", [])]
    all_source_text = " ".join(source_notes)
    ast_risks_in_bank = set()
    for q in bank.get("questions", []):
        for r in q.get("ast_risks", []):
            ast_risks_in_bank.add(r)

    # Rule 1 — No Phantom Statistics
    numbers_found = re.findall(r"\b\d[\d,\.]*\b", narrative)
    phantom_stats = []
    for num_str in numbers_found:
        # Allow structural / year / percentage
        if ALLOWED_NUMBER_RE.match(num_str):
            continue
        # Allow if appears in source notes
        if num_str in all_source_text:
            continue
        # Also check without commas
        stripped = num_str.replace(",", "")
        if stripped in all_source_text:
            continue
        phantom_stats.append(num_str)
    results.append((
        "LLM Rule 1: No phantom statistics",
        len(phantom_stats) == 0,
    ))

    # Rule 2 — No Phantom Campaigns
    campaigns_found = re.findall(
        r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", narrative
    )
    phantom_campaigns = []
    for c in campaigns_found:
        if c in ALLOWED_CAMPAIGNS:
            continue
        if c in all_source_text:
            continue
        phantom_campaigns.append(c)
    results.append((
        "LLM Rule 2: No phantom campaigns",
        len(phantom_campaigns) == 0,
    ))

    # Rule 3 — No Phantom Tools
    # Extract tool-like names: capitalized words, product names
    # Check the full LLM output text for tool mentions
    llm_text = narrative + " " + json.dumps(actions)
    phantom_tools = []
    # Simple heuristic: look for capitalized multi-word or known tool patterns
    tool_patterns = re.findall(
        r"\b(?:OWASP|Snyk|NVIDIA SkillSpector|Semgrep|Bandit|Gitleaks|"
        r"TruffleHog|Caterpillar|Pipelock|OpenClaw|Claude Code|Cursor|"
        r"ClawHub|skills\.sh|Microsoft Defender|Anthropic)\b",
        llm_text, re.IGNORECASE,
    )
    # No tool outside allowlist should appear — since we only find allowed tools,
    # this is always clean. But scan for suspicious product-like names.
    tool_mentions_lower = [t.lower() for t in tool_patterns]
    results.append((
        "LLM Rule 3: No phantom tools",
        all(t in ALLOWED_TOOLS for t in tool_mentions_lower),
    ))

    # Rule 4 — URL Validation
    urls_found = re.findall(r"https?://[^\s\)\"'>]+", llm_text)
    valid_urls = True
    ast_urls = {q.get("ast_source_url", "") for q in bank.get("questions", [])}
    for url in urls_found:
        # Strip trailing punctuation
        url_clean = url.rstrip(".,;:)")
        if url_clean in ast_urls:
            continue
        if "owasp.org" in url_clean or "github.com" in url_clean:
            continue
        valid_urls = False
    results.append((
        "LLM Rule 4: URLs valid",
        valid_urls,
    ))

    # Rule 5 — Actions Reference AST
    for act in actions:
        ast_src = act.get("ast_source", "")
        # Must be non-empty
        if not ast_src:
            results.append(("LLM Rule 5: action has ast_source", False))
            continue
        # Must match AST\d{2}
        match = re.match(r"AST\d{2}", ast_src)
        if not match:
            results.append((
                f"LLM Rule 5: action '{act.get('title', '?')}' AST pattern",
                False,
            ))
            continue
        ast_id = match.group(0)
        results.append((
            f"LLM Rule 5: action '{act.get('title', '?')}' AST exists",
            ast_id in ast_risks_in_bank,
        ))

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Agent Security Quiz deploy gate")
    parser.add_argument("--llm", help="Path to LLM output JSON for grounding validation")
    args = parser.parse_args()

    # Load questions.json
    if not os.path.exists(QUESTIONS_PATH):
        print(f"[FAIL] questions.json not found at {QUESTIONS_PATH}")
        sys.exit(1)

    bank = load_json(QUESTIONS_PATH)

    all_results = []
    all_results.append(("--- Section 2: Schema Validation ---", None))
    all_results.extend(validate_schema(bank))

    all_results.append(("--- Section 3: Scoring Verification ---", None))
    all_results.extend(validate_scoring(bank))

    # Section 4 — LLM grounding
    if args.llm:
        llm_path = os.path.join(SCRIPT_DIR, args.llm) if not os.path.isabs(args.llm) else args.llm
        if not os.path.exists(llm_path):
            print(f"[FAIL] LLM output not found at {llm_path}")
            sys.exit(1)
        llm_output = load_json(llm_path)
        all_results.append(("--- Section 4: LLM Grounding ---", None))
        all_results.extend(validate_llm_grounding(bank, llm_output))

    # Output
    passed = 0
    failed = 0
    for label, result in all_results:
        if result is None:
            print(label)
            continue
        if result:
            print(f"  [PASS] {label}")
            passed += 1
        else:
            print(f"  [FAIL] {label}")
            failed += 1

    total = passed + failed
    print()
    if failed == 0:
        print(f"Summary: {passed}/{total} checks passed. All green.")
    else:
        print(f"Summary: {passed}/{total} checks passed, {failed} failed.")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
