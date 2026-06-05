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
import { mkdirSync, writeFileSync } from 'node:fs';
import { run } from '../src/index.js';
import { parseWorkflow } from '../src/core/parser.js';
import { createConnector } from '../src/connectors/factory.js';
import type { LLMConfig, WorkflowResult, InputDefinition } from '../src/types.js';

const PROVIDER = process.env.AO_EVAL_PROVIDER || 'ollama';
// CLI 类 provider（claude-code / *-cli）model 留空即用 CLI 默认模型；否则默认 llama3。
const IS_CLI_PROVIDER = PROVIDER.endsWith('-cli') || PROVIDER === 'claude-code';
const MODEL = process.env.AO_EVAL_MODEL || (IS_CLI_PROVIDER ? '' : 'llama3');
const llm: LLMConfig = { provider: PROVIDER, model: MODEL, max_tokens: 2048, timeout: 600_000 };

const JUDGE_TRUNC = 3500; // 每份产出喂给 judge 前截断，避免超 judge 上下文
const trunc = (s: string) => (s.length > JUDGE_TRUNC ? s.slice(0, JUDGE_TRUNC) + '\n…[截断]' : s);

/**
 * 旗舰模板的示例输入（required 无默认的字段在这里给）。覆盖 5 类任务，
 * 用于看多智能体在"哪类任务"上稳赢、哪类不如 one-shot。
 */
const FIXTURES: Record<string, Record<string, string>> = {
  'story-creation.yaml': {}, // 用默认 premise 即可
  'tech-blog.yaml': { topic: '用 Rust 重写 Python 数据处理热点函数：从 12 秒到 0.8 秒的实战与踩坑' },
  'xiaohongshu-viral-post.yaml': { topic: '职场新人前 3 个月避坑指南' },
  'douyin-script.yaml': { topic: '30 岁转行做程序员还来得及吗' },
  'ai-opinion-article.yaml': { topic: '为什么大多数人用不好 AI：不是模型不行，是不会提问' },
  'pitch-deck-outline.yaml': { startup_idea: '用 AI 帮跨境电商中小卖家自动生成多语言商品详情页，降低本地化成本' },
  'okr-decomposition.yaml': { annual_goal: '让 SaaS 产品年度经常性收入 ARR 从 200 万做到 1000 万' },
  'investment-analysis.yaml': { target: '纳斯达克100指数ETF' },
  'product-review.yaml': {
    prd_content: [
      '# PRD：工作流执行结果一键分享',
      '## 背景：用户跑完多智能体工作流后想把成果分享给同事/客户，目前只能复制粘贴文本，排版丢失、不美观。',
      '## 目标：让用户一键把某次运行结果生成一个可分享的网页链接（含各步骤产出、可折叠）。',
      '## 范围：1) 运行结束后 CLI 给出"生成分享链接"提示；2) 上传到对象存储生成短链；3) 网页端只读展示，支持按步骤折叠、复制单步。',
      '## 非目标：不做评论/协作编辑；不做权限系统（链接即访问）。',
      '## 指标：分享转化率（跑完→生成链接）>20%；被分享链接的人均打开数。',
    ].join('\n'),
  },
};

const workflows = process.argv.slice(2);
if (workflows.length === 0) {
  for (const name of Object.keys(FIXTURES)) workflows.push(`workflows/${name}`);
}

/** 用 inputs 的 default 补全（与 run() 的注入一致），得到评测用的实际输入值 */
function resolveInputs(defs: InputDefinition[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs || []) if (d.default !== undefined) out[d.name] = d.default;
  return out;
}

/** 把工作流目标+输入合成"单次直接要成品"的基线 prompt（模拟用户不用 ao 的写法） */
function buildBaselineTask(name: string, description: string | undefined, inputs: Record<string, string>): string {
  const inputLines = Object.entries(inputs).map(([k, v]) => `- ${k}：${v}`).join('\n');
  return [
    `任务目标：${description || name}`,
    inputLines ? `\n输入信息：\n${inputLines}` : '',
    '\n请直接产出最终成品（完整、可直接交付），不要输出过程、大纲或说明文字。',
  ].join('');
}

function parseJudge(raw: string): { scoreA: number; scoreB: number; reason: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const a = Number(j.scoreA), b = Number(j.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { scoreA: a, scoreB: b, reason: String(j.reason || '').slice(0, 200) };
  } catch { return null; }
}

async function judge(taskDesc: string, outA: string, outB: string) {
  const conn = createConnector(llm);
  const prompt = [
    '你是严格、客观的内容质量评审。下面是针对同一任务的两份产出，请对比。',
    `任务：${taskDesc}`,
    '', '【产出 A】', trunc(outA), '', '【产出 B】', trunc(outB), '',
    '评判维度：完整性、具体性、可用性、是否直接可交付。',
    '只输出一行 JSON，不要任何额外文字：{"scoreA": 1-10, "scoreB": 1-10, "reason": "一句话理由"}',
  ].join('\n');
  // 解析失败重试一次（judge 偶尔会包代码块/加解释）——避免整条评测因格式问题丢失
  for (let attempt = 0; attempt < 2; attempt++) {
    const sys = attempt === 0
      ? '你是严格客观的评审，只输出 JSON。'
      : '你必须只输出一行纯 JSON，绝对不要代码块标记、前言或任何解释文字。';
    const res = await conn.chat(sys, prompt, { ...llm, max_tokens: 400 });
    const parsed = parseJudge(res.content);
    if (parsed) return parsed;
  }
  return null;
}

function finalOutput(result: WorkflowResult): string {
  const done = result.steps.filter(s => s.status === 'completed' && s.output);
  return done.length ? String(done[done.length - 1].output) : '';
}

interface EvalRow {
  workflow: string; multiScore: number; baseScore: number;
  winner: 'multi-agent' | 'baseline' | 'tie'; reasons: string[];
  multiLen: number; baseLen: number;
  /** 两次盲评是否对"真实产物"达成一致；false 多半是 judge 位置偏置→无判别力 */
  consistent: boolean;
  error?: string;
}

async function evalOne(wfPath: string): Promise<EvalRow> {
  const name = basename(wfPath);
  const row: EvalRow = { workflow: name, multiScore: 0, baseScore: 0, winner: 'tie', reasons: [], multiLen: 0, baseLen: 0, consistent: false };
  try {
    const wf = parseWorkflow(resolve(wfPath));
    const inputs = { ...resolveInputs(wf.inputs), ...(FIXTURES[name] || {}) };
    const baselineTask = buildBaselineTask(wf.name, wf.description, inputs);

    console.log(`\n▶ ${name}`);
    console.log('  · 跑多智能体工作流…');
    const result = await run(wfPath, inputs, {
      quiet: true, outputDir: 'eval-output/.runs',
      llmOverride: { provider: PROVIDER, model: MODEL },
    });
    const multiOut = finalOutput(result);
    row.multiLen = multiOut.length;

    console.log('  · 跑单次基线…');
    const conn = createConnector(llm);
    const baseOut = (await conn.chat('你是能力很强的助手，直接产出高质量的最终成品。', baselineTask, llm)).content;
    row.baseLen = baseOut.length;

    console.log('  · 盲评（双向各一次）…');
    const j1 = await judge(baselineTask, multiOut, baseOut);          // A=multi, B=base
    const j2 = await judge(baselineTask, baseOut, multiOut);          // A=base,  B=multi
    if (!j1 || !j2) { row.error = 'judge 输出无法解析为 JSON'; return row; }

    row.multiScore = (j1.scoreA + j2.scoreB) / 2;
    row.baseScore = (j1.scoreB + j2.scoreA) / 2;
    row.reasons = [j1.reason, j2.reason].filter(Boolean);
    row.winner = row.multiScore > row.baseScore ? 'multi-agent'
      : row.baseScore > row.multiScore ? 'baseline' : 'tie';
    // 一致性：pass1 认为 multi 更好(scoreA>scoreB) 应与 pass2 认为 multi 更好(scoreB>scoreA) 同向。
    // 若两次都偏向同一"位置"（如都选 B），说明 judge 只看位置不看内容→结论不可信。
    const p1MultiBetter = j1.scoreA - j1.scoreB;   // >0 多智能体更好
    const p2MultiBetter = j2.scoreB - j2.scoreA;   // >0 多智能体更好
    row.consistent = Math.sign(p1MultiBetter) === Math.sign(p2MultiBetter) && p1MultiBetter !== 0;
  } catch (err) {
    row.error = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  return row;
}

(async () => {
  console.log(`\n=== AO 质量评测闭环 ===`);
  console.log(`provider/model: ${PROVIDER}/${MODEL}　|　工作流: ${workflows.length} 个`);
  console.log(`方法：多智能体产出 vs 单次基线，judge 双向盲评取平均（抵消位置偏置）`);

  const rows: EvalRow[] = [];
  for (const wf of workflows) rows.push(await evalOne(wf));

  // 报告
  const lines: string[] = ['# AO 质量评测报告', '', `provider/model: ${PROVIDER}/${MODEL}`, ''];
  lines.push('| 工作流 | 多智能体 | 单次基线 | 胜者 | 可信度 | 多/基线长度 |');
  lines.push('|---|---|---|---|---|---|');
  let multiWins = 0, baseWins = 0, ties = 0, evaluated = 0, lowConf = 0;
  for (const r of rows) {
    if (r.error) { lines.push(`| ${r.workflow} | — | — | ⚠️ ${r.error} | — | — |`); continue; }
    evaluated++;
    if (r.winner === 'multi-agent') multiWins++; else if (r.winner === 'baseline') baseWins++; else ties++;
    if (!r.consistent) lowConf++;
    const mark = r.winner === 'multi-agent' ? '✅ 多智能体' : r.winner === 'baseline' ? '❌ 基线' : '➖ 平';
    const conf = r.consistent ? '高（双向一致）' : '低（judge 位置偏置）';
    lines.push(`| ${r.workflow} | ${r.multiScore.toFixed(1)} | ${r.baseScore.toFixed(1)} | ${mark} | ${conf} | ${r.multiLen}/${r.baseLen} |`);
  }
  lines.push('', `**汇总**：评测 ${evaluated} 个 — 多智能体胜 ${multiWins}，基线胜 ${baseWins}，平 ${ties}`);
  if (lowConf > 0) {
    lines.push('', `⚠️ ${lowConf}/${evaluated} 个评测可信度低：两次盲评只跟随位置、不随内容变化，说明当前 judge（${PROVIDER}/${MODEL}）判别力不足。`,
      '换更强的 judge（如 deepseek/claude + key：AO_EVAL_PROVIDER/AO_EVAL_MODEL）才能得到可信结论。');
  }
  for (const r of rows) if (r.reasons.length) lines.push('', `### ${r.workflow}`, ...r.reasons.map(x => `- ${x}`));

  const report = lines.join('\n');
  console.log('\n' + report + '\n');
  mkdirSync('eval-output', { recursive: true });
  writeFileSync('eval-output/report.md', report + '\n', 'utf-8');
  console.log('报告已写入 eval-output/report.md');
})().catch(e => { console.error('评测失败:', e); process.exit(1); });
