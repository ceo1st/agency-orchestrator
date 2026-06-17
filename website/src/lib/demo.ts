// 公开站「演示模式」数据层：没有本地后端时，专家库直接读静态数据
// （experts.json + public/prompts/*.md），可浏览 / 查看 / 复制提示词，但不能真跑。
// experts.json(~150kB)动态加载，避免被打进 Studio 首屏 chunk（只有进演示模式才取）。
import type { Role, Workflow } from "./studio";

interface ExpertEntry {
  category: string;
  categoryName: string;
  id: string;
  name: string;
  description: string;
  emoji?: string;
  color?: string;
}

let _data: { zh: ExpertEntry[]; en: ExpertEntry[] } | null = null;
async function loadData() {
  if (!_data) _data = (await import("@/content/experts.json")).default as { zh: ExpertEntry[]; en: ExpertEntry[] };
  return _data;
}

export async function demoRoles(lang: "zh" | "en"): Promise<Role[]> {
  const data = await loadData();
  const arr = data[lang] ?? data.zh;
  return arr.map((e) => ({
    id: e.id,
    category: e.category,
    categoryName: e.categoryName,
    name: e.name,
    description: e.description,
    color: e.color,
  }));
}

export async function demoRoleContent(lang: "zh" | "en", category: string, id: string): Promise<string> {
  const res = await fetch(`/prompts/${lang}/${category}/${id}.md`);
  if (!res.ok) throw new Error("not found");
  return res.text();
}

// 演示模式工作流：公开站无后端，这里给一组内置模板的静态快照，可浏览 / 看步骤，但不能真跑。
type DemoWf = { name: { zh: string; en: string }; desc: { zh: string; en: string }; steps: { role: string; name: { zh: string; en: string }; emoji: string }[] };
const DEMO_WORKFLOWS: DemoWf[] = [
  {
    name: { zh: "技术博客创作", en: "Tech Blog" },
    desc: { zh: "一句话主题 → 趋势调研 → 大纲 → 正文 → 润色，输出可发布的技术博客", en: "One topic → research → outline → draft → polish into a publishable post" },
    steps: [
      { role: "product/product-trend-researcher", name: { zh: "趋势研究员", en: "Trend Researcher" }, emoji: "🔬" },
      { role: "engineering/engineering-technical-writer", name: { zh: "技术作家", en: "Tech Writer" }, emoji: "✍️" },
      { role: "engineering/engineering-senior-developer", name: { zh: "资深开发", en: "Senior Dev" }, emoji: "💻" },
    ],
  },
  {
    name: { zh: "创业可行性分析", en: "Startup Feasibility" },
    desc: { zh: "市场 / 用户 / 产品 / 财务多角度并行评估，输出可行性结论", en: "Parallel market / user / product / finance analysis → feasibility verdict" },
    steps: [
      { role: "product/product-market-researcher", name: { zh: "市场研究员", en: "Market Researcher" }, emoji: "📊" },
      { role: "product/product-user-researcher", name: { zh: "用户研究员", en: "User Researcher" }, emoji: "🔍" },
      { role: "finance/finance-cfo", name: { zh: "财务总监", en: "CFO" }, emoji: "💰" },
    ],
  },
  {
    name: { zh: "PR 代码审查", en: "PR Code Review" },
    desc: { zh: "安全 / 性能 / 可读性三路并行审查 → 汇总修改建议", en: "Security / performance / readability review in parallel → consolidated feedback" },
    steps: [
      { role: "engineering/engineering-code-reviewer", name: { zh: "代码审查员", en: "Code Reviewer" }, emoji: "🔍" },
      { role: "engineering/engineering-security-engineer", name: { zh: "安全工程师", en: "Security Eng" }, emoji: "🛡️" },
    ],
  },
  {
    name: { zh: "小红书爆款文案", en: "Viral Social Post" },
    desc: { zh: "选题 → 标题 → 正文 → 标签，产出一篇可直接发的小红书笔记", en: "Topic → hook → body → tags: a ready-to-post note" },
    steps: [
      { role: "marketing/marketing-growth-hacker", name: { zh: "增长黑客", en: "Growth Hacker" }, emoji: "🚀" },
      { role: "marketing/marketing-content-creator", name: { zh: "内容创作者", en: "Content Creator" }, emoji: "✍️" },
    ],
  },
  {
    name: { zh: "会议纪要整理", en: "Meeting Notes" },
    desc: { zh: "清理 → 决策 / TODO / 争议三视角并行 → 整合成结构化纪要", en: "Clean up → decisions / TODOs / disputes → structured minutes" },
    steps: [
      { role: "operations/operations-chief-of-staff", name: { zh: "幕僚长", en: "Chief of Staff" }, emoji: "📋" },
      { role: "product/product-manager", name: { zh: "产品经理", en: "Product Manager" }, emoji: "🧭" },
    ],
  },
  {
    name: { zh: "OKR 拆解", en: "OKR Breakdown" },
    desc: { zh: "现状分析 → 季度 KR → 行动方案 → 完整 OKR 文档", en: "Status → quarterly KRs → action plan → full OKR doc" },
    steps: [
      { role: "operations/operations-chief-of-staff", name: { zh: "战略幕僚", en: "Strategist" }, emoji: "🎯" },
      { role: "product/product-manager", name: { zh: "产品经理", en: "Product Manager" }, emoji: "🧭" },
    ],
  },
];

/** 演示模式工作流列表(静态快照，标 private=false，file 用 demo:// 占位，不可真跑)。 */
export function demoWorkflows(lang: "zh" | "en"): Workflow[] {
  return DEMO_WORKFLOWS.map((w, i) => ({
    file: `demo://${i}`,
    filename: `${w.name.en.toLowerCase().replace(/\s+/g, "-")}.yaml`,
    name: w.name[lang],
    description: w.desc[lang],
    inputs: [],
    steps: w.steps.map((s, j) => ({ id: `step_${j + 1}`, role: s.role, name: s.name[lang], emoji: s.emoji })),
    private: false,
  }));
}
