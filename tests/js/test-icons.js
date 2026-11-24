exports.name = 'Icons';

exports.run = function() {
  var results = [];
  var fs = require('fs');
  var path = require('path');
  var repo = path.join(__dirname, '..', '..');

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }
  function exists(rel) { return fs.existsSync(path.join(repo, rel)); }
  function read(rel) { return fs.readFileSync(path.join(repo, rel), 'utf8'); }
  function bytes(rel) { return fs.readFileSync(path.join(repo, rel)); }

  var spec = [
    ['favicon-16.png', 16], ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180], ['icon-192.png', 192],
    ['icon-512.png', 512], ['icon-maskable-512.png', 512]
  ];

  /* ── One geometry source, six RGB rasters ─────────────────────────── */
  check('generator committed: scripts/generate-icons.py',
    exists('scripts/generate-icons.py'));
  check('regeneration command in package.json',
    /generate-icons\.py/.test(read('package.json')));
  check('vector master committed: favicon.svg', exists('favicon.svg'));

  var svg = exists('favicon.svg') ? read('favicon.svg') : '';
  check('SVG uses the 64-unit grid', /viewBox="0 0 64 64"/.test(svg));
  check('SVG is the eye from js/quiz.js (navy iris, black pupil, white glint)',
    /#000080/.test(svg) && /r="10"/.test(svg) && /r="5"/.test(svg) &&
    /M11 32 C20 18\.5 44 18\.5 53 32/.test(svg));
  check('SVG carries the full-bleed teal ground',
    /width="64" height="64" fill="#008080"/.test(svg));

  spec.forEach(function(entry) {
    var name = entry[0], size = entry[1];
    if (!exists(name)) { check('missing asset: ' + name, false); return; }
    var b = bytes(name);
    var png = b.length > 24 && b.slice(1, 4).toString() === 'PNG';
    var w = png ? b.readUInt32BE(16) : 0;
    var h = png ? b.readUInt32BE(20) : 0;
    var depth = png ? b[24] : 0;
    var colour = png ? b[25] : 0;
    check(name + ' is a ' + size + 'px truecolour RGB PNG (no alpha)',
      png && w === size && h === size && depth === 8 && colour === 2,
      png ? (w + 'x' + h + ' depth ' + depth + ' colour ' + colour) : 'not a PNG');
  });

  /* ── Manifest declares both purposes and only shipped files ──────── */
  var manifest = exists('site.webmanifest') ? read('site.webmanifest') : '{}';
  var m = null;
  try { m = JSON.parse(manifest); } catch (e) { m = null; }
  check('site.webmanifest parses', !!m);
  if (m) {
    check('manifest theme matches the icon ground', m.theme_color === '#008080');
    var icons = m.icons || [];
    var purposes = icons.map(function(i) { return i.purpose; }).sort().join(',');
    check('manifest ships any + any + maskable icon entries',
      purposes === 'any,any,maskable', purposes);
    icons.forEach(function(i) {
      var rel = String(i.src || '').replace(/^\//, '');
      check('manifest icon exists: ' + rel, exists(rel));
    });
  }

  /* ── All three entry points agree, root-absolute on every path ───── */
  ['index.html', 'zh/index.html', '404.html'].forEach(function(page) {
    var html = exists(page) ? read(page) : '';
    check(page + ' links the SVG, PNG fallbacks, touch icon and manifest',
      /href="\/favicon\.svg"/.test(html) &&
      /href="\/favicon-32\.png"/.test(html) &&
      /href="\/favicon-16\.png"/.test(html) &&
      /href="\/apple-touch-icon\.png"/.test(html) &&
      /href="\/site\.webmanifest"/.test(html));
    check(page + ' theme-color matches the ground',
      /content="#008080"/.test(html));
  });
  check('404 no longer suppresses the favicon with data:,',
    !/rel="icon" href="data:,/.test(read('404.html')));

  return results;
};
