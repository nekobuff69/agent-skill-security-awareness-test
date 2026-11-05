# ADR 0025: Attention types replace the tier ladder (no grade surface)

Date: 2026-11-06
Status: Accepted

## Context

The assessment's purpose is to help participants discover their security
blind spots — not to rank them. The tier ladder (Sentinel > Practitioner >
Aware > Newcomer > Uncharted) and the headline Overall Percentage graded
participants, and M先生 directed that the result become a "diversity"
presentation instead: like a personality test, participants differ from
each other but none stands above another.

## Decision

1. **The report carries no user-facing grade.** `computeScores` keeps the
   weighted scoring, the 108 total invariant, the AST aggregation and the
   <70% blind-spot threshold as INTERNAL machinery (`percentage` survives
   only as an internal anchor). The tier lookup is removed; the report
   gains `type`, `axisScores` and `axisRanked`.

2. **Three Attention Axes.** The ten AST Risks group into INTAKE (AST01,
   AST02, AST05), EXPOSURE (AST03, AST04, AST06) and UPKEEP (AST07–AST10)
   — registered in `js/ast.js` with a canonical order that doubles as the
   deterministic tie-break. A question mapped to risks of two axes feeds
   both aggregates, exactly like the AST aggregation.

3. **Six attention types.** The type is the SHAPE of the axis profile:
   the (weakest axis, strongest axis) pairing, one stable id T1–T6 per
   pairing. Ties break by canonical axis order (weakest = first, strongest
   = last); this only fires on flat profiles (all-best / pathological
   runs) and keeps the classifier deterministic. Type names, the
   MBTI-style three-letter code (axes ordered most- to least-attended),
   emojis and mottos are Chrome Strings (`type.T1.*`, `axis.INTAKE.*`).

4. **Risk without ranking.** Each type card carries a factual per-axis
   risk note stating what OWASP rates that family's risks (critical /
   high / medium), attached to the weak axis only. Notes never compare
   types — a danger ranking would rebuild the hierarchy this ADR removes.

5. **Counts replace percentages in prose.** The deterministic narrative
   anchors on counts of situations ("in 3 of the 6 situations touching…"),
   not percentages. The Deep-Dive and LLM prompts carry earned/possible
   counts, not grades, and the "scored X out of Y" choice line is retired.
   The Review screen stays score-free (ADR 0005).

6. **Visuals read as shape, not judgement.** The radar (now "Attention
   Map") drops percentage labels and score-band colours: one neutral
   dither for every participant, solid ink dots on the profile, open rings
   marking blind-spot axes. The bars drop their percentage figures and
   band colours. Share text carries the type, not a score.

## Consequences

- Session structural hash is unchanged (option scores and severities are
  untouched), so existing Sessions and desktop Records stay valid; the
  type is re-derived at render time from the report's own numbers.
- `content-rules.md` §2 is amended: percentages are no longer the
  narrative's objective anchor; counts are.
- Bank `meta.scoring.titles` remains in the JSON for schema compatibility
  but no code consumes it.

## Type table

| id | weak axis | strong axis | code | EN nickname | ZH nickname |
| --- | --- | --- | --- | --- | --- |
| T1 | INTAKE | EXPOSURE | EUI | The Hospitable Gatekeeper | 好客的守门人 |
| T2 | INTAKE | UPKEEP | UEI | The Curious Curator | 好奇的策展人 |
| T3 | EXPOSURE | INTAKE | IUE | The Candid Courier | 坦率的信使 |
| T4 | EXPOSURE | UPKEEP | UIE | The Steady Steward | 稳健的管家 |
| T5 | UPKEEP | INTAKE | IEU | The Sharp Lookout | 敏锐的瞭望员 |
| T6 | UPKEEP | EXPOSURE | EIU | The Quiet Archivist | 安静的档案员 |
