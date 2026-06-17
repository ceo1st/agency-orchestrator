/**
 * 测试 ao prompt — 提示词优化 / 沉淀模块（纯逻辑部分，不打 LLM）
 */
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slugify,
  buildOptimizeMetaPrompt,
  cleanOptimizedOutput,
  savePrompt,
  listPrompts,
  loadPrompt,
  removePrompt,
  appendVersion,
  parsePromptFile,
  PROMPT_GARDEN,
  type PromptRecord,
} from '../src/cli/prompt.js';

let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`); failed++; }
}
function assert(c: boolean, msg: string): void { if (!c) throw new Error(msg); }

console.log('\n─── ao prompt (Prompt Lab) ───');

const dir = mkdtempSync(join(tmpdir(), 'ao-prompts-'));

test('slugify 处理中文/空格', () => {
  assert(slugify('我的 提示词/库') === '我的-提示词-库', `got ${slugify('我的 提示词/库')}`);
});

test('buildOptimizeMetaPrompt 区分 system/user 与中英', () => {
  assert(buildOptimizeMetaPrompt('system', 'zh').includes('人设'), 'zh system mentions 人设');
  assert(buildOptimizeMetaPrompt('user', 'zh').includes('任务'), 'zh user mentions 任务');
  assert(/system\/role prompt/.test(buildOptimizeMetaPrompt('system', 'en')), 'en system');
  assert(buildOptimizeMetaPrompt('user', 'en').includes('Output ONLY'), 'en says output only');
});

test('cleanOptimizedOutput 去掉代码围栏', () => {
  assert(cleanOptimizedOutput('```\nhello\n```') === 'hello', 'plain fence');
  assert(cleanOptimizedOutput('```text\nhi there\n```') === 'hi there', 'lang fence');
  assert(cleanOptimizedOutput('  no fence  ') === 'no fence', 'trim only');
});

test('save / list / load / appendVersion / remove 全链路', () => {
  const now = '2026-06-18T00:00:00.000Z';
  const rec: PromptRecord = {
    kind: 'prompt', name: '测试提示词', mode: 'user', created: now,
    versions: [{ content: '原始', source: 'original', created: now }],
  };
  const file = savePrompt(rec, dir);
  assert(existsSync(file) && file.endsWith('测试提示词.prompt.json'), `saved ${file}`);

  // 追加版本并重存
  appendVersion(rec, { content: '优化版', source: 'optimize', created: now, note: '一键优化' });
  savePrompt(rec, dir);
  const loaded = loadPrompt('测试提示词', dir);
  assert(loaded.versions.length === 2, `versions ${loaded.versions.length}`);
  assert(loaded.versions[1].content === '优化版', 'latest version content');

  assert(listPrompts(dir).some(p => p.record.name === '测试提示词'), 'in list');
  const bySlug = loadPrompt(slugify('测试提示词'), dir);
  assert(bySlug.mode === 'user', 'load by slug');

  const removed = removePrompt('测试提示词', dir);
  assert(removed !== null && !existsSync(file), 'removed');
});

test('parsePromptFile 拒绝非提示词 JSON', () => {
  const bad = join(dir, 'bad.prompt.json');
  writeFileSync(bad, JSON.stringify({ kind: 'team' }), 'utf-8');
  let threw = false;
  try { parsePromptFile(bad); } catch { threw = true; }
  assert(threw, 'should reject non-prompt json');
});

test('Prompt Garden 有中英起手模板', () => {
  assert(PROMPT_GARDEN.length >= 4, 'has seeds');
  assert(PROMPT_GARDEN.some(s => s.lang === 'zh') && PROMPT_GARDEN.some(s => s.lang === 'en'), 'both langs');
  assert(PROMPT_GARDEN.every(s => s.content && (s.mode === 'system' || s.mode === 'user')), 'valid seeds');
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
