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
    'lang.switchLabel': 'Switch to Chinese',
    'lang.offerTitle': 'Language',
    'lang.selfName': 'EN',

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
    'landing.body': '{count} questions about the skills you install and the agents you run. Answer honestly; the results are for you.',
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

    /* ── Results view ── */
    'results.radarTitle': 'Risk Radar',
    'results.barsTitle': 'Blind-Spot Bars',
    'results.actionPlanTitle': 'Action Plan',
    'results.deepDiveTitle': 'Deep-Dive Prompt',
    'results.planLoading': 'Crafting your action plan…',
    'results.narrativeSummary': 'Why these actions? Read the analysis',
    'results.deepDiveHeading': 'Want to go deeper?',
    'results.deepDiveSub': 'Copy this into your agent chat: it turns your agent into a private security tutor for your exact blind spots.',
    'results.showPrompt': 'Show Deep-Dive Prompt',
    'results.copy': 'Copy to Clipboard',
    'results.copied': 'Copied!',
    'results.copyFailed': 'Copy failed',
    'results.downloadPng': 'Download PNG',
    'results.share': 'Share Results',
    'results.shareTitle': 'AST Quiz Results',
    'results.shareText': 'I scored {percentage}% as {emoji} {name} on the {app}.',
    'results.retake': 'Retake Assessment',
    'results.reviewBtn': 'Review your answers →',
    'results.reviewTitle': 'Review Your Answers',
    'results.reviewBack': '← Back to results',

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
    'shell.aboutTitle': 'About Agent Security Awareness Quiz',
    'shell.aboutBody': 'A security-awareness assessment for people who ' +
      'build and run AI agents, with scenarios drawn from the OWASP Top 10.',
    'shell.aboutLink': 'OWASP Top 10 for Agentic Applications',
    'shell.aboutCredits': 'Chrome typeface: W95FA by Alina Sava ' +
      '(SIL Open Font License 1.1).',
    'shell.ok': 'OK',

    /* ── End Program dialog (ticket #43) ──
       Wording mirrors the Win95 "End Program" confirmation: the title bar
       names the program being ended, the message asks the single question.
       The reusable primitive (App.Windows.openSystemDialog) resolves these
       ids through I18n.t() at open time; tickets #44 and #47 reuse the
       primitive with their own ids. */
    'windows.endProgramTitle': 'End Program - Agent Security Awareness Quiz',
    'windows.endProgramMessage': 'Are you sure you want to end this program?',
    'windows.yes': 'Yes',
    'windows.no': 'No',

    /* ── Start-menu sound toggle (ticket #41) ── */
    'sound.menuItem': 'Sound',

    /* ── Wizard Row (ticket #40, ADR 0020) ── */
    'wizard.back': '< Back',
    'wizard.next': 'Next >',
    'wizard.finish': 'Finish',

    /* ── Results Title Card (ticket #45) ──
       Section headings and panel copy resolve from the results.* ids above;
       these are the retro additions: the Overall caption and the drawn,
       DISABLED [—][□][×] aria-labels of the Title Card title bar. */
    'results.overall': 'Overall',
    'results.titleBtnMin': 'Minimize',
    'results.titleBtnMax': 'Maximize',
    'results.titleBtnClose': 'Close',

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

    /* ── Deterministic Fallback prose ── */
    'fallback.behavior.none': 'display gaps in your security posture',
    'fallback.behavior.single': 'choose {quote}, which indicates limited security awareness',
    'fallback.behavior.multiple': 'choose options like {list}, and {last}, all of which reflect limited security awareness',
    'fallback.quoteOpen': '"',
    'fallback.quoteClose': '"',
    'fallback.ellipsis': '...',
    'fallback.insight.generic': 'Applying OWASP best practices for {risk} would significantly reduce your exposure.',
    'fallback.narrative.item': '{risk} is your weakest area at {percentage}%. Among the questions mapped to this risk, you tended to {behavior}. {insight}',
    'fallback.narrative.clear': 'Your overall score is {percentage}%. All AST risk areas are at or above 70%, so no critical gaps were identified.',
    'fallback.action.title': 'Improve {risk}',
    'fallback.action.description.generic': 'Review OWASP Agentic Skills guidance for {risk} and apply the recommended mitigations to reduce your exposure.',
    'fallback.action.description.owaspRef': 'Refer to the OWASP Agentic Skills Top 10 for detailed checklists and remediation steps.',

    /* ── Deep-Dive Prompt ── */
    'prompt.budget': 3000,
    'prompt.titleFallback': 'Unknown',
    'prompt.titleFallbackEmoji': '?',
    'prompt.framing': 'I took an agent-skill security self-assessment based on the OWASP Agentic Skills Top 10. Please act as my security educator and help me improve my habits, one area at a time.',
    'prompt.sessionRules': '## How to Teach Me\n- Ground your explanations in the linked OWASP pages\n- Adapt depth to my level (I\'m learning)\n- Cover one area at a time\n- End each area with one concrete habit I can adopt',
    'prompt.profile.heading': '## My Profile',
    'prompt.profile.title': 'Title: {title}',
    'prompt.profile.overall': 'Overall: {percentage}%',
    'prompt.profile.astScores': 'Per-AST Scores:',
    'prompt.weakest.heading': '## Weakest Areas',
    'prompt.item.scenario': 'Scenario: {text}',
    'prompt.item.chose': 'I chose: {text}',
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
    'llm.participant.title': 'Title: {title}',
    'llm.participant.overall': 'Overall: {percentage}%',
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
    'llm.titleFallback': 'Unknown',
    'llm.titleFallbackEmoji': '?',

    /* ── Severity labels used in the LLM prompt ── */
    'severity.critical': 'critical',
    'severity.high': 'high',
    'severity.medium': 'medium'
  });

})(globalThis);
