/**
 * custom-providers.ts 测试 —— 自定义供应商的元数据 CRUD + id 校验
 */
import { validateCustomProviderId, readCustomProviders, addCustomProvider, removeCustomProvider, updateCustomProvider } from '../src/utils/custom-providers.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

function tmpFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aotest-customprov-'));
  return join(dir, 'custom-providers.json');
}

console.log('\n─── validateCustomProviderId ───');

test('合法 id 通过校验', () => {
  const err = validateCustomProviderId('my-provider', new Set());
  assert(err === null, `期望通过，实际: ${err}`);
});

test('大写字母被拒绝', () => {
  const err = validateCustomProviderId('MyProvider', new Set());
  assert(err !== null, '大写应被拒绝');
});

test('数字开头被拒绝', () => {
  const err = validateCustomProviderId('123abc', new Set());
  assert(err !== null, '数字开头应被拒绝');
});

test('空格/特殊字符被拒绝', () => {
  const err = validateCustomProviderId('my provider!', new Set());
  assert(err !== null, '空格/特殊字符应被拒绝');
});

test('单字符太短被拒绝', () => {
  const err = validateCustomProviderId('a', new Set());
  assert(err !== null, '单字符应被拒绝');
});

test('与内置 provider id 冲突被拒绝', () => {
  const err = validateCustomProviderId('deepseek', new Set(['deepseek', 'openai', 'claude']));
  assert(err !== null, '应拒绝与保留字冲突的 id');
});

console.log('\n─── 自定义供应商 CRUD ───');

test('新增后能读回', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'my-relay', name: '我的中转', homepageUrl: 'https://example.com' });
  const list = readCustomProviders(p);
  assert(list.length === 1, `应有 1 条，实际 ${list.length}`);
  assert(list[0].id === 'my-relay' && list[0].name === '我的中转', `内容不对: ${JSON.stringify(list[0])}`);
  assert(typeof list[0].createdAt === 'number', '应自动打上 createdAt');
});

test('新增多条保持顺序', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: 'A' });
  addCustomProvider(p, { id: 'b', name: 'B' });
  const list = readCustomProviders(p);
  assert(list.map((x) => x.id).join(',') === 'a,b', `顺序不对: ${JSON.stringify(list)}`);
});

test('删除指定 id 后其余保留', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: 'A' });
  addCustomProvider(p, { id: 'b', name: 'B' });
  removeCustomProvider(p, 'a');
  const list = readCustomProviders(p);
  assert(list.length === 1 && list[0].id === 'b', `期望只剩 b，实际: ${JSON.stringify(list)}`);
});

test('文件不存在时读取返回空数组', () => {
  const p = tmpFile(); // 只生成路径，不真的写文件
  const list = readCustomProviders(p);
  assert(Array.isArray(list) && list.length === 0, '应返回空数组');
});

test('更新名称/备注/官网,id 与 createdAt 不变', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: '旧名', note: '旧备注', homepageUrl: 'https://old.com' });
  const before = readCustomProviders(p)[0];
  updateCustomProvider(p, 'a', { name: '新名', note: '新备注', homepageUrl: 'https://new.com' });
  const after = readCustomProviders(p)[0];
  assert(after.name === '新名' && after.note === '新备注' && after.homepageUrl === 'https://new.com', `更新未生效: ${JSON.stringify(after)}`);
  assert(after.id === 'a' && after.createdAt === before.createdAt, 'id/createdAt 不应变');
});

test('更新时传空串清除可选字段,空名称被忽略', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: '名字', note: '备注', homepageUrl: 'https://x.com' });
  updateCustomProvider(p, 'a', { name: '  ', note: '', homepageUrl: '' });
  const after = readCustomProviders(p)[0];
  assert(after.name === '名字', `空名称不应覆盖,实际: ${after.name}`);
  assert(after.note === undefined && after.homepageUrl === undefined, `空串应清除可选字段: ${JSON.stringify(after)}`);
});

test('更新不存在的 id 不报错也不新增', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: 'A' });
  updateCustomProvider(p, 'ghost', { name: 'X' });
  assert(readCustomProviders(p).length === 1, '不应新增条目');
});

test('文件内容损坏时读取返回空数组（不崩）', () => {
  const p = tmpFile();
  addCustomProvider(p, { id: 'a', name: 'A' }); // 先创建目录
  writeFileSync(p, '{not valid json', 'utf-8');
  const list = readCustomProviders(p);
  assert(Array.isArray(list) && list.length === 0, '损坏内容应兜底为空数组');
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
