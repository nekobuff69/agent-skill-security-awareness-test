#!/usr/bin/env python3
"""Agent Security Quiz — deploy gate.

Validates every Bank Variant in the repo: schema, scoring math, and LLM
output grounding. Stdlib only: json, re, sys, os, glob, argparse.
"""

import argparse
import glob
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Bank discovery ────────────────────────────────────────────────────────
# Every Bank Variant lives in the repo root and matches questions*.json:
# questions.json is the source-language bank, questions.<tag>.json is a
# translated or otherwise derived Variant.
BANK_GLOB = "questions*.json"

# The source-language bank. Its source_note fields are part of the grounding
# vocabulary, whichever Bank Variant is under test.
SOURCE_LANGUAGE_BANK = os.path.join(SCRIPT_DIR, "questions.json")

# ── Grounding vocabulary ─────────────────────────────────────────────────
# Grounding comparisons always resolve against the source language: the OWASP
# Grounding Corpus plus the source-language bank's source_note fields. A Bank
# Variant in any language is validated against that same vocabulary, so a
# campaign name is not judged phantom just because it was translated.
GROUNDING_CORPUS_PATH = os.path.join(SCRIPT_DIR, "docs", "owasp-ast-full.md")

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


def discover_banks(bank_dir):
    """Every Bank Variant in bank_dir, sorted for deterministic output."""
    matches = glob.glob(os.path.join(bank_dir, BANK_GLOB))
    return sorted(p for p in matches if os.path.isfile(p))


# ── Grounding vocabulary, loaded once per source-language bank ───────────
_GROUNDING_CACHE = {}


def load_grounding_corpus(source_bank_path):
    """Return (text, errors): the source-language grounding vocabulary.

    Built from the OWASP Grounding Corpus plus the source-language bank's
    source_note fields — never from the bank under test, whose source_note
    prose may be written in another language.
    """
    key = os.path.abspath(source_bank_path)
    if key in _GROUNDING_CACHE:
        return _GROUNDING_CACHE[key]

    errors = []
    parts = []

    try:
        with open(GROUNDING_CORPUS_PATH, "r", encoding="utf-8") as f:
            parts.append(f.read())
    except OSError as exc:
        errors.append(
            f"grounding corpus unreadable at {GROUNDING_CORPUS_PATH}: {exc}"
        )

    if not os.path.exists(source_bank_path):
        errors.append(f"source-language bank not found at {source_bank_path}")
    else:
        try:
            source_bank = load_json(source_bank_path)
        except (OSError, ValueError) as exc:
            errors.append(
                f"source-language bank unreadable at {source_bank_path}: {exc}"
            )
            source_bank = {}
        for q in source_bank.get("questions", []):
            note = q.get("source_note", "")
            if isinstance(note, str):
                parts.append(note)

    result = ("\n".join(parts), errors)
    _GROUNDING_CACHE[key] = result
    return result


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


def title_ladder(bank):
    """The bank's Title Ladder, ascending by threshold."""
    titles = bank.get("meta", {}).get("scoring", {}).get("titles", [])
    return sorted(
        (t for t in titles if isinstance(t.get("threshold"), (int, float))),
        key=lambda t: t["threshold"],
    )


def resolve_title(bank, percentage):
    for t in bank["meta"]["scoring"]["titles"]:
        if percentage >= t["threshold"]:
            return t["name"]
    ladder = title_ladder(bank)
    return ladder[0].get("name") if ladder else None


def label_results(label, results):
    """Prefix every check label with the Bank Variant it came from."""
    if not label:
        return results
    return [(f"{label} {msg}", ok) for msg, ok in results]



def validate_variant_equivalence(source, variant, source_label, variant_label):
    """Assert a Bank Variant is scoring-equivalent to its source bank.

    Schema validation runs each bank on its own terms, which a variant can
    satisfy while having drifted: a translated file with one re-weighted
    Question still sums to Total Possible if another moved the other way.
    This compares every language-independent field against the source bank,
    so scoring drift is named rather than absorbed — including the order of the
    Question array, which is part of the structure even though it is invisible
    to an id-keyed comparison.

    Only structural and scoring fields are compared. Authored text is the one
    thing a variant is allowed to differ on, and its currency is not
    mechanically checkable at all.
    """
    results = []

    src_questions = {q.get("id"): q for q in source.get("questions", [])}
    var_questions = {q.get("id"): q for q in variant.get("questions", [])}

    def detail(msg, ok, extra):
        """Fold diagnostics into the message — the gate's (label, ok) contract."""
        return (f"{msg} [{extra}]" if extra else msg, ok)

    only_src = sorted(set(src_questions) - set(var_questions))
    only_var = sorted(set(var_questions) - set(src_questions))
    results.append(detail(
        "Variant covers the same Question ids as the source bank",
        not only_src and not only_var,
        f"only in source: {only_src}; only in variant: {only_var}",
    ))

    # Question array ORDER is semantic, and every check below compares
    # id-keyed dictionaries, so none of them can see it. Scoring resolves a
    # stored Session positionally against questions[i] and never looks a
    # Question up by id, so a Variant that reorders them silently
    # re-attributes every answer a Participant gave in that language.
    src_order = [q.get("id") for q in source.get("questions", [])]
    var_order = [q.get("id") for q in variant.get("questions", [])]
    first_diff = next(
        (i for i in range(max(len(src_order), len(var_order)))
         if src_order[i:i + 1] != var_order[i:i + 1]),
        None,
    )
    results.append(detail(
        "Question array order matches the source bank",
        first_diff is None,
        f"first divergence at index {first_diff}: "
        f"source {src_order[first_diff:first_diff + 1]} vs "
        f"variant {var_order[first_diff:first_diff + 1]}"
        if first_diff is not None else "",
    ))

    for qid in sorted(set(src_questions) & set(var_questions)):
        s, v = src_questions[qid], var_questions[qid]
        for field in ("phase", "severity_weight", "ast_source_url"):
            results.append((
                f"Q {qid}: {field} matches the source bank",
                s.get(field) == v.get(field),
            ))
        results.append((
            f"Q {qid}: ast_risks match the source bank",
            sorted(s.get("ast_risks", [])) == sorted(v.get("ast_risks", [])),
        ))
        s_scores = [o.get("score") for o in s.get("options", [])]
        v_scores = [o.get("score") for o in v.get("options", [])]
        results.append(detail(
            f"Q {qid}: Option Scores match the source bank, in order",
            s_scores == v_scores,
            f"source {s_scores} vs variant {v_scores}",
        ))
        results.append((
            f"Q {qid}: test block matches the source bank",
            s.get("test") == v.get("test"),
        ))

    # Phase membership must be identical, not merely the same set of ids.
    src_phases = {p.get("id"): p.get("question_ids", []) for p in source.get("phases", [])}
    var_phases = {p.get("id"): p.get("question_ids", []) for p in variant.get("phases", [])}
    for pid in sorted(set(src_phases) | set(var_phases)):
        results.append(detail(
            f"Phase {pid}: question membership matches the source bank",
            src_phases.get(pid) == var_phases.get(pid),
            f"source {src_phases.get(pid)} vs variant {var_phases.get(pid)}",
        ))

    # Severity weights and Title Ladder thresholds drive scoring, so a
    # translated ladder may rename its rungs but never move them.
    src_scoring = source.get("meta", {}).get("scoring", {})
    var_scoring = variant.get("meta", {}).get("scoring", {})
    results.append((
        "Severity Weights match the source bank",
        src_scoring.get("severity_values") == var_scoring.get("severity_values"),
    ))
    results.append((
        "Title Ladder thresholds match the source bank",
        [t.get("threshold") for t in src_scoring.get("titles", [])]
        == [t.get("threshold") for t in var_scoring.get("titles", [])],
    ))
    results.append((
        "Title Ladder emoji match the source bank",
        [t.get("emoji") for t in src_scoring.get("titles", [])]
        == [t.get("emoji") for t in var_scoring.get("titles", [])],
    ))
    results.append((
        "Scoring fixtures match the source bank",
        _fixture_shape(source) == _fixture_shape(variant),
    ))

    return label_results(variant_label, results)


def _fixture_shape(bank):
    """Fixture answers and expected percentages, ignoring fixture titles.

    A variant renames its Progression Title rungs, so expected_title differs
    by design; the answers and percentages that define them must not.
    """
    cases = bank.get("test_fixtures", {}).get("scoring_cases", [])
    return [
        (c.get("id"), c.get("answers"), c.get("expected_percentage"))
        for c in cases
    ]


# ---------------------------------------------------------------------------
# Section 2 — Schema validation
# ---------------------------------------------------------------------------

def validate_schema(bank, label):
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
            url.startswith("https://owasp.github.io/www-project-agentic-skills-top-10/ast")
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

    return label_results(label, results)


# ---------------------------------------------------------------------------
# Section 3 — Scoring verification
# ---------------------------------------------------------------------------

def validate_scoring(bank, label):
    results = []
    fixtures = bank.get("test_fixtures", {}).get("scoring_cases", [])
    ladder = title_ladder(bank)
    # Title Ladder rungs by position, so fixture boundaries are expressed as
    # "which rung" rather than as English Progression Title names.
    thresholds = [t["threshold"] for t in ladder]
    low_rungs = set(thresholds[:2])
    mid_rungs = set(thresholds[2:4])
    q_count = len(bank.get("questions", []))

    # --- Fixture tests ---
    for case in fixtures:
        cid = case.get("id", "???")
        answers = case.get("answers", [])
        result = compute_score(bank, answers)

        if cid not in ("all-zero", "all-best", "common-user", "security-aware"):
            continue

        if result is None:
            results.append((f"Fixture '{cid}': scored", False))
            continue

        earned, possible = result
        pct = (earned / possible * 100) if possible else 0
        title = resolve_title(bank, pct)

        if cid == "all-zero":
            expected_pct = case.get("expected_percentage")
            results.append((
                f"Fixture '{cid}': percentage == {expected_pct} (from bank)",
                expected_pct is not None
                and round(pct, 1) == round(float(expected_pct), 1),
            ))
        elif cid == "all-best":
            results.append((
                f"Fixture '{cid}': percentage == 100",
                pct == 100.0,
            ))

        resolved_threshold = None
        for t in ladder:
            if t.get("name") == title:
                resolved_threshold = t["threshold"]
                break

        if cid in ("all-zero", "all-best"):
            top = max(thresholds) if thresholds else None
            want = thresholds[0] if cid == "all-zero" else top
            results.append((
                f"Fixture '{cid}': resolves to ladder rung with threshold {want}",
                resolved_threshold == want,
            ))
            declared = case.get("expected_title")
            if declared is not None:
                results.append((
                    f"Fixture '{cid}': title matches bank-declared expected_title",
                    title == declared,
                ))
        elif cid == "common-user":
            results.append((
                f"Fixture '{cid}': resolves to the two lowest ladder rungs",
                resolved_threshold in low_rungs,
            ))
        elif cid == "security-aware":
            results.append((
                f"Fixture '{cid}': resolves to the middle ladder rungs",
                resolved_threshold in mid_rungs,
            ))

    # --- Edge cases ---
    edge_cases = [
        ("empty answers", []),
        ("short answers", [0] * max(1, q_count // 2)),
        ("invalid index", [5] * q_count),
        ("non-integer", ["2"] * q_count),
    ]
    for edge_label, bad_answers in edge_cases:
        result = compute_score(bank, bad_answers)
        results.append((
            f"Edge '{edge_label}': returns None (error state)",
            result is None,
        ))

    return label_results(label, results)


# ---------------------------------------------------------------------------
# Section 4 — LLM grounding validation
# ---------------------------------------------------------------------------

def validate_llm_grounding(bank, llm_output, label, grounding_text):
    results = []
    narrative = llm_output.get("narrative", "")
    actions = llm_output.get("actions", [])
    # Grounding vocabulary is the source-language corpus, not the bank under
    # test: a translated Bank Variant must still recognise the campaign names
    # and statistics of the source material.
    all_source_text = grounding_text
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
        if "owasp.org" in url_clean or "owasp.github.io" in url_clean or "github.com" in url_clean:
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

    return label_results(label, results)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Agent Security Quiz deploy gate")
    parser.add_argument("--llm", help="Path to LLM output JSON for grounding validation")
    parser.add_argument(
        "--grounding-source",
        default=SOURCE_LANGUAGE_BANK,
        help="Source-language bank whose source_note fields feed the grounding vocabulary",
    )
    parser.add_argument(
        "--bank-dir",
        default=SCRIPT_DIR,
        help="Directory to discover Bank Variants in (default: repo root)",
    )
    args = parser.parse_args()

    # Discover every Bank Variant: questions*.json in the bank directory.
    bank_paths = discover_banks(args.bank_dir)
    if not bank_paths:
        print(f"[FAIL] No Bank Variant found matching {BANK_GLOB} in {args.bank_dir}")
        sys.exit(1)

    # Section 4 runs once per Bank Variant, always against the same
    # source-language grounding corpus.
    grounding_text = ""
    llm_output = None
    if args.llm:
        grounding_text, grounding_errors = load_grounding_corpus(args.grounding_source)
        for err in grounding_errors:
            print(f"[FAIL] {err}")
            sys.exit(1)
        llm_path = (
            args.llm if os.path.isabs(args.llm)
            else os.path.join(SCRIPT_DIR, args.llm)
        )
        if not os.path.exists(llm_path):
            print(f"[FAIL] LLM output not found at {llm_path}")
            sys.exit(1)
        llm_output = load_json(llm_path)

    # The source-language bank is the reference every other Bank Variant is
    # compared against for scoring equivalence.
    source_bank_path = os.path.abspath(args.grounding_source)
    source_label = os.path.basename(source_bank_path)
    source_bank = None
    if any(os.path.abspath(p) != source_bank_path for p in bank_paths):
        try:
            source_bank = load_json(source_bank_path)
        except (OSError, ValueError) as exc:
            print(f"[FAIL] source bank is loadable JSON: {exc}")
            sys.exit(1)

    all_results = []
    for bank_path in bank_paths:
        label = os.path.basename(bank_path)
        try:
            bank = load_json(bank_path)
        except (OSError, ValueError) as exc:
            all_results.append((f"[{label}] bank is loadable JSON", False))
            all_results.append((f"[{label}] {exc}", False))
            continue

        all_results.append((f"=== Bank Variant: {label} ===", None))
        all_results.append((f"--- Section 2: Schema Validation ({label}) ---", None))
        all_results.extend(validate_schema(bank, label))

        all_results.append((f"--- Section 3: Scoring Verification ({label}) ---", None))
        all_results.extend(validate_scoring(bank, label))

        # Section 3b: a Bank Variant must stay scoring-equivalent to the
        # source-language bank. Schema validation alone cannot see a
        # re-weighted Question inside a translated file.
        if bank_path != source_bank_path:
            all_results.append(
                (f"--- Section 3b: Variant Equivalence ({label}) ---", None)
            )
            all_results.extend(
                validate_variant_equivalence(source_bank, bank, source_label, label)
            )

        if args.llm:
            all_results.append((f"--- Section 4: LLM Grounding ({label}) ---", None))
            all_results.extend(
                validate_llm_grounding(bank, llm_output, label, grounding_text)
            )

    # Output
    passed = 0
    failed = 0
    for msg, result in all_results:
        if result is None:
            print(msg)
            continue
        if result:
            print(f"  [PASS] {msg}")
            passed += 1
        else:
            print(f"  [FAIL] {msg}")
            failed += 1

    total = passed + failed
    print()
    print(
        f"Banks validated: {len(bank_paths)} "
        f"({', '.join(os.path.basename(p) for p in bank_paths)})"
    )
    if failed == 0:
        print(f"Summary: {passed}/{total} checks passed. All green.")
    else:
        print(f"Summary: {passed}/{total} checks passed, {failed} failed.")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
