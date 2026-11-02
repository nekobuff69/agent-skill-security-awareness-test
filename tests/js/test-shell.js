exports.name = 'Shell';

exports.run = function() {
  var fs = require('fs');
  var path = require('path');
  var results = [];

  function check(desc, pass, extra) {
    var msg = desc;
    if (extra) msg += ' — ' + extra;
    results.push({ pass: !!pass, message: msg });
  }

  // ── fakeEl DOM stub (pattern from test-lang-routing.js) ────────────────

  function fakeEl(tag) {
    var el = {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, children: [], parentNode: null,
      className: '', textContent: '', type: '', href: '',
      disabled: false,
      attrs: {}, handlers: {}, classes: {},
      setAttribute: function(n, v) { el.attrs[n] = v; },
      getAttribute: function(n) {
        return Object.prototype.hasOwnProperty.call(el.attrs, n) ? el.attrs[n] : null;
      },
      appendChild: function(c) { el.children.push(c); c.parentNode = el; return c; },
      removeChild: function(c) {
        el.children = el.children.filter(function(x) { return x !== c; });
        c.parentNode = null;
        return c;
      },
      insertBefore: function(node, ref) {
        if (!ref) { el.children.push(node); }
        else {
          var i = el.children.indexOf(ref);
          el.children.splice(i < 0 ? el.children.length : i, 0, node);
        }
        node.parentNode = el;
        return node;
      },
      addEventListener: function(evt, fn) { el.handlers[evt] = fn; },
      click: function() {
        if (el.disabled) return;               // disabled buttons don't fire
        if (el.handlers.click) el.handlers.click({ target: el, preventDefault: function() {} });
      },
      focus: function() { el.focused = true; }
    };
    el.classList = {
      add: function(c) { el.classes[c] = true; },
      remove: function(c) { delete el.classes[c]; },
      contains: function(c) { return !!el.classes[c]; }
    };
    return el;
  }

  function fakeDoc() {
    var doc = {
      body: fakeEl('body'),
      createElement: function(tag) { return fakeEl(tag); }
    };
    return doc;
  }

  // ── Load the module (no document present → wiring must stay dormant) ──
  var Shell = require('../../js/shell.js');

  check('module loads headless without a document',
    Shell && typeof Shell.build === 'function');

  // ── Strings for the controller, in both locales via the real seam ─────
  require('../../js/i18n.js');
  require('../../i18n/en.js');
  require('../../i18n/zh.js');
  var I18n = globalThis.App.I18n;

  function mount(locale) {
    I18n.use(locale);
    var doc = fakeDoc();
    var appEl = fakeEl('div');
    appEl.setAttribute('id', 'app');
    doc.body.appendChild(appEl);
    var ctl = Shell.build({
      doc: doc,
      appEl: appEl,
      strings: Shell.resolveStrings(I18n, Shell.STRING_IDS)
    });
    return { doc: doc, appEl: appEl, ctl: ctl };
  }

  // ── Taskbar: the clock is gone (ticket #50) ───────────────────────────

  // No clock element, no clock surface on the controller, no interval:
  // the tray slot belongs to the language toggle (asserted below).
  var en = mount('en');
  var zh = mount('zh');
  check('the taskbar carries no clock element and no clock surface',
    !en.ctl.clockEl && !zh.ctl.clockEl &&
    typeof en.ctl.refreshClock === 'undefined' &&
    typeof en.ctl.clockText === 'undefined' &&
    en.ctl.taskbar.children.every(function(child) {
      return String(child.className).indexOf('os-clock') !== 0;
    }),
    en.ctl.taskbar.children.map(function(c) { return c.className; }).join(','));

  // ── Structure: window frame, taskbar, disabled title-bar buttons ─────

  check('#app is re-parented inside the window frame',
    en.appEl.parentNode === en.ctl.windowEl &&
    en.ctl.windowEl.className === 'os-window');

  var actions = ['minimize', 'maximize', 'close'];
  var allDisabled = actions.every(function(a) {
    var b = en.ctl.titleButtons[a];
    return b && b.disabled === true &&
      b.getAttribute('data-os-button') === a;
  });
  check('all three title-bar buttons are drawn, disabled and tagged',
    allDisabled);

  var zhAllDisabled = actions.every(function(a) {
    return zh.ctl.titleButtons[a] && zh.ctl.titleButtons[a].disabled === true;
  });
  check('title-bar buttons disabled on the zh page too', zhAllDisabled);

  // ── Drawn era glyphs (#49) ────────────────────────────────────────────
  // Geometry pinned to the 98.css control reference: a 6×2 minimize bar,
  // a 9×9 outlined maximize square, an 8×7 close cross, painted with
  // currentColor so the live/disabled color token is the only variable
  // (the disabled white drop shadow rides the .tb-glyph CSS rule).
  var glyphGeometry = {
    minimize: 'width="6" height="2" viewBox="0 0 6 2"',
    maximize: 'width="9" height="9" viewBox="0 0 9 9"',
    close: 'width="8" height="7" viewBox="0 0 8 7"'
  };
  var glyphsDrawn = actions.every(function(a) {
    var html = en.ctl.titleButtons[a].innerHTML;
    return typeof html === 'string' &&
      html.indexOf('<svg') === 0 &&
      html.indexOf('class="tb-glyph"') >= 0 &&
      html.indexOf(glyphGeometry[a]) >= 0 &&
      html.indexOf('fill="currentColor"') >= 0 &&
      html.indexOf('aria-hidden="true"') >= 0;
  });
  check('every title-bar button draws its era glyph (6×2 bar, 9×9 square, 8×7 cross)',
    glyphsDrawn);

  check('zh page draws byte-identical glyphs to the en page',
    actions.every(function(a) {
      return zh.ctl.titleButtons[a].innerHTML === en.ctl.titleButtons[a].innerHTML;
    }));

  check('the glyph table is exported from the module that owns the ONE title bar',
    Shell.TITLE_BAR_GLYPHS && actions.every(function(a) {
      return Shell.TITLE_BAR_GLYPHS[a] === en.ctl.titleButtons[a].innerHTML;
    }));

  // Delegation surface for ticket #43: the handler fires only while the
  // button is enabled; live behavior through an App.Windows controller is
  // covered in tests/js/test-windows.js.
  var prevented = 0;
  var fakeEv = { preventDefault: function() { prevented++; } };
  en.ctl.titleButtons.close.click();           // disabled: no fire
  check('disabled title-bar button never fires', prevented === 0,
    'prevented=' + prevented);
  en.ctl.titleButtons.close.disabled = false;
  en.ctl.titleButtons.close.handlers.click(fakeEv);
  check('enabled title-bar button executes the handler', prevented === 1,
    'prevented=' + prevented);
  en.ctl.titleButtons.close.disabled = true;
  en.ctl.titleButtons.close.handlers.click(fakeEv);
  check('re-disabled button is inert again', prevented === 1);

  // ── Program button reflects the window title ─────────────────────────

  I18n.use('en');
  check('program button label equals the title-bar text (en)',
    en.ctl.programLabel.textContent === en.ctl.windowEl.children[0].children[0].textContent &&
    en.ctl.programLabel.textContent === 'Agent Security Awareness Quiz',
    en.ctl.programLabel.textContent);
  I18n.use('zh');
  check('program button label equals the title-bar text (zh)',
    zh.ctl.programLabel.textContent === '智能体安全意识测评',
    zh.ctl.programLabel.textContent);
  check('program button is pressed (this window is the running program)',
    en.ctl.programBtn.getAttribute('aria-pressed') === 'true');

  // ── Start menu: open/close transitions ───────────────────────────────

  check('menu starts closed', !en.ctl.isMenuOpen() &&
    !en.ctl.menu.classList.contains('open') &&
    en.ctl.startBtn.getAttribute('aria-expanded') === 'false');

  en.ctl.startBtn.click();
  check('Start button opens the menu',
    en.ctl.isMenuOpen() && en.ctl.menu.classList.contains('open') &&
    en.ctl.startBtn.getAttribute('aria-expanded') === 'true');

  en.ctl.startBtn.click();
  check('Start button closes the menu again',
    !en.ctl.isMenuOpen() && !en.ctl.menu.classList.contains('open'));

  // Escape.
  en.ctl.openMenu();
  en.ctl.handleKeydown('Escape');
  check('Escape closes the menu',
    !en.ctl.isMenuOpen() && en.ctl.startBtn.focused === true);
  check('Escape only reacts to the Escape key',
    (en.ctl.openMenu(), en.ctl.handleKeydown('Enter').menu === true));

  // Outside click: target chain that does not include the menu.
  var outside = fakeEl('div');
  var ancestor = fakeEl('div');
  ancestor.appendChild(outside);
  en.ctl.handleOutsideClick(outside);
  check('outside click closes the menu',
    !en.ctl.isMenuOpen());

  // Click inside the menu (on the About item's parent) does not close.
  en.ctl.openMenu();
  en.ctl.handleOutsideClick(en.ctl.menu.children[0]);
  check('click inside the menu keeps it open',
    en.ctl.isMenuOpen());

  // Outside click while closed is a no-op (state stays false).
  en.ctl.closeMenu(false);
  en.ctl.handleOutsideClick(outside);
  check('outside click while closed is a no-op', !en.ctl.isMenuOpen());

  // ── About window ─────────────────────────────────────────────────────

  check('About starts closed',
    !en.ctl.isAboutOpen() && !en.ctl.aboutBackdrop.classList.contains('open'));

  en.ctl.aboutBackdrop.classList.add('open');
  en.ctl.isAboutOpen();
  // Open through the real path: the About menu entry.
  en.ctl.openMenu();
  en.ctl.menu.children[0].click();
  check('About menu entry opens About and closes the menu',
    en.ctl.isAboutOpen() && en.ctl.aboutBackdrop.classList.contains('open') &&
    !en.ctl.isMenuOpen());

  en.ctl.okBtn.click();
  check('OK button closes About',
    !en.ctl.isAboutOpen() && !en.ctl.aboutBackdrop.classList.contains('open'));

  // Escape closes About (and does not touch a closed menu).
  en.ctl.openAbout();
  en.ctl.handleKeydown('Escape');
  check('Escape closes About', !en.ctl.isAboutOpen());

  // ── About content: identity, OWASP link, credits, OK ─────────────────

  var body = en.ctl.aboutEl.children[1];
  var link = body.children[2];
  check('About carries app name, description, OWASP link, credits',
    body.children[0].textContent === 'Agent Security Awareness Quiz' &&
    body.children[1].textContent.length > 0 &&
    link.href === 'https://owasp.org/Top10/AST10/' &&
    body.children[3].textContent.length > 0);

  check('About title is a Chrome String (en/zh)',
    en.ctl.aboutEl.children[0].children[0].textContent === 'About Agent Security Awareness Quiz' &&
    zh.ctl.aboutEl.children[0].children[0].textContent === '关于智能体安全意识测评',
    zh.ctl.aboutEl.children[0].children[0].textContent);

  check('OK button text is localized',
    en.ctl.okBtn.textContent === 'OK' && zh.ctl.okBtn.textContent === '确定',
    en.ctl.okBtn.textContent + '/' + zh.ctl.okBtn.textContent);

  // Missing id fails loudly (the i18n contract), so resolveStrings throws.
  I18n.use('en');
  var threw = false;
  try { Shell.resolveStrings(I18n, ['shell.nope']); } catch (e) { threw = true; }
  check('a missing shell.* id fails loudly', threw);

  // ── Tray language toggle (ticket #50): replaces the taskbar clock ─────

  // A page declaring a data-lang-alt gets the two-segment tray control,
  // both segments wired to the SAME action — the inline Quiz Chrome
  // switcher's job moved here. The Start menu carries no language entry.
  var switchCalls = 0;
  function fakeSwitch() { switchCalls++; }

  function buildWithLang(locale) {
    I18n.use(locale);
    var doc = fakeDoc();
    var appEl = fakeEl('div');
    appEl.setAttribute('id', 'app');
    doc.body.appendChild(appEl);
    var ctl = Shell.build({
      doc: doc,
      appEl: appEl,
      strings: Shell.resolveStrings(I18n, Shell.STRING_IDS),
      trayLang: {
        title: I18n.t('lang.offerTitle'),
        self: { label: I18n.t('lang.selfName') },
        other: {
          label: I18n.t('lang.otherShort'),
          title: I18n.t('lang.switchLabel')
        },
        onClick: fakeSwitch
      }
    });
    return ctl;
  }

  var langEn = buildWithLang('en');
  var langZh = buildWithLang('zh');

  check('the tray control is a labelled group ("Language"/语言)',
    langEn.langToggle.getAttribute('role') === 'group' &&
    langEn.langToggle.getAttribute('aria-label') === 'Language' &&
    langZh.langToggle.getAttribute('aria-label') === '语言',
    langEn.langToggle.getAttribute('aria-label'));

  check('both language names show: EN + 中文 on en, 中文 + EN on zh',
    langEn.langSegments.self.textContent === 'EN' &&
    langEn.langSegments.other.textContent === '中文' &&
    langZh.langSegments.self.textContent === '中文' &&
    langZh.langSegments.other.textContent === 'EN',
    langEn.langSegments.self.textContent + '+' +
    langEn.langSegments.other.textContent + '/' +
    langZh.langSegments.self.textContent + '+' +
    langZh.langSegments.other.textContent);

  check('the page language is pressed, the alternate flat (aria-pressed)',
    langEn.langSegments.self.getAttribute('aria-pressed') === 'true' &&
    langEn.langSegments.other.getAttribute('aria-pressed') === 'false' &&
    langZh.langSegments.self.getAttribute('aria-pressed') === 'true' &&
    langZh.langSegments.other.getAttribute('aria-pressed') === 'false',
    langEn.langSegments.self.getAttribute('aria-pressed') + '/' +
    langEn.langSegments.other.getAttribute('aria-pressed'));

  check('the alternate segment carries the switch tooltip',
    langEn.langSegments.other.getAttribute('title') === 'Switch to Chinese' &&
    langZh.langSegments.other.getAttribute('title') === '切换到英文',
    langEn.langSegments.other.getAttribute('title'));

  check('both segments are native buttons in one field (keyboard reachable)',
    langEn.langToggle.children.length === 2 &&
    langEn.langToggle.children.every(function(seg) {
      return seg.tagName === 'BUTTON' && seg.type === 'button';
    }));

  check('the Start menu carries no language entry',
    langEn.langItem === undefined &&
    langEn.menu.children.every(function(child) {
      return child.getAttribute('data-os-menu') !== 'language';
    }) &&
    langEn.menu.children.length === 1,
    'items=' + langEn.menu.children.length);

  I18n.use('en');
  langEn.langSegments.other.click();
  check('clicking the alternate segment runs the switch action',
    switchCalls === 1, 'calls=' + switchCalls);
  langEn.langSegments.self.click();
  check('clicking the pressed segment runs the same switch action',
    switchCalls === 2, 'calls=' + switchCalls);
  langZh.langSegments.other.click();
  check('the zh toggle routes through the same action',
    switchCalls === 3, 'calls=' + switchCalls);

  // A build without language deps (a page with no declared alternate)
  // renders no toggle at all.
  var noLang = mount('en');
  check('a page without a declared alternate shows no language toggle',
    noLang.ctl.langToggle === null && noLang.ctl.langSegments === null &&
    noLang.ctl.langItem === undefined);

  // The switch action itself: records the Language Preference, then
  // navigates the declared alternate — the exact LangPref path the inline
  // switcher used (ADR 0018: using the switch records the choice).
  var savedStorage = globalThis.localStorage;
  var savedLocation = globalThis.location;
  var langStore = {};
  globalThis.localStorage = {
    getItem: function(k) {
      return Object.prototype.hasOwnProperty.call(langStore, k) ? langStore[k] : null;
    },
    setItem: function(k, v) { langStore[k] = String(v); },
    removeItem: function(k) { delete langStore[k]; }
  };
  globalThis.location = { href: null };
  require('../../js/lang-pref.js');

  var altRoot = fakeEl('html');
  altRoot.setAttribute('data-lang-alt', 'zh/');
  altRoot.setAttribute('data-lang-alt-locale', 'zh');
  check('the switch records the Language Preference before navigating',
    Shell.recordChoice(altRoot) === true &&
    globalThis.App.LangPref.get().language === 'zh' &&
    globalThis.location.href === 'zh/',
    JSON.stringify(globalThis.App.LangPref.get()) + ' href=' + globalThis.location.href);

  var noAltRoot = fakeEl('html');
  check('a page with no declared alternate neither records nor navigates',
    Shell.recordChoice(noAltRoot) === false &&
    globalThis.location.href === 'zh/',
    'href=' + globalThis.location.href);

  if (savedStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = savedStorage;
  if (savedLocation === undefined) delete globalThis.location;
  else globalThis.location = savedLocation;

  // ── Keyboard floor wiring (ticket #67) ────────────────────────────────
  // The shell's side of the floor: every window announces its program by
  // name through a labelled grouping, no window claims a modal, the
  // retargeted pointer stream has a wrapper to land in, and Escape's
  // window tier is asked LAST — dialog, then About, then Start menu.
  //
  // ── Desktop shortcuts (ticket #62) ───────────────────────────────────
  // A top-left column with one shortcut per program, glyph over a localized
  // label, ALWAYS present — running or not. Double-click, Enter and Space
  // launch through the ONE launch action; a single click never does.
  //
  // Both suites mount through the same helper: the controller carries the
  // floor's Escape hook and the shortcut launch action side by side.

  var launches = [];
  var preventions = 0;
  function fakeLaunch(id) { launches.push(id); }
  function keyEvent(key) {
    return { key: key, preventDefault: function() { preventions++; } };
  }
  function clickEvent() {
    return { preventDefault: function() { preventions++; } };
  }

  I18n.use('en');
  var esc67 = 0;

  function mountWithLaunch(locale) {
    I18n.use(locale);
    var doc = fakeDoc();
    var appEl = fakeEl('div');
    appEl.setAttribute('id', 'app');
    doc.body.appendChild(appEl);
    var ctl = Shell.build({
      doc: doc,
      appEl: appEl,
      strings: Shell.resolveStrings(I18n, Shell.STRING_IDS),
      onWindowEscape: function() { esc67++; return true; },
      launchProgram: fakeLaunch
    });
    return { doc: doc, appEl: appEl, ctl: ctl };
  }

  var floorMount = mountWithLaunch('en');
  var floor = floorMount.ctl;
  var sZh = mountWithLaunch('zh');
  var ORDER = ['quiz', 'action-plan', 'deep-dive'];

  check('every window is announced by its program name through a labelled grouping',
    floor.windowEl.getAttribute('role') === 'group' &&
    floor.programFrames['action-plan'].windowEl.getAttribute('role') === 'group' &&
    floor.programFrames['deep-dive'].windowEl.getAttribute('role') === 'group' &&
    floor.windowEl.getAttribute('aria-label') === 'Agent Security Awareness Quiz' &&
    floor.programFrames['action-plan'].windowEl.getAttribute('aria-label') === 'Action Plan' &&
    floor.programFrames['deep-dive'].windowEl.getAttribute('aria-label') === 'Deep-Dive Prompt',
    floor.windowEl.getAttribute('aria-label') + '/' +
    floor.programFrames['action-plan'].windowEl.getAttribute('aria-label'));

  check('no window claims aria-modal: the desktop frames are peers on one stage',
    floor.windowEl.getAttribute('aria-modal') === null &&
    Object.keys(floor.programFrames).every(function(id) {
      return floor.programFrames[id].windowEl.getAttribute('aria-modal') === null;
    }));

  check('the labelled groupings re-resolve on an in-place language switch',
    (I18n.use('zh'), floor.refreshLang(),
      floor.windowEl.getAttribute('aria-label') === '智能体安全意识测评' &&
      floor.programFrames['action-plan'].windowEl.getAttribute('aria-label') === '行动计划' &&
      floor.programFrames['deep-dive'].windowEl.getAttribute('aria-label') === '深度提问'),
    floor.windowEl.getAttribute('aria-label'));
  I18n.use('en');

  check('the taskbar program buttons are native buttons (Enter/Space activate them)',
    floor.programBtn.tagName === 'BUTTON' && floor.programBtn.type === 'button' &&
    Object.keys(floor.programBtns).every(function(id) {
      return floor.programBtns[id].tagName === 'BUTTON' &&
        floor.programBtns[id].type === 'button';
    }));

  floor.openAbout();
  floor.handleKeydown('Escape');
  check('Escape with About open closes About and never reaches the window tier',
    !floor.isAboutOpen() && esc67 === 0);

  floor.openMenu();
  floor.handleKeydown('Escape');
  check('Escape with the Start menu open closes the menu before the window tier',
    !floor.isMenuOpen() && esc67 === 0);

  floor.handleKeydown('Escape');
  check('with nothing above it open, Escape drops to the window tier exactly once',
    esc67 === 1);

  floor.handleKeydown('Enter');
  floor.handleKeydown('Tab');
  check('the window tier answers Escape only — no other key is intercepted',
    esc67 === 1);

  // #62's shortcut suite mounts its own en shell: the floor suite above
  // re-resolved the shared controller's labels under zh.
  I18n.use('en');
  var sEn = mountWithLaunch('en');

  check('the shortcut column carries one shortcut per program, in the stable order',
    ORDER.every(function(id, i) {
      var item = sEn.ctl.shortcutBar.children[i];
      return item && item.getAttribute('data-os-shortcut') === id;
    }) && sEn.ctl.shortcutBar.children.length === 3,
    sEn.ctl.shortcutBar.children.map(function(c) {
      return c.getAttribute('data-os-shortcut');
    }).join(','));

  check('every shortcut is a keyboard-reachable button with a drawn glyph',
    ORDER.every(function(id) {
      var item = sEn.ctl.shortcutEls[id];
      return item.tagName === 'BUTTON' && item.type === 'button' &&
        item.children.length === 2 &&
        item.children[0].innerHTML.indexOf('<svg') === 0 &&
        item.children[0].getAttribute('aria-hidden') === 'true' &&
        item.children[1].textContent.length > 0;
    }));

  check('shortcut labels come from the en dictionary',
    sEn.ctl.shortcutLabels['quiz'].textContent === 'Agent Security Awareness Quiz' &&
    sEn.ctl.shortcutLabels['action-plan'].textContent === 'Action Plan' &&
    sEn.ctl.shortcutLabels['deep-dive'].textContent === 'Deep-Dive Prompt',
    [sEn.ctl.shortcutLabels['quiz'].textContent,
     sEn.ctl.shortcutLabels['action-plan'].textContent,
     sEn.ctl.shortcutLabels['deep-dive'].textContent].join('|'));

  check('shortcut labels come from the zh dictionary',
    sZh.ctl.shortcutLabels['quiz'].textContent === '智能体安全意识测评' &&
    sZh.ctl.shortcutLabels['action-plan'].textContent === '行动计划' &&
    sZh.ctl.shortcutLabels['deep-dive'].textContent === '深度提问',
    [sZh.ctl.shortcutLabels['quiz'].textContent,
     sZh.ctl.shortcutLabels['action-plan'].textContent,
     sZh.ctl.shortcutLabels['deep-dive'].textContent].join('|'));

  check('the shortcuts mount on the desktop surface (one column in the body)',
    sEn.ctl.shortcutBar.parentNode === sEn.doc.body &&
    sEn.doc.body.children.filter(function(c) {
      return c === sEn.ctl.shortcutBar;
    }).length === 1);

  check('the shortcut column is built even with no launch action (drawn, inert)',
    (function() {
      var plain = mount('en');
      var item = plain.ctl.shortcutEls['quiz'];
      return !!item && !item.handlers.dblclick && !item.handlers.keydown;
    })());

  // Launch gestures: double-click, Enter, Space. One click: nothing.
  launches = [];
  sEn.ctl.shortcutEls['deep-dive'].handlers.dblclick(clickEvent());
  check('double-clicking a shortcut launches that program',
    launches.join(',') === 'deep-dive', 'launches=' + launches.join(','));

  launches = [];
  sEn.ctl.shortcutEls['quiz'].click();
  check('a single click launches nothing (it only selects, as on a real desktop)',
    launches.length === 0, 'launches=' + launches.join(','));

  launches = [];
  preventions = 0;
  sEn.ctl.shortcutEls['action-plan'].handlers.keydown(keyEvent('Enter'));
  check('Enter on a focused shortcut launches it',
    launches.join(',') === 'action-plan' && preventions === 1,
    'launches=' + launches.join(',') + ' prevented=' + preventions);

  launches = [];
  preventions = 0;
  sEn.ctl.shortcutEls['quiz'].handlers.keydown(keyEvent(' '));
  check('Space on a focused shortcut launches it (and never scrolls)',
    launches.join(',') === 'quiz' && preventions === 1,
    'launches=' + launches.join(',') + ' prevented=' + preventions);

  launches = [];
  sEn.ctl.shortcutEls['quiz'].handlers.keydown(keyEvent('a'));
  sEn.ctl.shortcutEls['quiz'].handlers.keydown(keyEvent('Tab'));
  check('any other key launches nothing', launches.length === 0);

  // An in-place language switch re-resolves the labels (#55 contract).
  I18n.use('en');
  var swEn = mountWithLaunch('en');
  I18n.use('zh');
  swEn.ctl.refreshLang();
  check('refreshLang re-resolves the shortcut labels in place',
    swEn.ctl.shortcutLabels['action-plan'].textContent === '行动计划' &&
    swEn.ctl.shortcutEls['action-plan'].getAttribute('title') === '行动计划',
    swEn.ctl.shortcutLabels['action-plan'].textContent);

  // The mobile rule: no shortcut column at ≤768px (presentation, exactly
  // like the #46 maximized-by-default rule — the state model stays blind).
  // Ticket #68 completes that layout: the frame fills the screen above the
  // slim bar, its body scrolls inside, the chrome reduces to close, and
  // the taskbar's three program entries — painted permanent by
  // js/windows.js — share the bar as the only switcher.
  var shellCss = fs.readFileSync(
    path.join(__dirname, '..', '..', 'css', 'shell.css'), 'utf8');
  var mobileBlock = (function() {
    var at = shellCss.indexOf('@media (max-width: 768px)');
    return at < 0 ? '' : shellCss.slice(at);
  })();
  var mobileOnly = mobileBlock.slice(0, mobileBlock.indexOf('@media (max-width: 480px'));
  check('css: the shortcut column disappears at ≤768px',
    /\.os-shortcuts\s*\{[^}]*display:\s*none/.test(mobileOnly));
  check('css: at ≤768px one program frame fills the screen above the slim taskbar',
    /\.os-window\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0 0 var\(--os-taskbar-height\) 0/.test(mobileOnly) &&
    /:root\s*\{[^}]*--os-taskbar-height:\s*44px/.test(mobileOnly));
  check('css: the window body keeps its own scroll inside the full-screen frame',
    /\.os-window\s*\{[^}]*overflow:\s*hidden/.test(mobileOnly) &&
    /\.os-window #app\s*\{[^}]*height:\s*100%[^}]*overflow:\s*auto/.test(mobileOnly));
  check('css: the mobile chrome reduces to close — [—] and [□] leave the frame',
    /\.os-titlebar-btn\[data-os-button="minimize"\][^}]*\{[^}]*display:\s*none/.test(mobileOnly) &&
    /\.os-titlebar-btn\[data-os-button="maximize"\]/.test(mobileOnly));
  check('css: the title bar is no drag handle at ≤768px (and no grip either)',
    /\.os-window\.is-windowed \.os-titlebar\s*\{[^}]*cursor:\s*default/.test(mobileOnly) &&
    /\.os-window\.is-windowed \.os-resize-grip\s*\{[^}]*display:\s*none/.test(mobileOnly));
  check('css: the three program switches share the slim bar',
    /\.os-taskbar \.os-program-btn\s*\{[^}]*flex:\s*1 1 0/.test(mobileOnly) &&
    /\.os-taskbar-programs:has\(\.os-program-btn:not\(\[hidden\]\)\)\s*\{[^}]*flex:\s*2 1 0/.test(mobileOnly) &&
    /\.os-start-btn,\s*\.os-program-btn,\s*\.os-lang-toggle\s*\{[^}]*height:\s*100%/.test(mobileOnly));
  check('css: the desktop column is a top-left stack of icons',
    /\.os-shortcuts\s*\{[^}]*position:\s*fixed/.test(shellCss) &&
    /\.os-shortcuts\s*\{[^}]*flex-direction:\s*column/.test(shellCss) &&
    /\.os-shortcuts\s*\{[^}]*left:\s*var\(--space-2\)/.test(shellCss) &&
    /\.os-shortcuts\s*\{[^}]*top:\s*var\(--space-2\)/.test(shellCss));
  check('css: the icons stay above the windows and below the bar (always visible)',
    (function() {
      var shortcutZ = Number(
        (shellCss.match(/\.os-shortcuts\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]);
      var taskbarZ = Number(
        (shellCss.match(/\.os-taskbar\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]);
      var dialogZ = Number(
        (shellCss.match(/\.os-dialog-backdrop\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]);
      return shortcutZ > 0 && shortcutZ < taskbarZ && shortcutZ < dialogZ &&
        taskbarZ === 1000;
    })(),
    'shortcuts above the window rung, under 1000');
  // Reduced motion covers every window transition on this viewport: the
  // gate is a top-level block, so the ≤768px layout inherits it, and it
  // parks BOTH traces the switcher can paint.
  check('css: reduced motion parks the window traces at every viewport',
    (function() {
      var rmAt = shellCss.indexOf('@media (prefers-reduced-motion: reduce)');
      var mediaAt = shellCss.indexOf('@media (max-width: 768px)');
      var rmBlock = rmAt < 0 ? '' : shellCss.slice(rmAt,
        shellCss.indexOf('@media', rmAt + 1) < 0 ? shellCss.length
          : shellCss.indexOf('@media', rmAt + 1));
      return rmAt >= 0 && rmAt < mediaAt &&
        /\.os-window\.is-minimizing/.test(rmBlock) &&
        /\.os-window\.is-restoring/.test(rmBlock) &&
        /animation:\s*none/.test(rmBlock);
    })());

  return results;
};
