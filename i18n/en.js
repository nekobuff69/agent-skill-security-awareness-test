(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * English Chrome String dictionary.
   *
   * These are the site's interface strings, not Question Bank content —
   * scenarios, Options, Feedback, Best Practices and Phase headings arrive in
   * the Bank Variant the page loads.
   */
  app.I18n.register('en', {

    /* ── Document ── */
    'doc.title': 'Agent Security Awareness Quiz',

    /* ── Language ── */
    'lang.name': 'English',
    'lang.otherName': '中文',
    'lang.otherShort': '中文',
    'lang.switchLabel': 'Switch to Chinese',
    'lang.offerTitle': 'Language',
    'lang.switchUnavailable': 'Switching to {language} isn\'t available right now.',

    /* ── Loading & errors ── */
    'loading.bank': 'Loading…',
    'error.loadBank': 'Failed to load question bank: {message}',
    'error.retry': 'Retry',

    /* ── Boot splash (issue #39) ──
       The splash reuses the landing title as its app-name string so the boot
       screen always names the program that follows it. */
    'boot.status': 'Starting application…',

    /* ── Landing view (welcome splash, issue #53) ── */
    'landing.headline1': 'Be Informed.',
    'landing.headline2': 'Be Aware.',
    'landing.titleFallback': 'Agent Security Awareness Quiz',
    'landing.body': '{count} questions about the skills you install and the agents you run. Answer honestly; your answers shape the personalized plan.',
    'landing.meta': '{count} questions · {time}',
    'landing.metaCountFallback': '20',
    'landing.timeFallback': '8-12 minutes',
    'landing.start': 'Start',

    /* ── Quiz Chrome & Question Card ── */
    'quiz.phaseChip': 'Phase {number} · {title}',
    'quiz.questionChip': 'Q{number}',
    'quiz.labelScenario': 'Scenario',
    'quiz.labelQuestion': 'Question',
    'quiz.previous': '← Previous',
    'quiz.bankChanged': 'The question bank has changed. Starting fresh.',

    /* ── Results view ──
       No grade anywhere: the results identity is the attention type, and
       the map/bars show where attention lives — a distribution, never a
       ranking. */
    'results.radarTitle': 'Attention Map',
    'results.radarNote': 'The shape is yours alone — it shows where your attention lives, not how you compare.',
    'results.barsTitle': 'Attention Distribution',
    'results.barsNote': 'A distribution, not a ranking — a longer bar only means more of your attention lives there.',
    'results.actionPlanTitle': 'Action Plan',
    'results.deepDiveTitle': 'Deep-Dive Prompt',
    'results.planLoading': 'Crafting your action plan…',
    'results.narrativeSummary': 'Why these actions? Read the analysis',
    'results.deepDiveSub': 'Copy this into your agent chat: it turns your agent into a private security tutor for your exact blind spots.',
    'results.copy': 'Copy to Clipboard',
    'results.copied': 'Copied!',
    'results.copyFailed': 'Copy failed',
    'results.downloadPng': 'Download PNG',
    'results.share': 'Share Results',
    'results.shareTitle': 'Agent Security Awareness Quiz',
    'results.shareText': 'My AI-safety attention type is {emoji} {code} — {name}. Every map is a little different. Find yours on the {app}.',
    'results.retake': 'Retake Assessment',
    'results.reviewBtn': 'Review your answers →',
    'results.reviewTitle': 'Review Your Answers',
    'results.reviewBack': '← Back to results',

    /* ── Results type card ──
       The window's first body panel: the participant's attention type,
       with the two axes that define it. All type and axis names are
       Chrome Strings; the classifier owns only the stable ids. */
    'results.typeCaption': 'Your attention type',
    'results.attentionStrong': 'Your attention mostly lives here',
    'results.attentionWeak': 'It visits least here',
    'results.typeBlindList': 'Specific areas to look at first: {names}',

    /* ── Quiz window menu bar (ticket #65) ──
       The bar owns the four commands above (Download PNG, Share, Review
       answers, Retake) at the head of the Quiz window's body, so the body
       itself carries only the score header, the Risk Radar and the
       Blind-Spot Bars. This is the bar's accessible name; the command
       labels are the results.* strings they always were. */
    'results.menuBar': 'Quiz window menu',

    /* ── Review ── */
    'review.feedbackLabel': 'Feedback: ',
    'review.bestPracticeLabel': 'Best Practice: ',
    'review.viewOnOwasp': 'View on OWASP ↗',

    /* ── Desktop shell (ticket #38) ──
       Window frame, taskbar, Start menu and the About window. */
    'shell.windowTitle': 'Agent Security Awareness Quiz',
    'shell.minimize': 'Minimize',
    'shell.maximize': 'Maximize',
    'shell.close': 'Close',
    'shell.start': 'Start',
    'shell.menuAbout': 'About…',
    'shell.menuQuit': 'End Program',
    'shell.aboutTitle': 'About Agent Security Awareness Quiz',
    'shell.aboutBody': 'A security-awareness assessment for people who ' +
      'build and run AI agents, with scenarios drawn from the OWASP Agentic Skills Top 10.',
    'shell.aboutLink': 'OWASP Agentic Skills Top 10',
    'shell.aboutCredits': 'Chrome typeface: W95FA by Alina Sava ' +
      '(SIL Open Font License 1.1).',
    'shell.ok': 'OK',

    /* ── Program windows (ticket #61) ──
       The Action Plan and the Deep-Dive Prompt are programs of their own:
       these are their title bars and taskbar buttons. 'shell.programs' is
       the accessible name of the running-windows list in the taskbar. */
    'shell.actionPlanWindow': 'Action Plan',
    'shell.deepDiveWindow': 'Deep-Dive Prompt',
    'shell.programs': 'Programs',

    /* ── End Program dialog (ticket #43) ──
       Wording mirrors the Win95 "End Program" confirmation: the title bar
       names the program being ended, the message asks the single question.
       The reusable primitive (App.Windows.openSystemDialog) resolves these
       ids through I18n.t() at open time; tickets #44 and #47 reuse the
       primitive with their own ids. */
    'windows.endProgramTitle': 'End Program - Agent Security Awareness Quiz',
    'windows.endProgramMessage': 'Are you sure you want to end this program?',
    'windows.retakeTitle': 'Retake - Agent Security Awareness Quiz',
    'windows.retakeMessage': 'Retake clears this run and the desktop. All your answers will be lost. Start over?',
    'windows.yes': 'Yes',
    'windows.no': 'No',

    /* ── Start-menu sound toggle (ticket #41) ── */
    'sound.menuItem': 'Sound',

    /* ── Minesweeper easter egg (ticket #81, spec #79) ──
       The Start menu's game entry and every label of the game dialog:
       window title, the LED counters' and board's accessible names, the
       input hint for assistive tech, and the smiley button's name (it
       doubles as the restart control). */
    'mines.menuItem': 'Minesweeper…',
    'mines.windowTitle': 'Minesweeper',
    'mines.counterLabel': 'Mines remaining',
    'mines.timerLabel': 'Timer',
    'mines.boardLabel': 'Minefield',
    'mines.boardHint': 'Click to reveal a square. Right-click or long-press to flag one.',
    'mines.smileyRestart': 'New game',
    // Per-cell accessible state (each gridcell announces where it sits and
    // what it shows, resolved in paintCell).
    'mines.cellPosition': 'Row {row}, column {column}',
    'mines.cellUnrevealed': 'unrevealed',
    'mines.cellFlagged': 'flagged',
    'mines.cellClear': 'no adjacent mines',
    'mines.cellAdjacent': '{n} adjacent mines',
    'mines.cellMine': 'mine',
    'mines.cellDetonated': 'detonated mine',
    'mines.cellWrongFlag': 'wrongly flagged',

    /* ── Wizard Row (ticket #40, ADR 0020) ── */
    'wizard.back': '< Back',
    'wizard.next': 'Next >',
    'wizard.finish': 'Finish',

    /* ── Results header ──
       The retro addition to the window's first body panel now carries the
       type caption instead of an Overall caption — there is no overall
       number to show. */

    /* ── AST Risk names (ADR-0013: ids and severities stay in js/ast.js) ── */
    'ast.AST01': 'Malicious Skills',
    'ast.AST02': 'Supply Chain Compromise',
    'ast.AST03': 'Over-Privileged Skills',
    'ast.AST04': 'Insecure Metadata',
    'ast.AST05': 'Untrusted External Instructions',
    'ast.AST06': 'Weak Isolation',
    'ast.AST07': 'Update Drift',
    'ast.AST08': 'Poor Scanning',
    'ast.AST09': 'No Governance',
    'ast.AST10': 'Cross-Platform Reuse',

    /* ── Attention Axes (registry: js/ast.js) ──
       Display names, one-line descriptions, single-letter MBTI-style
       codes and per-axis risk notes for the three behavioral families
       the ten AST Risks group into. Risk notes state what OWASP rates
       the family's risks — factually, per axis, never comparatively:
       a ranking of types would rebuild the hierarchy the type system
       removed. */
    'axis.INTAKE': 'Input & Trust',
    'axis.INTAKE.code': 'I',
    'axis.INTAKE.desc': 'what you let in — skills, sources, instructions',
    'axis.INTAKE.risk': 'OWASP rates two of its risks — Malicious Skills and Supply Chain Compromise — critical: inattention here carries the highest stakes.',
    'axis.EXPOSURE': 'Permissions & Exposure',
    'axis.EXPOSURE.code': 'E',
    'axis.EXPOSURE.desc': 'what you give out — permissions, metadata, boundaries',
    'axis.EXPOSURE.risk': 'All three of its risks are rated high by OWASP: leaks tend to happen quietly and surface late.',
    'axis.UPKEEP': 'Upkeep & Renewal',
    'axis.UPKEEP.code': 'U',
    'axis.UPKEEP.desc': 'how you keep up — updates, scans, governance',
    'axis.UPKEEP.risk': 'All four of its risks are rated medium by OWASP: not urgent, but neglect here slowly widens every gap on the other two axes.',

    /* ── Attention Types ──
       Six types, one per (least-attended axis, most-attended axis)
       pairing. The code is the MBTI-style three-letter ordering of the
       axes from most- to least-attended (I = Input & Trust, E =
       Permissions & Exposure, U = Upkeep & Renewal); the nickname keeps
       it memorable. No type ranks above another: every motto describes
       where attention lives and where it rarely goes, in the same
       affirming register. Classifier owns the ids; dictionaries own the
       words. */
    'type.T1.name': 'The Hospitable Gatekeeper',
    'type.T1.code': 'EUI',
    'type.T1.emoji': '🚪',
    'type.T1.motto': 'You guard well what stays yours — permissions, data, boundaries. At the front door, most arrivals get a nod.',
    'type.T2.name': 'The Curious Curator',
    'type.T2.code': 'UEI',
    'type.T2.emoji': '🧺',
    'type.T2.motto': 'Your collection is well kept and always current. New arrivals are welcomed on instinct first.',
    'type.T3.name': 'The Candid Courier',
    'type.T3.code': 'IUE',
    'type.T3.emoji': '📮',
    'type.T3.motto': 'Nothing gets past your front door unexamined — and inside, doors and drawers stand open.',
    'type.T4.name': 'The Steady Steward',
    'type.T4.code': 'UIE',
    'type.T4.emoji': '🗝️',
    'type.T4.motto': 'Everything runs on schedule — updates, scans, routines. The keys themselves rarely get a second look.',
    'type.T5.name': 'The Sharp Lookout',
    'type.T5.code': 'IEU',
    'type.T5.emoji': '🔭',
    'type.T5.motto': 'You read what arrives with a careful eye. Long-term upkeep is where your attention rarely wanders.',
    'type.T6.name': 'The Quiet Archivist',
    'type.T6.code': 'EIU',
    'type.T6.emoji': '🗄️',
    'type.T6.motto': 'You hold your boundaries well. The everyday maintenance behind them gets left for another day.',

    /* ── Action Plan titles — curated per-risk labels, deliberately
       paraphrased so a title never repeats its description's opening ── */
    'action.AST01': 'Verify the publisher first',
    'action.AST02': 'Check the whole dependency tree',
    'action.AST03': 'Trim permissions to the stated function',
    'action.AST04': 'Judge every skill by the same bar',
    'action.AST05': 'Don\'t let skills fetch their own instructions',
    'action.AST06': 'Know the attack history before you install',
    'action.AST07': 'Verify every update before it lands',
    'action.AST08': 'Never trust one scan',
    'action.AST09': 'Log every skill you install',
    'action.AST10': 'Re-check security after every port',

    /* ── Deterministic Fallback prose ──
       No percentages: the objective anchor in the narrative is a count
       of situations, not a score. */
    'fallback.behavior.none': 'No single question stands out here — the gap spread across several partly-safe choices.',
    'fallback.behavior.single': 'On the question that matters most here, you chose {quote} — the option that lands exactly where attackers aim first.',
    'fallback.behavior.multiple': 'The same gap showed up more than once: you chose {list}, and {last}. When one instinct misfires in different situations, that is the habit worth fixing first.',
    'fallback.quoteOpen': '"',
    'fallback.quoteClose': '"',
    'fallback.ellipsis': '...',
    'fallback.narrative.item': '{risk} is the area your attention visited least — in {count} of the {total} situations touching it, the choice landed on the risky side. {behavior}',
    'fallback.narrative.others': '{risks} also drew less attention. The action list covers what to do there — none of them had a single standout miss.',
    'fallback.listSep': ', ',
    'fallback.narrative.clear': 'No area stands out as under-attended — your habits cover the whole map. Keep them.',
    'fallback.action.description.generic': 'Review the OWASP guidance for {risk} and work the mitigations into your routine.',

    /* ── Deep-Dive Prompt ── */
    'prompt.budget': 3000,
    'prompt.typeFallback': 'Undetermined',
    'prompt.framing': 'I took an agent-skill security self-assessment based on the OWASP Agentic Skills Top 10. Please act as my security educator and help me improve my habits, one area at a time.',
    'prompt.sessionRules': '## How to Teach Me\n- Ground your explanations in the linked OWASP pages\n- For each area: first point out what my chosen answer gets wrong, then give me one concrete habit I can adopt\n- Adapt depth to my level (I\'m learning)\n- Cover one area at a time',
    'prompt.profile.heading': '## My Profile',
    'prompt.profile.type': 'Attention type: {type}',
    'prompt.profile.axes': 'Attention axes:',
    'prompt.profile.axisLine': '- {axis}: {earned} of {possible}',
    'prompt.profile.astScores': 'Per-risk detail:',
    'prompt.profile.astLine': '- {id}: {earned} of {possible}',
    'prompt.weakest.heading': '## Weakest Areas',
    'prompt.item.scenario': 'Scenario: {text}',
    'prompt.item.chose': 'I chose: {text}',
    'prompt.item.better': 'A stronger answer: {text} — {reason}',
    'prompt.item.bestPractice': 'Best Practice: {text}',
    'prompt.item.owasp': 'OWASP: {url}',

    /* ── LLM Path prompt ── */
    // Measured, not guessed: a full normal report (5 Grounding Excerpts in
    // full + 5 Weakest Questions) assembles to ~20.6k characters. 12000 keeps
    // every Grounding Excerpt while trimming each field to a readable length,
    // so the ladder only sheds material on a pathological report — which is
    // what a guardrail is for.
    'llm.budget': 12000,
    'llm.system': '## System Instruction\n\nYou are a security advisor analyzing a user\'s self-assessment results\non AI agent skill security, based on the OWASP Agentic Skills Top 10.\n\nYour task: generate a personalized risk assessment and action plan.\n\nRULES:\n\n- Every factual claim MUST trace to the provided OWASP source material\n- Do NOT invent attack scenarios or statistics not in the source\n- Do NOT fabricate OWASP recommendations — use only what\'s provided\n- If the source material doesn\'t cover a specific situation, say so\n- Write for a non-technical audience — plain language, no jargon\n- Tone: helpful advisor, not alarmist or condescending\n{languageRule}\n',
    'llm.languageRule': '- Write the Narrative and Actions in {language}.',
    'llm.participant.heading': '## Participant Data',
    'llm.participant.type': 'Attention type: {type}',
    'llm.astScores.heading': 'Per-AST Scores:',
    'llm.astLine': '- {id} ({name}, {severity}): {earned}/{possible} ({percentage}%)',
    'llm.weakest.heading': '\nWeakest Questions (lowest performance):\n',
    'llm.weakestLine': '- {id}: Chose "{selected}" (score: {score}/3)',
    'llm.weakestScenario': '  Scenario: {text}',
    'llm.weakestBestPractice': '  Best Practice: {text}',
    'llm.weakestOwasp': '  OWASP Source: {url}',
    'llm.source.heading': '\n## OWASP Source Material\n\n',
    'llm.source.section': '### {id}\n\n',
    'llm.source.evidence': '**Evidence:**\n{text}\n\n',
    'llm.source.mitigations': '**Mitigations:**\n{text}\n\n',
    'llm.excerpt.truncated': '[truncated for the prompt budget]',
    'llm.outputFormat': '## Output Format\n\nReturn ONLY a JSON object, no markdown fences, no commentary:\n\n{\n  "narrative": "2-4 sentence plain-language analysis of the Participant\'s blind spots,\n    referencing their own choices and the OWASP evidence above",\n  "actions": [\n    {\n      "priority": 1,\n      "title": "short imperative action title",\n      "description": "1-2 sentences: what to do and why, grounded in the source material",\n      "ast_source": "AST01"\n    }\n  ]\n}\n\nRules: 3-5 actions, most important first (priority 1 = first). Each action must be\ngrounded in the provided material: its ast_source must be an AST ID covered by the\nOWASP Source Material or Weakest Questions sections, and its description must trace\nto that material.',
    'llm.prompt.truncated': '[source material clipped to fit the prompt budget]',
    'llm.typeFallback': 'Undetermined',

    /* ── Severity labels used in the LLM prompt ── */
    'severity.critical': 'critical',
    'severity.high': 'high',
    'severity.medium': 'medium'
  });

})(globalThis);
