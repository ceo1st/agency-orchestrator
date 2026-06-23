#!/usr/bin/env node
// 多源整合「创意提示词库」（图像生成）。源均为 CC BY 4.0，内置时在 UI 标注出处与作者署名。
//   源 A: YouMind/awesome-nano-banana-pro-prompts（README_zh.md，含预览图 URL）
//   源 B: jimmylv/awesome-nano-banana（cases/*/case.yml，结构化，图取 raw GitHub）
// 只存「文本提示词 + 预览图 URL（外链，不下载）」，保持轻量、版权干净。
//
// 用法：node scripts/import-creative-prompts.mjs <youmind README_zh.md> <jimmylv repo 根> <out.json>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const [youmindReadme, jimmylvRoot, out] = process.argv.slice(2);
if (!out) { console.error('用法: node scripts/import-creative-prompts.mjs <youmind README_zh.md> <jimmylv 根> <out.json>'); process.exit(1); }

// 更细的分类（关键词启发式；命不中归「其他」）。
const CATEGORY_RULES = [
  ['人像 / 写真', /人像|肖像|自拍|写真|portrait|证件照|大头照|形象照/i],
  ['电商 / 产品', /电商|产品|商品|主图|包装|带货|详情页|手机壳|周边/i],
  ['海报 / 广告', /海报|广告|banner|宣传|封面|kv|促销|活动图/i],
  ['信息图 / 排版', /信息图|infographic|图表|流程|排版|卡片|bento|知识图|时间线|思维导图/i],
  ['Logo / 品牌', /logo|标志|品牌|vi|徽章|图标|icon/i],
  ['插画 / 绘画', /插画|illustration|手绘|线稿|水彩|油画|素描|绘本/i],
  ['国风 / 水墨', /国风|水墨|中国风|工笔|古风|山水/i],
  ['3D / 手办', /3d|手办|玩偶|盲盒|渲染|c4d|建模|q版|chibi|粘土|clay/i],
  ['动漫 / 漫画', /动漫|漫画|二次元|anime|manga|赛璐璐|分镜|条漫/i],
  ['角色 / IP', /角色|character|ip|吉祥物|mascot|表情|贴纸|emoji/i],
  ['摄影 / 影视', /摄影|photo|电影|剧照|cinematic|镜头|胶片|写真集|大片/i],
  ['建筑 / 空间', /建筑|室内|空间|场景|展厅|店铺|装修/i],
];
function categorize(text) {
  for (const [name, re] of CATEGORY_RULES) if (re.test(text)) return name;
  return '其他';
}

const prompts = [];

// ── 源 A：YouMind README_zh.md ──
if (youmindReadme && existsSync(youmindReadme)) {
  const md = readFileSync(youmindReadme, 'utf-8');
  const blocks = md.split(/\n### No\. \d+:/).slice(1);
  const titles = [...md.matchAll(/\n### No\. \d+:\s*(.+)/g)].map((m) => m[1].trim());
  blocks.forEach((block, i) => {
    const promptM = block.match(/####\s*📝\s*提示词\s*\n+```[^\n]*\n([\s\S]*?)\n```/);
    if (!promptM) return;
    const prompt = promptM[1].trim();
    const title = titles[i] || `Prompt ${i + 1}`;
    const descM = block.match(/####\s*📖\s*描述\s*\n+([\s\S]*?)\n+####/);
    const description = descM ? descM[1].trim() : '';
    const imgM = block.match(/<img src="(https:\/\/cms-assets\.youmind\.com[^"]+)"/);
    const authorM = block.match(/-\s*\*\*作者:\*\*\s*\[([^\]]+)\]\(([^)]+)\)/);
    prompts.push({
      id: `ym-${i + 1}`, title, description, prompt,
      category: categorize(`${title} ${description}`),
      image: imgM ? imgM[1] : '',
      author: authorM ? authorM[1] : '', authorUrl: authorM ? authorM[2] : '',
      source: 'YouMind',
    });
  });
}

// ── 源 B：jimmylv/awesome-nano-banana cases/*/case.yml ──
if (jimmylvRoot && existsSync(join(jimmylvRoot, 'cases'))) {
  const RAW = 'https://raw.githubusercontent.com/jimmylv/awesome-nano-banana/main/cases';
  const dirs = readdirSync(join(jimmylvRoot, 'cases')).filter((d) => existsSync(join(jimmylvRoot, 'cases', d, 'case.yml')));
  for (const d of dirs) {
    try {
      const c = yaml.load(readFileSync(join(jimmylvRoot, 'cases', d, 'case.yml'), 'utf-8'));
      const prompt = (c.prompt || c.prompt_en || '').trim();
      if (!prompt) continue;
      const title = (c.title || c.title_en || `Case ${d}`).trim();
      prompts.push({
        id: `jl-${d}`, title, description: (c.reference_note || '').trim(), prompt,
        category: categorize(`${title} ${c.prompt || ''}`),
        image: c.image ? `${RAW}/${encodeURIComponent(d)}/${encodeURIComponent(c.image)}` : '',
        author: c.author || '', authorUrl: c.author_link || '',
        source: 'awesome-nano-banana',
      });
    } catch { /* skip bad case */ }
  }
}

const dataset = {
  model: 'Nano Banana / Gemini 图像生成',
  sources: [
    { name: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts', url: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    { name: 'jimmylv/awesome-nano-banana', url: 'https://github.com/jimmylv/awesome-nano-banana', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
  ],
  count: prompts.length,
  prompts,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dataset, null, 2), 'utf-8');
const byCat = {}; const bySrc = {};
prompts.forEach((p) => { byCat[p.category] = (byCat[p.category] || 0) + 1; bySrc[p.source] = (bySrc[p.source] || 0) + 1; });
const withImg = prompts.filter((p) => p.image).length;
console.log(`✅ ${prompts.length} 条 → ${out}（带预览图 ${withImg} 条）`);
console.log('按源:', JSON.stringify(bySrc));
console.log('按分类:', JSON.stringify(byCat));
