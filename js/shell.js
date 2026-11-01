(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Desktop shell (ticket #38): window frame, taskbar, Start menu, About
   * window, clock. Ticket #43 makes the title-bar controls live.
   *
   * Layering: the shell WRAPS the existing `#app` node at runtime (no HTML
   * edits) — a `div.os-window` with a navy title bar takes `#app` as its
   * content, and a fixed `div.os-taskbar` pins the Start button, the program
   * button and the clock to the bottom of the screen.
   *
   * The three title-bar buttons carry `data-os-button="minimize|maximize|
   * close"` and DELEGATE to an App.Windows controller when the page wires
   * one in (js/shell.js start() builds it from js/windows.js). Without a
   * controller they keep the era default: drawn, disabled, inert — a
   * landing-state application that cannot close itself. The controller
   * re-renders their disabled state on every view change, opens the End
   * Program dialog on [×] away from the landing view, and drives the
   * minimize/maximize trace classes on the window frame.
   *
   * Pure logic (clock formatting, tick cadence, menu/About state
   * transitions) is exposed on App.Shell and runs headless with fakeEl
   * stubs; DOM wiring is guarded so `require()` in Node (no `document`)
   * still loads.
   */

  var TITLE_BUTTON_ACTIONS = ['minimize', 'maximize', 'close'];

  var shell = {};

  // ── Clock ───────────────────────────────────────────────────────────────

  /** Pad a single digit to two, Win95 taskbar style. */
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /**
   * Format a clock label. 24-hour HH:MM in BOTH locales (era-correct for a
   * system tray clock with 24-hour settings), single digits padded.
   */
  function formatClock(date) {
    return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  /**
   * Milliseconds until the next minute boundary — the 1-minute cadence
   * decision, derived from the clock so wall-clock drift cannot accumulate:
   * every tick re-derives its own target.
   */
  function nextTickDelay(nowMs) {
    return 60000 - (nowMs % 60000);
  }

  // ── State transitions (pure; headless-testable) ────────────────────────

  /** Start menu: click/Enter on the Start button toggles it. */
  function toggleMenu(wasOpen) { return !wasOpen; }

  /** Escape and outside clicks close the menu. */
  function closeMenu() { return false; }

  /** The OK button and the About menu entry close the About window. */
  function closeAbout() { return false; }

  // ── DOM factory helpers ────────────────────────────────────────────────

  function createEl(doc, tag, className, text) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function setAttrs(el, attrs) {
    Object.keys(attrs).forEach(function(name) {
      el.setAttribute(name, attrs[name]);
    });
  }

  function on(el, evt, fn) {
    el.addEventListener(evt, fn);
  }

  // ── Build ───────────────────────────────────────────────────────────────

  /**
   * Build the whole shell around the given `#app` node and return a
   * controller. `deps` supplies the collaborators so the same code runs in
   * the page (real document + App.I18n) and in tests (fakeEl stubs +
   * prepared strings):
   *
   *   deps.doc      - document or fakeEl document (createElement)
   *   deps.appEl    - the existing #app node to re-parent
   *   deps.strings  - resolved Chrome Strings map (shell.* ids → text)
   *   deps.onOutsideClick - optional; receives the outside-click handler
   */
  function build(deps) {
    var doc = deps.doc;
    var strings = deps.strings;
    var appEl = deps.appEl;

    // ── Window frame ─────────────────────────────────────────────────────
    var windowEl = createEl(doc, 'div', 'os-window');

    var titleBar = createEl(doc, 'div', 'os-titlebar');
    titleBar.setAttribute('role', 'banner');

    var titleText = createEl(doc, 'span', 'os-titlebar-title', strings['shell.windowTitle']);
    titleBar.appendChild(titleText);

    var titleButtons = createEl(doc, 'div', 'os-titlebar-buttons');
    var titleButtonEls = {};
    TITLE_BUTTON_ACTIONS.forEach(function(action) {
      var btn = createEl(doc, 'button', 'os-titlebar-btn');
      btn.type = 'button';
      setAttrs(btn, {
        'data-os-button': action,
        'aria-label': strings['shell.' + action]
      });
      // Era default until an App.Windows controller refines it via render():
      // landing state draws [×][□] gray (a program that cannot close
      // itself) and live [—]; away from landing all three are live.
      btn.disabled = true;
      on(btn, 'click', function(ev) {
        // Disabled buttons never fire (browser and fakeEl both).
        if (btn.disabled) return;
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (!deps.windows) return;
        var fn = deps.windows[action];
        if (typeof fn === 'function') fn();
      });
      titleButtons.appendChild(btn);
      titleButtonEls[action] = btn;
    });
    titleBar.appendChild(titleButtons);
    windowEl.appendChild(titleBar);

    // ── Taskbar ───────────────────────────────────────────────────────────
    var taskbar = createEl(doc, 'div', 'os-taskbar');
    taskbar.setAttribute('role', 'contentinfo');

    var startBtn = createEl(doc, 'button', 'os-start-btn');
    startBtn.type = 'button';
    setAttrs(startBtn, {
      'aria-haspopup': 'menu',
      'aria-expanded': 'false'
    });
    startBtn.appendChild(createEl(doc, 'span', 'os-start-icon'));
    startBtn.appendChild(createEl(doc, 'span', 'os-start-label', strings['shell.start']));

    // ── Start menu (built once; shown/hidden by class) ───────────────────
    var menu = createEl(doc, 'div', 'os-start-menu');
    menu.setAttribute('role', 'menu');
    var aboutItem = createEl(doc, 'button', 'os-start-menu-item', strings['shell.menuAbout']);
    aboutItem.type = 'button';
    aboutItem.setAttribute('role', 'menuitem');
    menu.appendChild(aboutItem);

    // ── Tray language indicator + Start-menu language entry (ticket #44) ─
    // Both surfaces share one action (deps.trayLang.onClick / deps.
    // langMenuItem.onClick): record the Language Preference, then navigate
    // the declared alternate — the same action the inline Quiz Chrome
    // switcher used. Built only when the page declares a data-lang-alt,
    // so a page without an alternate shows neither surface.
    var trayLang = null;
    if (deps.trayLang) {
      trayLang = createEl(doc, 'button', 'os-tray-lang', deps.trayLang.label);
      trayLang.type = 'button';
      setAttrs(trayLang, {
        title: deps.trayLang.title,
        'aria-label': deps.trayLang.title
      });
    }

    var langItem = null;
    if (deps.langMenuItem) {
      langItem = createEl(doc, 'button', 'os-start-menu-item', deps.langMenuItem.label);
      langItem.type = 'button';
      langItem.setAttribute('role', 'menuitem');
      langItem.setAttribute('data-os-menu', 'language');
      menu.appendChild(langItem);
    }

    // ── Program button (pressed: this window is the running program) ─────
    var programBtn = createEl(doc, 'button', 'os-program-btn');
    programBtn.type = 'button';
    setAttrs(programBtn, { 'aria-pressed': 'true' });
    var programLabel = createEl(doc, 'span', 'os-program-label', strings['shell.windowTitle']);
    programBtn.appendChild(programLabel);

    var clockEl = createEl(doc, 'span', 'os-clock');
    clockEl.setAttribute('role', 'timer');

    taskbar.appendChild(startBtn);
    taskbar.appendChild(menu);
    taskbar.appendChild(programBtn);
    if (trayLang) taskbar.appendChild(trayLang);
    taskbar.appendChild(clockEl);

    // ── About window (over a dimmed backdrop) ────────────────────────────
    var aboutBackdrop = createEl(doc, 'div', 'os-about-backdrop');
    var aboutEl = createEl(doc, 'div', 'os-about-window');
    aboutEl.setAttribute('role', 'dialog');
    aboutEl.setAttribute('aria-modal', 'true');
    aboutEl.setAttribute('aria-labelledby', 'os-about-title');

    var aboutTitleBar = createEl(doc, 'div', 'os-titlebar');
    aboutTitleBar.appendChild(createEl(doc, 'span', 'os-titlebar-title', strings['shell.aboutTitle']));
    aboutEl.appendChild(aboutTitleBar);

    var aboutBody = createEl(doc, 'div', 'os-about-body');
    aboutBody.appendChild(createEl(doc, 'p', 'os-about-app', strings['shell.windowTitle']));
    aboutBody.appendChild(createEl(doc, 'p', 'os-about-desc', strings['shell.aboutBody']));
    var aboutLink = createEl(doc, 'a', 'os-about-link', strings['shell.aboutLink']);
    aboutLink.href = 'https://owasp.org/Top10/AST10/';
    aboutLink.setAttribute('target', '_blank');
    aboutLink.setAttribute('rel', 'noopener noreferrer');
    aboutBody.appendChild(aboutLink);
    aboutBody.appendChild(createEl(doc, 'p', 'os-about-credits', strings['shell.aboutCredits']));
    aboutEl.appendChild(aboutBody);

    var okBtn = createEl(doc, 'button', 'os-about-ok', strings['shell.ok']);
    okBtn.type = 'button';
    aboutEl.appendChild(okBtn);
    aboutBackdrop.appendChild(aboutEl);

    // ── Re-parent into the live document ─────────────────────────────────
    // All three top-level containers are built; now they enter the body and
    // #app moves inside the window frame. The reference node (#app) stays in
    // the body until the frame is inserted, then its move re-parents it in
    // one insert, so it never leaves the document.
    var body = doc.body;
    body.insertBefore(windowEl, appEl);
    body.insertBefore(taskbar, appEl);
    body.appendChild(aboutBackdrop);
    windowEl.appendChild(appEl);

    // ── Controller (pure state + thin DOM ops) ───────────────────────────
    var menuOpen = false;
    var aboutOpen = false;

    var controller = {
      windowEl: windowEl,
      titleBar: titleBar,
      titleButtons: titleButtonEls,
      taskbar: taskbar,
      startBtn: startBtn,
      menu: menu,
      programBtn: programBtn,
      programLabel: programLabel,
      clockEl: clockEl,
      trayLang: trayLang,
      langItem: langItem,
      aboutBackdrop: aboutBackdrop,
      aboutEl: aboutEl,
      okBtn: okBtn,

      isMenuOpen: function() { return menuOpen; },
      isAboutOpen: function() { return aboutOpen; },
      clockText: function() { return clockEl.textContent; },

      openMenu: function() {
        menuOpen = true;
        menu.classList.add('open');
        startBtn.setAttribute('aria-expanded', 'true');
        return menuOpen;
      },
      closeMenu: function(focusStart) {
        menuOpen = closeMenu();
        menu.classList.remove('open');
        startBtn.setAttribute('aria-expanded', 'false');
        if (focusStart && typeof startBtn.focus === 'function') startBtn.focus();
        return menuOpen;
      },
      toggleMenu: function() {
        return toggleMenu(menuOpen)
          ? controller.openMenu()
          : controller.closeMenu(false);
      },

      openAbout: function() {
        aboutOpen = true;
        aboutBackdrop.classList.add('open');
        if (typeof okBtn.focus === 'function') okBtn.focus();
        return aboutOpen;
      },
      closeAbout: function() {
        aboutOpen = closeAbout();
        aboutBackdrop.classList.remove('open');
        return aboutOpen;
      },

      /** Paint the clock from a Date; returns the rendered label. */
      refreshClock: function(date) {
        var label = formatClock(date);
        clockEl.textContent = label;
        return label;
      },

      /** Document-level outside click: closes the menu (focus stays put). */
      handleOutsideClick: function(target) {
        if (!menuOpen) return menuOpen;
        var inside = false;
        var node = target;
        while (node) {
          if (node === menu || node === startBtn) { inside = true; break; }
          node = node.parentNode;
        }
        if (!inside) controller.closeMenu(false);
        return menuOpen;
      },

      /** Document-level keydown: Escape closes About first, then the menu.
       *  A system dialog owns Escape while it is open (its own keydown
       *  handler cancels it), so the menu/About handlers step aside. */
      handleKeydown: function(key) {
        if (key !== 'Escape') return { menu: menuOpen, about: aboutOpen };
        if (app.Windows && app.Windows.isDialogOpen &&
            app.Windows.isDialogOpen()) {
          return { menu: menuOpen, about: aboutOpen };
        }
        if (aboutOpen) controller.closeAbout();
        else if (menuOpen) controller.closeMenu(true);
        return { menu: menuOpen, about: aboutOpen };
      },

      /** Tear the shell DOM down (test cleanup). */
      destroy: function() {
        if (windowEl.parentNode) windowEl.parentNode.removeChild(windowEl);
        if (taskbar.parentNode) taskbar.parentNode.removeChild(taskbar);
        if (aboutBackdrop.parentNode) aboutBackdrop.parentNode.removeChild(aboutBackdrop);
      }
    };

    // ── Wiring ───────────────────────────────────────────────────────────
    on(startBtn, 'click', function() { controller.toggleMenu(); });
    if (trayLang) {
      on(trayLang, 'click', function() {
        if (typeof deps.trayLang.onClick === 'function') deps.trayLang.onClick();
      });
    }
    if (langItem) {
      on(langItem, 'click', function() {
        controller.closeMenu(false);
        if (typeof deps.langMenuItem.onClick === 'function') deps.langMenuItem.onClick();
      });
    }
    on(aboutItem, 'click', function() {
      controller.closeMenu(false);
      controller.openAbout();
    });
    on(okBtn, 'click', function() { controller.closeAbout(); });

    if (typeof deps.onOutsideClick === 'function') {
      deps.onOutsideClick(function(ev) {
        var target = ev && ev.target;
        if (target) controller.handleOutsideClick(target);
      });
    }

    return controller;
  }

  // ── System sounds (ticket #41) ────────────────────────────────────────
  //
  // The pages carry no <script> tag for js/sound.js, so the shell — the
  // Start-menu owner — injects it itself, deriving the URL from its own
  // script tag (works on / and /zh/ alike). A load failure mounts nothing:
  // no inert menu entry, no surfaced error. Headless (no document) this
  // stays dormant.

  var soundLoadQueue = [];
  var soundLoading = false;

  function withSoundModule(fn) {
    var doc = global.document;
    if (!doc || !doc.createElement) return;          // headless: dormant
    if (app.Sound) { fn(); return; }
    if (typeof fn !== 'function') return;
    soundLoadQueue.push(fn);
    if (soundLoading) return;
    soundLoading = true;

    var tags = doc.getElementsByTagName ? doc.getElementsByTagName('script') : [];
    var src = null;
    for (var i = 0; i < tags.length; i++) {
      var s = tags[i].getAttribute && tags[i].getAttribute('src');
      if (s && /(^|\/)js\/shell\.js$/.test(s)) { src = s; break; }
    }
    if (!src) { soundLoading = false; soundLoadQueue = []; return; }

    var script = doc.createElement('script');
    script.src = src.replace(/shell\.js$/, 'sound.js');
    script.addEventListener('load', function() {
      var queue = soundLoadQueue;
      soundLoadQueue = [];
      soundLoading = false;
      if (app.Sound) queue.forEach(function(cb) { cb(); });
    });
    script.addEventListener('error', function() {
      soundLoadQueue = [];
      soundLoading = false;                          // silent: no entry
    });
    (doc.head || doc.body).appendChild(script);
  }

  /**
   * Mount the Start-menu sound toggle: a checkable entry whose ✓ marker
   * and aria-pressed reflect the persisted mute preference (a Preference
   * like the Language Preference). It is inserted ahead of About — the
   * existing menu structure is otherwise untouched.
   */
  function attachSoundEntry(controller) {
    var doc = global.document;
    var I18n = app.I18n;
    if (!doc || !I18n || !app.Sound || controller.soundEntry) return null;

    var entry = createEl(doc, 'button', 'os-start-menu-item');
    entry.type = 'button';
    entry.setAttribute('role', 'menuitem');
    entry.setAttribute('data-os-menu', 'sound');

    function paint() {
      var on = !app.Sound.isMuted();
      entry.setAttribute('aria-pressed', on ? 'true' : 'false');
      entry.textContent = (on ? '\u2713 ' : '') + I18n.t('sound.menuItem');
    }
    paint();

    on(entry, 'click', function() {
      app.Sound.toggleMuted();
      paint();
      controller.closeMenu(false);
    });

    controller.menu.insertBefore(entry, controller.menu.firstChild);
    controller.soundEntry = entry;
    return entry;
  }

  /**
   * Resolve the shell Chrome Strings through the active dictionary.
   * Throws loudly on a missing id, per the i18n contract.
   */
  function resolveStrings(I18n, ids) {
    var strings = {};
    ids.forEach(function(id) { strings[id] = I18n.t(id); });
    return strings;
  }

  var STRING_IDS = [
    'shell.windowTitle', 'shell.minimize', 'shell.maximize', 'shell.close',
    'shell.start', 'shell.menuAbout',
    'shell.aboutTitle', 'shell.aboutBody', 'shell.aboutLink',
    'shell.aboutCredits', 'shell.ok',
    'windows.endProgramTitle', 'windows.endProgramMessage',
    'windows.yes', 'windows.no'
  ];

  /**
   * Open the End Program dialog over the given App.Windows controller.
   * Wording mirrors the Win95 confirmation (Chrome Strings resolved at open
   * time by the dialog primitive, so locale switches are honored). No /
   * Escape keeps the current view and Session; Yes returns to the landing
   * view — js/session-store.js owns the answers and is never touched, so a
   * mid-quiz close can never cost progress (issue #36 story 17).
   */
  function openEndProgram(win, opener) {
    if (!app.Windows || !app.Windows.openSystemDialog) return null;
    return app.Windows.openSystemDialog({
      icon: 'warn',
      titleId: 'windows.endProgramTitle',
      messageId: 'windows.endProgramMessage',
      dangerous: true,
      opener: opener,
      onOk: function() {
        // Show landing FIRST: the controller's render() re-syncs the view
        // gating from the DOM, so the landing rules must already be on
        // screen when it runs.
        if (typeof app.showView === 'function') app.showView('landing-view');
        win.confirmClose();
      },
      onCancel: function() {
        win.cancelClose();
      }
    });
  }

  /**
   * Record the language choice and navigate the declared alternate — the
   * exact action the inline Quiz Chrome switcher (js/quiz.js) performed on
   * click: `LangPref.setLanguage(data-lang-alt-locale)` first, then a plain
   * navigation to `data-lang-alt`, so the destination page treats the
   * Participant as a chooser and never routes them back (ADR 0018).
   * Returns true when a switch was performed. Headless-safe.
   */
  function recordChoice(root) {
    try {
      if (!root || typeof root.getAttribute !== 'function') return false;
      var href = root.getAttribute('data-lang-alt');
      var locale = root.getAttribute('data-lang-alt-locale');
      if (!href) return false;
      if (app.LangPref && typeof app.LangPref.setLanguage === 'function') {
        app.LangPref.setLanguage(locale);
      }
      global.location.href = href;
      return true;
    } catch (e) {
      // storage or navigation unavailable — the control degrades, never throws
      return false;
    }
  }

  /** The tray chip and the Start-menu entry both route through here. */
  function switchLanguage() {
    var doc = global.document;
    if (!doc || !doc.documentElement) return false;
    return recordChoice(doc.documentElement);
  }

  /**
   * Start the shell on the live page. Safe to call once; builds the frame,
   * re-parents #app, starts the clock and wires document-level handlers.
   */
  function start() {
    var doc = global.document;
    if (!doc || !doc.getElementById) return null;
    var appEl = doc.getElementById('app');
    if (!appEl || appEl.getAttribute('data-shell-mounted')) return null;

    var I18n = app.I18n;
    // A missing locale selection would otherwise throw from deep inside
    // t(); select from the document language like the boot layer does.
    if (I18n && I18n.locale === null) {
      I18n.use(I18n.baseLocale(doc.documentElement.lang || 'en'));
    }

    // The window manager (ticket #43): pure state machine rendered onto the
    // frame built below. The facade hands build() the three click actions;
    // attach() afterwards gives the controller the DOM to render onto.
    var win = app.Windows ? app.Windows.create({ doc: doc }) : null;

    // Language surfaces (ticket #44): the tray chip and the Start-menu
    // entry reflect the page's own locale and both run the switch action
    // above. Only pages declaring a data-lang-alt get either surface.
    var langAlt = doc.documentElement.getAttribute('data-lang-alt');
    var langAction = langAlt ? switchLanguage : null;

    var controller = build({
      doc: doc,
      appEl: appEl,
      strings: resolveStrings(I18n, STRING_IDS),
      trayLang: langAction ? {
        label: I18n.t('lang.selfName'),
        title: I18n.t('lang.switchLabel'),
        onClick: langAction
      } : null,
      langMenuItem: langAction ? {
        label: I18n.t('lang.menuItem', { language: I18n.t('lang.otherName') }),
        onClick: langAction
      } : null,
      windows: win ? {
        minimize: function() { win.minimize(); },
        maximize: function() { win.toggleMaximize(); },
        close: function() {
          if (!win.requestClose()) return;
          // The opener explicitly: requestClose() renders all three
          // controls disabled, which blurs the focused [×] before the
          // dialog could read doc.activeElement.
          openEndProgram(win, controller.titleButtons.close);
        }
      } : null,
      onOutsideClick: function(handler) {
        doc.addEventListener('click', handler);
      }
    });
    appEl.setAttribute('data-shell-mounted', 'true');
    if (win) {
      // Landing rules first: [×][□] gray, [—] live; the program-button
      // click handler (restore when minimized) is wired here too.
      win.attach({
        windowEl: controller.windowEl,
        programBtn: controller.programBtn,
        buttons: controller.titleButtons
      });
      app.Windows.controller = win;
    }

    // Escape closes the About window or the Start menu; focus returns to
    // the Start button on menu close.
    doc.addEventListener('keydown', function(ev) {
      controller.handleKeydown(ev.key);
    });

    // Clock: paint immediately, then re-derive the delay to the next minute
    // boundary on every tick.
    controller.refreshClock(new Date());
    var timer = global.setInterval(function() {
      controller.refreshClock(new Date());
    }, nextTickDelay(Date.now()));

    controller.stopClock = function() { global.clearInterval(timer); };
    app.Shell.controller = controller;

    // System sounds (ticket #41): inject js/sound.js (no HTML tag for it),
    // then mount the Start-menu toggle as soon as the module lands.
    withSoundModule(function() { attachSoundEntry(controller); });

    return controller;
  }

  shell.build = build;
  shell.start = start;
  shell.recordChoice = recordChoice;
  shell.switchLanguage = switchLanguage;
  shell.attachSoundEntry = attachSoundEntry;
  shell.withSoundModule = withSoundModule;
  shell.openEndProgram = openEndProgram;
  shell.formatClock = formatClock;
  shell.nextTickDelay = nextTickDelay;
  shell.pad2 = pad2;
  shell.toggleMenu = toggleMenu;
  shell.closeMenu = closeMenu;
  shell.closeAbout = closeAbout;
  shell.resolveStrings = resolveStrings;
  shell.STRING_IDS = STRING_IDS;

  app.Shell = shell;

  // DOM wiring: guarded so a headless require (no document) still loads.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { start(); });
    } else {
      start();
    }
  }

  if (typeof module !== 'undefined') module.exports = app.Shell;

})(globalThis);
