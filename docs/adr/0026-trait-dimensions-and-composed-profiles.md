# ADR 0026: Trait dimensions and composed profiles supersede the six types

Date: 2026-11-06
Status: Accepted — supersedes the type mechanism of ADR 0025 (its no-grade
guarantee, count-anchored prose and neutral visuals all carry forward)

## Context

ADR 0025 replaced the tier ladder with six nicknamed attention types keyed
on a (weakest-axis, strongest-axis) pair. M先生's review of the live build:

1. The letter codes (EUI…) felt forced and generic — a three-letter code
   mapped onto an arbitrary nickname reads as astrology, not as MBTI.
2. The radar still showed the ten AST Risks; it should show the capability
   dimensions the result actually speaks in.
3. The single-colour distribution bars were dull; colour may follow bar
   length.

## Decision

1. **Five trait dimensions** replace the three axes (registry in
   `js/ast.js`, canonical order = code position order = tie-break order):
   VETTING (AST01, AST02), PRIVILEGE (AST03, AST04), HYGIENE (AST05,
   AST06), CURRENT (AST07, AST08), MAPPED (AST09, AST10). Cross-dimension
   questions feed both dimensions, as before.

2. **Composed profiles, no nicknames.** Each dimension carries two poles —
   the attentive pole (≥50% of that dimension's own scale; exactly 50%
   counts as attentive) and the drifting pole (<50%) — each pole a
   single-letter code plus one behavioural phrase, all Chrome Strings
   (`trait.X.hi.*`). The participant's five picks compose the entire
   result: a five-letter code (registry order) and one phrase per
   dimension rendered as five trait rows. 32 combinations; the traits
   themselves are the naming, so nothing can be "forced".

3. **Radar = capability dimensions.** The Attention Map draws five spokes
   (short localized labels), the same neutral dither, solid ink dots on
   the profile and open rings on dimensions holding an AST below the 70%
   internal line. No numbers on the map.

4. **Bars coloured by length, not by judgement.** Bar ink follows a
   single-hue navy ramp in five steps (`results-bar-lv1…lv5`, mapped by
   `barLevel()` from the bar's own width): pale where attention rarely
   sits, deep where it lives. No numbers, no red/amber/green — depth
   reads as intensity of attention, not as a grade.

5. **Prompts and share text carry the code.** The Deep-Dive and LLM
   profiles lead with the composed code plus per-trait earned/possible
   counts; the share text is code-only. `results.typeCaption` becomes
   「你的注意力画像 / Your attention profile」.

## Consequences

- Session structural hash unchanged (option scores/severities untouched).
- The 70% blind-spot machinery, the AST-level blind list, the Action Plan
  and the count-anchored narrative are untouched.
- ADR 0025's guarantee holds and is restated: no pole, trait or phrase
  ranks above another; colour encodes attention intensity on a single
  hue, never pass/fail.
