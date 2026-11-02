exports.name = 'ThemeRetroOS';

exports.run = function() {
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  var fs = require('fs');
  var path = require('path');
  var repo = path.join(__dirname, '..', '..');

  function read(rel) {
    return fs.readFileSync(path.join(repo, rel), 'utf8');
  }

  function exists(rel) {
    return fs.existsSync(path.join(repo, rel));
  }

  /* ── Font logistics ── */
  check('self-hosted chrome face present: fonts/w95fa.woff2', exists('fonts/w95fa.woff2'));
  check('face woff fallback present: fonts/w95fa.woff', exists('fonts/w95fa.woff'));
  check('license text committed with the face: fonts/OFL.txt', exists('fonts/OFL.txt'));
  check('provenance record committed: fonts/PROVENANCE.md', exists('fonts/PROVENANCE.md'));

  /* Faces added by #51: the Silkscreen display pair and the Chinese
     Fusion Pixel subset — artifacts, licenses, and inventory. */
  check('display face woff2s present: fonts/Silkscreen-{Regular,Bold}.woff2',
    exists('fonts/Silkscreen-Regular.woff2') && exists('fonts/Silkscreen-Bold.woff2'));
  check('Silkscreen license text committed: fonts/Silkscreen-OFL.txt',
    exists('fonts/Silkscreen-OFL.txt'));
  check('CJK subset face present: fonts/fusion-pixel-12px-proportional-sc-subset.woff2',
    exists('fonts/fusion-pixel-12px-proportional-sc-subset.woff2'));
  check('CJK subset inventory committed: fonts/fusion-pixel-12px-proportional-sc-subset.codepoints.json',
    exists('fonts/fusion-pixel-12px-proportional-sc-subset.codepoints.json'));
  check('Fusion Pixel license text committed: fonts/fusion-pixel-OFL.txt',
    exists('fonts/fusion-pixel-OFL.txt'));

  if (exists('fonts/OFL.txt')) {
    var ofl = read('fonts/OFL.txt');
    check('fonts/OFL.txt is the SIL Open Font License 1.1',
      ofl.indexOf('SIL OPEN FONT LICENSE Version 1.1') !== -1);
  }
  if (exists('fonts/Silkscreen-OFL.txt')) {
    var silkOfl = read('fonts/Silkscreen-OFL.txt');
    check('fonts/Silkscreen-OFL.txt is the SIL Open Font License 1.1',
      silkOfl.indexOf('SIL OPEN FONT LICENSE Version 1.1') !== -1);
  }
  if (exists('fonts/fusion-pixel-OFL.txt')) {
    var fpOfl = read('fonts/fusion-pixel-OFL.txt');
    check('fonts/fusion-pixel-OFL.txt is the SIL Open Font License 1.1, TakWolf header',
      fpOfl.indexOf('SIL OPEN FONT LICENSE Version 1.1') !== -1 &&
      fpOfl.indexOf('Fusion Pixel Font') !== -1 &&
      fpOfl.indexOf('TakWolf') !== -1);
  }
  if (exists('fonts/PROVENANCE.md')) {
    var prov = read('fonts/PROVENANCE.md');
    check('PROVENANCE records commercial-web permission',
      /free personal and commercial use/.test(prov) || /commercial/i.test(prov));
    check('PROVENANCE records source URL and retrieval date',
      prov.indexOf('https://fontsarena.com') !== -1 && prov.indexOf('2026-11-01') !== -1);
    check('PROVENANCE records the Silkscreen face (source + license)',
      /Silkscreen/.test(prov) && prov.indexOf('google/fonts') !== -1 &&
      prov.indexOf('2026-11-02') !== -1);
    check('PROVENANCE records the Fusion Pixel subset (source + subset procedure)',
      /Fusion Pixel/.test(prov) && prov.indexOf('TakWolf') !== -1 &&
      prov.indexOf('subset-fusion-pixel.py') !== -1);
  }

  /* ── Skin file exists and @font-faces the committed faces ── */
  var skin = exists('css/theme-retro-os.css') ? read('css/theme-retro-os.css') : '';
  check('css/theme-retro-os.css exists', skin.length > 0);
  check('skin @font-faces the committed W95FA face',
    /@font-face/.test(skin) && skin.indexOf("font-family: 'W95FA'") !== -1 &&
    skin.indexOf("url('../fonts/w95fa.woff2')") !== -1);
  check('W95FA coverage pinned to Latin (unicode-range keeps CJK on system faces)',
    /unicode-range:\s*U\+0020-007E/.test(skin));
  check('skin @font-faces the Silkscreen display face, both weights, committed woff2s',
    skin.indexOf("font-family: 'Silkscreen'") !== -1 &&
    skin.indexOf("url('../fonts/Silkscreen-Regular.woff2')") !== -1 &&
    skin.indexOf("url('../fonts/Silkscreen-Bold.woff2')") !== -1 &&
    /@font-face\s*\{[^}]*'Silkscreen'[^}]*font-weight:\s*700/.test(skin));
  check('Silkscreen faces pinned to the same Latin unicode-range as W95FA',
    (skin.match(/@font-face\s*\{[^}]*'Silkscreen'[^}]*\}/g) || []).length === 2 &&
    (skin.match(/@font-face\s*\{[^}]*'Silkscreen'[^}]*\}/g) || []).every(function(block) {
      return /unicode-range:[^;]*U\+0020-007E/.test(block);
    }));
  check('skin @font-faces the Fusion Pixel CJK subset face',
    skin.indexOf("font-family: 'Fusion Pixel 12 SC'") !== -1 &&
    skin.indexOf("url('../fonts/fusion-pixel-12px-proportional-sc-subset.woff2')") !== -1);
  var fusionFace = (skin.match(/@font-face\s*\{[^}]*'Fusion Pixel 12 SC'[^}]*\}/) || [''])[0];
  check('Fusion subset face covers the CJK Unified block',
    /unicode-range:[\s\S]*U\+4E00-9FFF/.test(fusionFace));
  check('Fusion subset face excludes Latin (W95FA wins Latin runs, English never fetches it)',
    fusionFace.length > 0 && !/U\+0020-007E|U\+0041|U\+0061/.test(fusionFace));
  check('every @font-face src is a local ../fonts/ url (no runtime network font fetch)',
    !/src:\s*url\(\s*['"]?https?:/i.test(skin) &&
    (skin.match(/src:\s*url\('[^']+'\)/g) || []).every(function(src) {
      return src.indexOf("../fonts/") !== -1;
    }));

  /* ── Win95 tokens ── */
  check('white field tokens (--color-bg/--color-surface #FFFFFF)',
    /--color-bg:\s*#FFFFFF/.test(skin) && /--color-surface:\s*#FFFFFF/.test(skin));
  check('chrome face token --color-face #C0C0C0', /--color-face:\s*#C0C0C0/.test(skin));
  check('navy accent/primary #000080 (replaces editorial orange)',
    /--color-accent:\s*#000080/.test(skin) && /--color-primary:\s*#000080/.test(skin));
  check('teal desktop #008080 painted on body', /background-color:\s*#008080/.test(skin));
  check('radii are square (--border-radius: 0)', /--border-radius:\s*0\b/.test(skin));

  /* ── Status colours: dark text variants, bright graphics-only ── */
  check('score text uses dark system variants',
    /--color-score-green:\s*#008000/.test(skin) &&
    /--color-score-amber:\s*#808000/.test(skin) &&
    /--color-score-red:\s*#800000/.test(skin));
  check('fill colours use dark system variants',
    /--color-success:\s*#008000/.test(skin) &&
    /--color-warning:\s*#808000/.test(skin) &&
    /--color-error:\s*#800000/.test(skin));
  check('bright tints declared graphics-only',
    /--color-bright-green:\s*#00FF00/.test(skin) &&
    /--color-bright-yellow:\s*#FFFF00/.test(skin) &&
    /--color-bright-red:\s*#FF0000/.test(skin) &&
    /graphics-only/i.test(skin));
  check('contrast rationale documented in the token layer',
    /contrast/.test(skin) && /:1\b/.test(skin));

  /* ── Retro idiom components ── */
  check('Progress Fill is segmented navy blocks (gradient trick)',
    /\.quiz-status-fill/.test(skin) &&
    /repeating-linear-gradient\(\s*90deg,\s*var\(--color-primary\)/.test(skin));
  check('bevels drawn from the classic triad (highlight/face/shadow)',
    /--bevel-raised:/.test(skin) && /--bevel-sunken:/.test(skin) &&
    skin.indexOf('#FFFFFF') !== -1 && skin.indexOf('#808080') !== -1 &&
    skin.indexOf('#000000') !== -1);
  check('title bars use navy→lighter-blue gradient',
    /linear-gradient\(90deg,\s*#000080\s*0%,\s*#1084D0/.test(read('css/shell.css')));
  check('1px dither token present (graphics-only)',
    /--dither:\s*repeating-conic-gradient/.test(skin));

  /* ── HTML entry points ── */
  var htmls = { 'index.html': 'css/theme-retro-os.css',
                'zh/index.html': '../css/theme-retro-os.css',
                '404.html': '/css/theme-retro-os.css' };
  Object.keys(htmls).forEach(function(f) {
    var html = read(f);
    check(f + ' links the retro skin', html.indexOf(htmls[f]) !== -1);
    check(f + ' no longer links the editorial skin', html.indexOf('theme-surya') === -1);
    check(f + ' has no Google Fonts dependency',
      !/fonts\.(googleapis|gstatic)/.test(html));
    check(f + ' has no remote font file URL',
      !/(?:href|src)="https?:[^"]*\.(?:woff2?|ttf|otf)/i.test(html));
  });
  /* ── Consolidated CJK stylesheet (#51) ── */
  function sheetList(file) {
    var html = read(file);
    return (html.match(/<link rel="stylesheet" href="([^"]+)"/g) || [])
      .map(function(tag) {
        return tag.replace(/^<link rel="stylesheet" href="/, '')
                  .replace(/"$/, '')
                  .replace(/^\.\.\//, '');
      })
      .sort();
  }
  var enSheets = sheetList('index.html');
  var zhSheets = sheetList('zh/index.html');
  check('css/cjk.css deleted (rules consolidated into the theme)',
    !exists('css/cjk.css'));
  check('neither page links the retired css/cjk.css',
    read('index.html').indexOf('cjk.css') === -1 &&
    read('zh/index.html').indexOf('cjk.css') === -1);
  check('en and zh pages link the identical stylesheet list (one shared theme)',
    JSON.stringify(enSheets) === JSON.stringify(zhSheets),
    JSON.stringify(enSheets) + ' vs ' + JSON.stringify(zhSheets));

  /* ── No editorial orange, anywhere ── */
  ['css/theme-retro-os.css', 'css/quiz.css', 'css/results.css',
   'styles.css', 'index.html', 'zh/index.html',
   '404.html', 'js/results.js'].forEach(function(f) {
    check(f + ' contains no #ED682B', read(f).toUpperCase().indexOf('ED682B') === -1);
  });
  check('editorial skin file deleted', !exists('css/theme-surya.css'));
  check('design-DNA artifact deleted', !exists('design-dna-surya.json'));
  check('no Google Fonts import remains in css/',
    fs.readdirSync(path.join(repo, 'css')).every(function(f) {
      return !/fonts\.(googleapis|gstatic)/.test(read('css/' + f));
    }));

  /* ── zh typography: pixel Han chrome, SimSun-first prose, in the shared theme ── */
  check('CJK overrides gated on html[lang^="zh"] (English matches none of them)',
    /html\[lang\^="zh"\]/.test(skin) &&
    !/html\[lang\^="en"\]/.test(skin));
  check('zh heading stack leads with the Fusion pixel subset, W95FA behind for Latin',
    /--font-heading:\s*'Fusion Pixel 12 SC',\s*'W95FA',\s*'SimSun',\s*'宋体'/.test(skin));
  check('zh body stack is SimSun-first (prose stays on the system CJK stack)',
    /--font-body:\s*'SimSun',\s*'宋体'/.test(skin));
  check('zh mono stack re-pointed to CJK-capable monos',
    /--font-mono:\s*'Sarasa Mono SC'/.test(skin));
  check('CJK override catalogue re-pointed (no theme-surya refs)',
    skin.indexOf('theme-surya') === -1);
  check('Risk Radar axis labels re-pointed to the heading token on the zh page',
    skin.indexOf('html[lang^="zh"] .results-radar-svg text tspan') !== -1 &&
    /html\[lang\^="zh"\]\s+\.results-radar-svg text[\s\S]{0,400}font-family:\s*var\(--font-heading\)/.test(skin));

  /* ── Wireframe view tracing (issue #42) ──────────────────────────── */
  var cssDir = fs.readdirSync(path.join(repo, 'css'));
  var allCss = cssDir.map(function(f) { return read('css/' + f); }).join('\n');

  check('no view-fade animation remains anywhere in css/',
    !/fadeInUp|fadeIn(?![-a-zA-Z])|view-fade/i.test(allCss));
  check('wireframe trace keyframes declared',
    /@keyframes\s+os-wireframe-trace/.test(skin));
  check('trace targets un-hidden views inside the shell window',
    /\.os-window\s+#app\s*>\s*section:not\(\[hidden\]\)/.test(skin));
  check('trace is capped at 200ms',
    /animation:\s*os-wireframe-trace\s+200ms/.test(skin) &&
    /animation:\s*os-view-pop\s+200ms/.test(skin));
  check('trace is mechanical: steps() timing, no easing',
    /steps\(/.test(skin.match(/@keyframes\s+os-wireframe-trace[\s\S]*?^\}/m) || ''));

  var rmIndex = skin.lastIndexOf('prefers-reduced-motion');
  var rmBlock = rmIndex === -1 ? '' : skin.slice(rmIndex);
  check('reduced motion kills the wireframe trace',
    rmIndex !== -1 &&
    /os-window\s+#app\s*>\s*section:not\(\[hidden\]\),?[\s\S]*animation:\s*none/.test(rmBlock) &&
    /content:\s*none/.test(rmBlock));
  check('reduced motion kills Blind-Spot Bar width easing (historical gap)',
    /\.results-bar-fill\s*\{\s*transition:\s*none/.test(rmBlock));

  var quizCss = read('css/quiz.css');
  var quizRmIndex = quizCss.lastIndexOf('prefers-reduced-motion');
  var quizRmBlock = quizRmIndex === -1 ? '' : quizCss.slice(quizRmIndex);
  check('quiz.css reduced-motion block still gates card wipes and Progress Fill',
    quizRmIndex !== -1 &&
    /card-wipe-in/.test(quizRmBlock) &&
    /\.quiz-status-fill/.test(quizRmBlock));

  var bootCss = read('css/boot.css');
  check('boot splash gates view rendering until the reveal (one trace, not two)',
    /\.boot-overlay:not\(\.boot-leaving\)\s*~\s*\.os-window\s+#app\s*>\s*section/.test(bootCss));

  return results;
};
