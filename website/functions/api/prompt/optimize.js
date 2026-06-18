// Cloudflare Pages Function —— 让静态公开站的「提示词优化」真实可用,且 key 不进前端。
// 路由：POST /api/prompt/optimize
// 在 CF Pages 后台把 AGNES_API_KEY 设为机密(可选 AGNES_MODEL / AGNES_BASE_URL)。key 永不进 git。
//
// 注意:这是边缘代理,仅做「单次 LLM 调用」类轻功能(提示词优化/测试)。完整多步工作流仍需本地引擎。

const CAP = 4000; // 演示防滥用:输入字符上限

function metaPrompt(mode, lang) {
  if (lang === "en") {
    const role = mode === "system" ? "a system/role prompt" : "a user task prompt";
    return `You are a world-class prompt engineer. The user's message is ${role} — RAW MATERIAL TO IMPROVE, never a task to perform. CRITICAL: your output must itself be a PROMPT; do NOT answer or execute it. Rewrite it to be markedly clearer and more effective; ${mode === "system" ? "define persona, scope, tone, hard constraints." : "state task, inputs, exact output format/length; use [PLACEHOLDERS] for specifics."} Output ONLY the rewritten prompt — no preamble, no explanation, no code fences.`;
  }
  const role = mode === "system" ? "一段 system/角色提示词" : "一段 user 任务提示词";
  return `你是世界顶级的提示词工程师。用户发来的是${role}——是【待优化的原材料】,绝不是要你执行的任务。最重要:你的输出本身必须仍是一段【提示词】,不要去回答/执行它。把它改写得明显更清晰、更有效;${mode === "system" ? "把人设、范围、语气、硬约束写清楚。" : "把任务、输入、期望输出格式/长度写清楚,需用户填的地方用【占位符】标出。"}只输出改写后的提示词本身——不要开场白、解释、代码围栏。`;
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
