/**
 * agency-orchestrator 测试
 * 测试核心逻辑（解析、DAG、模板），不调用 LLM
 */
import { resolve } from 'node:path';
import { parseWorkflow, validateWorkflow } from '../src/core/parser.js';
import { buildDAG, formatDAG } from '../src/core/dag.js';
import { renderTemplate, extractVariables } from '../src/core/template.js';
import { loadAgent, listAgents } from '../src/agents/loader.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ─── YAML Parser ───
console.log('\n=== YAML Parser ===');

const workflowPath = resolve(import.meta.dirname!, '../workflows/product-review.yaml');

test('解析 product-review.yaml', () => {
  const wf = parseWorkflow(workflowPath);
  assert(wf.name === '产品需求评审', `name 应为 "产品需求评审"，实际: ${wf.name}`);
  assert(wf.steps.length === 4, `应有 4 步，实际: ${wf.steps.length}`);
  assert(wf.llm.provider === 'claude', `provider 应为 claude`);
  assert(wf.concurrency === 2, `concurrency 应为 2`);
});

test('解析输入定义', () => {
  const wf = parseWorkflow(workflowPath);
  assert(wf.inputs!.length === 1, '应有 1 个输入');
  assert(wf.inputs![0].name === 'prd_content', '输入名应为 prd_content');
  assert(wf.inputs![0].required === true, '应为必填');
});

test('解析步骤依赖', () => {
  const wf = parseWorkflow(workflowPath);
  const techReview = wf.steps.find(s => s.id === 'tech_review')!;
  const designReview = wf.steps.find(s => s.id === 'design_review')!;
  const summary = wf.steps.find(s => s.id === 'final_summary')!;

  assert(techReview.depends_on![0] === 'analyze', 'tech_review 应依赖 analyze');
  assert(designReview.depends_on![0] === 'analyze', 'design_review 应依赖 analyze');
  assert(summary.depends_on!.includes('tech_review'), 'summary 应依赖 tech_review');
  assert(summary.depends_on!.includes('design_review'), 'summary 应依赖 design_review');
});

// ─── Validator ───
console.log('\n=== Validator ===');

test('有效工作流无错误', () => {
  const wf = parseWorkflow(workflowPath);
  const errors = validateWorkflow(wf);
  assert(errors.length === 0, `应无错误，实际: ${errors.join(', ')}`);
});

test('检测不存在的依赖', () => {
  const wf = parseWorkflow(workflowPath);
  wf.steps[1].depends_on = ['nonexistent'];
  const errors = validateWorkflow(wf);
  assert(errors.some(e => e.includes('nonexistent')), '应检测到不存在的依赖');
});

test('检测未定义的变量引用', () => {
  const wf = parseWorkflow(workflowPath);
  wf.steps[0].task = '{{undefined_var}}';
  const errors = validateWorkflow(wf);
  assert(errors.some(e => e.includes('undefined_var')), '应检测到未定义变量');
});

test('content-pipeline.yaml 也能解析', () => {
  const path2 = resolve(import.meta.dirname!, '../workflows/content-pipeline.yaml');
  const wf = parseWorkflow(path2);
  assert(wf.name === '内容创作流水线', `name 应为 "内容创作流水线"`);
  assert(wf.steps.length === 4, `应有 4 步`);
  assert(wf.inputs!.length === 3, '应有 3 个输入');
});

// ─── DAG ───
console.log('\n=== DAG ===');

test('构建 DAG 并计算层级', () => {
  const wf = parseWorkflow(workflowPath);
  const dag = buildDAG(wf);

  assert(dag.nodes.size === 4, `应有 4 个节点`);
  assert(dag.levels.length === 3, `应有 3 层，实际: ${dag.levels.length}`);
  assert(dag.levels[0].length === 1, '第 1 层应有 1 个节点 (analyze)');
  assert(dag.levels[1].length === 2, '第 2 层应有 2 个节点 (并行)');
  assert(dag.levels[2].length === 1, '第 3 层应有 1 个节点 (summary)');
});

test('第 2 层是 tech_review 和 design_review', () => {
  const wf = parseWorkflow(workflowPath);
  const dag = buildDAG(wf);
  const level2 = dag.levels[1].sort();
  assert(level2.includes('design_review'), '应包含 design_review');
  assert(level2.includes('tech_review'), '应包含 tech_review');
});

test('formatDAG 输出包含并行标记', () => {
  const wf = parseWorkflow(workflowPath);
  const dag = buildDAG(wf);
  const text = formatDAG(dag);
  assert(text.includes('并行'), '应包含并行标记');
});

test('反向依赖正确', () => {
  const wf = parseWorkflow(workflowPath);
  const dag = buildDAG(wf);
  const analyzeNode = dag.nodes.get('analyze')!;
  assert(analyzeNode.dependents.includes('tech_review'), 'analyze 应被 tech_review 依赖');
  assert(analyzeNode.dependents.includes('design_review'), 'analyze 应被 design_review 依赖');
});

// ─── Template ───
console.log('\n=== Template ===');

test('基本变量替换', () => {
  const ctx = new Map([['name', '张三'], ['role', '工程师']]);
  const result = renderTemplate('我是{{name}}，职位是{{role}}', ctx);
  assert(result === '我是张三，职位是工程师', `结果: ${result}`);
});

test('多次引用同一变量', () => {
  const ctx = new Map([['x', 'hello']]);
  const result = renderTemplate('{{x}} and {{x}}', ctx);
  assert(result === 'hello and hello', `结果: ${result}`);
});

test('未定义变量抛错', () => {
  const ctx = new Map<string, string>();
  try {
    renderTemplate('{{missing}}', ctx);
    throw new Error('应该抛错');
  } catch (err) {
    assert((err as Error).message.includes('missing'), '错误应提及变量名');
  }
});

test('extractVariables 提取所有变量', () => {
  const vars = extractVariables('{{a}} 和 {{b}} 以及 {{a}}');
  assert(vars.length === 2, `应有 2 个唯一变量，实际: ${vars.length}`);
  assert(vars.includes('a') && vars.includes('b'), '应包含 a 和 b');
});

test('无变量的模板原样返回', () => {
  const ctx = new Map<string, string>();
  const result = renderTemplate('没有变量的文本', ctx);
  assert(result === '没有变量的文本', '应原样返回');
});

// ─── Agent Loader ───
console.log('\n=== Agent Loader ===');

const agentsDir = resolve(import.meta.dirname!, '../../agency-agents-zh');

test('加载 engineering/engineering-software-architect', () => {
  const agent = loadAgent(agentsDir, 'engineering/engineering-software-architect');
  assert(agent.name !== '', 'name 不应为空');
  assert(agent.systemPrompt.length > 100, `systemPrompt 应有实质内容，实际长度: ${agent.systemPrompt.length}`);
});

test('加载 product/product-manager', () => {
  const agent = loadAgent(agentsDir, 'product/product-manager');
  assert(agent.systemPrompt.includes('#'), 'systemPrompt 应包含 markdown 标题');
});

test('不存在的角色抛错', () => {
  try {
    loadAgent(agentsDir, 'nonexistent/fake-agent');
    throw new Error('应该抛错');
  } catch (err) {
    assert((err as Error).message.includes('不存在'), '错误应包含"不存在"');
  }
});

test('listAgents 能列出角色', () => {
  const agents = listAgents(agentsDir);
  assert(agents.length > 100, `应有 100+ 个角色，实际: ${agents.length}`);
});

// ─── 结果 ───
console.log('\n' + '='.repeat(50));
console.log(`  测试结果: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
if (failed === 0) {
  console.log('  全部通过!');
} else {
  process.exit(1);
}
console.log('='.repeat(50) + '\n');
