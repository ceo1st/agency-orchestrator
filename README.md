# Agency Orchestrator

Lightweight multi-agent workflow engine built on [agency-agents](https://github.com/jnMetaCode/agency-agents-zh) role definitions — define workflows in YAML, automatically orchestrate AI roles to collaborate on complex tasks.

[中文文档](./README.zh-CN.md)

## Why This?

[agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) provides 186 well-defined AI role prompts (product managers, engineers, designers, marketers...), but each role works alone. Real tasks need **collaboration**: who goes first, how to hand off context, when to merge results.

| | CrewAI | LangGraph | Agency Orchestrator |
|---|--------|-----------|---------------------|
| Language | Python | Python | **TypeScript** |
| Role definitions | Write your own | Write your own | **186 ready-to-use** |
| Getting started | Write Python classes | Learn graph concepts | **Write YAML** |
| Chinese-first | No | No | **Yes** |

**Core difference:** Others give you a framework and you write the roles. We give you 186 roles and you just orchestrate.

## Quick Start

```bash
# Install
npm install agency-orchestrator

# Validate a workflow
npx ao validate workflow.yaml

# View execution plan
npx ao plan workflow.yaml

# Run a workflow
export ANTHROPIC_API_KEY=your-key
npx ao run workflow.yaml --input prd_content=@prd.md
```

## How It Works

Define a workflow in YAML:

```yaml
name: "Product Review"
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
1. Parses YAML and builds a DAG (directed acyclic graph)
2. Detects parallelism — `tech_review` and `design_review` run concurrently
3. Passes outputs between steps via `{{variables}}`
4. Loads role definitions from agency-agents as system prompts
5. Saves all outputs to `.ao-output/`

```
analyze ──→ tech_review  ──→ summary
         └→ design_review ──┘
          (parallel)
```

## CLI Commands

```bash
# Run a workflow
ao run <workflow.yaml> [options]

# Validate without executing
ao validate <workflow.yaml>

# Show execution plan (DAG visualization)
ao plan <workflow.yaml>

# List available roles
ao roles --agents-dir ./agents
```

**Options:**

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

Or use lower-level APIs:

```typescript
import {
  parseWorkflow,
  validateWorkflow,
  buildDAG,
  executeDAG,
  ClaudeConnector,
  loadAgent,
} from 'agency-orchestrator';

// Parse and validate
const workflow = parseWorkflow('workflow.yaml');
const errors = validateWorkflow(workflow);

// Build DAG
const dag = buildDAG(workflow);

// Execute with custom connector
const connector = new ClaudeConnector();
const result = await executeDAG(dag, {
  connector,
  agentsDir: './agents',
  llmConfig: workflow.llm,
  concurrency: 2,
  inputs: new Map([['key', 'value']]),
});
```

## YAML Schema

### Workflow

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Workflow name |
| `description` | string | No | Description |
| `agents_dir` | string | Yes | Path to agency-agents directory |
| `llm.provider` | string | Yes | `"claude"` (more coming) |
| `llm.model` | string | Yes | Model name |
| `llm.max_tokens` | number | No | Default: 4096 |
| `llm.timeout` | number | No | Step timeout in ms (default: 120000) |
| `llm.retry` | number | No | Retry count (default: 3) |
| `concurrency` | number | No | Max parallel steps (default: 2) |
| `inputs` | array | No | Input variable definitions |
| `steps` | array | Yes | Workflow steps |

### Step

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique step identifier |
| `role` | string | Yes | Path to agent (e.g. `"engineering/engineering-sre"`) |
| `task` | string | Yes | Task description, supports `{{variables}}` |
| `output` | string | No | Name for this step's output variable |
| `depends_on` | string[] | No | IDs of steps this depends on |

## Built-in Workflow Templates

| Template | Description |
|----------|-------------|
| `product-review.yaml` | Product requirements review (PM → Architect + Designer → Summary) |
| `content-pipeline.yaml` | Content creation pipeline (Research → Draft → Review → Final) |

## Output

Each run saves to `.ao-output/<name>-<timestamp>/`:

```
.ao-output/Product-Review-2026-03-21T16-30-00/
├── summary.md          # Final step output
├── steps/
│   ├── 1-analyze.md
│   ├── 2-tech_review.md
│   ├── 3-design_review.md
│   └── 4-summary.md
└── metadata.json       # Duration, token usage, step status
```

## Ecosystem

```
agency-agents-zh (186 role definitions)
        │
        ▼ referenced by
agency-orchestrator (this project)
        │
        ▼ optional integration
shellward (security middleware)
```

## Roadmap

- [x] **v0.1** — YAML workflow, DAG engine, Claude connector, CLI
- [ ] **v0.2** — Human approval nodes, OpenAI/Ollama connectors, iteration loops
- [ ] **v0.3** — Workflow templates, Web UI, MCP Server mode

## License

Apache-2.0
