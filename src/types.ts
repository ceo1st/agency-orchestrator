/** 工作流 YAML 定义的类型 */

export interface WorkflowDefinition {
  name: string;
  description?: string;
  agents_dir: string;
  llm: LLMConfig;
  concurrency?: number;       // 最大并行步骤数，默认 2
  inputs?: InputDefinition[];
  steps: StepDefinition[];
}

export interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama' | 'deepseek';
  base_url?: string;          // 自定义 API 地址（DeepSeek、智谱等）
  api_key?: string;           // 可在 YAML 中配置，也可用环境变量
  model: string;
  max_tokens?: number;        // 默认 4096
  timeout?: number;           // 单步超时 ms，默认 120000
  retry?: number;             // 失败重试次数，默认 3
}

export interface InputDefinition {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;            // 可选输入的默认值
}

export interface StepDefinition {
  id: string;
  role: string;               // agency-agents 路径，如 "engineering/engineering-sre"
  task: string;               // 任务描述，支持 {{变量}} 模板
  output?: string;            // 输出变量名
  depends_on?: string[];      // 依赖的步骤 id
  type?: 'normal' | 'approval'; // 节点类型
  prompt?: string;            // approval 类型的提示文本
}

/** DAG 执行相关类型 */

export interface DAGNode {
  step: StepDefinition;
  dependencies: string[];     // 依赖的 node id
  dependents: string[];       // 被谁依赖
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  tokenUsage?: { input: number; output: number };
}

/** LLM Connector 相关类型 */

export interface LLMResult {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LLMConnector {
  chat(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResult>;
}

/** Agent Loader 相关类型 */

export interface AgentDefinition {
  name: string;
  description: string;
  emoji?: string;
  tools?: string;
  systemPrompt: string;       // frontmatter 之后的完整 markdown 内容
}

/** 执行结果 */

export interface WorkflowResult {
  name: string;
  success: boolean;
  steps: StepResult[];
  totalDuration: number;
  totalTokens: { input: number; output: number };
}

export interface StepResult {
  id: string;
  role: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  duration: number;
  tokens: { input: number; output: number };
}
