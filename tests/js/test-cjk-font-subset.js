var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '../..');

exports.name = 'CJK pixel face subset coverage (#51)';

/**
 * The committed Fusion Pixel subset must carry every CJK-range glyph the
 * Simplified Chinese surfaces render — i18n/zh.js (Chrome Strings) and
 * questions.zh.json (zh Bank Variant). The contract is the committed
 * inventory (fonts/*.codepoints.json); this test recomputes the required
 * set from the live sources and fails in both directions:
 *   - a glyph used by a source but absent from the inventory means the
 *   subset would render it via system fallback (or tofu) → re-run
 *   scripts/subset-fusion-pixel.py;
 *   - a glyph in the inventory but no longer used means the subset
 *   carries dead weight → same regeneration.
 */
exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var fontRel = 'fonts/fusion-pixel-12px-proportional-sc-subset.woff2';
  var invRel = 'fonts/fusion-pixel-12px-proportional-sc-subset.codepoints.json';

  check('subset artifact committed: ' + fontRel, fs.existsSync(path.join(ROOT, fontRel)));
  check('codepoint inventory committed: ' + invRel, fs.existsSync(path.join(ROOT, invRel)));
  if (!fs.existsSync(path.join(ROOT, invRel))) return results;

  /* Mirror of CJK_RANGES in scripts/subset-fusion-pixel.py — the ranges
     the @font-face unicode-range may pull from this face. */
  var CJK_RANGES = [
    [0x2026, 0x2026],  // HORIZONTAL ELLIPSIS — the CJK ellipsis (扫雷……)
    [0x3000, 0x303F],  // CJK Symbols and Punctuation
    [0x3040, 0x30FF],  // Hiragana / Katakana (defensive)
    [0x3130, 0x318F],  // Hangul compatibility (defensive)
    [0x3400, 0x4DBF],  // CJK Extension A
    [0x4E00, 0x9FFF],  // CJK Unified Ideographs
    [0xF900, 0xFAFF],  // CJK Compatibility Ideographs
    [0xFE30, 0xFE4F],  // CJK Compatibility Forms
    [0xFF00, 0xFFEF]   // Halfwidth and Fullwidth Forms
  ];

  function inCjkRanges(cp) {
    for (var i = 0; i < CJK_RANGES.length; i++) {
      if (cp >= CJK_RANGES[i][0] && cp <= CJK_RANGES[i][1]) return true;
    }
    return false;
  }

  function neededCodepoints() {
    var text = ['i18n/zh.js', 'questions.zh.json'].map(function(f) {
      return fs.readFileSync(path.join(ROOT, f), 'utf8');
    }).join('');
    var set = {};
    var count = 0;
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      if (cp > 0xFFFF) i++;          // consume the low surrogate pair
      if (cp > 0x7F && inCjkRanges(cp) && !set[cp]) { set[cp] = true; count++; }
    }
    return { set: set, count: count };
  }

  var inventory = JSON.parse(fs.readFileSync(path.join(ROOT, invRel), 'utf8'));

  var needed = neededCodepoints();
  var committed = {};
  (inventory.codepoints || []).forEach(function(u) {
    committed[parseInt(String(u).replace(/^U\+/, ''), 16)] = true;
  });

  var missing = Object.keys(needed.set)
    .map(Number)
    .filter(function(cp) { return !committed[cp]; })
    .sort(function(a, b) { return a - b; });
  check('subset covers every CJK glyph used by i18n/zh.js and questions.zh.json',
    missing.length === 0,
    missing.length ? 'missing ' + missing.length + ': ' +
      missing.slice(0, 20).map(function(c) {
        return 'U+' + c.toString(16).toUpperCase();
      }).join(', ') : needed.count + ' codepoints');

  var stale = Object.keys(committed)
    .map(Number)
    .filter(function(cp) { return !needed.set[cp]; })
    .sort(function(a, b) { return a - b; });
  check('inventory tracks the live sources (no stale glyphs; re-run the subset script)',
    stale.length === 0,
    stale.length ? 'stale ' + stale.length + ': ' +
      stale.slice(0, 20).map(function(c) {
        return 'U+' + c.toString(16).toUpperCase();
      }).join(', ') : (inventory.codepoints || []).length + ' committed');

  /* The committed artifact is the file the inventory describes. */
  var head = Buffer.alloc(4);
  var fd = fs.openSync(path.join(ROOT, fontRel), 'r');
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  check('subset artifact is a woff2 (wOF2 magic)', head.toString('latin1') === 'wOF2');
  check('inventory names the committed artifact',
    inventory.font === path.basename(fontRel), inventory.font);
  check('inventory cites the two render sources',
    JSON.stringify(inventory.sources) ===
    JSON.stringify(['i18n/zh.js', 'questions.zh.json']),
    JSON.stringify(inventory.sources));

  /* The skin's unicode-range for the face must claim every committed
     codepoint — a glyph outside the range would never reach the face. */
  var skin = fs.readFileSync(path.join(ROOT, 'css/theme-retro-os.css'), 'utf8');
  var face = (skin.match(/@font-face\s*\{[^}]*'Fusion Pixel 12 SC'[^}]*\}/) || [''])[0];
  var rangeMatch = face.match(/unicode-range:\s*([^;]+);/);
  var claimed = [];
  if (rangeMatch) {
    rangeMatch[1].split(',').forEach(function(part) {
      var m = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
      if (!m) return;
      var lo = parseInt(m[1], 16);
      var hi = m[2] ? parseInt(m[2], 16) : lo;
      claimed.push([lo, hi]);
    });
  }
  function claimedByRange(cp) {
    for (var i = 0; i < claimed.length; i++) {
      if (cp >= claimed[i][0] && cp <= claimed[i][1]) return true;
    }
    return false;
  }
  var unclaimed = Object.keys(committed).map(Number).filter(function(cp) {
    return !claimedByRange(cp);
  }).sort(function(a, b) { return a - b; });
  check('skin unicode-range claims every subset codepoint (face actually serves them)',
    rangeMatch !== null && unclaimed.length === 0,
    unclaimed.length ? 'unclaimed ' + unclaimed.length + ': ' +
      unclaimed.slice(0, 20).map(function(c) {
        return 'U+' + c.toString(16).toUpperCase();
      }).join(', ') : claimed.length + ' ranges');

  return results;
};
