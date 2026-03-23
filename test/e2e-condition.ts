/**
 * 条件分支 E2E 测试
 * 验证: condition 匹配/不匹配、级联跳过、depends_on_mode: any_completed
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { parseWorkflow } from '../src/core/parser.js';
import { buildDAG } from '../src/core/dag.js';
import { executeDAG } from '../src/core/executor.js';
import type { LLMConnector, LLMResult, LLMConfig } from '../src/types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((err) => {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  });
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// Mock LLM — 返回包含关键词的固定内容
class MockConnector implements LLMConnector {
  callLog: { system: string; user: string }[] = [];

  async chat(systemPrompt: string, userMessage: string, _config: LLMConfig): Promise<LLMResult> {
    this.callLog.push({ system: systemPrompt.slice(0, 100), user: userMessage.slice(0, 100) });
    const content = `分析结果: mock_keyword`;
    await new Promise(r => setTimeout(r, 5));
    return {
      content,
      usage: { input_tokens: systemPrompt.length + userMessage.length, output_tokens: content.length },
    };
  }
}

const tmpDir = resolve(import.meta.dirname!, '../.test-tmp-condition');
const agentsDir = resolve(import.meta.dirname!, '../node_modules/agency-agents-zh');

// 创建临时目录
mkdirSync(tmpDir, { recursive: true });

const baseLlm = `
llm:
  provider: claude
  model: test
  max_tokens: 1024
  timeout: 5000
  retry: 0
`;

// ─── Test 1: condition 匹配 → 正常执行 ───
console.log('\n=== E2E: 条件分支 ===');

await test('condition 匹配: 步骤正常执行', async () => {
  const yamlPath = resolve(tmpDir, 'cond-match.yaml');
  writeFileSync(yamlPath, `
name: 条件匹配测试
description: condition 匹配时步骤正常执行
agents_dir: ${agentsDir}
${baseLlm}
inputs:
  - name: category
    required: true
steps:
  - id: step_a
    role: product/product-manager
    task: "分析类别: {{category}}"
    output: result_a
    condition: "{{category}} contains bug"
`);

  const wf = parseWorkflow(yamlPath);
  const dag = buildDAG(wf);
  const mock = new MockConnector();

  const result = await executeDAG(dag, {
    connector: mock,
    agentsDir,
    llmConfig: wf.llm,
    concurrency: 1,
    inputs: new Map([['category', 'this is a bug report']]),
  });

  assert(result.steps.length === 1, `应有 1 步结果，实际: ${result.steps.length}`);
  assert(result.steps[0].status === 'completed', `步骤应完成，实际: ${result.steps[0].status}`);
  assert(mock.callLog.length === 1, `LLM 应被调用 1 次，实际: ${mock.callLog.length}`);
});

// ─── Test 2: condition 不匹配 → 跳过，兄弟步骤正常执行 ───
await test('condition 不匹配: 步骤跳过，兄弟执行', async () => {
  const yamlPath = resolve(tmpDir, 'cond-mismatch.yaml');
  writeFileSync(yamlPath, `
name: 条件不匹配测试
description: condition 不匹配时跳过，兄弟步骤正常执行
agents_dir: ${agentsDir}
${baseLlm}
inputs:
  - name: category
    required: true
steps:
  - id: step_bug
    role: product/product-manager
    task: "处理 bug: {{category}}"
    output: bug_result
    condition: "{{category}} contains bug"
  - id: step_feature
    role: engineering/engineering-software-architect
    task: "处理 feature: {{category}}"
    output: feature_result
    condition: "{{category}} contains feature"
`);

  const wf = parseWorkflow(yamlPath);
  const dag = buildDAG(wf);
  const mock = new MockConnector();

  const result = await executeDAG(dag, {
    connector: mock,
    agentsDir,
    llmConfig: wf.llm,
    concurrency: 2,
    inputs: new Map([['category', 'new feature request']]),
  });

  assert(result.steps.length === 2, `应有 2 步结果`);

  const bugStep = result.steps.find(s => s.id === 'step_bug')!;
  const featureStep = result.steps.find(s => s.id === 'step_feature')!;

  assert(bugStep.status === 'skipped', `bug 步骤应跳过，实际: ${bugStep.status}`);
  assert(featureStep.status === 'completed', `feature 步骤应完成，实际: ${featureStep.status}`);
  assert(mock.callLog.length === 1, `LLM 应只被调用 1 次（feature），实际: ${mock.callLog.length}`);
});

// ─── Test 3: 级联跳过 ───
await test('cascade skip: 跳过步骤的下游也被跳过', async () => {
  const yamlPath = resolve(tmpDir, 'cond-cascade.yaml');
  writeFileSync(yamlPath, `
name: 级联跳过测试
description: 条件不满足时下游也被跳过
agents_dir: ${agentsDir}
${baseLlm}
inputs:
  - name: category
    required: true
steps:
  - id: step_a
    role: product/product-manager
    task: "分析: {{category}}"
    output: result_a
    condition: "{{category}} contains bug"
  - id: step_b
    role: engineering/engineering-software-architect
    task: "基于分析结果: {{result_a}}"
    output: result_b
    depends_on:
      - step_a
`);

  const wf = parseWorkflow(yamlPath);
  const dag = buildDAG(wf);
  const mock = new MockConnector();

  const result = await executeDAG(dag, {
    connector: mock,
    agentsDir,
    llmConfig: wf.llm,
    concurrency: 1,
    inputs: new Map([['category', 'new feature']]),  // 不含 bug，step_a 跳过
  });

  assert(result.steps.length === 2, `应有 2 步结果`);
  assert(result.steps[0].status === 'skipped', `step_a 应跳过，实际: ${result.steps[0].status}`);
  assert(result.steps[1].status === 'skipped', `step_b 应级联跳过，实际: ${result.steps[1].status}`);
  assert(mock.callLog.length === 0, `LLM 不应被调用，实际: ${mock.callLog.length}`);
});

// ─── Test 4: depends_on_mode any_completed ───
await test('depends_on_mode any_completed: 互斥分支，下游仍执行', async () => {
  const yamlPath = resolve(tmpDir, 'cond-any-completed.yaml');
  writeFileSync(yamlPath, `
name: any_completed 测试
description: 两个互斥分支，下游用 any_completed 仍能执行
agents_dir: ${agentsDir}
${baseLlm}
inputs:
  - name: category
    required: true
steps:
  - id: branch_bug
    role: product/product-manager
    task: "处理 bug: {{category}}"
    output: analysis
    condition: "{{category}} contains bug"
  - id: branch_feature
    role: product/product-manager
    task: "处理 feature: {{category}}"
    output: analysis
    condition: "{{category}} contains feature"
  - id: summary
    role: engineering/engineering-software-architect
    task: "汇总分析: {{analysis}}"
    output: final_result
    depends_on:
      - branch_bug
      - branch_feature
    depends_on_mode: any_completed
`);

  const wf = parseWorkflow(yamlPath);
  const dag = buildDAG(wf);
  const mock = new MockConnector();

  const result = await executeDAG(dag, {
    connector: mock,
    agentsDir,
    llmConfig: wf.llm,
    concurrency: 2,
    inputs: new Map([['category', 'this is a bug']]),  // 只有 branch_bug 匹配
  });

  assert(result.steps.length === 3, `应有 3 步结果`);

  const bugStep = result.steps.find(s => s.id === 'branch_bug')!;
  const featureStep = result.steps.find(s => s.id === 'branch_feature')!;
  const summaryStep = result.steps.find(s => s.id === 'summary')!;

  assert(bugStep.status === 'completed', `branch_bug 应完成，实际: ${bugStep.status}`);
  assert(featureStep.status === 'skipped', `branch_feature 应跳过，实际: ${featureStep.status}`);
  assert(summaryStep.status === 'completed', `summary 应完成（any_completed），实际: ${summaryStep.status}`);
  assert(mock.callLog.length === 2, `LLM 应被调用 2 次（bug + summary），实际: ${mock.callLog.length}`);
});

// 清理临时目录
rmSync(tmpDir, { recursive: true });

// ─── 结果 ───
console.log('\n' + '='.repeat(50));
console.log(`  E2E Condition 测试: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
if (failed === 0) {
  console.log('  全部通过!');
} else {
  process.exit(1);
}
console.log('='.repeat(50) + '\n');
