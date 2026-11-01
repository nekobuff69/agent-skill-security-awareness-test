(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * Desktop shell (ticket #38): window frame, taskbar, Start menu, About
   * window. Ticket #43 makes the title-bar controls live; ticket #50
   * replaces the tray clock with the two-segment language toggle; ticket
   * #61 adds the Action Plan and the Deep-Dive Prompt windows, so the
   * shell builds THREE program frames — one chrome, one control idiom, one
   * taskbar button each — instead of wrapping #app alone.
   *
   * Layering: the shell WRAPS the existing `#app` node at runtime (no HTML
   * edits) — a `div.os-window` with a navy title bar takes `#app` as its
   * content, and a fixed `div.os-taskbar` pins the Start button, the
   * program buttons and the language toggle to the bottom of the screen.
   *
   * The three title-bar buttons carry `data-os-button="minimize|maximize|
   * close"` and DELEGATE to an App.Windows controller when the page wires
   * one in (js/shell.js start() builds it from js/windows.js) — for the
   * Quiz frame that is the controller's own action, for a program frame
   * the same action bound to that program's Id. Without a controller they
   * keep the era default: drawn, disabled, inert — a landing-state
   * application that cannot close itself. The controller
   * re-renders their disabled state on every view change, drives the
   * minimize/maximize trace classes on the window frame, and decides what
   * [×] means: the End Program dialog on a flow view, the core's hide()
   * on the results/review desktop stage (ticket #60).
   *
   * Desktop regime (ticket #60): on the results and review views the frame
   * is a positioned, draggable, resizable window (`.is-windowed` — see
   * css/shell.css); the landing and quiz views keep the layout-flow frame
   * above. The title bar and the bottom-right corner grip are the drag and
   * resize handles; js/windows.js moves the window only by writing the
   * core's Geometry.
   *
   * Pure logic (menu/About state transitions) is exposed on App.Shell and
   * runs headless with fakeEl stubs; DOM wiring is guarded so `require()`
   * in Node (no `document`) still loads.
   */

  var TITLE_BUTTON_ACTIONS = ['minimize', 'maximize', 'close'];

  /**
   * Era-correct title-bar glyphs (#49): 98.css control geometry drawn as
   * inline SVG — a 6×2 minimize bar, a 9×9 outlined maximize square, an
   * 8×7 close cross — sized for the 16×14 button. No image assets, no
   * extra fonts (ADR 0001). `fill="currentColor"` lets the button's own
   * color token paint the glyph: black while live, gray on the disabled
   * landing state (the 1px white drop shadow rides the glyph in
   * css/shell.css's `.tb-glyph` rule). These are the ONE title bar: the
   * results header panel (js/results.js, ticket #60) rides the window's
   * body instead of drawing a second fake chrome — no other module copies
   * this table.
   */
  var TITLE_BAR_GLYPHS = {
    minimize:
      '<svg class="tb-glyph" width="6" height="2" viewBox="0 0 6 2" aria-hidden="true">' +
      '<rect width="6" height="2" fill="currentColor"/></svg>',
    maximize:
      '<svg class="tb-glyph" width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">' +
      '<path fill-rule="evenodd" d="M9 0H0V9H9V0ZM8 2H1V8H8V2Z" fill="currentColor"/></svg>',
    close:
      '<svg class="tb-glyph" width="8" height="7" viewBox="0 0 8 7" aria-hidden="true">' +
      '<path fill-rule="evenodd" d="M0 0H2V1H3V2H4H5V1H6V0H8V1H7V2H6V3H5V4H6V5H7V6H8V7H6V6H5V5H4H3V6H2V7H0V6H1V5H2V4H3V3H2V2H1V1H0V0Z" ' +
      'fill="currentColor"/></svg>'
  };

  var shell = {};

  /**
   * The two programs that run in their own windows (ticket #61, spec #58):
   * the Action Plan and the Deep-Dive Prompt. `id` is the program Id the
   * Desktop Core keys its Window Record by, `mount` the Section Mount Point
   * name js/results.js resolves through App.resultsMount, and `titleId` the
   * Chrome String the title bar and the taskbar button carry.
   */
  var PROGRAM_FRAMES = [
    { id: 'action-plan', mount: 'action-plan', titleId: 'shell.actionPlanWindow' },
    { id: 'deep-dive', mount: 'deep-dive', titleId: 'shell.deepDiveWindow' }
  ];

  /**
   * The stable host id a program frame's body carries. js/results.js owns
   * the Section Mount Point names (App.resultsMountIds); the shell adopts
   * them so `App.resultsMount('action-plan')` resolves the ACTION PLAN
   * WINDOW's body on the desktop — the presenter renders the section into
   * its own program without knowing the window exists. Without results.js
   * (a bare shell in a headless test) the same ids are derived, and the
   * strings match: the contract is the name, not the file.
   */
  function programBodyId(spec) {
    var ids = app.resultsMountIds || {};
    return ids[spec.mount] || 'results-mount-' + spec.mount;
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
   * The frame chrome — one navy title bar with the three control buttons,
   * plus the corner grip. Ticket #61 generalizes what used to be the one
   * Quiz frame into a factory: every program frame is drawn with the same
   * chrome and the same delegated buttons, so the desktop has ONE window
   * idiom, not a per-program copy.
   *
   *   opts.titleText   title-bar text (a resolved Chrome String)
   *   opts.actions     {minimize, maximize, close} — the delegation target
   *                    for this frame's control buttons (an App.Windows
   *                    controller method bound to the frame's program Id);
   *                    absent, the buttons keep the era default: drawn,
   *                    disabled, inert.
   */
  function buildFrameChrome(doc, strings, opts) {
    var windowEl = createEl(doc, 'div', 'os-window');

    var titleBar = createEl(doc, 'div', 'os-titlebar');
    titleBar.setAttribute('role', 'banner');

    var titleText = createEl(doc, 'span', 'os-titlebar-title', opts.titleText);
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
      btn.innerHTML = TITLE_BAR_GLYPHS[action];
      // Era default until an App.Windows controller refines it via render():
      // landing state draws [×][□] gray (a program that cannot close
      // itself) and live [—]; away from landing all three are live.
      btn.disabled = true;
      on(btn, 'click', function(ev) {
        // Disabled buttons never fire (browser and fakeEl both).
        if (btn.disabled) return;
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (!opts.actions) return;
        var fn = opts.actions[action];
        if (typeof fn === 'function') fn();
      });
      titleButtons.appendChild(btn);
      titleButtonEls[action] = btn;
    });
    titleBar.appendChild(titleButtons);
    windowEl.appendChild(titleBar);

    // Resize grip (ticket #60): the bottom-right corner handle of the
    // positioned window. The shell builds it; the controller owns when it
    // is live (css/shell.css shows it only while .is-windowed is on the
    // frame, and js/windows.js refuses the write on the mobile layout and
    // while maximized). It carries no label: [—][□][×] and the keyboard
    // route stay the accessible controls, so the grip is presentation.
    var resizeGrip = createEl(doc, 'div', 'os-resize-grip');
    resizeGrip.setAttribute('aria-hidden', 'true');
    windowEl.appendChild(resizeGrip);

    return {
      windowEl: windowEl,
      titleBar: titleBar,
      titleText: titleText,
      resizeGrip: resizeGrip,
      titleButtons: titleButtonEls
    };
  }

  /**
   * Build the whole shell around the given `#app` node and return a
   * controller. `deps` supplies the collaborators so the same code runs in
   * the page (real document + App.I18n) and in tests (fakeEl stubs +
   * prepared strings):
   *
   *   deps.doc      - document or fakeEl document (createElement)
   *   deps.appEl    - the existing #app node to re-parent
   *   deps.strings  - resolved Chrome Strings map (shell.* ids → text)
   *   deps.windows  - the Quiz window's control delegation (App.Windows)
   *   deps.programWindows - { 'action-plan': {...}, 'deep-dive': {...} }
   *                   the same three control actions bound to each program
   *                   frame (ticket #61)
   *   deps.onOutsideClick - optional; receives the outside-click handler
   */
  function build(deps) {
    var doc = deps.doc;
    var strings = deps.strings;
    var appEl = deps.appEl;

    // ── Window frame ─────────────────────────────────────────────────────
    var chrome = buildFrameChrome(doc, strings, {
      titleText: strings['shell.windowTitle'],
      actions: deps.windows
    });
    var windowEl = chrome.windowEl;
    var titleBar = chrome.titleBar;
    var titleText = chrome.titleText;
    var resizeGrip = chrome.resizeGrip;
    var titleButtonEls = chrome.titleButtons;

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
    var startLabel = createEl(doc, 'span', 'os-start-label', strings['shell.start']);
    startBtn.appendChild(startLabel);

    // ── Start menu (built once; shown/hidden by class) ───────────────────
    var menu = createEl(doc, 'div', 'os-start-menu');
    menu.setAttribute('role', 'menu');
    var aboutItem = createEl(doc, 'button', 'os-start-menu-item', strings['shell.menuAbout']);
    aboutItem.type = 'button';
    aboutItem.setAttribute('role', 'menuitem');
    menu.appendChild(aboutItem);

    // ── Tray language toggle (tickets #50, #55) ──────────────────────────
    // Two segments name both languages: the active language renders
    // pressed (aria-pressed=true), the other flat. Both segments run one
    // action (deps.trayLang.onClick): js/lang-switch.js swaps the Chrome
    // String dictionary and Bank Variant in place on the splash and
    // answering screens, and keeps the record-and-navigate action for
    // the views it does not swap. Built only when the page declares a
    // data-lang-alt, so a page without an alternate shows no toggle.
    var langToggle = null;
    var langSegments = null;
    if (deps.trayLang) {
      langToggle = createEl(doc, 'div', 'os-lang-toggle');
      langToggle.setAttribute('role', 'group');
      langToggle.setAttribute('aria-label', deps.trayLang.title);
      langSegments = {};
      [['self', deps.trayLang.self, 'true'],
       ['other', deps.trayLang.other, 'false']].forEach(function(spec) {
        var seg = createEl(doc, 'button', 'os-lang-seg', spec[1].label);
        seg.type = 'button';
        seg.setAttribute('aria-pressed', spec[2]);
        if (spec[1].title) seg.setAttribute('title', spec[1].title);
        langToggle.appendChild(seg);
        langSegments[spec[0]] = seg;
      });
    }

    // ── Program button (pressed: this window is the running program) ─────
    var programBtn = createEl(doc, 'button', 'os-program-btn');
    programBtn.type = 'button';
    setAttrs(programBtn, { 'aria-pressed': 'true' });
    var programLabel = createEl(doc, 'span', 'os-program-label', strings['shell.windowTitle']);
    programBtn.appendChild(programLabel);

    // ── The running-windows list (ticket #61) ────────────────────────────
    // One button per program window, in the stable program order: the Quiz
    // button above, then the Action Plan and the Deep-Dive Prompt. The
    // Windows controller shows a button only while its window is RUNNING
    // (a program that has not arrived, or one the Participant put away, has
    // no button), presses the ACTIVE window's button, and wires the click
    // to focus-or-restore. The buttons carry no icon: the era's bar named
    // its programs.
    var programsBar = createEl(doc, 'div', 'os-taskbar-programs');
    programsBar.setAttribute('role', 'toolbar');
    programsBar.setAttribute('aria-label', strings['shell.programs']);
    var programBtns = {};
    var programLabels = { quiz: programLabel };
    PROGRAM_FRAMES.forEach(function(spec) {
      var btn = createEl(doc, 'button', 'os-program-btn os-program-taskbar-btn');
      btn.type = 'button';
      btn.setAttribute('data-os-program', spec.id);
      btn.hidden = true;                 // not running until it arrives
      var label = createEl(doc, 'span', 'os-program-label', strings[spec.titleId]);
      btn.appendChild(label);
      programsBar.appendChild(btn);
      programBtns[spec.id] = btn;
      programLabels[spec.id] = label;
    });

    taskbar.appendChild(startBtn);
    taskbar.appendChild(menu);
    taskbar.appendChild(programBtn);
    taskbar.appendChild(programsBar);
    if (langToggle) taskbar.appendChild(langToggle);

    // ── About window (over a dimmed backdrop) ────────────────────────────
    var aboutBackdrop = createEl(doc, 'div', 'os-about-backdrop');
    var aboutEl = createEl(doc, 'div', 'os-about-window');
    aboutEl.setAttribute('role', 'dialog');
    aboutEl.setAttribute('aria-modal', 'true');
    aboutEl.setAttribute('aria-labelledby', 'os-about-title');

    var aboutTitleBar = createEl(doc, 'div', 'os-titlebar');
    // Named because refreshLang() re-resolves it after an in-place
    // language switch — the unassigned span made every switch throw.
    var aboutTitle = createEl(doc, 'span', 'os-titlebar-title', strings['shell.aboutTitle']);
    aboutTitleBar.appendChild(aboutTitle);
    aboutEl.appendChild(aboutTitleBar);

    var aboutBody = createEl(doc, 'div', 'os-about-body');
    var aboutApp = createEl(doc, 'p', 'os-about-app', strings['shell.windowTitle']);
    aboutBody.appendChild(aboutApp);
    var aboutDesc = createEl(doc, 'p', 'os-about-desc', strings['shell.aboutBody']);
    aboutBody.appendChild(aboutDesc);
    var aboutLink = createEl(doc, 'a', 'os-about-link', strings['shell.aboutLink']);
    aboutLink.href = 'https://owasp.org/Top10/AST10/';
    aboutLink.setAttribute('target', '_blank');
    aboutLink.setAttribute('rel', 'noopener noreferrer');
    aboutBody.appendChild(aboutLink);
    var aboutCredits = createEl(doc, 'p', 'os-about-credits', strings['shell.aboutCredits']);
    aboutBody.appendChild(aboutCredits);
    aboutEl.appendChild(aboutBody);

    var okBtn = createEl(doc, 'button', 'os-about-ok', strings['shell.ok']);
    okBtn.type = 'button';
    aboutEl.appendChild(okBtn);
    aboutBackdrop.appendChild(aboutEl);

    // ── Program frames (ticket #61) ──────────────────────────────────────
    // The Action Plan and the Deep-Dive Prompt each get a real window: the
    // same chrome as the Quiz frame, and a body that IS the section's
    // Mount Point host (the id js/results.js resolves through
    // App.resultsMount rides this element). They start with no Record in
    // the core, so the controller paints them UNSEEN: the Action Plan
    // window does not exist until its content settles, and the Deep-Dive
    // Prompt arrives minimized at the Finish Commit.
    var programFrames = {};
    PROGRAM_FRAMES.forEach(function(spec) {
      var frame = buildFrameChrome(doc, strings, {
        titleText: strings[spec.titleId],
        actions: deps.programWindows && deps.programWindows[spec.id]
      });
      frame.windowEl.setAttribute('data-os-program', spec.id);
      frame.bodyEl = createEl(doc, 'div', 'os-window-body os-program-body');
      frame.bodyEl.id = programBodyId(spec);
      frame.bodyEl.setAttribute('data-results-mount', spec.mount);
      // Inserted before the grip so the grip stays the frame's last child.
      frame.windowEl.insertBefore(frame.bodyEl, frame.resizeGrip);
      programFrames[spec.id] = frame;
    });

    // ── Re-parent into the live document ─────────────────────────────────
    // All the top-level containers are built; now they enter the body and
    // #app moves inside the window frame. The reference node (#app) stays in
    // the body until the frame is inserted, then its move re-parents it in
    // one insert, so it never leaves the document. The program frames enter
    // the desktop AFTER the Quiz frame (the stack order is the core's z, not
    // the DOM order, but the era's tab order follows the paint order).
    var body = doc.body;
    body.insertBefore(windowEl, appEl);
    body.insertBefore(taskbar, appEl);
    PROGRAM_FRAMES.forEach(function(spec) {
      body.insertBefore(programFrames[spec.id].windowEl, taskbar);
    });
    body.appendChild(aboutBackdrop);
    windowEl.insertBefore(appEl, resizeGrip);

    // ── Controller (pure state + thin DOM ops) ───────────────────────────
    var menuOpen = false;
    var aboutOpen = false;

    var controller = {
      windowEl: windowEl,
      titleBar: titleBar,
      resizeGrip: resizeGrip,
      titleButtons: titleButtonEls,
      taskbar: taskbar,
      startBtn: startBtn,
      menu: menu,
      programBtn: programBtn,
      programLabel: programLabel,
      programsBar: programsBar,
      programFrames: programFrames,
      programBtns: programBtns,
      programLabels: programLabels,
      langToggle: langToggle,
      langSegments: langSegments,

      /**
       * Re-resolve every Chrome String on the shell after an in-place
       * language switch (#55): tray labels and pressed states, title bar,
       * Start button, About window. Render-time resolution, exactly as
       * the quiz views rebuild theirs (ADR 0015).
       */
      refreshLang: function() {
        var I18n = app.I18n;
        if (!I18n || I18n.locale === null) return false;
        if (langSegments) {
          langToggle.setAttribute('aria-label', I18n.t('lang.offerTitle'));
          langSegments.self.textContent = I18n.t('lang.selfName');
          langSegments.self.setAttribute('aria-pressed', 'true');
          langSegments.other.textContent = I18n.t('lang.otherShort');
          langSegments.other.setAttribute('aria-pressed', 'false');
          langSegments.other.setAttribute('title', I18n.t('lang.switchLabel'));
        }
        titleText.textContent = I18n.t('shell.windowTitle');
        programLabel.textContent = I18n.t('shell.windowTitle');
        startLabel.textContent = I18n.t('shell.start');
        aboutItem.textContent = I18n.t('shell.menuAbout');
        aboutTitle.textContent = I18n.t('shell.aboutTitle');
        aboutApp.textContent = I18n.t('shell.windowTitle');
        aboutDesc.textContent = I18n.t('shell.aboutBody');
        aboutLink.textContent = I18n.t('shell.aboutLink');
        aboutCredits.textContent = I18n.t('shell.aboutCredits');
        okBtn.textContent = I18n.t('shell.ok');
        // The program windows (#61): their title bars, their taskbar
        // buttons and the bar's own label re-resolve with everything else.
        PROGRAM_FRAMES.forEach(function(spec) {
          var frame = programFrames[spec.id];
          frame.titleText.textContent = I18n.t(spec.titleId);
          if (programLabels[spec.id]) {
            programLabels[spec.id].textContent = I18n.t(spec.titleId);
          }
          TITLE_BUTTON_ACTIONS.forEach(function(action) {
            var btn = frame.titleButtons[action];
            if (btn) btn.setAttribute('aria-label', I18n.t('shell.' + action));
          });
        });
        programsBar.setAttribute('aria-label', I18n.t('shell.programs'));
        TITLE_BUTTON_ACTIONS.forEach(function(action) {
          var btn = titleButtonEls[action];
          if (btn) btn.setAttribute('aria-label', I18n.t('shell.' + action));
        });
        if (controller.soundEntry && typeof controller.soundEntry.paint === 'function') {
          controller.soundEntry.paint();
        }
        return true;
      },
      aboutBackdrop: aboutBackdrop,
      aboutEl: aboutEl,
      okBtn: okBtn,

      isMenuOpen: function() { return menuOpen; },
      isAboutOpen: function() { return aboutOpen; },

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
        PROGRAM_FRAMES.forEach(function(spec) {
          var frame = programFrames[spec.id];
          if (frame.windowEl.parentNode) {
            frame.windowEl.parentNode.removeChild(frame.windowEl);
          }
        });
        if (taskbar.parentNode) taskbar.parentNode.removeChild(taskbar);
        if (aboutBackdrop.parentNode) aboutBackdrop.parentNode.removeChild(aboutBackdrop);
      }
    };

    // ── Wiring ───────────────────────────────────────────────────────────
    on(startBtn, 'click', function() { controller.toggleMenu(); });
    if (langSegments) {
      [langSegments.self, langSegments.other].forEach(function(seg) {
        on(seg, 'click', function() {
          if (typeof deps.trayLang.onClick === 'function') deps.trayLang.onClick();
        });
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
    // Paintable again so controller.refreshLang (#55) can re-resolve the
    // menu label after an in-place language switch.
    entry.paint = paint;
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
    // The three-program desktop (ticket #61).
    'shell.actionPlanWindow', 'shell.deepDiveWindow', 'shell.programs',
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
   * pre-#55 action: `LangPref.setLanguage(data-lang-alt-locale)` first,
   * then a plain navigation to `data-lang-alt`, so the destination page
   * treats the Participant as a chooser and never routes them back
   * (ADR 0018). js/lang-switch.js mirrors this action for the results and
   * review views (instant presence there is #56) and as the fallback
   * when the switch module is absent. Returns true when a switch was
   * performed. Headless-safe.
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

  /** Both tray-toggle segments route through here. */
  function switchLanguage() {
    var doc = global.document;
    if (!doc || !doc.documentElement) return false;
    // #55: swap in place on the splash and answering screens. The switch
    // module keeps the pre-#55 record-and-navigate behavior for results
    // and review; without the module this falls straight back to it.
    if (app.LangSwitch && typeof app.LangSwitch.toggle === 'function') {
      return app.LangSwitch.toggle();
    }
    return recordChoice(doc.documentElement);
  }

  /**
   * Start the shell on the live page. Safe to call once; builds the frame,
   * re-parents #app and wires document-level handlers.
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

    // Language surfaces (ticket #50): the tray toggle shows the page's own
    // language pressed (lang.selfName) and the declared alternate flat
    // (lang.otherName); the group label reuses lang.offerTitle ("Language"),
    // and both segments run the switch action above. Only pages declaring a
    // data-lang-alt get the tray control.
    var langAlt = doc.documentElement.getAttribute('data-lang-alt');
    var langAction = langAlt ? switchLanguage : null;

    var controller = build({
      doc: doc,
      appEl: appEl,
      strings: resolveStrings(I18n, STRING_IDS),
      trayLang: langAction ? {
        title: I18n.t('lang.offerTitle'),
        self: { label: I18n.t('lang.selfName') },
        other: {
          label: I18n.t('lang.otherShort'),
          title: I18n.t('lang.switchLabel')
        },
        onClick: langAction
      } : null,
      windows: win ? {
        minimize: function() { win.minimize(); },
        maximize: function() { win.toggleMaximize(); },
        close: function() {
          // One decision (js/windows.js): on the desktop stage the window
          // is PUT AWAY (core hide(), no dialog — the program keeps its
          // results and the taskbar button brings the window back); a flow
          // stage asks the End Program confirmation first.
          var decision = win.close();
          if (decision !== 'dialog') return;
          // The opener explicitly: requestClose() renders all three
          // controls disabled, which blurs the focused [×] before the
          // dialog could read doc.activeElement.
          openEndProgram(win, controller.titleButtons.close);
        }
      } : null,
      // The Action Plan and the Deep-Dive Prompt frames (ticket #61): the
      // same three controls, bound to that program's Id. Their [×] is
      // always the core's hide() — these windows never own the Session, so
      // there is no End Program dialog for them.
      programWindows: win ? (function() {
        var actions = {};
        PROGRAM_FRAMES.forEach(function(spec) {
          actions[spec.id] = {
            minimize: function() { win.minimize(spec.id); },
            maximize: function() { win.toggleMaximize(spec.id); },
            close: function() { win.closeProgram(spec.id); }
          };
        });
        return actions;
      })() : null,
      onOutsideClick: function(handler) {
        doc.addEventListener('click', handler);
      }
    });
    appEl.setAttribute('data-shell-mounted', 'true');
    if (win) {
      // Landing rules first: [×][□] gray, [—] live; the program-button
      // click handler (restore when minimized OR hidden) and the title-bar
      // drag / corner-grip resize handles are wired in there too.
      win.attach({
        windowEl: controller.windowEl,
        titleBar: controller.titleBar,
        resizeGrip: controller.resizeGrip,
        programBtn: controller.programBtn,
        buttons: controller.titleButtons
      });
      // Each program frame paints from its own Record: no Record, no
      // window. The taskbar button is the way to focus or restore it.
      PROGRAM_FRAMES.forEach(function(spec) {
        var frame = controller.programFrames[spec.id];
        win.attachProgram(spec.id, {
          windowEl: frame.windowEl,
          titleBar: frame.titleBar,
          bodyEl: frame.bodyEl,
          resizeGrip: frame.resizeGrip,
          buttons: frame.titleButtons,
          taskbarBtn: controller.programBtns[spec.id]
        });
      });
      app.Windows.controller = win;
    }

    // Escape closes the About window or the Start menu; focus returns to
    // the Start button on menu close.
    doc.addEventListener('keydown', function(ev) {
      controller.handleKeydown(ev.key);
    });

    app.Shell.controller = controller;

    // System sounds (ticket #41): inject js/sound.js (no HTML tag for it),
    // then mount the Start-menu toggle as soon as the module lands.
    withSoundModule(function() { attachSoundEntry(controller); });

    return controller;
  }

  shell.build = build;
  shell.buildFrameChrome = buildFrameChrome;
  shell.PROGRAM_FRAMES = PROGRAM_FRAMES;
  shell.programBodyId = programBodyId;
  shell.start = start;
  shell.recordChoice = recordChoice;
  shell.switchLanguage = switchLanguage;
  shell.attachSoundEntry = attachSoundEntry;
  shell.withSoundModule = withSoundModule;
  shell.openEndProgram = openEndProgram;
  shell.toggleMenu = toggleMenu;
  shell.closeMenu = closeMenu;
  shell.closeAbout = closeAbout;
  shell.resolveStrings = resolveStrings;
  shell.STRING_IDS = STRING_IDS;
  shell.TITLE_BAR_GLYPHS = TITLE_BAR_GLYPHS;

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
