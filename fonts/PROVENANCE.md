# Chrome typeface provenance

Face: **W95FA** (a pixel design re-created after the original MS Sans Serif,
i.e. the same bitmap metrics/look Windows 95 chrome used), author **Alina Sava**.
Used as the UI-chrome typeface of the retro-OS skin (`css/theme-retro-os.css`).

## Files

| File | Source artifact |
| ---- | --------------- |
| `W95FA.otf` | original author build |
| `w95fa.woff` | original author build |
| `w95fa.woff2` | original author build (preferred by `@font-face`) |
| `OFL.txt` | verbatim license text shipped inside the author's official zip |

## Licensing (verified 2026-11-01)

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

## Rejected candidates (recorded so nobody re-lights this fuse)

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

## Behavioural note (recorded 2026-11-01)

The face maps CJK codepoints to placeholder (tofu-lookalike) glyphs rather
than leaving them uncovered, so plain font-family fallback would never hand
Han text to the system CJK faces. The `@font-face` in
`css/theme-retro-os.css` therefore pins the face to Latin + typographic
marks with `unicode-range`; the font file itself is shipped unmodified
(no OFL "Modified Version" rename obligations apply).
