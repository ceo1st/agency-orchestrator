#!/usr/bin/env node
/**
 * agency-orchestrator CLI
 *
 * 用法:
 *   ao run workflow.yaml --input key=value --input file=@path.md
 *   ao validate workflow.yaml
 *   ao plan workflow.yaml
 *   ao roles --agents-dir ./agents
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseWorkflow, validateWorkflow } from './core/parser.js';
import { buildDAG, formatDAG } from './core/dag.js';
import { listAgents } from './agents/loader.js';
import { run } from './index.js';

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'run':
      await handleRun();
      break;
    case 'validate':
      handleValidate();
      break;
    case 'plan':
      handlePlan();
      break;
    case 'roles':
      handleRoles();
      break;
    case '--version':
    case '-v':
      console.log(getVersion());
      break;
    default:
      console.error(`未知命令: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

async function handleRun(): Promise<void> {
  const filePath = args[1];
  if (!filePath) {
    console.error('用法: ao run <workflow.yaml> [--input key=value ...]');
    process.exit(1);
  }

  const inputs = parseInputArgs();
  const outputDir = getArgValue('--output') || '.ao-output';
  const quiet = args.includes('--quiet') || args.includes('-q');

  try {
    const result = await run(resolve(filePath), inputs, { outputDir, quiet });
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(`\n错误: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function handleValidate(): void {
  const filePath = args[1];
  if (!filePath) {
    console.error('用法: ao validate <workflow.yaml>');
    process.exit(1);
  }

  try {
    const workflow = parseWorkflow(resolve(filePath));
    const errors = validateWorkflow(workflow);

    if (errors.length === 0) {
      console.log(`  ${workflow.name} — 校验通过`);
      console.log(`  ${workflow.steps.length} 个步骤, ${(workflow.inputs || []).length} 个输入`);
    } else {
      console.error(`  ${workflow.name} — 校验失败:\n`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(`错误: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function handlePlan(): void {
  const filePath = args[1];
  if (!filePath) {
    console.error('用法: ao plan <workflow.yaml>');
    process.exit(1);
  }

  try {
    const workflow = parseWorkflow(resolve(filePath));
    const errors = validateWorkflow(workflow);
    if (errors.length > 0) {
      console.error(`校验失败:\n${errors.map(e => `  - ${e}`).join('\n')}`);
      process.exit(1);
    }

    const dag = buildDAG(workflow);
    console.log(`\n  ${workflow.name}\n`);
    console.log(formatDAG(dag));
  } catch (err) {
    console.error(`错误: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function handleRoles(): void {
  const agentsDir = getArgValue('--agents-dir') || './agents';

  try {
    const agents = listAgents(resolve(agentsDir));
    console.log(`\n  共 ${agents.length} 个角色 (${agentsDir}):\n`);
    for (const agent of agents) {
      const emoji = agent.emoji || ' ';
      console.log(`  ${emoji} ${agent.name} — ${agent.description || '(无描述)'}`);
    }
  } catch (err) {
    console.error(`错误: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/** 解析 --input key=value 和 --input key=@file 参数 */
function parseInputArgs(): Record<string, string> {
  const inputs: Record<string, string> = {};

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') {
      const pair = args[++i];
      if (!pair) {
        console.error('--input 需要 key=value 参数');
        process.exit(1);
      }
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 1) {
        console.error(`无效的 input 格式: ${pair} (应为 key=value)`);
        process.exit(1);
      }
      const key = pair.slice(0, eqIdx);
      let value = pair.slice(eqIdx + 1);

      // @file 语法：从文件读取值
      if (value.startsWith('@')) {
        const filePath = resolve(value.slice(1));
        try {
          value = readFileSync(filePath, 'utf-8');
        } catch {
          console.error(`无法读取文件: ${filePath}`);
          process.exit(1);
        }
      }

      inputs[key] = value;
    }
  }

  return inputs;
}

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

function printHelp(): void {
  console.log(`
  agency-orchestrator — 多智能体编排引擎

  用法:
    ao run <workflow.yaml> [选项]     执行工作流
    ao validate <workflow.yaml>       校验工作流定义
    ao plan <workflow.yaml>           查看执行计划
    ao roles [--agents-dir path]     列出可用角色

  选项:
    --input, -i key=value    传入工作流输入变量
    --input, -i key=@file    从文件读取变量值
    --output dir             输出目录 (默认 .ao-output/)
    --quiet, -q              静默模式
    --version, -v            版本号
    --help, -h               帮助信息

  示例:
    ao run product-review.yaml -i prd=@prd.md
    ao plan content-pipeline.yaml
    ao roles --agents-dir node_modules/agency-agents-zh/agents
  `);
}

main();
