(function(global) {
  'use strict';

  var app = global.App || {};
  global.App = app;

  /**
   * 简体中文 Chrome String 词典。
   *
   * 与 en.js 的 id 集合完全一致：任何一侧缺项，t() 都会抛错，
   * 不会静默回落到英文。
   *
   * 题库内容（情境、选项、反馈、最佳实践、阶段标题）不在这里——
   * 它随页面加载的 Bank Variant 一同到达。
   */
  app.I18n.register('zh', {

    /* ── 文档 ── */
    'doc.title': '智能体安全意识测评',

    /* ── 语言 ── */
    'lang.name': '简体中文',
    'lang.otherName': 'English',
    'lang.switchLabel': '切换到英文',
    'lang.offerQuestion': '要用{language}阅读吗？',
    'lang.offerAccept': '继续',
    'lang.offerDismiss': '暂不',
    'lang.offerTitle': '语言',
    'lang.selfName': '中文',

    /* ── 加载与错误 ── */
    'loading.bank': '加载中……',
    'error.loadBank': '题库加载失败：{message}',
    'error.retry': '重试',

    /* ── 启动闪屏（issue #39） ──
       闪屏复用落地页标题作为应用名，保证开机画面与随后的程序同名。 */
    'boot.status': '正在启动程序……',

    /* ── 落地页 ── */
    'landing.titleFallback': '智能体安全意识测评',
    'landing.subtitleFallback': '',
    'landing.meta': '{count} 道问题，约 {time}',
    'landing.metaCountFallback': '20',
    'landing.timeFallback': '8-12 分钟',
    'landing.start': '开始测评',

    /* ── 答题区与题卡 ── */
    'quiz.phaseChip': '第 {number} 阶段 · {title}',
    'quiz.questionChip': '第 {number} 题',
    'quiz.labelScenario': '情境',
    'quiz.labelQuestion': '问题',
    'quiz.previous': '← 上一题',
    'quiz.bankChanged': '题库已更新，已重新开始。',

    /* ── 结果页 ── */
    'results.radarTitle': '风险雷达图',
    'results.barsTitle': '盲区排行',
    'results.actionPlanTitle': '行动计划',
    'results.deepDiveTitle': '深度提问',
    'results.planLoading': '正在生成你的行动计划……',
    'results.narrativeSummary': '为什么是这些行动？展开分析',
    'results.deepDiveHeading': '想再深入一点？',
    'results.deepDiveSub': '把它粘贴到你的智能体对话里：它会针对你的盲区，把你的智能体变成一个私人的安全导师。',
    'results.showPrompt': '查看深度提问',
    'results.copy': '复制到剪贴板',
    'results.copied': '已复制！',
    'results.copyFailed': '复制失败',
    'results.downloadPng': '下载 PNG',
    'results.share': '分享结果',
    'results.shareTitle': 'AST 测评结果',
    'results.shareText': '我在{app}里拿到 {percentage} 分，成长称号是 {emoji} {name}。',
    'results.retake': '重新测评',
    'results.reviewBtn': '回顾我的作答 →',
    'results.reviewTitle': '回顾你的作答',
    'results.reviewBack': '← 返回结果',

    /* ── 回顾 ── */
    'review.feedbackLabel': '反馈：',
    'review.bestPracticeLabel': '最佳实践：',
    'review.viewOnOwasp': '在 OWASP 查看 ↗',

    /* ── 桌面外壳（ticket #38） ──
       窗口框架、任务栏、开始菜单与关于窗口。 */
    'shell.windowTitle': '智能体安全意识测评',
    'shell.minimize': '最小化',
    'shell.maximize': '最大化',
    'shell.close': '关闭',
    'shell.start': '开始',
    'shell.menuAbout': '关于……',
    'shell.aboutTitle': '关于智能体安全意识测评',
    'shell.aboutBody': '面向构建和运营智能体人群的安全意识测评，' +
      '情境取材于 OWASP Top 10。',
    'shell.aboutLink': 'OWASP 智能体应用十大风险（英文）',
    'shell.aboutCredits': '界面字体：W95FA（作者 Alina Sava，' +
      'SIL OFL 1.1 许可）。',
    'shell.ok': '确定',

    /* ── 结束程序对话框（ticket #43） ──
       措辞对应 Win95 的“结束程序”确认框：标题栏点名被结束的程序，
       正文只问一个问题。可复用原语 App.Windows.openSystemDialog 在打开时
       通过 I18n.t() 解析这些 id；#44 与 #47 复用该原语时传入各自的 id。 */
    'windows.endProgramTitle': '结束程序 - 智能体安全意识测评',
    'windows.endProgramMessage': '确定要结束这个程序吗？',
    'windows.yes': '是',
    'windows.no': '否',

    /* ── 开始菜单声音开关（ticket #41） ── */
    'sound.menuItem': '声音',

    /* ── 向导按钮行（ticket #40，ADR 0020） ── */
    'wizard.back': '< 上一步',
    'wizard.next': '下一步 >',
    'wizard.finish': '完成',

    /* ── 结果页标题卡（ticket #45） ──
       标题与面板文案由上面的 results.* id 提供；这里是复古皮肤的新增：
       总分小标题，以及标题卡标题栏上 [—][□][×] 的 aria-label。 */
    'results.overall': '总分',
    'results.titleBtnMin': '最小化',
    'results.titleBtnMax': '最大化',
    'results.titleBtnClose': '关闭',

    /* ── AST 风险名称（术语表定稿） ── */
    'ast.AST01': '恶意技能',
    'ast.AST02': '供应链入侵',
    'ast.AST03': '权限过度的技能',
    'ast.AST04': '不安全的元数据',
    'ast.AST05': '不可信的外部指令',
    'ast.AST06': '隔离不严',
    'ast.AST07': '更新漂移',
    'ast.AST08': '扫描不力',
    'ast.AST09': '缺乏治理',
    'ast.AST10': '跨平台复用',

    /* ── 确定性兜底的文案 ── */
    'fallback.behavior.none': '在安全实践上暴露明显短板',
    'fallback.behavior.single': '选择了{quote}，说明安全意识有限',
    'fallback.behavior.multiple': '选择了{list}，以及{last}，都反映出安全意识有限',
    'fallback.quoteOpen': '「',
    'fallback.quoteClose': '」',
    'fallback.ellipsis': '……',
    'fallback.insight.generic': '为「{risk}」落实 OWASP 最佳实践，可以显著降低你的风险敞口。',
    'fallback.narrative.item': '{risk} 是你最薄弱的一项，得分 {percentage}%。在映射到这项风险的题目里，你倾向于{behavior}。{insight}',
    'fallback.narrative.clear': '你的总分为 {percentage}%。所有 AST 风险区域都在 70% 以上，没有发现明显缺口。',
    'fallback.action.title': '改进{risk}',
    'fallback.action.description.generic': '查阅 OWASP Agentic Skills 中关于「{risk}」的指导，并落实推荐的缓解措施，降低你的风险敞口。',
    'fallback.action.description.owaspRef': '参考 OWASP Agentic Skills Top 10，其中给出了详细的检查清单和修复步骤。',

    /* ── 深度提问 ── */
    'prompt.budget': 3000,
    'prompt.titleFallback': '未知',
    'prompt.titleFallbackEmoji': '?',
    'prompt.framing': '我参加了一份基于 OWASP Agentic Skills Top 10 的智能体技能安全自评。请充当我的安全导师，帮我一个领域一个领域地改进习惯。',
    'prompt.sessionRules': '## 如何教我\n- 所有解释都要落在所链接的 OWASP 页面上\n- 根据我的水平调整深度（我还在学）\n- 一次只讲一个领域\n- 每个领域最后给我一个可以立刻养成的具体习惯',
    'prompt.profile.heading': '## 我的情况',
    'prompt.profile.title': '成长称号：{title}',
    'prompt.profile.overall': '总分：{percentage}%',
    'prompt.profile.astScores': '各 AST 得分：',
    'prompt.weakest.heading': '## 最薄弱的地方',
    'prompt.item.scenario': '情境：{text}',
    'prompt.item.chose': '我的选择：{text}',
    'prompt.item.bestPractice': '最佳实践：{text}',
    'prompt.item.owasp': 'OWASP：{url}',

    /* ── LLM 路径提示词 ── */
    // 与英文侧同一个实测值：正常报告会裁剪字段长度，但五段 OWASP 素材全部保留。
    'llm.budget': 12000,
    'llm.system': '## 系统指令\n\n你在分析一份关于 AI 智能体技能安全的用户自评结果，\n依据是 OWASP Agentic Skills Top 10。\n\n你的任务：生成一份个性化的风险评估与行动计划。\n\n规则：\n\n- 每一条事实性陈述都必须能追溯到给出的 OWASP 素材\n- 不要编造素材中没有的攻击场景或统计数据\n- 不要伪造 OWASP 建议——只用给出的内容\n- 如果素材没有覆盖某个具体情形，就直说没有\n- 面向非技术读者——用大白话，不用行话\n- 语气：有帮助的顾问，不制造恐慌，也不居高临下\n{languageRule}\n',
    'llm.languageRule': '- 用 {language} 撰写 Narrative 与 actions；OWASP 证据引用保留英文原文；凡引用 OWASP 素材之处，同时给出中文释义与英文原文。',
    'llm.participant.heading': '## 参与者数据',
    'llm.participant.title': '成长称号：{title}',
    'llm.participant.overall': '总分：{percentage}%',
    'llm.astScores.heading': '各 AST 得分：',
    'llm.astLine': '- {id}（{name}，{severity}）：{earned}/{possible}（{percentage}%）',
    'llm.weakest.heading': '\n表现最弱的题目（得分最低）：\n',
    'llm.weakestLine': '- {id}：选择了「{selected}」（得分：{score}/3）',
    'llm.weakestScenario': '  情境：{text}',
    'llm.weakestBestPractice': '  最佳实践：{text}',
    'llm.weakestOwasp': '  OWASP 来源：{url}',
    'llm.source.heading': '\n## OWASP 素材\n\n',
    'llm.source.section': '### {id}\n\n',
    'llm.source.evidence': '**证据：**\n{text}\n\n',
    'llm.source.mitigations': '**缓解措施：**\n{text}\n\n',
    'llm.excerpt.truncated': '（为控制提示词长度已截断）',
    'llm.outputFormat': '## 输出格式\n\n只返回一个 JSON 对象，不要 markdown 代码块，不要任何说明文字：\n\n{\n  "narrative": "用 2-4 句话、通俗地分析参与者的盲区，\n    结合他自己的选择与上面的 OWASP 证据",\n  "actions": [\n    {\n      "priority": 1,\n      "title": "简短的动作标题，用命令式",\n      "description": "1-2 句话：做什么、为什么，必须落在给出的素材上",\n      "ast_source": "AST01"\n    }\n  ]\n}\n\n规则：3-5 条行动，重要的排在前面（priority 1 为第一）。每条行动都必须有素材支撑：它的 ast_source 必须是在 OWASP 素材或表现最弱的题目中出现过的 AST ID，它的 description 必须能追溯到那份素材。',
    'llm.prompt.truncated': '（为控制提示词长度，此处素材已被裁剪）',
    'llm.titleFallback': '未知',
    'llm.titleFallbackEmoji': '?',

    /* ── LLM 提示词里的 Severity 标签（结构化数据，保持英文） ── */
    'severity.critical': 'critical',
    'severity.high': 'high',
    'severity.medium': 'medium'
  });

})(globalThis);
