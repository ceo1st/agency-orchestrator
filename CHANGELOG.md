# Changelog

本项目采用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed
- **赞助位收敛到赞助页**：APINEBULA 旗舰赞助 / 优惠码推广此前在首页(SponsorStrip)和 Studio(StudioSponsorSlot)也展示，现仅保留在 `/sponsors` 赞助页，不再出现在首页与工作区。

### Fixed
- **Studio 演示模式下切 tab 不响应**：引擎离线 / 公开演示站（无后端）时，各 tab 点了内容都不变（一律显示角色 demo），看起来像卡死。现在演示模式也**按 tab 显示真实内容、可浏览**——工作流展示内置模板快照、角色展示角色库、提示词展示 Prompt Lab，**只是运行类操作引导安装、不能真跑**（运行历史 / 用量本就无离线数据，给出简短说明）。另加防御：任一 tab 文案缺失也不再让整个 Studio 渲染崩溃。
- **Azure OpenAI 兼容**（#38）：Azure 的 gpt 模型只认 `max_completion_tokens`（不认 `max_tokens`），且用 `api-key` header 鉴权。OpenAI 兼容连接器现在检测到 `base_url` 含 `azure` 时自动切换；非 Azure 的 OpenAI o 系列推理模型可用 `AO_OPENAI_TOKENS_PARAM=max_completion_tokens` 显式覆盖（含回归测试 `test/azure-compat.ts`）。
- **`ao prompt` 文档补齐**：Prompt Lab 合入后 `ao prompt` 一直没进 `ao --help` / README / CLAUDE.md，用户无从发现；现已补上（中英）。

### Added
- **团队 / Loadout（可复用角色阵容）**：把跑得好的角色阵容存下来，套到任意新任务上。
  - CLI：`ao team save <workflow.yaml>` 从工作流抽出阵容存为团队；`ao team list / show / rm` 管理；`ao run --team <名字> "新任务"` 用固定阵容跑新活（本质 = compose 时把可选角色锁定为团队那几个，不漏人也不幻觉）。团队存为 `~/.ao/teams/*.team.yaml`（纯 YAML 可分享，`AO_TEAMS_DIR` 可覆盖）。
  - Web Studio：「我的团队」一排可一键载入整队；选 ≥2 角色后「存为团队」，合成预览里也能「存为团队」。后端 `GET/POST/DELETE /api/teams`，**与 CLI 共用同一份存储**，两端互通。
- **Prompt Lab —— 提示词优化 / 测试 / 对比 / 沉淀**（参考 prompt-optimizer）：把「靠感觉」的提示词变成可迭代资产。
  - **优化**：输入原始 prompt → LLM 一键改写（system / user 两种模式；meta-prompt 明确「产出仍是提示词，不是去执行它」）；原版 vs 优化版并排对比。
  - **测试 / 对比**：用样例输入实跑两版，看真实输出；可调 LLM 裁判给多个输出**打分排序**（多结果评估）。
  - **沉淀**：保存 + 版本历史 + 收藏；内置起手模板 Prompt Garden。
  - 三端：`ao prompt optimize/test/list/show/rm/garden` + Web Studio「提示词」页 + 后端 `/api/prompt/*`；存 `~/.ao/prompts`（`AO_PROMPTS_DIR` 可改），CLI 与 Studio 共用。
- **自带私有角色**：环境变量 `AO_AGENTS_DIR=/你的角色目录` 让 `run / compose / roles / web` 全部改用自定义角色库。

### Fixed
- **桌面端连不上本地 CLI（claude/codex/gemini）**（#41）：从 Finder/Dock 启动的 GUI 应用只继承 launchd 的精简 PATH（`/usr/bin:/bin:...`），找不到装在 homebrew / `~/.local/bin` / npm-global 里的 CLI provider 二进制，表现为「找不到 claude / 连不上本地 cli」。桌面壳现在在拉起引擎前重建可用 PATH（登录 shell 的 PATH + 常见 bin 目录），子进程继承之；终端里 `ao run` 不受影响。
- **Studio 默认语言不跟随环境**：导航栏本来就有中/英切换，但**首启默认语言**走 `navigator.language`，桌面端 Electron 常判成英文 → 中文用户一进来看到英文。现在桌面端按操作系统语言（`app.getLocale()`）、`ao web` 按 CLI 界面语言（`--lang`/`AO_LANG`/`LANG`）带上 `?lang=` 决定首启语言；用户在导航栏切换后由 localStorage 记住。判定优先级：URL 路径 `/en` > 用户已切换的持久化选择 > launcher 的 `?lang=` > 浏览器语言。
- **Studio 默认 provider 缺 key 不提示**：默认 provider 改成 APINEBULA 后，它没被加进 Studio 的 `KEYED` 列表，导致新用户没填 key 时**不弹「需要配置 key」提示**、直接运行才报认证错。已补上。

## [0.7.5] - 2026-06-17

### Fixed
- **循环回跳误伤并行旁支**：loop 重跑现在只重置「循环体」（`back_to` 到循环节点的依赖闭包），不再清空同层但不在链上的并行步骤——避免它们被重复执行、重复弹 human_input / approval（含回归测试）。
- **条件运算符解析**：`contains` / `equals` 改为在 YAML 模板（替换变量之前）上解析；专家产出里恰好出现 "contains/equals" 不再会把分支 / 循环退出条件从错误位置切开（含回归测试）。

### Performance
- Studio 懒加载「用量」面板（recharts ~390kB）与 `experts.json`（~150kB）：不再随 Studio 首屏 / 演示模式一次性拉取，仅在用到时按需加载。

### Accessibility
- 专家详情 / 安装引导 / 专家库弹框加上 `role="dialog"` + `aria-modal` + Esc 关闭。

## [0.7.4] - 2026-06-16

### Changed
- 英文工作流模板统一到 `workflows/en/`（10 个），移除重复的 `workflows-en/` 目录（web/server.js、package.json、README.en 同步更新）。

### Fixed
- 补提交英文库 `agency-agents/marketing/` 的 30 个角色——此前随 npm 包分发但因历史 `.gitignore` 规则从未纳入 git，fresh clone / CI 会缺这些角色。

## [0.7.3] - 2026-06-16

### Fixed
- **`--resume` 上下文污染**：恢复上游产出时未剥离 step 文件头（`> 名字 | 步骤 i/n … ---`），下游专家会收到带 markdown 头的「上一版产出」；现与 `loadStepOutput` 一致只回灌正文（含回归测试）。
- **OpenAI 兼容流式静默截断**：命中 `max_tokens`（`finish_reason=length`）时直接返回截断内容、不续写——正是 DeepSeek 长文场景；现读取 `finish_reason`，达上限自动续写（与流断开同样处理）。
- **安全**：`claude-code` 临时系统提示词文件改为 `0600`，避免同机其他用户读取专有角色定义。

### Changed
- 英文站专家计数按英文库实际显示 **184**（原误标 216），并移除英文文案中英文库并不包含的「中国平台角色」描述。
- 删除演示模式改造后已无引用的死代码 `StudioGate.tsx`。

## [0.7.2] - 2026-06-16

### Changed
- **角色库升级到 agency-agents-zh 1.2.2**：中文角色 **211 → 216**（新增服装厂排产工程师等；并带来 Hermes Windows 目录修复、Qoder 集成、ai-citation-strategist 中文化）。全站计数统一为 **216 中文 / 184 英文**（README / 官网 / 文档 / 教程 / About）。

### Fixed
- 官网专家库清理一个失效角色的孤儿提示词（`support-supply-chain-strategist`，1.2.x 已移除）。

## [0.7.1] - 2026-06-16

### Fixed
- **嵌套角色现在可枚举 / 可用**：角色加载改为**递归**子目录，`game-development/unity/*`、`unreal-engine/*`、`roblox-studio/*`、`godot/*`、`blender/*` 等 15 个嵌套智能体此前无法被 `listAgents` / `ao roles` / compose 建议发现（loader 只扫一层）——现在补齐，中文库角色数与官方一致达到 **211**（英文库 184）。
- **枚举只认真角色**：仅纳入带 `name:` frontmatter 的 `.md`，排除 `QUICKSTART` / `EXECUTIVE-BRIEF` 等攻略 / 模板文档（此前会被当成"角色"混入列表）。
- **官网专家库补齐**：`gen-experts.mjs` 同步递归，专家浏览 / 复制提示词覆盖全部 211（zh）+ 184（en），不再漏掉游戏开发类嵌套专家。

## [0.7.0] - 2026-06-16

### Added
- **网页 Studio + 桌面客户端**：本地 `ao web` 启动可视化 Studio（角色组队 / 工作流 / 运行历史 / 用量 / 密钥）；同一套 UI 打包为 Electron 桌面客户端（macOS arm64+Intel · Windows · Linux），经 GitHub Actions 一键发布到 Releases，官网提供下载入口。key 只存本机。
- **Studio / 官网全面双语化 + 英文资源**：UI、角色库、工作流模板按语言切换（`/en` 读英文 `agency-agents` 库与 `workflows-en/` 模板，不再混中文）。
- **CompShare（优云智算）provider 内置**：OpenAI 兼容接入，填 key 即用（`COMPSHARE_API_KEY` / `COMPSHARE_BASE_URL`）。
- **一键复制完整提示词**：Studio 专家详情与公开站「专家库」页都能查看 / 复制每位专家的完整系统提示词（公开站读静态 `experts.json` + `/prompts/*.md`）。
- **公开站 `/studio` 演示模式**：无后端也能浏览全部专家、查看 / 复制提示词；填 key 与运行被引导到「安装客户端 / 本地运行」。
- **`ao roles <关键词>` 角色搜索**：按 角色路径 / 名称 / 描述 不区分大小写过滤（也支持 `--search`）；无匹配给友好提示。
- **`ao init` 首跑向导**：角色库装好后自动探测可用 provider（优先免 key 的 claude-code CLI / Ollama），按环境给出个性化下一步，缩短「安装→价值」。
- **评测回归门禁**：黄金任务集抽到 `eval/golden-tasks.ts`；新增 `eval/gate.ts` 与 `npm run eval:gate` / `eval:baseline`——胜率阈值 + judge 双向一致率阈值 + 基线快照回归判定，judge 太弱时判 INCONCLUSIVE（绝不当通过）。

### Changed
- **`ao compose` 幻觉角色确定性修复**：生成的工作流引用不存在的角色时，优先用最接近的**真实角色直接改写 YAML**（不再多花一次 LLM 调用、保证产物可运行），无可信匹配才回退 LLM；并在 LLM 重试后再做确定性兜底，堵住「重试后仍残留坏角色却被当成功」的缺口。
- **打包内容**：npm 包额外纳入 `web/`、`website/dist/`、`workflows-en/`，`prepublishOnly` 自动构建引擎 + Studio。

### Tests
- 新增 `test/roles.ts`、`test/init.ts`、`test/eval-gate.ts` 并并入 `npm test`；`test/compose.ts` 覆盖确定性角色修复。

## [0.6.17] - 2026-04-29

### Added
- 模板库扩充：5 个手写精调高质量 workflow，覆盖个人 / 中小团队高频场景
  - `tech-blog.yaml` — 技术博客创作（调研 → 大纲 → 正文 → 润色，4 步）
  - `meeting-notes.yaml` — 会议纪要整理（清理 → 决策/TODO/争议 三视角并行 → 整合，5 步）
  - `okr-decomposition.yaml` — OKR 拆解（现状分析 → 季度 KR → Q1 行动方案 → 完整文档，4 步）
  - `product-launch-comms.yaml` — 产品发布物料（统一定位 → 通稿 / 社交 / 邮件 三件套并行 → 物料包，5 步）
  - `pitch-deck-outline.yaml` — 创业 Pitch Deck 大纲（市场 / 方案 / 商业模式 / 财务 四角度并行 → 5 屏 deck，5 步）
- 内置 workflow 总数从 44 个增加到 **49 个**，全部 validate 通过

### Notes
- 5 个模板都是"输入一句话 / 一段简介 → 多角度并行展开 → 整合"的纯 LLM 任务，不依赖外部数据 / 联网，零歧义
- 每个模板的 task 描述都精确指定输出格式（markdown 模板）和约束（字数 / 结构 / 不许 AI 套话），避免 LLM 输出泛泛而谈
- 默认 provider deepseek-chat（最便宜稳），用户可用 `--provider` 覆盖

## [0.6.16] - 2026-04-29

### Changed
- **`ao demo` 重构：检测优先，去掉预录 mock**
  - 检测到可用 LLM（CLI / API key / Ollama）→ **直接真跑** story-creation 工作流，无需"先看 mock 再确认"
  - 没检测到 → 显示**真实 DAG 结构**（用 ao 自身的 `formatDAG`）+ 3 行行动指引（Claude Code / DeepSeek / Ollama 任选）
  - 删掉旧的 `MOCK_STEPS` 预录数据 + `replayMockSteps` 函数（共 ~150 行）。原 mock 内容是精修过的小说创作，让用户对真跑的输出期望被错误抬高，且占用 5 秒注意力后还要再问 y/n，链路过长
  - 体验路径从 "mock 5s → 选 provider → y/n → 真跑" 简化为 "检测 → 真跑" 或 "检测 → DAG + 配 key 指引"

## [0.6.15] - 2026-04-27

### Fixed
- CLI provider（claude-code / gemini-cli / copilot-cli / codex-cli / openclaw-cli / hermes-cli）在"进程退出码 0 但 stdout 完全空"时，cli-base.ts 之前会默默返回空字符串给上层，导致 `ao compose` 报出迷惑性的"AI 生成的内容不是有效的 workflow YAML"，真实根因被吞。现在直接 reject 并给出诊断 hint：可能是 CLI 命令格式过期（参考 issue #14 hermes 的 `chat -q` → `-z`）、agent / model 配置错、或需要先认证。错误消息附上"在终端直接跑一次该命令看真实输出"的具体调试建议

### Tests
- 新增 test/cli-base.ts：覆盖 4 类场景（exit 0 + 空输出 reject / 正常输出 / exit 非 0 + stderr / ENOENT 提示安装），全量从 135 项增加到 **139 项**

## [0.6.14] - 2026-04-27

### Fixed
- **#16** DeepSeek 原生 connector 在某些用户环境下报 `405 Method Not Allowed`。根因：commit `f96d7b0` 让 deepseek case fallback 到 `OPENAI_BASE_URL` env，但用户先用 `ao init --provider openai --base-url https://api.openai.com/v1` 写入过 `OPENAI_BASE_URL` 后切到 deepseek，会用 OpenAI endpoint + DeepSeek key 调用，得到 405。修复：每个 provider 用自己专属的 BASE_URL env（deepseek → `DEEPSEEK_BASE_URL`，openai → `OPENAI_BASE_URL`），不再跨污染。`ao init` 也对应路由到正确 env

### Tests
- 修补一个发版 process 漏洞：`factory-custom.ts` / `step-llm.ts` / `step-llm-yaml.ts` / `stdin-limit.ts` / `compose-name.ts` 这 5 个测试文件之前**根本没在 `npm test` 里跑**（21 项 +1 项新加的测试都不被 CI 守护）。补进 test 脚本，全量从 114 项增加到 **135 项**
- 新增 2 项 factory-custom 测试覆盖 #16：deepseek 不被 OPENAI_BASE_URL 污染 / DEEPSEEK_BASE_URL 自定义代理仍生效

## [0.6.13] - 2026-04-27

### Fixed
- **回归修复**：0.6.12 新加的"output 唯一性校验"对两类合法的 ao 设计模式误报，导致 6 个内置 workflow 在 validate 时失败。现在校验放过两类例外：
  - **`any_completed` 分支收敛**：多个并行 step 产出同名 output，下游用 `depends_on_mode: any_completed` 引用，是有意的"任一分支完成即走"设计（如 incident-response.yaml 的多团队并行分析、hiring-pipeline.yaml 的多维度评估）
  - **loop 迭代覆盖**：种子 step 产生初始值 + loop step 反复覆盖同名 output，是常见的"原地修改"迭代模式（如 content-publish.yaml 的 write/revise 循环）
- 修了 3 个内置 workflow 的拓扑反向引用：legal-consultation.yaml / investment-analysis.yaml / xiaohongshu-content.yaml 的相关 step 补 `depends_on`（不是新校验过严，是 yaml 本身设计就有缺陷，新校验把它们暴露出来）

### Tests
- 新增 2 项 parser 测试覆盖 any_completed / loop 迭代覆盖的合法重名例外
- E2E 验证：44 个内置 workflow 现在全部通过 validate

## [0.6.12] - 2026-04-27

### Fixed
- **#14** `hermes-cli` connector 用旧参数 `chat -q` 调用 hermes，新版 hermes 已废弃此用法、改为 `-z`（oneshot）。修正参数让 hermes provider 重新可用
- `validateWorkflow` 之前只检查"变量是否在某处定义"，不检查"是否在引用方的 DAG 上游"。一个 step 引用下游 step 的 output（拓扑反向）会通过校验，到 run 阶段才崩。现在校验阶段就拦下，错误提示明确指出"该变量由非上游 step 产出，需要把对应 step 加进 depends_on"。和 autoFix 的拓扑约束保持一致
- `validateWorkflow` 加 `step.output` 唯一性检查。两个 step 不能 output 到同一个变量名（重名会让下游引用拿到的值依赖 context Map 写入顺序，不可预期）
- `validateWorkflow` 的变量引用检查范围扩到 `step.condition` / `step.loop.exit_condition` / `step.prompt`。之前只看 `step.task`，让条件分支表达式里的未定义变量漏检

### Tests
- 新增 3 项 parser 测试覆盖：拓扑反向引用 / output 重名 / condition 字段里的未定义变量

## [0.6.11] - 2026-04-27

### Fixed
- `repairWithLLM` 失败时静默吞错。LLM 调用因网络/认证/超时失败时不再悄悄返回，会在 stderr 给出失败原因，避免用户看到 "LLM 修复后仍有 X 个变量未解决" 误以为 LLM 修了但不够，实际是根本没调通

### Tests
- 新增 1 项测试覆盖跨 step 同名 bad var 的已知边界行为（全局 replace 只处理一次，靠 LLM repair 兜底）

## [0.6.10] - 2026-04-27

### Fixed
- `ao compose --run` 生成的 YAML 中变量引用错误的修复链全面强化。原 `autoFixVariableRefs` 启发式有两个核心缺陷：
  - 模糊匹配在**全局 outputs** 范围内找替换目标，能把"早期 step 引用未来 step output"配上（DAG 拓扑反向），例如 `{{personal_assessment}}` 被错误地改成 `{{final_report}}`
  - 启发式覆盖不全时直接放弃，没有 LLM 兜底
- 现在的修复链：
  - autoFix 加 **DAG 上游约束**：替换目标必须在当前 step 的 `depends_on` 递归闭包内的 step.output 集合里。指向下游或跨支的错改不再可能
  - autoFix 修不全时自动调 **LLM 二次修复**：把当前 YAML、未解决的变量列表、可用 inputs/outputs 喂给 LLM，让它选择改 task 引用 / 加 step output / 补 depends_on
  - `--run` 模式在 compose 阶段就检查"未定义变量 / 角色不存在 / 解析失败"等致命错误，不再放进 run 阶段才崩溃；abort 时给出清晰的"重新生成 / 手动修改"建议

### Changed
- compose system prompt（中英）加两条规则：(1) 每个 `{{X}}` 引用的 X 必须在 inputs 或上游 step.output 中；(2) merge / 汇总类 step 的 `depends_on` 必须列出所有产生引用变量的上游 step

## [0.6.9] - 2026-04-24

### Fixed
- Windows 上 `ao run` / `ao compose` / `ao serve` 找不到包内置 / node_modules 下的 agents 目录，报 "agents 目录不存在"。根因：`new URL(import.meta.url).pathname` 在 Windows 上返回 `/C:/Users/...` 这种前导斜杠非法路径，`dirname` + `resolve` 后所有依赖 scriptDir 的候选路径全部失效。改用 `node:url` 的 `fileURLToPath` 跨平台 API 正确解析。Mac/Linux 行为不变

## [0.6.8] - 2026-04-24

### Changed
- 超时重试递增的上限从 900s 提到 3600s（60 分钟）。原上限对 CLI / ollama 长任务偏紧：CLI 默认 600s 起跳第一次递增就封顶，用户 `--timeout 20m` 起点已超上限完全不递增。抬到 60min 后覆盖绝大多数真实长任务；仍然保留上限作为"防误配置放飞"的保险丝。真要超过 1 小时单步用 `timeout: 0` / `--timeout 0` 完全不限时

## [0.6.7] - 2026-04-23

### Added
- `ao run` / `ao compose` 新增 `--timeout <value>` 参数。支持 `300000`（毫秒）、`300s`（秒）、`5m`（分钟）、`0`（不限时）。命令行优先级高于 YAML 里的 `llm.timeout`
- 因超时触发重试时，下一次 timeout 自动 x1.5 递增（上限 900s，本版本后续被提到 3600s）。递增同时作用于 connector 内层 fetch/CLI timeout，避免内层 hard timeout 提前 abort

### Changed
- `ao compose` 生成的 YAML 默认 `timeout` 从 120000 抬到 300000（API 类 provider）。ollama 和 CLI 类保持 600000
- `withTimeout` 错误消息加引导："超时 (Xms)，可用 --timeout 或 YAML llm.timeout 延长"

### Fixed
- `classifyError` 5xx / 429 状态码改用 `\b` 单词边界匹配。原 `msg.includes('500')` 等会把 "450000ms"、"1500ms"、"1429ms" 等字符串里的数字子串误判成 HTTP 错误，导致超时错误被错误归类为 server_error，递增逻辑失效
- `classifyError` 现在识别中文"超时"字样。之前 `withTimeout` 抛出的 `超时 (120000ms)` 被归为 non_retryable，retry 根本不触发
- `timeout: 0`（不限时）现在真正生效。原 `effectiveConfig.timeout || default` 把 0 当 falsy 用默认值覆盖了，改成 `!== undefined` 判断
