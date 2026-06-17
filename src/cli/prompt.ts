/**
 * ao prompt — 提示词优化 / 测试 / 沉淀（Prompt Lab）
 *
 * 参考 prompt-optimizer 的核心定位：把临时问答里「靠感觉」的提示词，变成可优化、
 * 可测试、可对比、可沉淀的资产。
 *   - 优化：输入原始 prompt → LLM 一键改写（system / user 两种模式）
 *   - 测试：用样例输入实跑某版 prompt，看真实输出
 *   - 对比：原版 vs 优化版（或多版本 / 多模型）并排，可选 LLM 评分
 *   - 沉淀：保存 + 版本历史 + 收藏；内置一小撮起手模板（Prompt Garden）
 *
 * 存储沿用团队/Loadout 的模式：~/.ao/prompts/<slug>.prompt.json，CLI 与 Studio 共用。
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createConnector } from '../connectors/factory.js';
import type { LLMConfig } from '../types.js';

export type PromptMode = 'system' | 'user';

export interface PromptVersion {
  content: string;
  note?: string;            // 这次改了什么 / 备注
  created: string;          // ISO
  source?: 'original' | 'optimize' | 'manual' | 'garden';
}

export interface PromptRecord {
  kind: 'prompt';
  name: string;
  mode: PromptMode;
  favorite?: boolean;
  versions: PromptVersion[];  // 时间序，[0] 为最初版本，末尾为最新
  created: string;
}

/** 提示词库目录：默认 ~/.ao/prompts，可用 AO_PROMPTS_DIR 覆盖。 */
export function promptsDir(): string {
  return process.env.AO_PROMPTS_DIR
    ? resolve(process.env.AO_PROMPTS_DIR)
    : join(homedir(), '.ao', 'prompts');
}

export function slugify(name: string): string {
  const s = name.trim()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'prompt';
}

// ── 优化：meta-prompt → LLM ──────────────────────────────────────────────────

/** 构建「优化提示词」的 meta system prompt。 */
export function buildOptimizeMetaPrompt(mode: PromptMode, lang: 'zh' | 'en' = 'zh'): string {
  if (lang === 'en') {
    const role = mode === 'system'
      ? 'a system/role prompt that defines an AI assistant\'s persona, capabilities and constraints'
      : 'a user task prompt that asks an AI to do something';
    return `You are a world-class prompt engineer. The user's message is ${role} — treat it as RAW MATERIAL TO IMPROVE, never as a task to perform.

CRITICAL: Your output must itself be a PROMPT (an instruction meant to be sent to an AI). Do NOT answer, fulfill, or execute the user's prompt. If the input says "write a tweet selling coffee", you do NOT write the tweet — you produce a sharper *prompt* for writing that tweet.

Rewrite it to be markedly more effective:
- Make the intent and desired output explicit; remove ambiguity.
- Add the structure that helps (role/goal/constraints/steps/output-format) ONLY where it earns its place — do not bloat.
- Keep the user's original language and domain. Do NOT invent facts or over-specify details the user didn't ask for.
- ${mode === 'system' ? 'Define persona, scope, tone, and hard constraints crisply.' : 'State the task, the inputs, and the exact output format/length expected. Use [PLACEHOLDERS] where the user would fill in specifics.'}

Output ONLY the rewritten prompt itself — no preamble, no explanation, no markdown fences, no "here is".`;
  }
  const role = mode === 'system'
    ? '一段 system / 角色提示词（定义 AI 的人设、能力和约束）'
    : '一段 user 任务提示词（让 AI 去完成某件事）';
  return `你是世界顶级的提示词工程师。用户发给你的内容是${role}——把它当作【待优化的原材料】，绝不要当成一个要你去完成的任务。

最重要的一条：你的输出本身必须仍是一段【提示词】（一条准备发给 AI 的指令），不要去回答、完成或执行用户那段提示词。举例：如果输入是「帮我写个朋友圈文案卖咖啡」，你**不要**真去写文案，而是产出一段更好的「让 AI 写这条文案」的提示词。

请把它改写得明显更有效：
- 让意图和期望产出更明确，消除歧义。
- 只在「确实能提升效果」的地方补结构（角色/目标/约束/步骤/输出格式），不要为了堆结构而臃肿。
- 保持用户原本的语言和领域。不要编造事实，也不要过度补充用户没要求的细节。
- ${mode === 'system' ? '把人设、适用范围、语气、硬性约束写清楚。' : '把任务、输入、期望的输出格式/长度写清楚；用户需要自己填的地方用【方括号占位符】标出。'}

只输出改写后的提示词本身——不要开场白、不要解释、不要 markdown 代码围栏、不要「这是…」之类的话。`;
}

/** 去掉 LLM 偶尔仍加上的 ```围栏 / "这是优化后的..." 前缀。 */
export function cleanOptimizedOutput(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/);
  if (fence) s = fence[1].trim();
  return s;
}

/** 调 LLM 优化一段提示词，返回优化后的文本。 */
export async function optimizePrompt(options: {
  rawPrompt: string;
  mode: PromptMode;
  llmConfig: LLMConfig;
  lang?: 'zh' | 'en';
}): Promise<string> {
  const { rawPrompt, mode, llmConfig } = options;
  if (!rawPrompt.trim()) throw new Error('原始提示词为空');
  const lang = options.lang ?? (/[一-鿿]/.test(rawPrompt) ? 'zh' : 'en');
  const system = buildOptimizeMetaPrompt(mode, lang);
  const connector = createConnector(llmConfig);
  const result = await connector.chat(system, rawPrompt, { ...llmConfig, max_tokens: llmConfig.max_tokens || 4096 });
  const optimized = cleanOptimizedOutput(result.content);
  if (!optimized) throw new Error('优化结果为空');
  return optimized;
}

/**
 * 用某版提示词实跑一个样例输入，返回真实输出（用于「测试 / 对比」）。
 * system 模式：prompt 作为 system，testInput 作为 user。
 * user 模式：把 prompt 和样例拼成 user 消息（prompt 通常已自带任务）。
 */
export async function testPrompt(options: {
  prompt: string;
  mode: PromptMode;
  testInput: string;
  llmConfig: LLMConfig;
}): Promise<string> {
  const { prompt, mode, testInput, llmConfig } = options;
  const connector = createConnector(llmConfig);
  const system = mode === 'system' ? prompt : 'You are a helpful assistant.';
  const user = mode === 'system'
    ? (testInput || '（请按你的设定，给一个示例性的回应）')
    : (testInput ? `${prompt}\n\n---\n${testInput}` : prompt);
  const result = await connector.chat(system, user, { ...llmConfig, max_tokens: llmConfig.max_tokens || 2048 });
  return result.content.trim();
}

// ── 存储：~/.ao/prompts/<slug>.prompt.json ───────────────────────────────────

export function serializePrompt(rec: PromptRecord): string {
  return JSON.stringify(rec, null, 2) + '\n';
}

export function parsePromptFile(filePath: string): PromptRecord {
  const rec = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!rec || rec.kind !== 'prompt' || !Array.isArray(rec.versions)) {
    throw new Error(`不是提示词文件: ${filePath}`);
  }
  return rec as PromptRecord;
}

export function savePrompt(rec: PromptRecord, dir = promptsDir()): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slugify(rec.name)}.prompt.json`);
  writeFileSync(path, serializePrompt(rec), 'utf-8');
  return path;
}

export function listPrompts(dir = promptsDir()): { file: string; record: PromptRecord }[] {
  if (!existsSync(dir)) return [];
  const out: { file: string; record: PromptRecord }[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.prompt.json')) continue;
    try { out.push({ file: join(dir, f), record: parsePromptFile(join(dir, f)) }); } catch { /* skip */ }
  }
  return out;
}

export function loadPrompt(ref: string, dir = promptsDir()): PromptRecord {
  const bySlug = join(dir, `${slugify(ref)}.prompt.json`);
  if (existsSync(bySlug)) return parsePromptFile(bySlug);
  const hit = listPrompts(dir).find(p => p.record.name === ref || slugify(p.record.name) === slugify(ref));
  if (hit) return hit.record;
  throw new Error(`找不到提示词 "${ref}"`);
}

export function removePrompt(ref: string, dir = promptsDir()): string | null {
  const bySlug = join(dir, `${slugify(ref)}.prompt.json`);
  if (existsSync(bySlug)) { unlinkSync(bySlug); return bySlug; }
  const hit = listPrompts(dir).find(p => p.record.name === ref || slugify(p.record.name) === slugify(ref));
  if (hit) { unlinkSync(hit.file); return hit.file; }
  return null;
}

/** 追加一个新版本（沉淀迭代历史）。返回更新后的记录。 */
export function appendVersion(rec: PromptRecord, version: PromptVersion): PromptRecord {
  rec.versions.push(version);
  return rec;
}

// ── Prompt Garden：内置起手模板 ──────────────────────────────────────────────

export interface GardenSeed {
  id: string;
  name: string;
  mode: PromptMode;
  lang: 'zh' | 'en';
  tags: string[];
  content: string;
}

/** 一小撮高频起手模板，给「不知道从哪写起」的用户一个起点。 */
export const PROMPT_GARDEN: GardenSeed[] = [
  {
    id: 'zh-expert-role', name: '领域专家人设', mode: 'system', lang: 'zh', tags: ['通用', '角色'],
    content: '你是【某领域】资深专家，有 10 年以上一线经验。回答时：先给结论，再给依据；只讲可执行的具体建议，不说正确的废话；不确定的地方明确标注。语气专业但不端着。',
  },
  {
    id: 'zh-rewrite', name: '文本润色改写', mode: 'user', lang: 'zh', tags: ['写作'],
    content: '请把下面这段文字改写得更清晰流畅，保持原意和信息量，去掉口水话和重复，控制在原长度的 80% 以内。只输出改写后的正文：\n\n【在这里粘贴原文】',
  },
  {
    id: 'zh-extract', name: '结构化信息抽取', mode: 'user', lang: 'zh', tags: ['数据', '抽取'],
    content: '从下面的文本中抽取信息，按这个 JSON 结构输出（缺失的字段填 null，不要编造）：\n{"标题": "", "关键结论": [], "数据点": [], "待办": []}\n\n文本：\n【在这里粘贴文本】',
  },
  {
    id: 'en-expert-role', name: 'Domain Expert Persona', mode: 'system', lang: 'en', tags: ['general', 'role'],
    content: 'You are a senior expert in [DOMAIN] with 10+ years of hands-on experience. Lead with the conclusion, then the reasoning. Give specific, actionable advice only — no generic filler. Flag anything you are unsure about. Professional tone, no fluff.',
  },
  {
    id: 'en-rewrite', name: 'Rewrite & Tighten', mode: 'user', lang: 'en', tags: ['writing'],
    content: 'Rewrite the text below to be clearer and tighter while preserving meaning and all key info. Cut filler and repetition; keep it under 80% of the original length. Output only the rewritten text:\n\n[PASTE TEXT HERE]',
  },
];
