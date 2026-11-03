#!/usr/bin/env python3
"""Regenerate the subset Fusion Pixel face for the Simplified Chinese page.

The committed asset `fonts/fusion-pixel-12px-proportional-sc-subset.woff2`
carries ONLY the glyphs the Simplified Chinese surfaces actually render:
every CJK-range codepoint (CJK Symbols and Punctuation, CJK Unified
Ideographs, CJK compatibility Ideographs, Halfwidth and Fullwidth Forms)
that appears in the two content sources:

  - i18n/zh.js       (Chrome String dictionary)
  - questions.zh.json (zh Bank Variant)

Latin, Greek, arrows, emoji, parentheses-style quotes in U+2000–206F are
deliberately NOT subset into the face: those runs must keep resolving to
the W95FA chrome face / the system stacks (ticket #51). The emitted
codepoint inventory is committed beside the font as
`fonts/fusion-pixel-12px-proportional-sc-subset.codepoints.json` and is the
contract the Node test `tests/js/test-theme-retro-os.js` enforces: add a
string with a new Han glyph and the test fails until this script re-runs.

## Regeneration procedure

    uv venv /tmp/venv-fonttools
    uv pip install --python /tmp/venv-fonttools/bin/python fonttools brotli
    /tmp/venv-fonttools/bin/python scripts/subset-fusion-pixel.py

The script downloads the pinned upstream release zip on demand (see
`UPSTREAM_RELEASE` below), subsets the Simplified Chinese proportional
build, and rewrites BOTH committed artifacts in place. After regenerating,
diff the codepoints JSON: it must either be unchanged (a no-op) or every
added line must correspond to a real render surface (never a comment
glyph), and the woff2 diff must be small.

## Licensing

Upstream face: Fusion Pixel Font by TakWolf (https://takwolf.com), plus
glyph contributions merged from Ark Pixel, Cubic-11, and Galmuri — the
verbatim license text for the whole bundle is shipped in
`fonts/fusion-pixel-OFL.txt` (contents of `OFL.txt` inside the zip). SIL
Open Font License 1.1: free for personal and commercial use including web
embedding; the face is distributed with the license, not sold.
"""

import json
import pathlib
import re
import tempfile
import urllib.request
import zipfile

from fontTools import subset
from fontTools.ttLib import TTFont

REPO = pathlib.Path(__file__).resolve().parent.parent
FONTS = REPO / 'fonts'
SOURCES = [REPO / 'i18n' / 'zh.js', REPO / 'questions.zh.json']

# Pinned upstream release: patch releases of Fusion Pixel change glyph
# outlines, so regenerating against a different tag is a deliberate act —
# bump this constant, adjust PROVENANCE.md, and commit the new artifacts
# together.
UPSTREAM_VERSION = '2026.10.25'
UPSTREAM_ZIP = ('https://github.com/TakWolf/fusion-pixel-font/releases/download/'
                f'{UPSTREAM_VERSION}/'
                f'fusion-pixel-font-12px-proportional-ttf.woff2-v{UPSTREAM_VERSION}.zip')
UPSTREAM_WOFF2 = f'fusion-pixel-12px-proportional-zh_hans.ttf.woff2'

OUT_WOFF2 = FONTS / 'fusion-pixel-12px-proportional-sc-subset.woff2'
OUT_CODEPOINTS = FONTS / 'fusion-pixel-12px-proportional-sc-subset.codepoints.json'

# CJK ranges the renderer is allowed to pull from this face. Everything
# outside these ranges (Latin, typographic punctuation U+2000–206F, arrows,
# emoji) stays on W95FA / the system stacks and is excluded from the subset
# on purpose — see the module docstring.
CJK_RANGES = (
    (0x3000, 0x303F),   # CJK Symbols and Punctuation
    (0x3040, 0x30FF),   # Hiragana / Katakana (defensive; zh copy should avoid)
    (0x3130, 0x318F),   # Hangul_compat (defensive)
    (0x3400, 0x4DBF),   # CJK Extension A
    (0x4E00, 0x9FFF),   # CJK Unified Ideographs
    (0xF900, 0xFAFF),   # CJK Compatibility Ideographs
    (0xFE30, 0xFE4F),   # CJK Compatibility Forms
    (0xFF00, 0xFFEF),   # Halfwidth and Fullwidth Forms
)


def needed_codepoints() -> set[int]:
    """CJK-range codepoints present in the two render sources."""
    sources = ''.join(p.read_text(encoding='utf-8') for p in SOURCES)
    low, high = min(r[0] for r in CJK_RANGES), max(r[1] for r in CJK_RANGES)
    return {
        cp
        for cp in {ord(ch) for ch in sources}
        if low <= cp <= high
        and any(lo <= cp <= hi for lo, hi in CJK_RANGES)
    }


def fetch_upstream_woff2(dir_: pathlib.Path) -> pathlib.Path:
    """Fetch + unpack the pinned upstream zip; return the zh_hans woff2 path."""
    bundle = dir_ / f'fusion-pixel-font-12px-proportional-ttf.woff2-v{UPSTREAM_VERSION}.zip'
    if not bundle.exists():
        print(f'downloading {UPSTREAM_ZIP}')
        urllib.request.urlretrieve(UPSTREAM_ZIP, bundle)
    if not (dir_ / UPSTREAM_WOFF2).exists():
        with zipfile.ZipFile(bundle) as zf:
            zf.extract(UPSTREAM_WOFF2, dir_)
    return dir_ / UPSTREAM_WOFF2


def subset_font(src: pathlib.Path, unicode_list: list[int]) -> TTFont:
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'  # committed artifact is woff2
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.ignore_missing_glyphs = True  # upstream may skip an exotic codepoint
    opts.layout_features = ['*']
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=unicode_list)
    # The upstream file already serves zh_hans text: keep every cmap entry in
    # the requested set, drop everything else, and let the subsetter shrink
    # glyf/bitmap tables to whatever the surviving codepoints reference.
    subsetter.subset(font)
    return font


def main() -> None:
    needed = needed_codepoints()
    print(f'{len(needed)} codepoints needed from {len(SOURCES)} sources')

    with tempfile.TemporaryDirectory(prefix='fusion-pixel-') as tmp:
        upstream = fetch_upstream_woff2(pathlib.Path(tmp))

        # Roundtrip: read the font once (with the upstream cmap intact) so we
        # can report what the subset *actually* kept, independent of what we
        # asked for.
        probe = TTFont(upstream)
        cmap = set()
        for table in probe['cmap'].tables:
            cmap.update(table.cmap.keys())
        probe.close()

        subsetted = needed & cmap
        missing = needed - cmap
        if missing:
            print('upstream face lacks (%d): ' % len(missing) +
                  ', '.join(hex(c) for c in sorted(missing)))

        font = subset_font(upstream, sorted(subsetted))
        font.save(OUT_WOFF2)
        font.close()

    # Emit the committed inventory from the SAVED subset: reopen the artifact
    # itself so the JSON describes the file that ships, byte-for-byte.
    saved = TTFont(OUT_WOFF2)
    kept: set[int] = set()
    for table in saved['cmap'].tables:
        kept.update(table.cmap.keys())
    saved.close()

    inventory = sorted(kept)
    OUT_CODEPOINTS.write_text(
        json.dumps(
            {
                'font': OUT_WOFF2.name,
                'upstream': 'Fusion Pixel Font %s — fusion-pixel-12px-proportional-zh_hans.ttf.woff2'
                            % UPSTREAM_VERSION,
                'sources': [p.relative_to(REPO).as_posix() for p in SOURCES],
                'cjk_ranges': [(hex(lo), hex(hi)) for lo, hi in CJK_RANGES],
                'codepoints': ['U+%04X' % cp for cp in inventory],
            },
            indent=2,
        )
        + '\n',
        encoding='utf-8',
    )
    print(f'{len(inventory)} codepoints kept in {OUT_WOFF2.name}; inventory written')
    # Cross-check the subset's own cmap against the wanted list one more time.
    assert needed <= kept, 'subset lost codepoints: ' + ', '.join(
        hex(c) for c in sorted(needed - kept))


if __name__ == '__main__':
    main()
