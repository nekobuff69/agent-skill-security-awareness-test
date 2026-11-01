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

  if (exists('fonts/OFL.txt')) {
    var ofl = read('fonts/OFL.txt');
    check('fonts/OFL.txt is the SIL Open Font License 1.1',
      ofl.indexOf('SIL OPEN FONT LICENSE Version 1.1') !== -1);
  }
  if (exists('fonts/PROVENANCE.md')) {
    var prov = read('fonts/PROVENANCE.md');
    check('PROVENANCE records commercial-web permission',
      /free personal and commercial use/.test(prov) || /commercial/i.test(prov));
    check('PROVENANCE records source URL and retrieval date',
      prov.indexOf('https://fontsarena.com') !== -1 && prov.indexOf('2026-11-01') !== -1);
  }

  /* ── Skin file exists and @font-faces the committed face ── */
  var skin = exists('css/theme-retro-os.css') ? read('css/theme-retro-os.css') : '';
  check('css/theme-retro-os.css exists', skin.length > 0);
  check('skin @font-faces the committed W95FA face',
    /@font-face/.test(skin) && skin.indexOf("font-family: 'W95FA'") !== -1 &&
    skin.indexOf("url('../fonts/w95fa.woff2')") !== -1);
  check('W95FA coverage pinned to Latin (unicode-range keeps CJK on system faces)',
    /unicode-range:\s*U\+0020-007E/.test(skin));

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
    /linear-gradient\(90deg,\s*#000080\s*0%,\s*#1084D0/.test(skin));
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
  });
  check('skin is last before cjk.css on the zh page',
    (function() {
      var html = read('zh/index.html');
      return html.indexOf('theme-retro-os.css') < html.indexOf('cjk.css');
    })());

  /* ── No editorial orange, anywhere ── */
  ['css/theme-retro-os.css', 'css/cjk.css', 'css/quiz.css', 'css/results.css',
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

  /* ── zh page: SimSun-first stack, pixel chrome ── */
  var cjk = read('css/cjk.css');
  check('cjk.css uses a SimSun-first body stack',
    /--font-body:\s*'SimSun',\s*'宋体'/.test(cjk));
  check('cjk.css keeps the pixel face on Latin chrome',
    /--font-heading:\s*'W95FA',\s*'SimSun'/.test(cjk));
  check('cjk.css override catalog re-pointed (no theme-surya refs)',
    cjk.indexOf('theme-surya') === -1);

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
