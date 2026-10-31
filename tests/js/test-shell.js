exports.name = 'Shell';

exports.run = function() {
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
  require('../../js/i18n-add-shell.js');
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

  // ── Clock: format + 1-minute cadence decision ─────────────────────────

  check('clock pads single digits (07:05)',
    Shell.formatClock(new Date(2026, 0, 1, 7, 5)) === '07:05',
    Shell.formatClock(new Date(2026, 0, 1, 7, 5)));

  check('clock is 24h at 23:59 and rolls to 00:00',
    Shell.formatClock(new Date(2026, 0, 1, 23, 59)) === '23:59' &&
    Shell.formatClock(new Date(2026, 0, 1, 0, 0)) === '00:00',
    Shell.formatClock(new Date(2026, 0, 1, 23, 59)) + '/' +
    Shell.formatClock(new Date(2026, 0, 1, 0, 0)));

  // The same format in both locales: HH:MM is locale-independent by design.
  var en = mount('en');
  var zh = mount('zh');
  var d = new Date(2026, 0, 1, 9, 7);
  check('clock label renders the same HH:MM in en and zh',
    en.ctl.refreshClock(d) === '09:07' && zh.ctl.refreshClock(d) === '09:07',
    en.ctl.clockText() + '/' + zh.ctl.clockText());

  // 1-min cadence: the delay targets the next minute boundary, re-derived
  // every tick (no real waiting).
  check('tick cadence waits until the next minute boundary',
    Shell.nextTickDelay(60500) === 59500 &&
    Shell.nextTickDelay(0) === 60000 &&
    Shell.nextTickDelay(59999) === 1 &&
    Shell.nextTickDelay(123456789012) === (60000 - 123456789012 % 60000),
    String(Shell.nextTickDelay(60500)));

  // Minute rollover: paint again at the boundary → label advances.
  var before = new Date(2026, 0, 1, 9, 59, 59);
  var after = new Date(2026, 0, 1, 10, 0, 0);
  check('label updates when the minute rolls',
    en.ctl.refreshClock(before) === '09:59' &&
    en.ctl.refreshClock(after) === '10:00',
    en.ctl.clockText());

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

  var prevented = 0;
  var fakeEv = { preventDefault: function() { prevented++; } };
  en.ctl.titleButtons.close.handlers.click(fakeEv);
  check('title-bar button handlers are inert no-ops while disabled',
    prevented === 0, 'prevented=' + prevented);

  // Hook surface for ticket #43: the handler is a guarded no-op — it only
  // runs once BOTH the disabled attribute and the enable flag are lifted.
  Shell.titleBarButtonsEnabled = true;
  en.ctl.titleButtons.close.click();           // still disabled: no fire
  en.ctl.titleButtons.close.disabled = false;
  en.ctl.titleButtons.close.handlers.click(fakeEv);
  check('hook surface: enabled flag + re-enabled button executes the handler',
    prevented === 1, 'prevented=' + prevented);
  en.ctl.titleButtons.close.disabled = true;
  en.ctl.titleButtons.close.handlers.click(fakeEv);
  check('hook surface: re-disabled button is inert again', prevented === 1);
  Shell.titleBarButtonsEnabled = false;

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

  return results;
};
