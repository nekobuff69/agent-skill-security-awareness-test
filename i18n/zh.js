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
    'lang.otherName': '英文',
    'lang.otherShort': 'EN',
    'lang.switchLabel': '切换到英文',
    'lang.offerTitle': '语言',
    'lang.switchUnavailable': '暂时无法切换到{language}。',

    /* ── 加载与错误 ── */
    'loading.bank': '加载中……',
    'error.loadBank': '题库加载失败：{message}',
    'error.retry': '重试',

    /* ── 启动闪屏（issue #39） ──
       闪屏复用落地页标题作为应用名，保证开机画面与随后的程序同名。 */
    'boot.status': '正在启动程序……',

    /* ── 落地页（issue #53） ── */
    'landing.headline1': '了解风险',
    'landing.headline2': '保持警觉',
    'landing.titleFallback': '智能体安全意识测评',
    'landing.body': '{count} 道题，关于你安装的技能和你运行的智能体。如实作答，结果用于生成你的个性化建议。',
    'landing.meta': '{count} 道问题 · {time}',
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
    'results.deepDiveSub': '把它粘贴到你的智能体对话里：它会针对你的盲区，把你的智能体变成一个私人的安全导师。',
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

    /* ── 测验窗口菜单（#65） ──
       菜单里放着下载、分享、回顾、重测这些命令，窗口正文只留总分、
       风险雷达图与盲区排行。命令文案复用上面 results.* 字符串，
       这里只新增菜单名称。 */
    'results.menuBar': '测验窗口菜单',

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
    'shell.menuQuit': '结束程序',
    'shell.aboutTitle': '关于智能体安全意识测评',
    'shell.aboutBody': '面向构建和运营智能体人群的安全意识测评，' +
      '情境取材于 OWASP 智能体技能十大风险。',
    'shell.aboutLink': 'OWASP 智能体技能十大风险（英文）',
    'shell.aboutCredits': '界面字体：W95FA（作者 Alina Sava，' +
      'SIL OFL 1.1 许可）。',
    'shell.ok': '确定',

    /* ── 程序窗口（ticket #61） ──
       行动计划与深度提问各自成窗：这些是它们的标题栏与任务栏按钮文案。
       'shell.programs' 是任务栏窗口列表的名称。 */
    'shell.actionPlanWindow': '行动计划',
    'shell.deepDiveWindow': '深度提问',
    'shell.programs': '程序',

    /* ── 结束程序对话框（ticket #43） ──
       措辞对应 Win95 的“结束程序”确认框：标题栏点名被结束的程序，
       正文只问一个问题。可复用原语 App.Windows.openSystemDialog 在打开时
       通过 I18n.t() 解析这些 id；#44 与 #47 复用该原语时传入各自的 id。 */
    'windows.endProgramTitle': '结束程序 - 智能体安全意识测评',
    'windows.endProgramMessage': '确定要结束这个程序吗？',
    'windows.retakeTitle': '重新开始 - 智能体安全意识测评',
    'windows.retakeMessage': '确定要放弃这次测评、重新开始吗？所有作答都会被清除。',
    'windows.yes': '是',
    'windows.no': '否',

    /* ── 开始菜单声音开关（ticket #41） ── */
    'sound.menuItem': '声音',

    /* ── 扫雷彩蛋（ticket #81，spec #79） ──
       开始菜单里的游戏入口与游戏对话框的每处文案：窗口标题、两个 LED
       计数器和棋盘的无障碍名称、输入方式提示，以及笑脸按钮的名称
       （它同时是重开一局的按钮）。 */
    'mines.menuItem': '扫雷……',
    'mines.windowTitle': '扫雷',
    'mines.counterLabel': '剩余雷数',
    'mines.timerLabel': '计时',
    'mines.boardLabel': '雷区',
    'mines.boardHint': '左键或点按翻开格子，右键或长按插旗。',
    'mines.smileyRestart': '新开一局',
    // 逐格无障碍状态：每个格子说明位置和当前内容（paintCell 里解析）。
    'mines.cellPosition': '第{row}行，第{column}列',
    'mines.cellUnrevealed': '未翻开',
    'mines.cellFlagged': '已插旗',
    'mines.cellClear': '周围没有雷',
    'mines.cellAdjacent': '周围有{n}颗雷',
    'mines.cellMine': '地雷',
    'mines.cellDetonated': '被引爆的地雷',
    'mines.cellWrongFlag': '插错的旗',

    /* ── 向导按钮行（ticket #40，ADR 0020） ── */
    'wizard.back': '< 上一步',
    'wizard.next': '下一步 >',
    'wizard.finish': '完成',

    /* ── 结果页标题（ticket #45，#60 之后） ──
       总分小标题在窗口正文的第一块面板上；复古皮肤新增的假窗框与它的 [—][□][×]
       aria-label 一起不再使用（真标题栏只有一块，由 shell 提供）。 */
    'results.overall': '总分',

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

    /* ── 行动计划标题 —— 逐风险策展短语，刻意改写以免与描述首句重复 ── */
    'action.AST01': '先核实发布者，再谈安装',
    'action.AST02': '查依赖要查整棵树',
    'action.AST03': '权限只给声称要用的',
    'action.AST04': '所有技能用同一把尺子',
    'action.AST05': '别让技能自己拉指令',
    'action.AST06': '安装前先查案底',
    'action.AST07': '更新先验后收',
    'action.AST08': '扫描只是信号之一',
    'action.AST09': '每装一个技能都登记',
    'action.AST10': '跨平台后重新验一遍',

    /* ── 确定性兜底的文案 ── */
    'fallback.behavior.none': '这里没有哪一题特别突出——分数是在几个「看起来还行」的选择里慢慢溜走的。',
    'fallback.behavior.single': '这里最关键的一题，你选了{quote}——攻击者最希望你就这么选。',
    'fallback.behavior.multiple': '同一个缺口出现了不止一次：你选了{list}，还有{last}。同一个本能在不同场景里失手，这就是最值得先补的习惯。',
    'fallback.quoteOpen': '「',
    'fallback.quoteClose': '」',
    'fallback.ellipsis': '……',
    'fallback.narrative.item': '{risk}是你最薄弱的一项，得分 {percentage}%。{behavior}',
    'fallback.narrative.others': '同样低于 70% 线的还有：{risks}。这些领域没有哪一题单独失手——行动清单里已给出对应做法。',
    'fallback.listSep': '、',
    'fallback.narrative.clear': '你的总分为 {percentage}%。所有风险领域都在 70% 以上——没有需要紧急处理的问题，保持现在的好习惯。',
    'fallback.action.description.generic': '查阅 OWASP 关于「{risk}」的指引，把对应的缓解做法融入日常。',

    /* ── 深度提问 ── */
    'prompt.budget': 3000,
    'prompt.titleFallback': '未知',
    'prompt.titleFallbackEmoji': '?',
    'prompt.framing': '我参加了一份基于 OWASP Agentic Skills Top 10 的智能体技能安全自评。请充当我的安全导师，帮我一个领域一个领域地改进习惯。',
    'prompt.sessionRules': '## 如何教我\n- 所有解释都要落在所链接的 OWASP 页面上\n- 每个领域：先指出我的选择错在哪，再给我一个能立刻养成的具体习惯\n- 根据我的水平调整深度（我还在学）\n- 一次只讲一个领域',
    'prompt.profile.heading': '## 我的情况',
    'prompt.profile.title': '成长称号：{title}',
    'prompt.profile.overall': '总分：{percentage}%',
    'prompt.profile.astScores': '各 AST 得分：',
    'prompt.weakest.heading': '## 最薄弱的地方',
    'prompt.item.scenario': '情境：{text}',
    'prompt.item.chose': '我的选择：{text}',
    'prompt.item.choseScored': '我的选择：{text}（得 {score} 分，满分 {max}）',
    'prompt.item.better': '更好的选择：{text}——{reason}',
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
