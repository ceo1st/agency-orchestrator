/**
 * agency-orchestrator — 公开 API
 *
 * 使用方式:
 *   import { run, validate, plan } from 'agency-orchestrator';
 */

export { parseWorkflow, validateWorkflow } from './core/parser.js';
export { buildDAG, formatDAG } from './core/dag.js';
export { executeDAG } from './core/executor.js';
export { renderTemplate, extractVariables } from './core/template.js';
export { loadAgent, listAgents } from './agents/loader.js';
export { ClaudeConnector } from './connectors/claude.js';
export { OllamaConnector } from './connectors/ollama.js';
export { saveResults } from './output/reporter.js';

export type {
  WorkflowDefinition,
  StepDefinition,
  LLMConfig,
  LLMConnector,
  LLMResult,
  AgentDefinition,
  WorkflowResult,
  StepResult,
  DAGNode,
} from './types.js';

import { parseWorkflow, validateWorkflow } from './core/parser.js';
import { buildDAG, formatDAG } from './core/dag.js';
import { executeDAG, type ExecutorOptions } from './core/executor.js';
import { ClaudeConnector } from './connectors/claude.js';
import { OllamaConnector } from './connectors/ollama.js';
import { saveResults, printStepStart, printStepComplete, printSummary } from './output/reporter.js';
import type { LLMConnector } from './types.js';

/**
 * 一行运行工作流（高级 API）
 */
export async function run(
  workflowPath: string,
  inputs: Record<string, string>,
  options?: { outputDir?: string; quiet?: boolean }
): Promise<import('./types.js').WorkflowResult> {
  const workflow = parseWorkflow(workflowPath);

  // 校验
  const errors = validateWorkflow(workflow);
  if (errors.length > 0) {
    throw new Error(`工作流校验失败:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  // 构建 DAG
  const dag = buildDAG(workflow);

  // 创建 connector
  let connector: LLMConnector;
  switch (workflow.llm.provider) {
    case 'claude':
      connector = new ClaudeConnector();
      break;
    case 'ollama':
      connector = new OllamaConnector();
      break;
    default:
      throw new Error(`暂不支持 provider: ${workflow.llm.provider}（支持 claude / ollama）`);
  }

  // 构建输入
  const inputMap = new Map(Object.entries(inputs));

  // 检查必填输入
  for (const def of workflow.inputs || []) {
    if (def.required && !inputMap.has(def.name)) {
      throw new Error(`缺少必填输入: ${def.name}`);
    }
  }

  // 执行
  let stepCounter = 0;
  const totalSteps = workflow.steps.length;
  const quiet = options?.quiet ?? false;

  if (!quiet) {
    console.log(`\n  工作流: ${workflow.name}`);
    console.log(`  步骤数: ${totalSteps} | 并发: ${workflow.concurrency} | 模型: ${workflow.llm.model}`);
    console.log('─'.repeat(50));
  }

  const result = await executeDAG(dag, {
    connector,
    agentsDir: workflow.agents_dir,
    llmConfig: workflow.llm,
    concurrency: workflow.concurrency || 2,
    inputs: inputMap,
    onStepStart: quiet ? undefined : (node) => {
      stepCounter++;
      printStepStart(node, stepCounter, totalSteps);
    },
    onStepComplete: quiet ? undefined : (node) => {
      printStepComplete(node);
    },
  } satisfies ExecutorOptions);

  result.name = workflow.name;

  // 保存结果
  const outputDir = options?.outputDir || '.ao-output';
  const outputPath = saveResults(result, outputDir);

  if (!quiet) {
    printSummary(result, outputPath);
  }

  return result;
}
