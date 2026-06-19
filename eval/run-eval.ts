/**
 * Phase 1 质量评测闭环：多智能体产出 vs 单次 prompt 基线，盲评打分。
 *
 * 回答项目的核心假设——"多角色 DAG 协作的产出，是否真的比用户自己写一句 prompt 更好"。
 *
 * 用法：
 *   npx tsx eval/run-eval.ts [workflow1.yaml ...]    # 默认评 story-creation
 *   AO_EVAL_PROVIDER=ollama AO_EVAL_MODEL=llama3 npx tsx eval/run-eval.ts
 *   （换强模型做评审更可信：AO_EVAL_PROVIDER=deepseek AO_EVAL_MODEL=deepseek-chat + key）
 *
 * 方法学：
 *  - 基线 = 把工作流的目标+输入合成"一句话直接要最终成品"的单次调用（模拟用户不用 ao 的做法）。
 *  - 盲评 = 同一 judge 模型，对 (A=多智能体,B=基线) 和交换后的 (A=基线,B=多智能体) 各评一次，
 *    取平均 → 抵消 LLM 评审最大的位置偏置。judge 不知道哪份来自 ao。
 */
import { resolve, basename } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { run } from '../src/index.js';
import { parseWorkflow } from '../src/core/parser.js';
import type { LLMConfig, InputDefinition } from '../src/types.js';
import { buildBaselineTask, runBaseline, finalOutput, compareOutputs } from '../src/core/compare.js';
import { GOLDEN_FIXTURES } from './golden-tasks.js';
import { decideGate, formatGate, type EvalSummary, type BaselineSnapshot } from './gate.js';

const isCli = (p: string) => p.endsWith('-cli') || p === 'claude-code';
const modelFor = (p: string, env?: string) => env || (isCli(p) ? '' : 'llama3');

// 生成与评审分离：生成用弱模型（ollama，测 ao 真实卖点——分工能否抬高弱模型），
// 评审用强模型（claude-code，给可信判别）。AO_EVAL_PROVIDER 作为两者的旧版兜底。
const GEN_PROVIDER = process.env.AO_GEN_PROVIDER || process.env.AO_EVAL_PROVIDER || 'ollama';
const GEN_MODEL = modelFor(GEN_PROVIDER, process.env.AO_GEN_MODEL || process.env.AO_EVAL_MODEL);
const JUDGE_PROVIDER = process.env.AO_JUDGE_PROVIDER || 'claude-code';
const JUDGE_MODEL = modelFor(JUDGE_PROVIDER, process.env.AO_JUDGE_MODEL);
const RUNS = Math.max(1, parseInt(process.env.AO_EVAL_RUNS || '1', 10)); // 每模板跑 N 次取平均，压噪音

const genLlm: LLMConfig = { provider: GEN_PROVIDER, model: GEN_MODEL, max_tokens: 2048, timeout: 600_000 };
const judgeLlm: LLMConfig = { provider: JUDGE_PROVIDER, model: JUDGE_MODEL, max_tokens: 400, timeout: 600_000 };

// 黄金任务集（filename → 输入）来自 eval/golden-tasks.ts，覆盖创作/社媒/商业/分析/产品五类。
const FIXTURES = GOLDEN_FIXTURES;

// 解析参数：--xxx 为开关，其余位置参数为指定的工作流路径。
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const GATE = flags.has('--gate');                 // 跑完后做回归门禁判定，失败 exit 1
const SAVE_BASELINE = flags.has('--save-baseline'); // 把本次结果写入 eval/baseline.json 作为基线
const BASELINE_PATH = resolve(import.meta.dirname!, 'baseline.json');

const workflows = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (workflows.length === 0) {
  for (const name of Object.keys(FIXTURES)) workflows.push(`workflows/${name}`);
}

/** 用 inputs 的 default 补全（与 run() 的注入一致），得到评测用的实际输入值 */
function resolveInputs(defs: InputDefinition[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs || []) if (d.default !== undefined) out[d.name] = d.default;
  return out;
}

interface EvalRow {
  workflow: string; multiScore: number; baseScore: number;
  winner: 'multi-agent' | 'baseline' | 'tie'; reasons: string[];
  multiLen: number; baseLen: number;
  /** 末次盲评双向是否一致；false 多半是 judge 位置偏置→无判别力 */
  consistent: boolean;
  runs: number;       // 实际有效评测次数
  multiWins: number;  // N 次里多智能体得分更高的次数（稳定性）
  error?: string;
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

async function evalOne(wfPath: string): Promise<EvalRow> {
  const name = basename(wfPath);
  const row: EvalRow = { workflow: name, multiScore: 0, baseScore: 0, winner: 'tie', reasons: [], multiLen: 0, baseLen: 0, consistent: false, runs: 0, multiWins: 0 };
  try {
    const wf = parseWorkflow(resolve(wfPath));
    const inputs = { ...resolveInputs(wf.inputs), ...(FIXTURES[name] || {}) };
    const baselineTask = buildBaselineTask(wf.name, wf.description, inputs);
    console.log(`\n▶ ${name}`);

    const mScores: number[] = [], bScores: number[] = [], mLens: number[] = [], bLens: number[] = [];
    for (let r = 0; r < RUNS; r++) {
      console.log(`  · run ${r + 1}/${RUNS}: 生成(${GEN_PROVIDER})…`);
      const result = await run(wfPath, inputs, {
        quiet: true, outputDir: 'eval-output/.runs',
        llmOverride: { provider: GEN_PROVIDER, model: GEN_MODEL },
      });
      const multiOut = finalOutput(result);
      const baseOut = await runBaseline(genLlm, baselineTask);

      console.log(`    盲评(${JUDGE_PROVIDER})…`);
      const verdict = await compareOutputs(judgeLlm, baselineTask, multiOut, baseOut);
      if (!verdict) { console.log('    ⚠️ judge 解析失败，跳过本 run'); continue; }

      mScores.push(verdict.multiScore); bScores.push(verdict.baseScore);
      mLens.push(multiOut.length); bLens.push(baseOut.length);
      if (verdict.multiScore > verdict.baseScore) row.multiWins++;
      if (row.reasons.length < 2) row.reasons = verdict.reasons;
      row.consistent = verdict.consistent;
      row.runs++;
    }
    if (row.runs === 0) { row.error = 'judge 全部解析失败'; return row; }
    row.multiScore = avg(mScores); row.baseScore = avg(bScores);
    row.multiLen = Math.round(avg(mLens)); row.baseLen = Math.round(avg(bLens));
    row.winner = row.multiScore > row.baseScore ? 'multi-agent'
      : row.baseScore > row.multiScore ? 'baseline' : 'tie';
  } catch (err) {
    row.error = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  return row;
}

(async () => {
  const setup = `生成 ${GEN_PROVIDER}/${GEN_MODEL || '默认'}　评审 ${JUDGE_PROVIDER}/${JUDGE_MODEL || '默认'}　每模板 ${RUNS} 次取平均`;
  console.log(`\n=== AO 质量评测闭环 ===`);
  console.log(`${setup}　|　工作流 ${workflows.length} 个`);
  console.log(`方法：多智能体 vs 单次基线，judge 双向盲评取平均（抵消位置偏置）`);

  const rows: EvalRow[] = [];
  for (const wf of workflows) rows.push(await evalOne(wf));

  // 报告
  const lines: string[] = ['# AO 质量评测报告', '', setup, ''];
  lines.push('| 工作流 | 多智能体 | 单次基线 | 胜者 | 稳定性(多胜/总) | 末次可信度 | 多/基线长度 |');
  lines.push('|---|---|---|---|---|---|---|');
  let multiWins = 0, baseWins = 0, ties = 0, evaluated = 0, lowConf = 0;
  for (const r of rows) {
    if (r.error) { lines.push(`| ${r.workflow} | — | — | ⚠️ ${r.error} | — | — | — |`); continue; }
    evaluated++;
    if (r.winner === 'multi-agent') multiWins++; else if (r.winner === 'baseline') baseWins++; else ties++;
    if (!r.consistent) lowConf++;
    const mark = r.winner === 'multi-agent' ? '✅ 多智能体' : r.winner === 'baseline' ? '❌ 基线' : '➖ 平';
    const conf = r.consistent ? '高' : '低(位置偏置)';
    lines.push(`| ${r.workflow} | ${r.multiScore.toFixed(1)} | ${r.baseScore.toFixed(1)} | ${mark} | ${r.multiWins}/${r.runs} | ${conf} | ${r.multiLen}/${r.baseLen} |`);
  }
  lines.push('', `**汇总**：评测 ${evaluated} 个 — 多智能体胜 ${multiWins}，基线胜 ${baseWins}，平 ${ties}`);
  if (lowConf > 0) {
    lines.push('', `⚠️ ${lowConf}/${evaluated} 个末次盲评可信度低（位置偏置）。多次取平均可压噪音；如仍多为低可信，说明 judge 判别力不足或两份产出确实接近。`);
  }
  for (const r of rows) if (r.reasons.length) lines.push('', `### ${r.workflow}`, ...r.reasons.map(x => `- ${x}`));

  const report = lines.join('\n');
  console.log('\n' + report + '\n');
  mkdirSync('eval-output', { recursive: true });
  writeFileSync('eval-output/report.md', report + '\n', 'utf-8');
  console.log('报告已写入 eval-output/report.md');

  // ── 回归门禁 / 基线 ──
  const summary: EvalSummary = { evaluated, multiWins, baseWins, ties, reliable: evaluated - lowConf };
  const winRate = evaluated > 0 ? summary.multiWins / summary.evaluated : 0;

  if (SAVE_BASELINE) {
    const snap: BaselineSnapshot = {
      winRate,
      reliability: evaluated > 0 ? summary.reliable / summary.evaluated : 0,
      date: new Date().toISOString().slice(0, 10),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(snap, null, 2) + '\n', 'utf-8');
    console.log(`基线已保存到 ${BASELINE_PATH}`);
  }

  if (GATE) {
    let baseline: BaselineSnapshot | null = null;
    if (existsSync(BASELINE_PATH)) {
      try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')); } catch { /* 无效基线则忽略 */ }
    }
    const result = decideGate(summary, baseline);
    console.log('\n' + formatGate(result) + '\n');
    // 不可信或失败都不放行（exit 1）；只有明确 PASS 才 exit 0
    process.exit(result.pass ? 0 : 1);
  }
})().catch(e => { console.error('评测失败:', e); process.exit(1); });
