// 预生成「工作流模板」静态快照，供公开演示站(无后端)展示完整模板库。
// 读取 repo 根的 workflows/*.yaml(中文)与 workflows/en/*.yaml(英文),
// 产出 src/content/workflows.json（含 zh / en）。本地跑一次并提交。
//   用法(在 repo 根)：node website/scripts/gen-workflows.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
// js-yaml 在 repo 根 node_modules
const require = createRequire(join(repoRoot, "package.json"));
const yaml = require("js-yaml");

function loadDir(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
    const full = join(dir, f);
    try {
      if (statSync(full).isDirectory()) continue;
      const doc = yaml.load(readFileSync(full, "utf-8"));
      if (!doc || !doc.name || !Array.isArray(doc.steps)) continue;
      out.push({
        name: String(doc.name),
        description: doc.description ? String(doc.description) : "",
        steps: doc.steps
          .filter((s) => s && s.role)
          .map((s) => ({ id: String(s.id || ""), role: String(s.role), name: s.name ? String(s.name) : undefined, emoji: s.emoji ? String(s.emoji) : undefined })),
      });
    } catch {
      /* 跳过解析失败的模板 */
    }
  }
  // 按步骤数(更有看头的排前)再按名字，稳定排序
  return out.sort((a, b) => b.steps.length - a.steps.length || a.name.localeCompare(b.name));
}

const zh = loadDir(join(repoRoot, "workflows"));
const en = loadDir(join(repoRoot, "workflows", "en"));
const outFile = join(repoRoot, "website", "src", "content", "workflows.json");
writeFileSync(outFile, JSON.stringify({ zh, en }, null, 2), "utf-8");
console.log(`workflows.json: zh=${zh.length} en=${en.length} → ${outFile}`);
