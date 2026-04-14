/**
 * YAML → WorkflowDefinition 解析器
 */
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { WorkflowDefinition, StepDefinition } from '../types.js';

export function parseWorkflow(filePath: string): WorkflowDefinition {
  const raw = readFileSync(filePath, 'utf-8');
  const doc = yaml.load(raw) as Record<string, unknown>;

  // 基本校验
  if (!doc || typeof doc !== 'object') {
    throw new Error(`工作流文件格式错误: ${filePath}`);
  }
  if (!doc.name || typeof doc.name !== 'string') {
    throw new Error('工作流缺少 name 字段');
  }
  if (!doc.steps || !Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new Error('工作流缺少 steps 或 steps 为空');
  }
  if (!doc.llm || typeof doc.llm !== 'object') {
    throw new Error('工作流缺少 llm 配置');
  }

  const llm = doc.llm as Record<string, unknown>;
  if (!llm.provider) {
    throw new Error('llm 配置缺少 provider');
  }
  // CLI providers (claude-code, gemini-cli, copilot-cli, codex-cli, openclaw-cli, hermes-cli) 和 ollama 不需要 model
  const cliProviders = ['claude-code', 'gemini-cli', 'copilot-cli', 'codex-cli', 'openclaw-cli', 'hermes-cli', 'ollama'];
  if (!llm.model && !cliProviders.includes(llm.provider as string)) {
    throw new Error('llm 配置缺少 model（CLI provider 可省略）');
  }

  // 校验每个 step
  const stepIds = new Set<string>();
  const steps = doc.steps as StepDefinition[];

  for (const step of steps) {
    if (!step.id) throw new Error('step 缺少 id');
    if (stepIds.has(step.id)) throw new Error(`step id 重复: ${step.id}`);
    stepIds.add(step.id);

    if (step.type !== 'approval' && !step.role) {
      throw new Error(`step "${step.id}" 缺少 role`);
    }
    if (!step.task && step.type !== 'approval') {
      throw new Error(`step "${step.id}" 缺少 task`);
    }

    // depends_on 的引用校验在 validateWorkflow() 中处理
  }

  return {
    name: doc.name as string,
    description: doc.description as string | undefined,
    agents_dir: (doc.agents_dir as string) || './agents',
    llm: doc.llm as WorkflowDefinition['llm'],
    concurrency: (doc.concurrency as number) || 2,
    inputs: doc.inputs as WorkflowDefinition['inputs'],
    steps,
  };
}

/**
 * 验证工作流定义（不执行），返回错误列表
 */
export function validateWorkflow(workflow: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const stepIds = new Set(workflow.steps.map(s => s.id));

  for (const step of workflow.steps) {
    // 检查 depends_on 引用
    if (step.depends_on) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          errors.push(`step "${step.id}" 依赖不存在的 step: "${dep}"`);
        }
        if (dep === step.id) {
          errors.push(`step "${step.id}" 不能依赖自己`);
        }
      }
    }

    // 检查 loop 配置
    if (step.loop) {
      if (!step.loop.back_to) {
        errors.push(`step "${step.id}" 的 loop 缺少 back_to`);
      } else if (!stepIds.has(step.loop.back_to)) {
        errors.push(`step "${step.id}" 的 loop.back_to 引用不存在的 step: "${step.loop.back_to}"`);
      }
      if (!step.loop.max_iterations || step.loop.max_iterations < 1) {
        errors.push(`step "${step.id}" 的 loop.max_iterations 必须 >= 1`);
      }
      if (step.loop.max_iterations > 10) {
        errors.push(`step "${step.id}" 的 loop.max_iterations 不能超过 10`);
      }
      if (!step.loop.exit_condition) {
        errors.push(`step "${step.id}" 的 loop 缺少 exit_condition`);
      }
    }

    // 检查 {{变量}} 引用
    const varRefs = step.task?.match(/\{\{(\w+)\}\}/g) || [];
    for (const ref of varRefs) {
      const varName = ref.slice(2, -2);
      // 变量要么来自 inputs，要么来自某个 step 的 output
      const inputDef = workflow.inputs?.find(i => i.name === varName);
      const isOutput = workflow.steps.some(s => s.output === varName);
      if (!inputDef && !isOutput && varName !== '_loop_iteration') {
        errors.push(`step "${step.id}" 引用了未定义的变量: {{${varName}}}`);
      }
      // 可选输入无默认值用在模板中 → 警告
      if (inputDef && !inputDef.required && inputDef.default === undefined) {
        errors.push(`step "${step.id}" 使用了可选输入 {{${varName}}}，但未设置默认值（未提供时为空字符串）`);
      }
    }
  }

  // 检查循环依赖
  const cycleError = detectCycle(workflow.steps);
  if (cycleError) errors.push(cycleError);

  return errors;
}

function detectCycle(steps: StepDefinition[]): string | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    adj.set(step.id, step.depends_on || []);
  }

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    for (const dep of adj.get(id) || []) {
      if (inStack.has(dep)) return true;
      if (!visited.has(dep) && dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id) && dfs(step.id)) {
      return '工作流存在循环依赖';
    }
  }
  return null;
}
