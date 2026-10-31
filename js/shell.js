(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Desktop shell (ticket #38): window frame, taskbar, Start menu, About
   * window, clock.
   *
   * Layering: the shell WRAPS the existing `#app` node at runtime (no HTML
   * edits) — a `div.os-window` with a navy title bar takes `#app` as its
   * content, and a fixed `div.os-taskbar` pins the Start button, the program
   * button and the clock to the bottom of the screen.
   *
   * The three title-bar buttons are DRAWN but disabled, era-correct for a
   * landing-state application that cannot close itself. The live controls
   * arrive with ticket #43: the hook surface is stable — the buttons carry
   * `data-os-button="minimize|maximize|close"`, are marked
   * `disabled = true`, and their click handler is a guarded no-op that
   * checks the `titleBarButtonsEnabled` flag before doing anything. Toggling
   * that one flag later activates them without touching this structure.
   *
   * Pure logic (clock formatting, tick cadence, menu/About state
   * transitions) is exposed on App.Shell and runs headless with fakeEl
   * stubs; DOM wiring is guarded so `require()` in Node (no `document`)
   * still loads.
   */

  var TITLE_BUTTON_ACTIONS = ['minimize', 'maximize', 'close'];

  var shell = {
    /** True when the title-bar buttons perform actions (ticket #43 flips this). */
    titleBarButtonsEnabled: false
  };

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
      // Era-correct disabled state: drawn, gray, inert (ticket #43).
      btn.disabled = true;
      on(btn, 'click', function(ev) {
        // Hook surface for ticket #43: stays a no-op while disabled.
        if (btn.disabled || !shell.titleBarButtonsEnabled) return;
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
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

      /** Document-level keydown: Escape closes About first, then the menu. */
      handleKeydown: function(key) {
        if (key !== 'Escape') return { menu: menuOpen, about: aboutOpen };
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
    'shell.aboutCredits', 'shell.ok'
  ];

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

    var controller = build({
      doc: doc,
      appEl: appEl,
      strings: resolveStrings(I18n, STRING_IDS),
      onOutsideClick: function(handler) {
        doc.addEventListener('click', handler);
      }
    });
    appEl.setAttribute('data-shell-mounted', 'true');

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
  shell.attachSoundEntry = attachSoundEntry;
  shell.withSoundModule = withSoundModule;
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
