#!/usr/bin/env python3
"""Generate the Eye favicon set from ONE geometry source. Stdlib only.

The drawing is the Welcome-Splash eye from js/quiz.js (EYE_SVG), promoted to
a favicon as approved in the mark review. The same constants feed the SVG and
every raster, so the vector and the bitmaps cannot drift. No build step, no
third-party package, no network: the repo stays a vanilla static site
(ADR 0001). Re-run with `python3 scripts/generate-icons.py` (or `npm run icons`).

Rasters are truecolour RGB PNGs (colour type 2, no alpha): the teal ground is
opaque, which also satisfies iOS's apple-touch-icon requirement. Each target
is drawn at 4x and box-downsampled; the master resolution is small enough
that the whole set takes well under a minute on any machine.
"""

import os
import struct
import zlib

# ── Extracted tokens (css/theme-retro-os.css + js/quiz.js) ────────────────
C = {
    'teal': '#008080',
    'white': '#FFFFFF',
    'black': '#000000',
    'navy': '#000080',
}

# Almond: the exact cubic pair from EYE_SVG's viewBox="0 0 32 32", scaled
# 1.5x into the 64u grid. The lower pair is the mirror about y=32.
P0 = (11.0, 32.0)
C1 = (20.0, 18.5)
C2 = (44.0, 18.5)
P1 = (53.0, 32.0)
STROKE = 4.0
IRIS = (32.0, 32.0, 10.0)
PUPIL = (32.0, 32.0, 5.0)
GLINT = (27.0, 27.0, 5.0, 5.0)  # x, y, w, h — 3u+ detail, texture only
GRID = 64.0
MASKABLE_SCALE = 0.90              # explicit padding for the maskable crop

SPECS = [
    ('favicon-16.png', 16, 1.0),
    ('favicon-32.png', 32, 1.0),
    ('apple-touch-icon.png', 180, 1.0),
    ('icon-192.png', 192, 1.0),
    ('icon-512.png', 512, 1.0),
    ('icon-maskable-512.png', 512, MASKABLE_SCALE),
]


def rgb(hexstr):
    return tuple(int(hexstr[i:i + 2], 16) for i in (1, 3, 5))


GROUND = rgb(C['teal'])
WHITE = rgb(C['white'])
BLACK = rgb(C['black'])
NAVY = rgb(C['navy'])


def bez(t):
    """Point on the upper almond cubic at parameter t."""
    mt = 1.0 - t
    x = mt**3 * P0[0] + 3 * mt*mt*t * C1[0] + 3 * mt*t*t * C2[0] + t**3 * P1[0]
    y = mt**3 * P0[1] + 3 * mt*mt*t * C1[1] + 3 * mt*t*t * C2[1] + t**3 * P1[1]
    return x, y


def top_at(x):
    """Upper almond edge at unit-x, or None outside the eye. Symmetric."""
    xr = x if x <= GRID / 2 else GRID - x
    if xr < P0[0] or xr > P1[0]:
        return None
    lo, hi = 0.0, 0.5  # Bx(t) is monotonic from x=11 (t=0) to x=32 (t=.5)
    for _ in range(26):
        mid = (lo + hi) / 2.0
        if bez(mid)[0] < xr:
            lo = mid
        else:
            hi = mid
    return bez((lo + hi) / 2.0)[1]


def render(size, scale):
    """Return a flat RGB bytearray for `size` px, geometry scaled about 32,32."""
    ss = 4
    w = size * ss
    u = [(i + 0.5) * GRID / w for i in range(w)]
    gx = [GRID / 2 + (p - GRID / 2) / scale for p in u]
    tops = [top_at(x) for x in gx]

    master = bytearray(w * w * 3)
    half = STROKE / 2.0
    iris_r2 = IRIS[2] ** 2
    pupil_r2 = PUPIL[2] ** 2

    for row, uy_u in enumerate(u):
        gy = GRID / 2 + (uy_u - GRID / 2) / scale
        base = row * w * 3
        for col in range(w):
            idx = base + col * 3
            r, g, b = GROUND

            yt = tops[col]
            if yt is not None:
                yb = GRID - yt
                if yt - half <= gy <= yb + half:
                    if yt + half <= gy <= yb - half:
                        r, g, b = WHITE
                    else:
                        r, g, b = BLACK

            x = gx[col]
            d2 = (x - IRIS[0]) ** 2 + (gy - IRIS[1]) ** 2
            if d2 <= iris_r2:
                r, g, b = NAVY
            if d2 <= pupil_r2:
                r, g, b = BLACK
            if GLINT[0] <= x <= GLINT[0] + GLINT[2] and \
               GLINT[1] <= gy <= GLINT[1] + GLINT[3]:
                r, g, b = WHITE

            master[idx] = r
            master[idx + 1] = g
            master[idx + 2] = b

    # Box downsample 4x4 -> 1px. Integer division keeps the code deterministic.
    out = bytearray(size * size * 3)
    for y in range(size):
        for x in range(size):
            s0 = s1 = s2 = 0
            for dy in range(ss):
                i = ((y * ss + dy) * w + x * ss) * 3
                s0 += master[i] + master[i + 3] + master[i + 6] + master[i + 9]
                s1 += master[i + 1] + master[i + 4] + master[i + 7] + master[i + 10]
                s2 += master[i + 2] + master[i + 5] + master[i + 8] + master[i + 11]
            j = (y * size + x) * 3
            out[j] = s0 // 16
            out[j + 1] = s1 // 16
            out[j + 2] = s2 // 16
    return out


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


def write_png(path, size, pixels):
    raw = bytearray()
    stride = size * 3
    for y in range(size):
        raw.append(0)  # PNG filter type: none
        raw.extend(pixels[y * stride:(y + 1) * stride])
    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
           chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def svg():
    """The vector master, emitted from the same numbers as the rasters."""
    d = ('M{0:g} {1:g} C{2:g} {3:g} {4:g} {5:g} {6:g} {7:g} '
         'C{8:g} {9:g} {10:g} {11:g} {12:g} {13:g} Z').format(
        P0[0], P0[1], C1[0], C1[1], C2[0], C2[1], P1[0], P1[1],
        P1[0], GRID - P1[1], C2[0], GRID - C2[1], C1[0], GRID - C1[1],
        P0[0], P0[1])
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        'width="64" height="64" role="img" aria-label="Eye — a mirror, not a grade">\n'
        '  <rect width="64" height="64" fill="{teal}"/>\n'
        '  <path d="{d}" fill="{white}" stroke="{black}" stroke-width="{sw:g}" '
        'stroke-linejoin="miter"/>\n'
        '  <circle cx="{ix:g}" cy="{iy:g}" r="{ir:g}" fill="{navy}"/>\n'
        '  <circle cx="{px:g}" cy="{py:g}" r="{pr:g}" fill="{black}"/>\n'
        '  <rect x="{gx:g}" y="{gy:g}" width="{gw:g}" height="{gh:g}" '
        'fill="{white}"/>\n'
        '</svg>\n'
    ).format(teal=C['teal'], white=C['white'], black=C['black'], navy=C['navy'],
             d=d, sw=STROKE, ix=IRIS[0], iy=IRIS[1], ir=IRIS[2],
             px=PUPIL[0], py=PUPIL[1], pr=PUPIL[2],
             gx=GLINT[0], gy=GLINT[1], gw=GLINT[2], gh=GLINT[3])


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    with open(os.path.join(root, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg())
    print('favicon.svg')

    for name, size, scale in SPECS:
        write_png(os.path.join(root, name), size, render(size, scale))
        print('%-24s %3dx%-3d RGB  scale %.2f' % (name, size, size, scale))

    # Maskable arithmetic: the eye's farthest unit point is the right tip
    # plus half the stroke, at x=55 => 23u from centre. Crop radius is 25.6u.
    far = (P1[0] + STROKE / 2.0 - GRID / 2) * MASKABLE_SCALE
    print('maskable farthest point: %.2fu (limit 25.6u)' % far)
    assert far <= 25.6, 'maskable safe zone violated'


if __name__ == '__main__':
    main()
