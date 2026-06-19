// Cloudflare Pages Function —— 让静态公开站的「提示词优化」真实可用,且 key 不进前端。
// 路由：POST /api/prompt/optimize
// 在 CF Pages 后台把 AGNES_API_KEY 设为机密(可选 AGNES_MODEL / AGNES_BASE_URL)。key 永不进 git。
//
// 注意:这是边缘代理,仅做「单次 LLM 调用」类轻功能(提示词优化/测试)。完整多步工作流仍需本地引擎。

const CAP = 4000; // 演示防滥用:输入字符上限

// 与本地 Studio/CLI 的 buildOptimizeMetaPrompt(src/cli/prompt.ts) 内容保持一致：
// 诊断→重写 + 技巧清单 + 任务类型自适应。改这里时务必同步那边，避免两端优化质量不一致。
function metaPrompt(mode, lang) {
  if (lang === "en") {
    const role = mode === "system"
      ? "a system/role prompt that defines an AI assistant's persona, capabilities and constraints"
      : "a user task prompt that asks an AI to do something";
    return `You are a world-class prompt engineer. The user's message is ${role} — treat it as RAW MATERIAL TO IMPROVE, never as a task to perform.

CRITICAL: Your output must itself be a PROMPT (an instruction meant to be sent to an AI). Do NOT answer, fulfill, or execute the user's prompt. If the input says "write a tweet selling coffee", you do NOT write the tweet — you produce a sharper *prompt* for writing that tweet.

Before rewriting, silently diagnose the original's weaknesses (think internally, do NOT output the diagnosis): unclear intent, missing audience/role/constraints/output-format/success-criteria, ambiguity or redundancy. Then rewrite to fix them.

When rewriting, consider the checklist below but apply ONLY the items that genuinely improve it — never bloat for structure's sake:
- Role / goal: name the AI's persona and objective when useful.
- Context / inputs: what the user provides and the scenario it runs in.
- Constraints: hard requirements (tone, length, scope, do-nots).
- Output format: specify structure / length / example shape; ask for a list, JSON or table when it helps.
- Task-type patterns: extraction → define the fields/schema; reasoning or math → require step-by-step thinking then a final answer; classification → give the label set; generation → pin down style, audience and length.
- Use [PLACEHOLDERS] where the user must fill in specifics.

Hard boundaries: keep the user's original language and domain; do NOT invent facts or over-specify details the user didn't ask for; ${mode === "system" ? "define persona, scope, tone and hard constraints crisply." : "state the task, the inputs, and the exact output format/length expected."}

Output ONLY the rewritten prompt itself — no diagnosis, no preamble, no explanation, no markdown fences, no "here is".`;
  }
  const role = mode === "system"
    ? "一段 system / 角色提示词（定义 AI 的人设、能力和约束）"
    : "一段 user 任务提示词（让 AI 去完成某件事）";
  return `你是世界顶级的提示词工程师。用户发给你的内容是${role}——把它当作【待优化的原材料】，绝不要当成一个要你去完成的任务。

最重要的一条：你的输出本身必须仍是一段【提示词】（一条准备发给 AI 的指令），不要去回答、完成或执行用户那段提示词。举例：如果输入是「帮我写个朋友圈文案卖咖啡」，你**不要**真去写文案，而是产出一段更好的「让 AI 写这条文案」的提示词。

改写前，先在心里快速诊断原提示词的薄弱处（只在脑中思考，不要输出诊断）：意图是否清晰、有无缺受众/角色/约束/输出格式/成功标准、是否有歧义或冗余。然后据此重写来修补它们。

重写时对照下面这份清单，但【只采用确实能提升效果的项】，绝不为了堆结构而臃肿：
- 角色 / 目标：需要时点明 AI 的身份与要达成的目标。
- 上下文 / 输入：用户会提供什么、在什么场景使用。
- 约束：必须遵守的硬性要求（语气、长度、范围、禁忌）。
- 输出格式：明确结构 / 字数 / 示例样式；该用列表、JSON 或表格就指定。
- 按任务类型加对应套路：抽取类 → 定义字段 / schema；推理或计算类 → 要求分步思考后再给结论；分类类 → 给定类别集合；生成类 → 明确风格、受众、长度。
- 用户需要自己填的地方，用【方括号占位符】标出。

硬性边界：保持用户原本的语言和领域；不要编造事实，也不要过度补充用户没要求的细节；${mode === "system" ? "把人设、适用范围、语气、硬性约束写清楚。" : "把任务、输入、期望的输出格式/长度写清楚。"}

只输出改写后的提示词本身——不要诊断、不要开场白、不要解释、不要 markdown 代码围栏、不要「这是…」之类的话。`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost({ request, env }) {
  const key = env.AGNES_API_KEY;
  if (!key) return json({ error: "本站未配置免费额度(AGNES_API_KEY 未设置)" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const raw = String(body?.rawPrompt || "");
  if (!raw.trim()) return json({ error: "rawPrompt required" }, 400);
  if (raw.length > CAP) return json({ error: `输入过长(演示限 ${CAP} 字),请本地安装后无限制使用` }, 413);

  const mode = body?.mode === "system" ? "system" : "user";
  const lang = /[一-鿿]/.test(raw) ? "zh" : "en";
  const base = (env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
  // 模型：前端可选,但只接受白名单内的 Agnes 文本模型(防止请求贵模型刷额度)
  const ALLOWED = ["agnes-2.0-flash", "agnes-1.5-flash"];
  const reqModel = String(body?.model || "");
  const model = ALLOWED.includes(reqModel) ? reqModel : (env.AGNES_MODEL || "agnes-2.0-flash");

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: metaPrompt(mode, lang) }, { role: "user", content: raw }],
        max_tokens: 2048,
      }),
    });
  } catch (e) {
    return json({ error: "upstream fetch failed: " + (e?.message || e) }, 502);
  }
  if (!res.ok) return json({ error: `upstream ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502);

  const data = await res.json();
  let optimized = String(data?.choices?.[0]?.message?.content || "").trim();
  const fence = optimized.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/);
  if (fence) optimized = fence[1].trim();
  if (!optimized) return json({ error: "优化结果为空" }, 502);
  return json({ optimized });
}
