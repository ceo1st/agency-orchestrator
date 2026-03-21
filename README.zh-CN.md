# Agency Orchestrator

基于 [agency-agents](https://github.com/jnMetaCode/agency-agents-zh) 角色定义的轻量多智能体编排引擎 —— 用 YAML 定义工作流，自动调度 AI 角色协作完成复杂任务。

[English](./README.md)

## 解决什么问题

[agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) 提供了 186 个定义完善的 AI 角色（产品经理、工程师、设计师、营销专家……），但每个角色只能独立工作。真实任务需要**协作**：谁先谁后、怎么交接上下文、什么时候汇总。

| | CrewAI | LangGraph | Agency Orchestrator |
|---|--------|-----------|---------------------|
| 语言 | Python | Python | **TypeScript** |
| 角色定义 | 自己写 | 自己写 | **186 个现成角色** |
| 上手方式 | 写 Python 类 | 学图概念 | **写 YAML** |
| 中文支持 | 无 | 无 | **原生中文** |

**核心差异：** 别人给你框架让你自己写角色，我们给你 186 个角色你只需要编排。

## 快速开始

```bash
# 安装
npm install agency-orchestrator

# 校验工作流
npx ao validate workflow.yaml

# 查看执行计划
npx ao plan workflow.yaml

# 执行工作流
export ANTHROPIC_API_KEY=your-key
npx ao run workflow.yaml --input prd_content=@prd.md
```

## 工作原理

用 YAML 定义工作流：

```yaml
name: "产品需求评审"
agents_dir: "./node_modules/agency-agents-zh"

llm:
  provider: "claude"
  model: "claude-sonnet-4-6"

concurrency: 2

inputs:
  - name: prd_content
    required: true

steps:
  - id: analyze
    role: "product/product-manager"
    task: "分析以下 PRD，提取核心需求：\n\n{{prd_content}}"
    output: requirements

  - id: tech_review
    role: "engineering/engineering-software-architect"
    task: "评估技术可行性：\n\n{{requirements}}"
    output: tech_report
    depends_on: [analyze]

  - id: design_review
    role: "design/design-ux-researcher"
    task: "评估用户体验风险：\n\n{{requirements}}"
    output: design_report
    depends_on: [analyze]

  - id: summary
    role: "product/product-manager"
    task: "综合反馈输出结论：\n\n{{tech_report}}\n\n{{design_report}}"
    depends_on: [tech_review, design_review]
```

引擎自动：
1. 解析 YAML，构建 DAG（有向无环图）
2. 检测并行机会 —— `tech_review` 和 `design_review` 并发执行
3. 通过 `{{变量}}` 在步骤间传递输出
4. 从 agency-agents 加载角色定义作为 system prompt
5. 保存所有输出到 `.ao-output/`

```
analyze ──→ tech_review  ──→ summary
         └→ design_review ──┘
          (并行)
```

## CLI 命令

```bash
# 执行工作流
ao run <workflow.yaml> [选项]

# 校验（不执行）
ao validate <workflow.yaml>

# 查看执行计划
ao plan <workflow.yaml>

# 列出可用角色
ao roles --agents-dir ./agents
```

**选项：**

| 参数 | 说明 |
|------|------|
| `--input key=value` | 传入输入变量 |
| `--input key=@file` | 从文件读取变量值 |
| `--output dir` | 输出目录（默认 `.ao-output/`） |
| `--quiet` | 静默模式 |

## 编程 API

```typescript
import { run } from 'agency-orchestrator';

const result = await run('workflow.yaml', {
  prd_content: '你的 PRD 内容...',
});

console.log(result.success);     // true/false
console.log(result.totalTokens); // { input: 1234, output: 5678 }
```

## 内置工作流模板

| 模板 | 说明 |
|------|------|
| `product-review.yaml` | 产品需求评审（PM → 架构师 + 设计师 → 汇总） |
| `content-pipeline.yaml` | 内容创作流水线（调研 → 写作 → 审核 → 定稿） |

## 项目生态

```
agency-agents-zh（186 个角色定义）
        │
        ▼ 引用
agency-orchestrator（本项目）
        │
        ▼ 可选集成
shellward（安全中间件）
```

## 路线图

- [x] **v0.1** — YAML 工作流、DAG 引擎、Claude Connector、CLI
- [ ] **v0.2** — 人工审批节点、OpenAI/Ollama 支持、迭代循环
- [ ] **v0.3** — 工作流模板库、Web UI、MCP Server 模式

## 许可证

Apache-2.0
