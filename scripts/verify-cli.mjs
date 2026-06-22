#!/usr/bin/env node
// 校验「构建出的 dist/cli.js」实现了源码声明的所有顶层命令 —— 防止 #80 那类
// （发布的 dist 陈旧 / 半成品，README 写了 prompt/team/skills 但二进制里没有）复发。
//
// 取 src/cli.ts 里的 knownCmds 作为权威命令清单，逐个断言 dist/cli.js 有对应 `case '<cmd>'`。
// 因为 prepublishOnly 会先 `npm run build` 再跑本脚本，本质是给「tsc 是否真的把最新源码
// 编译进 dist」上了一道闸：只要 dist 落后于源码，发布就 fail。
//
// 退出码 0 = 一致；1 = dist 缺命令。

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('src/cli.ts');
const DIST = resolve('dist/cli.js');

function fail(msg) {
  console.error(`\n❌ CLI 命令校验失败：${msg}`);
  console.error('   这正是 #80 的根因：发布的 dist 落后于源码 / README，用户敲文档里的命令却「命令不存在」。');
  console.error('   请确认 `npm run build` 成功且 dist/cli.js 是最新的，再发布。\n');
  process.exit(1);
}

if (!existsSync(SRC)) fail(`找不到源文件：${SRC}`);
if (!existsSync(DIST)) fail(`找不到构建产物：${DIST}（先 npm run build）`);

const src = readFileSync(SRC, 'utf-8');
const dist = readFileSync(DIST, 'utf-8');

// 从 src/cli.ts 抽取权威命令清单：const knownCmds = ['run', 'validate', ...]
const m = src.match(/knownCmds\s*=\s*\[([^\]]*)\]/s);
if (!m) fail('在 src/cli.ts 里没找到 knownCmds 数组（脚本需更新匹配规则）');
const cmds = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]);
if (cmds.length === 0) fail('knownCmds 解析为空');

const missing = cmds.filter((c) => !dist.includes(`case '${c}'`) && !dist.includes(`case "${c}"`));
if (missing.length > 0) {
  fail(`dist/cli.js 缺以下命令的实现：${missing.join(', ')}`);
}

console.log(`✅ CLI 命令完整：dist/cli.js 实现了全部 ${cmds.length} 个命令`);
console.log(`   ${cmds.join(', ')}`);
