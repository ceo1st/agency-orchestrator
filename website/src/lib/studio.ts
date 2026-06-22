// Shared types + API client for the Studio (talks to web/server.js backend).

export interface Role {
  id: string;
  category: string;
  categoryName: string;
  name: string;
  description: string;
  color?: string;
  content?: string;
}

export interface WorkflowStepMeta {
  id: string;
  role: string;
  name?: string;
  emoji?: string;
}

export interface WorkflowInput {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface Workflow {
  file: string;
  filename: string;
  name: string;
  description?: string;
  inputs?: WorkflowInput[];
  steps?: WorkflowStepMeta[];
  provider?: string;
  private?: boolean;
}

export interface RunStepSummary {
  id: string;
  status: string;
  agentName?: string;
  agentEmoji?: string;
  duration?: string;
  tokens?: { input: number; output: number };
  content?: string;
}

export interface RunSummary {
  id: string;
  name: string;
  success: boolean;
  duration?: string;
  tokens?: { input: number; output: number };
  stepCount?: number;
  completedCount?: number;
  file?: string;
  steps?: RunStepSummary[];
}

export interface ComposeResult {
  file: string;
  yaml: string;
  warnings?: string[];
}

// ── 可编辑画布 graph 模型（与服务端 src/canvas/graph.ts 对齐）──
export interface CanvasNode {
  id: string;
  position: { x: number; y: number };
  /** 该步骤的完整 YAML 定义，保真往返用。 */
  data: Record<string, unknown>;
}
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}
export interface CanvasGraphResponse {
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  file: string;
  /** 仅用户目录(COMPOSED_DIR)的工作流可就地保存；内置模板只读。 */
  editable: boolean;
}

export interface TeamRole {
  role: string;
  name?: string;
  emoji?: string;
  note?: string;
}

export interface Team {
  slug: string;
  name: string;
  description?: string;
  roles: TeamRole[];
  lang?: string;
  provider?: string;
  source?: string;
  created?: string;
}

// ── Prompt Lab ──
export type PromptMode = "system" | "user";
export interface PromptVersion {
  content: string;
  note?: string;
  created?: string;
  source?: "original" | "optimize" | "manual" | "garden";
}
export interface PromptRecord {
  kind: "prompt";
  name: string;
  mode: PromptMode;
  favorite?: boolean;
  versions: PromptVersion[];
  created?: string;
}
export interface GardenSeed {
  id: string;
  name: string;
  mode: PromptMode;
  lang: string;
  tags: string[];
  content: string;
}
export interface ScoreResult {
  ranking: { label: string; score: number; reason: string }[];
  best: string | null;
}

export type SseHandler = (event: string, data: any) => void;

const API = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

async function delJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export interface ProviderKeyStatus {
  family: "api" | "local";
  hasKey?: boolean;
  fromEnv?: boolean;
  baseUrl: string;
  model?: string;
  supportsBaseUrl?: boolean;
  configured?: boolean;
}

export interface CliProviderStatus {
  name: string;
  installed: boolean;
}

export interface ConfigResponse {
  providers: Record<string, ProviderKeyStatus>;
  cli: (string | CliProviderStatus)[];
  /** 本机已探测到、可零配置直接用的订阅制 CLI provider 名。 */
  installedCli?: string[];
  /** 推荐默认 provider：已装 CLI 优先 > 已配 key > 默认。 */
  recommended?: string;
  defaultProvider: string;
}

const ACTIVE_KEY = "ao-active-provider";
export function getActiveProvider(): string {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  // 空串（老用户存过的「默认」）也归一到旗舰默认
  return window.localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROVIDER;
}
export function setActiveProvider(p: string) {
  window.localStorage.setItem(ACTIVE_KEY, p);
}
/** 用户是否显式选过 provider（localStorage 有非空值）。没选过 → 可采用后端推荐的零配置 provider。 */
export function hasExplicitProvider(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(ACTIVE_KEY);
}

export interface UsageDay {
  date: string;
  input: number;
  output: number;
  runs: number;
}
export interface UsageRole {
  role: string;
  name: string;
  runs: number;
  input: number;
  output: number;
}
export interface UsageResponse {
  totalRuns: number;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  byDay: UsageDay[];
  byRole: UsageRole[];
  firstDate: string | null;
  lastDate: string | null;
}

/** Rough USD price per 1M tokens (input/output) for cost estimation. */
export const PRICING: Record<string, { label: string; in: number; out: number }> = {
  deepseek: { label: "DeepSeek", in: 0.27, out: 1.1 },
  "gpt-4o": { label: "OpenAI GPT-4o", in: 2.5, out: 10 },
  "claude-sonnet": { label: "Claude Sonnet", in: 3, out: 15 },
  gemini: { label: "Gemini 1.5 Pro", in: 1.25, out: 5 },
};

export interface CompareVerdict {
  multiScore: number;
  baseScore: number;
  winner: "multi-agent" | "baseline" | "tie";
  consistent: boolean;
  reasons: string[];
}
export interface CompareResult {
  multiOutput: string;
  baselineOutput: string;
  verdict: CompareVerdict | null;
}

export const api = {
  health: () => getJSON<{ ok: boolean; version: string }>("/health"),
  usage: () => getJSON<UsageResponse>("/usage"),
  config: () => getJSON<ConfigResponse>("/config"),
  saveConfig: (body: { provider: string; apiKey?: string; baseUrl?: string; model?: string }) =>
    postJSON<{ ok: boolean }>("/config", body),
  testProvider: (provider: string) =>
    postJSON<{ ok: boolean; latencyMs?: number; error?: string; note?: string }>("/test-provider", { provider }),
  roles: (lang?: string) => getJSON<Role[]>(`/roles${lang === "en" ? "?lang=en" : ""}`),
  role: (category: string, id: string, lang?: string) =>
    getJSON<Role>(`/roles/${category}/${id}${lang === "en" ? "?lang=en" : ""}`),
  workflows: (lang?: string) => getJSON<Workflow[]>(`/workflows${lang === "en" ? "?lang=en" : ""}`),
  // ── 可编辑画布：工作流 YAML ↔ graph（转换在引擎侧，前端只碰 graph JSON）──
  workflowGraph: (file: string) => getJSON<CanvasGraphResponse>(`/workflows/graph?file=${encodeURIComponent(file)}`),
  saveWorkflowGraph: (body: { file?: string; name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; baseYaml?: string }) =>
    postJSON<{ file: string; overwritten: boolean; errors?: string[] }>("/workflows/graph", body),
  runs: () => getJSON<RunSummary[]>("/runs"),
  run: (id: string) => getJSON<RunSummary>(`/runs/${encodeURIComponent(id)}`),
  compose: (body: { description: string; roles: string[]; name?: string; provider?: string; lang?: string }) =>
    postJSON<ComposeResult>("/compose", body),
  // 团队 / Loadout：可复用角色阵容，与 `ao team` CLI 共用 ~/.ao/teams
  teams: () => getJSON<{ teams: Team[] }>("/teams").then((r) => r.teams),
  saveTeam: (body: { name: string; description?: string; roles: TeamRole[]; lang?: string; provider?: string }) =>
    postJSON<{ ok: boolean; slug: string; file: string }>("/teams", body),
  deleteTeam: (slug: string) => delJSON<{ ok: boolean }>(`/teams/${encodeURIComponent(slug)}`),
  // 把人工输入写回正在等待的运行（human_input / approval 节点暂停时）
  runInput: (runId: string, text: string) =>
    postJSON<{ ok: boolean }>("/run-input", { runId, text }),
  // ── 多智能体 vs 单次基线对比（本地引擎，非流式，可能较慢）──
  compare: (body: { file: string; inputs: Record<string, string>; provider?: string }) =>
    postJSON<CompareResult>("/compare", body),
  // ── Prompt Lab ──
  optimizePrompt: (body: { rawPrompt: string; mode: PromptMode; provider?: string; lang?: string; model?: string }) =>
    postJSON<{ optimized: string }>("/prompt/optimize", body),
  testPrompt: (body: { prompt: string; mode: PromptMode; testInput: string; provider?: string; model?: string }) =>
    postJSON<{ output: string }>("/prompt/test", body),
  scorePrompts: (body: { testInput: string; candidates: { label: string; output: string }[]; provider?: string; lang?: string }) =>
    postJSON<ScoreResult>("/prompt/score", body),
  prompts: () => getJSON<{ prompts: PromptRecord[] }>("/prompts").then((r) => r.prompts),
  savePrompt: (body: { name: string; mode: PromptMode; versions: PromptVersion[]; favorite?: boolean }) =>
    postJSON<{ ok: boolean; slug: string }>("/prompts", body),
  deletePrompt: (slug: string) => delJSON<{ ok: boolean }>(`/prompts/${encodeURIComponent(slug)}`),
  promptGarden: () => getJSON<{ seeds: GardenSeed[] }>("/prompt/garden").then((r) => r.seeds),
};

/** Parse a Server-Sent-Events stream coming from a POST response body. */
async function streamSse(
  path: string,
  body: unknown,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    onEvent("error", { message: msg });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const dispatch = (chunk: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let data: any = dataLines.join("\n");
    try {
      data = JSON.parse(data);
    } catch {
      /* keep raw string */
    }
    onEvent(event, data);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      dispatch(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  if (buf.trim()) dispatch(buf);
}

export function runWorkflow(
  body: { file: string; inputs?: Record<string, string>; provider?: string; resume?: string | boolean; fromStep?: string; feedback?: string; materialize?: boolean },
  onEvent: SseHandler,
  signal?: AbortSignal,
) {
  return streamSse("/run", body, onEvent, signal);
}

export function runRole(
  body: { role: string; task: string; provider?: string; lang?: string },
  onEvent: SseHandler,
  signal?: AbortSignal,
) {
  return streamSse("/run-role", body, onEvent, signal);
}

// 默认 provider：旗舰赞助商 APINEBULA（取代原来的 DeepSeek 默认）
export const DEFAULT_PROVIDER = "apinebula";

export const PROVIDERS = ["apinebula", "compshare", "agnes", "deepseek", "openai", "claude", "claude-code", "gemini-cli", "openclaw-cli", "ollama"];

// 仅品牌名（语言无关）。
export const PROVIDER_LABELS: Record<string, string> = {
  apinebula: "APINEBULA",
  deepseek: "DeepSeek",
  compshare: "CompShare",
  agnes: "Agnes AI",
  openai: "OpenAI",
  claude: "Claude",
  "claude-code": "Claude Code CLI",
  "gemini-cli": "Gemini CLI",
  "openclaw-cli": "OpenClaw CLI",
  ollama: "Ollama",
};
