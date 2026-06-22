#!/usr/bin/env node
// 校验 React Studio 前端产物是否完整 —— 防止 #81（AppImage 白屏：website/dist 未真正落入产物）复发。
//
// 用法：
//   node scripts/verify-frontend.mjs                 # 校验源树 website/dist（打包前用）
//   node scripts/verify-frontend.mjs <dir>           # 校验指定目录
//   node scripts/verify-frontend.mjs --packed <root> # 在 electron-builder 产物里递归找 resources/app/website/dist 再校验
//
// 退出码 0 = 完整；1 = 缺失（CI 据此 fail，绝不让半成品包发出去）。

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function fail(msg) {
  console.error(`\n❌ 前端产物校验失败：${msg}`);
  console.error('   这正是 #81（AppImage 白屏）的根因：website/dist 不完整就被打包/发布。');
  console.error('   请先 `npm run build:studio` 生成完整前端，再打包。\n');
  process.exit(1);
}

/** 校验一个 website/dist 目录：必须有 index.html 且 assets/ 下至少一个 .js。 */
function verifyDistDir(dir) {
  const d = resolve(dir);
  if (!existsSync(d)) fail(`目录不存在：${d}`);

  const indexHtml = join(d, 'index.html');
  if (!existsSync(indexHtml)) fail(`缺 index.html：${indexHtml}`);
  if (statSync(indexHtml).size === 0) fail(`index.html 为空文件：${indexHtml}`);

  const assetsDir = join(d, 'assets');
  if (!existsSync(assetsDir)) fail(`缺 assets/ 目录：${assetsDir}`);
  const js = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  if (js.length === 0) fail(`assets/ 下没有任何 .js 产物：${assetsDir}`);

  console.log(`✅ 前端产物完整：${d}`);
  console.log(`   index.html ✓  assets/*.js ✓ (${js.length} 个 chunk)`);
}

/** 在 electron-builder 产物根（如 desktop/release）里递归找 resources/app/website/dist。 */
function findPackedDistDirs(root) {
  const r = resolve(root);
  if (!existsSync(r)) fail(`产物目录不存在：${r}（electron-builder 没产出 unpacked 目录？）`);
  const hits = [];
  const stack = [r];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = join(cur, e.name);
      // 命中 .../resources/app/website/dist
      // 大小写不敏感：mac 的 .app 包里是 Contents/Resources（大写 R），linux/win 是 resources。
      const norm = full.replace(/\\/g, '/').toLowerCase();
      if (norm.endsWith('resources/app/website/dist')) {
        hits.push(full);
      } else {
        stack.push(full);
      }
    }
  }
  return hits;
}

const args = process.argv.slice(2);
if (args[0] === '--packed') {
  const root = args[1] || 'desktop/release';
  const dirs = findPackedDistDirs(root);
  if (dirs.length === 0) {
    fail(`在 ${resolve(root)} 里没找到任何 resources/app/website/dist —— 前端没被打进桌面产物！`);
  }
  console.log(`🔎 在桌面产物里找到 ${dirs.length} 个前端目录，逐个校验：`);
  for (const d of dirs) verifyDistDir(d);
  console.log('\n✅ 桌面产物的前端完整，可以发布。');
} else {
  verifyDistDir(args[0] || 'website/dist');
}
