// Cloudflare Pages Function —— 静态站「用样例实测提示词」轻功能,代理到 Agnes,key 不进前端。
// 路由：POST /api/prompt/test  。需在 CF Pages 设机密 AGNES_API_KEY。
const CAP = 6000;
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost({ request, env }) {
  const key = env.AGNES_API_KEY;
  if (!key) return json({ error: "本站未配置免费额度(AGNES_API_KEY 未设置)" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const prompt = String(body?.prompt || "");
  if (!prompt.trim()) return json({ error: "prompt required" }, 400);
  const testInput = String(body?.testInput || "");
  if (prompt.length + testInput.length > CAP) return json({ error: `输入过长(演示限 ${CAP} 字)` }, 413);

  const mode = body?.mode === "system" ? "system" : "user";
  const system = mode === "system" ? prompt : "You are a helpful assistant.";
  const user = mode === "system" ? (testInput || "（请按你的设定给一个示例回应）") : (testInput ? `${prompt}\n\n---\n${testInput}` : prompt);
  const base = (env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
  const ALLOWED = ["agnes-2.0-flash", "agnes-1.5-flash"];
  const reqModel = String(body?.model || "");
  const model = ALLOWED.includes(reqModel) ? reqModel : (env.AGNES_MODEL || "agnes-2.0-flash");

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 2048 }),
    });
  } catch (e) {
    return json({ error: "upstream fetch failed: " + (e?.message || e) }, 502);
  }
  if (!res.ok) return json({ error: `upstream ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502);
  const data = await res.json();
  const output = String(data?.choices?.[0]?.message?.content || "").trim();
  return json({ output });
}
