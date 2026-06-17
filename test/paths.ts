/**
 * 测试 AO 全局目录解析（issue #20）
 */
import { aoHome, defaultOutputDir, defaultWorkflowsDir } from '../src/utils/paths.js';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }

console.log('\n─── AO 全局目录 (#20) ───');

const save = { ...process.env };
function clear() { delete process.env.AO_HOME; delete process.env.AO_OUTPUT_DIR; delete process.env.AO_WORKFLOWS_DIR; }

clear();
assert(aoHome() === null, '无 env: aoHome=null（旧行为）');
assert(defaultOutputDir() === 'ao-output', '无 env: output 默认 ao-output（cwd 相对）');
assert(defaultWorkflowsDir('workflows') === 'workflows', '无 env: workflows 用 fallback');

process.env.AO_HOME = '/tmp/aohome';
assert(defaultOutputDir() === '/tmp/aohome/ao-output', 'AO_HOME: output 落到其下');
assert(defaultWorkflowsDir('workflows') === '/tmp/aohome/ao-workflows', 'AO_HOME: workflows 落到其下');

process.env.AO_OUTPUT_DIR = '/tmp/out';
process.env.AO_WORKFLOWS_DIR = '/tmp/wf';
assert(defaultOutputDir() === '/tmp/out', 'AO_OUTPUT_DIR 优先于 AO_HOME');
assert(defaultWorkflowsDir('workflows') === '/tmp/wf', 'AO_WORKFLOWS_DIR 优先于 AO_HOME');

// 还原环境
clear();
if (save.AO_HOME) process.env.AO_HOME = save.AO_HOME;

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
