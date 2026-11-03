# 模板输出样张（common-user fixture，双语）

> 行动标题为逐风险策展短语（i18n），与描述首句不再同源；行动行只含具体做法。


## EN — 称号 Uncharted，总分 10.2%，最弱题 q02, q04, q05, q14, q06

### 行动计划 · Narrative（作答分析）

Supply Chain Compromise is your weakest area at 0%. On the question that matters most here, you chose "I probably wouldn't notice a one-letter difference in a dependency name, and if I did, I'd assume it was a fork" — the option that lands exactly where attackers aim first.

Over-Privileged Skills is your weakest area at 0%. On the question that matters most here, you chose "Accept all. The marketplace wouldn't list it if the permissions weren't appropriate" — the option that lands exactly where attackers aim first.

Also below the 70% line: Untrusted External Instructions, Update Drift, Cross-Platform Reuse. The action list covers what to do there — none of them had a single standout miss.

### 行动计划 · Actions（纯建议）

**[1] Check the whole dependency tree**

> Inspect the full dependency tree for typosquatting and verify each package name against the legitimate registry before installing.

_(AST02: Supply Chain Compromise)_

**[2] Trim permissions to the stated function**

> Review each permission request against the skill's stated function and deny any access that isn't necessary for the task.

_(AST03: Over-Privileged Skills)_

**[3] Don't let skills fetch their own instructions**

> Avoid skills that fetch instructions from external URLs at runtime; inline content where possible, pin it to a content hash, and re-verify the hash on every load before the content reaches the model.

_(AST05: Untrusted External Instructions)_

**[4] Verify every update before it lands**

> Verify publisher identity, check for cryptographic signatures, and review update diffs before accepting any skill update. Never auto-update without verification.

_(AST07: Update Drift)_

**[5] Re-check security after every port**

> Verify that security properties (permissions, risk tiers, isolation) are preserved when porting skills across different agent platforms.

_(AST10: Cross-Platform Reuse)_

### Deep-Dive Prompt（2388 字符）

```
I took an agent-skill security self-assessment based on the OWASP Agentic Skills Top 10. Please act as my security educator and help me improve my habits, one area at a time.

## My Profile
Title: 🧭 Uncharted
Overall: 10.2%

Per-AST Scores:
- AST02: 0% (0/18)
- AST03: 0% (0/16)
- AST05: 0% (0/12)
- AST07: 0% (0/11)
- AST10: 0% (0/3)
- AST04: 11.1% (2/18)
- AST09: 11.1% (1/9)
- AST06: 14.3% (3/21)
- AST01: 33.3% (6/18)
- AST08: 33.3% (2/6)

## Weakest Areas

### q02: AST04
Scenario: A skill called "Google Calendar Integration" shows up on a marketplace. The desc...
I chose: The name gives me confidence. Google wouldn't let a bad skill use their name on a major marketplace (scored 0 out of 3)
A stronger answer: The name doesn't matter to me. I'd evaluate it the same as any other skill, on permissions and code review — Evaluating every skill on the same criteria (permissions, publisher verification, code review) removes the bias that brand impersonation exploits. A brand name is a marketing signal, not a security one.
Best Practice: Evaluate every skill on the same criteria: permissions, publisher verification, and code review, regardless of brand names or trademark claims in the skill name.
OWASP: https://owasp.github.io/www-project-agentic-skills-top-10/ast04.html

### q04: AST02
Scenario: You're reviewing a skill before installing it. The main code looks clean, but wh...
I chose: I probably wouldn't notice a one-letter difference in a dependency name, and if I did, I'd assume it was a fork (scored 0 out of 3)
A stronger answer: I'd check the full dependency tree, not just top-level imports, and verify each package name against the legitimate registry — Thorough, and for good reason: dependency confusion attacks target the nested, transitive dependencies most people never look at. Checking the full tree against the registry is what the OWASP checklist (AST02.3, AST02.6) recommends.
Best Practice: Inspect the full dependency tree for typosquatting and verify each package name against the legitimate registry before installing.
OWASP: https://owasp.github.io/www-project-agentic-skills-top-10/ast02.html

## How to Teach Me
- Ground your explanations in the linked OWASP pages
- For each area: first point out what my chosen answer gets wrong, then give me one concrete habit I can adopt
- Adapt depth to my level (I'm learning)
- Cover one area at a time
```


## ZH — 称号 未开垦，总分 10.2%，最弱题 q02, q04, q05, q14, q06

### 行动计划 · Narrative（作答分析）

供应链入侵是你最薄弱的一项，得分 0%。这里最关键的一题，你选了「依赖名里差一个字母，我多半看不出来；就算看出来了，也会以为只是个 fork。」——攻击者最希望你就这么选。

权限过度的技能是你最薄弱的一项，得分 0%。这里最关键的一题，你选了「全部接受。市场上不会上架一个权限不合适的技能」——攻击者最希望你就这么选。

同样低于 70% 线的还有：不可信的外部指令、更新漂移、跨平台复用。这些领域没有哪一题单独失手——行动清单里已给出对应做法。

### 行动计划 · Actions（纯建议）

**[1] 查依赖要查整棵树**

> 安装前检查整棵依赖树有没有仿冒包，并把每个包名和正牌仓库核对一遍。

_(AST02: 供应链入侵)_

**[2] 权限只给声称要用的**

> 逐条把权限申请和技能声称的功能对照一遍，拒绝任何对该任务不必要的访问。

_(AST03: 权限过度的技能)_

**[3] 别让技能自己拉指令**

> 避开那些在运行时从外部 URL 拉取指令的技能；尽量把内容内联进去，或锁定到内容哈希上，并在每次加载、内容进入模型之前重新校验哈希。

_(AST05: 不可信的外部指令)_

**[4] 更新先验后收**

> 接受任何技能更新之前，先验证发布方身份、检查加密签名、审阅更新差异。没有验证就绝不自动更新。

_(AST07: 更新漂移)_

**[5] 跨平台后重新验一遍**

> 在不同智能体平台之间移植技能时，验证安全属性（权限、风险等级、隔离）是否完整保留。

_(AST10: 跨平台复用)_

### Deep-Dive Prompt（2437 字符）

```
我参加了一份基于 OWASP Agentic Skills Top 10 的智能体技能安全自评。请充当我的安全导师，帮我一个领域一个领域地改进习惯。

## 我的情况
成长称号：🧭 未开垦
总分：10.2%

各 AST 得分：
- AST02: 0% (0/18)
- AST03: 0% (0/16)
- AST05: 0% (0/12)
- AST07: 0% (0/11)
- AST10: 0% (0/3)
- AST04: 11.1% (2/18)
- AST09: 11.1% (1/9)
- AST06: 14.3% (3/21)
- AST01: 33.3% (6/18)
- AST08: 33.3% (2/6)

## 最薄弱的地方

### q02: AST04
情境：一个叫“Google Calendar Integration”的技能出现在市场上。描述写得很漂亮，README 看着很专业，还有其他用户的好评。
我的选择：这个名字让我放心。Google 不会让一个坏技能在主流市场上用他们的名字。（得 0 分，满分 3）
更好的选择：名字对我无所谓。我会用同样的标准衡量它，和其他任何技能一样，看权限和代码。——用同一套标准衡量每个技能（权限、发布者验证、代码审查），能消掉品牌冒充所利用的那种偏见。品牌名是营销信号，不是安全信号。
最佳实践：不管技能名里带什么品牌或商标声明，都用同一套标准衡量：权限、发布者验证、代码审查。
OWASP：https://owasp.github.io/www-project-agentic-skills-top-10/ast04.html

### q04: AST02
情境：你在安装前审一个技能。主代码看着干净，但查看依赖时，发现它 import 了一个叫“yutube-dl-core”的包（正牌的是“youtube-dl-core”）。这个拼写错误很容易看漏。
我的选择：依赖名里差一个字母，我多半看不出来；就算看出来了，也会以为只是个 fork。（得 0 分，满分 3）
更好的选择：我会检查整棵依赖树，不只是顶层 import，并把每个包名都和正牌仓库核对。——很彻底，而且理由充分：依赖混淆攻击瞄准的是大多数人根本不会看的那些嵌套的、传递性的依赖。把整棵树拿去和仓库核对，正是 OWASP 检查表（AST02.3、AST02.6）推荐的做法。
最佳实践：安装前检查整棵依赖树有没有仿冒包，并把每个包名和正牌仓库核对一遍。
OWASP：https://owasp.github.io/www-project-agentic-skills-top-10/ast02.html

### q05: AST04
情境：你在安装前审一个技能的 SKILL.md 文件。你读了描述、使用说明和示例提示词。读下来一切正常：清楚、有用，没有明显的危险信号。
我的选择：够了。文本读起来通顺、说得通，我就放心了。（得 0 分，满分 3）
更好的选择：我会把这个文件过一遍安全扫描工具，检查隐藏字符和编码载荷。我不指望自己的眼睛能看全。——正确的心态是：眼睛抓表面的问题，工具抓看不见的问题。OWASP 检查表（AST04.2）建议扫描 ASCII 走私、零宽 Unicode 和 base64 编码的载荷。认真读也赢不了你根本看不到的内容。
最佳实践：把 SKILL.md 文件过一遍能检查隐藏字符、零宽 Unicode 和 base64 编码载荷的安全扫描工具。别只信眼睛。
OWASP：https://owasp.github.io/www-project-agentic-skills-top-10/ast04.html

### q14: AST08
情境：安装技能之前，你让它过了一遍代码扫描工具。结果是干净的，没有发现问题。你觉得可以放心往下走了。
我的选择：扫描干净就说明是安全的。扫描工具不就是干这个的。（得 0 分，满分 3）
更好的选择：我只把它当成多个信号里的一个。我还想看行为分析：这个技能跑起来到底做了什么，而不只是代码长什么样。——OWASP AST08 建议分层扫描：代码模式分析、凭据检测、行为测试、手动审阅。模式扫描干净是必要条件，不是充分条件；行为分析能告诉你运行时到底发生了什么，不管代码嘴上怎么写。
最佳实践：用多层扫描（代码模式分析、自然语言审阅、行为测试），因为没有任何单一扫描工具能覆盖所有攻击类型。
OWASP：https://owasp.github.io/www-project-agentic-skills-top-10/ast08.html

### q06: AST03
情境：你在安装一个日历技能。安装界面显示它正在申请：文件系统访问（所有文件）、shell 执行、网络访问（所有域名），以及修改你的智能体配置的权限。而这个技能的描述里只提到读取和创建日历事件。
我的选择：全部接受。市场上不会上架一个权限不合适的技能（得 0 分，满分 2）
更好的选择：接受看起来和日历相关的那些权限（同步大概需要网络访问），其余的拒绝——日历技能需要网络访问来做同步，也可能需要文件访问来读写它的日历文件，但不需要 shell 执行，不需要全文件访问，也不需要改配置。把权限限制在它声称的功能范围内，这正是 AST03 建议的核心。
最佳实践：逐条把权限申请和技能声称的功能对照一遍，拒绝任何对该任务不必要的访问。
OWASP：https://owasp.github.io/www-project-agentic-skills-top-10/ast03.html

## 如何教我
- 所有解释都要落在所链接的 OWASP 页面上
- 每个领域：先指出我的选择错在哪，再给我一个能立刻养成的具体习惯
- 根据我的水平调整深度（我还在学）
- 一次只讲一个领域
```

