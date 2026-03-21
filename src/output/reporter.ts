/**
 * 执行结果输出和保存
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkflowResult } from '../types.js';
import type { DAGNode } from '../types.js';

/**
 * 保存工作流执行结果到文件
 */
export function saveResults(result: WorkflowResult, outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirName = `${result.name}-${timestamp}`;
  const dir = join(outputDir, dirName);
  const stepsDir = join(dir, 'steps');

  mkdirSync(stepsDir, { recursive: true });

  // 保存每步的输出
  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const filename = `${i + 1}-${step.id}.md`;
    const content = step.output || step.error || '(无输出)';
    writeFileSync(join(stepsDir, filename), content, 'utf-8');
  }

  // 保存最终输出（最后一个成功步骤的结果）
  const lastCompleted = [...result.steps].reverse().find(s => s.status === 'completed');
  if (lastCompleted?.output) {
    writeFileSync(join(dir, 'summary.md'), lastCompleted.output, 'utf-8');
  }

  // 保存元数据
  const metadata = {
    name: result.name,
    success: result.success,
    totalDuration: `${(result.totalDuration / 1000).toFixed(1)}s`,
    totalTokens: result.totalTokens,
    steps: result.steps.map(s => ({
      id: s.id,
      role: s.role,
      status: s.status,
      duration: `${(s.duration / 1000).toFixed(1)}s`,
      tokens: s.tokens,
    })),
  };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

  return dir;
}

/**
 * 实时进度打印
 */
export function printStepStart(node: DAGNode, stepIndex: number, totalSteps: number): void {
  const role = node.step.role || node.step.type || '?';
  process.stdout.write(`\n  [${stepIndex}/${totalSteps}] ${node.step.id} — ${role}`);
}

export function printStepComplete(node: DAGNode): void {
  const duration = ((node.endTime || 0) - (node.startTime || 0)) / 1000;
  const tokens = node.tokenUsage
    ? `, ${node.tokenUsage.input + node.tokenUsage.output} tokens`
    : '';

  if (node.status === 'completed') {
    console.log(`  -> 完成 (${duration.toFixed(1)}s${tokens})`);
  } else if (node.status === 'failed') {
    console.log(`  -> 失败: ${node.error}`);
  } else if (node.status === 'skipped') {
    console.log(`  -> 跳过 (上游失败)`);
  }
}

export function printSummary(result: WorkflowResult, outputPath: string): void {
  const totalTokens = result.totalTokens.input + result.totalTokens.output;
  const duration = (result.totalDuration / 1000).toFixed(1);
  const completedSteps = result.steps.filter(s => s.status === 'completed').length;

  console.log('\n' + '─'.repeat(50));
  console.log(`  ${result.success ? '完成' : '部分失败'}: ${completedSteps}/${result.steps.length} 步`);
  console.log(`  耗时: ${duration}s | Tokens: ${totalTokens}`);
  console.log(`  输出: ${outputPath}`);
  console.log('─'.repeat(50));
}
