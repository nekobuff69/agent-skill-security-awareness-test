# Typeface provenance

Three faces serve the retro-OS skin — all SIL Open Font License 1.1, all
committed under `fonts/` next to their license text. No face is fetched
over the network at runtime (ADR 0001).

## Face 1 — W95FA (Latin UI chrome)

Face: **W95FA** (a pixel design re-created after the original MS Sans Serif,
i.e. the same bitmap metrics/look Windows 95 chrome used), author **Alina Sava**.
Used as the Latin UI-chrome typeface of the retro-OS skin (`css/theme-retro-os.css`).

### Files

| File | Source artifact |
| ---- | --------------- |
| `W95FA.otf` | original author build |
| `w95fa.woff` | original author build |
| `w95fa.woff2` | original author build (preferred by `@font-face`) |
| `OFL.txt` | verbatim license text shipped inside the author's official zip |

### Licensing (verified 2026-11-01)

1. The font was **downloaded as a zip from its official hosting page**
   <https://fontsarena.com/wp-content/uploads/2020/01/W95FA.zip> (linked from
   the font's page <https://fontsarena.com/w95fa-by-alina-sava/>). The zip
   itself contains the license text `OFL.txt` — committed here unmodified.
2. `OFL.txt` is the **SIL Open Font License 1.1**, whose PERMISSION &
   CONDITIONS grants, in verbatim quote: *"Permission is hereby granted, free
   of charge, to any person obtaining a copy of the Font Software, to use,
   study, copy, merge, embed, modify, redistribute, and sell modified and
   unmodified copies of the Font Software"* — with the only condition that the
   Font Software is distributed under the same license and is not sold by
   itself. Embedding this face in a commercial website (serving it
   self-hosted to visitors) is covered; the site does not sell the font.
3. The publisher page states (verbatim): *"This font was created for W95
   WordPress theme (a Windows 95 style blog theme), and offered for free
   personal and commercial use under SIL OpenFont license."*
   — retrieved 2026-11-01, <https://fontsarena.com/w95fa-by-alina-sava/>.

### Rejected candidates (recorded so nobody re-lights this fuse)

- **React95/R95-fonts** (`SSERIFE.FON` / `SERIFF.FON` conversions):
  a conversion of Microsoft's own copyrighted bitmap files, no license file
  in the repository — redistribution not proven, rejected.
- **Pixel Surplus freebies** (e.g. "Tms Rmx" family of stock Win95-styled
  pixel faces): licensing page declares Free Goods as **Personal Use License**
  (*"limited to projects that will not be related with any business or
  monetary gain"*) — commercial web embedding not permitted, rejected.
  <https://www.pixelsurplus.com/pages/licensing> — retrieved 2026-11-01.

No network fetch happens at page load: the face is self-hosted under
`fonts/`, satisfying ADR 0001 (zero third-party runtime dependency).

### Behavioural note (recorded 2026-11-01)

The face maps CJK codepoints to placeholder (tofu-lookalike) glyphs rather
than leaving them uncovered, so plain font-family fallback would never hand
Han text to the system CJK faces. The `@font-face` in
`css/theme-retro-os.css` therefore pins the face to Latin + typographic
marks with `unicode-range`; the font file itself is shipped unmodified
(no OFL "Modified Version" rename obligations apply).

## Face 2 — Silkscreen (display face, ticket #51)

Face: **Silkscreen**, author **Jason Kottke**, SIL Open Font License 1.1 —
a compact bitmap-style display face reserved for headline/splash use, live
since ticket #53 as the Welcome Splash catchphrase
(`#landing-view .wizard-title`: 32px, uppercase; on the Chinese page the
same line runs 36px and its Han glyphs fall through to the Fusion Pixel
subset below, because this face is Latin-pinned).

### Files

| File | Source artifact |
| ---- | --------------- |
| `Silkscreen-Regular.woff2` | official TTF `Silkscreen-Regular.ttf` re-encoded to WOFF2 locally |
| `Silkscreen-Bold.woff2` | official TTF `Silkscreen-Bold.ttf` re-encoded to WOFF2 locally |
| `Silkscreen-OFL.txt` | verbatim license text from the font's directory in `google/fonts` |

SHA-256 (committed artifacts):

    Silkscreen-Regular.woff2  6dd76850c9c5420a81d9b1c0f476290b3726008ac813e0c721e4d1262c699e60
    Silkscreen-Bold.woff2     7e4afdb4a82f3df525ed7317b2677da1ca901892cfbde9d6602c6520949f50dd

### Licensing (retrieved 2026-11-02)

1. Source of record is the Google Fonts repository, the font's official
   distribution:
   <https://github.com/google/fonts/tree/main/ofl/silkscreen> — TTFs
   (`Silkscreen-Regular.ttf`, `Silkscreen-Bold.ttf`) and `OFL.txt` were
   fetched from that directory; the license text is committed verbatim as
   `Silkscreen-OFL.txt`.
2. `OFL.txt` is the **SIL Open Font License 1.1** (same terms quoted under
   Face 1): free to use, embed, redistribute, and sell as part of a product —
   never sold by itself; embedding self-hosted in this site is covered.
3. The face's name table embeds the license notice (nameID 13): *"This Font
   Software is licensed under the SIL Open Font License, Version 1.1."*
4. Conversion: the official TTFs were re-encoded to WOFF2 with FontTools
   4.68.0 + Brotli (flavor change only — no glyph, metric, or name-table
   edits), so no OFL "Modified Version" rename obligation applies and the
   primary name stays **Silkscreen**.

### Behavioural note

`@font-face` in `css/theme-retro-os.css` pins Silkscreen to the same Latin
`unicode-range` as W95FA (U+0020-007E, U+00A0-024F, U+2000-206F, U+2122,
U+25A0-25FF); the face carries Latin glyphs only, so any non-Latin
codepoint skips it and falls through to the CJK/system stacks. Self-hosted:
no network font request at runtime (ADR 0001).

## Face 3 — Fusion Pixel 12 SC subset (Chinese chrome face, ticket #51)

Face: **Fusion Pixel 12px proportional (Simplified Chinese build)**,
author **TakWolf** (<https://takwolf.com>) with glyph contributions merged
from the Ark Pixel, Cubic-11, and Galmuri projects (as recorded in the
license header of the release zip), SIL Open Font License 1.1. Served as
the Han-carrying half of `--font-heading` on the Chinese page.

### Files

| File | Source artifact |
| ---- | --------------- |
| `fusion-pixel-12px-proportional-sc-subset.woff2` | `fusion-pixel-12px-proportional-zh_hans.ttf.woff2` from the pinned release, subset with FontTools (see below) |
| `fusion-pixel-12px-proportional-sc-subset.codepoints.json` | machine-readable inventory of every codepoint kept in the subset |
| `fusion-pixel-OFL.txt` | verbatim `OFL.txt` shipped inside the release zip |

SHA-256 (committed artifact):

    fusion-pixel-12px-proportional-sc-subset.woff2  f4987ff2bc0142f16ee84f135468dc82cf639bd311b4e7a9ccc5a1bea8f6f1d4

### Licensing (retrieved 2026-11-02)

1. Source of record is the project's GitHub release:
   <https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.10.25>,
   asset `fusion-pixel-font-12px-proportional-ttf.woff2-v2026.10.25.zip`,
   member `fusion-pixel-12px-proportional-zh_hans.ttf.woff2` (~960 KB full
   build). The zip's `OFL.txt` — which carries the copyright header for
   TakWolf and the merged glyph projects — is committed verbatim as
   `fusion-pixel-OFL.txt`.
2. `OFL.txt` is the **SIL Open Font License 1.1** (terms as under Face 1).
   No Reserved Font Name is declared after the copyright line, so subset
   distribution carries no rename obligation; the license text ships with
   every copy (condition 2).
3. Subsetting is redistribution of a Modified Version of the Font
   Software, permitted by the license as long as it stays under the OFL —
   which it does: the OFL text is committed beside the subset.

### Subsetting and regeneration (recorded 2026-11-02)

The committed woff2 carries only the CJK-range codepoints that
`i18n/zh.js` and `questions.zh.json` actually render (889 codepoints:
CJK Symbols and Punctuation, CJK Unified Ideographs, CJK compatibility
Ideographs, Halfwidth and Fullwidth Forms) — Latin, arrows, emoji, and the
typographic punctuation U+2000-206F are deliberately excluded so those runs
keep resolving to W95FA/the system stacks exactly as before.

Regeneration is a repo-side, offline procedure (no page build, ADR 0001
intact) — documented in `scripts/subset-fusion-pixel.py` and reproducible
with:

    uv venv /tmp/venv-fonttools
    uv pip install --python /tmp/venv-fonttools/bin/python fonttools brotli
    /tmp/venv-fonttools/bin/python scripts/subset-fusion-pixel.py

The script downloads the pinned release zip on demand, subsets the
Simplified Chinese build, and rewrites both the woff2 and the codepoint
inventory in place. The inventory is the contract enforced by
`tests/js/test-cjk-font-subset.js`: a new Han glyph in the dictionary or
the Bank Variant fails the test until the script re-runs.
