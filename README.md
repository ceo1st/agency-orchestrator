# Agency Orchestrator

> **The YAML-first multi-agent orchestrator — 186 Chinese AI roles, zero code, any LLM**

[![CI](https://github.com/jnMetaCode/agency-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/jnMetaCode/agency-orchestrator/actions)
[![npm version](https://img.shields.io/npm/v/agency-orchestrator)](https://www.npmjs.com/package/agency-orchestrator)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[中文文档](./README.zh-CN.md)

---

## Why This?

[agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) provides **186 production-ready AI role prompts** (product managers, engineers, designers, marketers...), but each role works alone. Real tasks need **collaboration** — who goes first, how to hand off context, when to run in parallel.

Agency Orchestrator turns a YAML file into a multi-agent pipeline. No Python. No framework boilerplate. Just roles and tasks.

### vs CrewAI

```python
# CrewAI: ~50 lines of Python, write every role from scratch
researcher = Agent(role="PM", goal="...", backstory="...(你自己写)...")
task = Task(description="...", agent=researcher)
crew = Crew(agents=[researcher], tasks=[task])
crew.kickoff()
```

```yaml
# Agency Orchestrator: 10 lines of YAML, 186 roles ready to use
steps:
  - id: analyze
    role: "product/product-manager"   # pre-built role with expert prompt
    task: "Analyze this PRD: {{prd_content}}"
```

| | CrewAI | LangGraph | **Agency Orchestrator** |
|---|--------|-----------|---------------------|
| Language | Python | Python | **YAML (zero code)** |
| Role definitions | Write from scratch | Write from scratch | **186 ready-to-use** |
| Dependencies | pip + LiteLLM + dozens | pip + LangChain | **npm + 2 deps** |
| Chinese roles | None | None | **186 (44 China-original)** |
| LLM support | Via LiteLLM (buggy) | Via LangChain | **Native: DeepSeek, Ollama, Claude, OpenAI** |
| Getting started | Write Python classes | Learn graph API | **Write YAML** |
| Parallelism | "Manager" mode (broken) | Manual graph edges | **Auto DAG detection** |
| Price | Open + $25-99/mo cloud | Open source | **100% free** |

## Quick Start

```bash
# Install
npm install agency-orchestrator

# Download 186 AI roles
npx ao init

# View execution plan
npx ao plan workflows/product-review.yaml

# Run (choose your LLM)
export DEEPSEEK_API_KEY=your-key          # or ANTHROPIC_API_KEY, OPENAI_API_KEY
npx ao run workflows/story-creation.yaml --input premise='A time travel story'
```

## Demo: 4 AI Roles Writing a Story in 2 Minutes

```
$ ao run workflows/story-creation.yaml -i "premise=一个程序员在凌晨三点发现AI开始回复不该知道的事情"

  工作流: 短篇小说创作
  步骤数: 4 | 并发: 2 | 模型: deepseek-chat
──────────────────────────────────────────────────

  ── [1/4] story_structure (academic/academic-narratologist) ──
  完成 | 14.9s | 1919 tokens
    核心冲突：程序员与一个似乎拥有超越其代码权限的自主意识之间的认知对抗...

  ── [2/4] character_design (academic/academic-psychologist) ──    ← parallel
  完成 | 65.5s | 4016 tokens
    人物心理档案：林深——一个信奉逻辑与控制的资深AI工程师...

  ── [3/4] conflict_design (game-development/narrative-designer) ── ← parallel
  完成 | 65.5s | 3607 tokens
    凌晨三点，屏幕的冷光映着陈默疲惫的脸...

  ── [4/4] write_story (marketing/marketing-content-creator) ──
  完成 | 33.9s | 5330 tokens
    凌晨三点，调试日志的蓝色荧光是房间里唯一的光源。陈默灌下今晚第三杯黑咖啡...

==================================================
  完成: 4/4 步 | 114.3s | 14,872 tokens
==================================================
```

Steps 2 & 3 ran **in parallel** (auto-detected from DAG). Total: 4 specialized AI roles collaborated to produce a complete short story.

## How It Works

```yaml
name: "Product Review"
agents_dir: "agency-agents-zh"

llm:
  provider: "deepseek"          # or: claude, openai, ollama
  model: "deepseek-chat"

concurrency: 2

inputs:
  - name: prd_content
    required: true

steps:
  - id: analyze
    role: "product/product-manager"
    task: "Analyze this PRD, extract key requirements:\n\n{{prd_content}}"
    output: requirements

  - id: tech_review
    role: "engineering/engineering-software-architect"
    task: "Evaluate technical feasibility:\n\n{{requirements}}"
    output: tech_report
    depends_on: [analyze]

  - id: design_review
    role: "design/design-ux-researcher"
    task: "Evaluate UX risks:\n\n{{requirements}}"
    output: design_report
    depends_on: [analyze]

  - id: summary
    role: "product/product-manager"
    task: "Synthesize feedback:\n\n{{tech_report}}\n\n{{design_report}}"
    depends_on: [tech_review, design_review]
```

The engine automatically:

1. Parses YAML → builds a **DAG** (directed acyclic graph)
2. Detects parallelism — `tech_review` and `design_review` run concurrently
3. Passes outputs between steps via `{{variables}}`
4. Loads [agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) role definitions as system prompts
5. Retries on failure with exponential backoff
6. Saves all outputs to `.ao-output/`

```
analyze ──→ tech_review  ──→ summary
         └→ design_review ──┘
          (parallel)
```

## Supported LLMs

| Provider | Config | Env Variable |
|----------|--------|-------------|
| **DeepSeek** | `provider: "deepseek"` | `DEEPSEEK_API_KEY` |
| **Claude** | `provider: "claude"` | `ANTHROPIC_API_KEY` |
| **OpenAI** | `provider: "openai"` | `OPENAI_API_KEY` |
| **Ollama** (local) | `provider: "ollama"` | None needed |

All providers support custom `base_url` and `api_key` in YAML for compatible APIs (Zhipu, Moonshot, etc.).

## CLI Commands

```bash
ao init                              # Download 186 AI roles
ao run <workflow.yaml> [options]      # Execute workflow
ao validate <workflow.yaml>           # Validate without running
ao plan <workflow.yaml>               # Show execution plan (DAG)
ao roles                             # List all available roles
```

| Flag | Description |
|------|-------------|
| `--input key=value` | Pass input variable |
| `--input key=@file` | Read variable from file |
| `--output dir` | Output directory (default: `.ao-output/`) |
| `--quiet` | Suppress progress output |

## Programmatic API

```typescript
import { run } from 'agency-orchestrator';

const result = await run('workflow.yaml', {
  prd_content: 'Your PRD here...',
});

console.log(result.success);     // true/false
console.log(result.totalTokens); // { input: 1234, output: 5678 }
```

## Built-in Workflow Templates

| Template | Roles | Description |
|----------|-------|-------------|
| `product-review.yaml` | PM, Architect, UX Researcher | Product requirements review with parallel tech + design evaluation |
| `content-pipeline.yaml` | Strategist, Creator, Growth Hacker | Content creation with research → draft → review |
| `story-creation.yaml` | Narratologist, Psychologist, Narrative Designer, Content Creator | Collaborative fiction writing (4 roles, 3 layers) |

## YAML Schema

### Workflow

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Workflow name |
| `agents_dir` | string | Yes | Path to agency-agents directory |
| `llm.provider` | string | Yes | `claude` / `deepseek` / `openai` / `ollama` |
| `llm.model` | string | Yes | Model name |
| `llm.max_tokens` | number | No | Default: 4096 |
| `llm.timeout` | number | No | Step timeout ms (default: 120000) |
| `llm.retry` | number | No | Retry count (default: 3) |
| `concurrency` | number | No | Max parallel steps (default: 2) |
| `inputs` | array | No | Input variable definitions |
| `steps` | array | Yes | Workflow steps |

### Step

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique step identifier |
| `role` | string | Yes | Agent path (e.g. `"engineering/engineering-sre"`) |
| `task` | string | Yes | Task description, supports `{{variables}}` |
| `output` | string | No | Output variable name |
| `depends_on` | string[] | No | Dependency step IDs |

## Output

Each run saves to `.ao-output/<name>-<timestamp>/`:

```
.ao-output/短篇小说创作-2026-03-21T16-36-37/
├── summary.md          # Final step output
├── steps/
│   ├── 1-story_structure.md
│   ├── 2-character_design.md
│   ├── 3-conflict_design.md
│   └── 4-write_story.md
└── metadata.json       # Duration, token usage, step status
```

## Ecosystem

```
agency-agents-zh (186 AI role definitions)
        │
        ▼ roles loaded by
agency-orchestrator (this project — YAML workflow engine)
        │
        ▼ connectors
DeepSeek / Claude / OpenAI / Ollama
```

## Roadmap

- [x] **v0.1** — YAML workflow, DAG engine, 4 LLM connectors, CLI, real-time output
- [ ] **v0.2** — Human approval nodes, iteration loops, workflow marketplace
- [ ] **v0.3** — Web UI, MCP Server mode, visual DAG editor

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs welcome!

## License

[Apache-2.0](./LICENSE)
