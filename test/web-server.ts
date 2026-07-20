/**
 * web/server.js 冒烟测试：启真实服务，验证关键端点路由 + 安全守卫(路径穿越/越权)。
 * 不需要 LLM——只打不依赖模型的端点。server.js 不在 tsc/其余测试覆盖内，这是它唯一的自动化网。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
  });
}

async function post(base: string, path: string, body: unknown): Promise<number> {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.status;
}

console.log('\n─── web/server.js 冒烟 ───');

const port = await freePort();
const dataDir = mkdtempSync(join(tmpdir(), 'ao-web-test-'));
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess | null = null;

try {
  server = spawn(process.execPath, [resolve('web/server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AO_NODE: process.execPath, AO_DATA_DIR: dataDir, AO_USER_ROLES_DIR: join(dataDir, 'my-roles') },
    stdio: 'ignore',
  });

  // 等健康
  let up = false;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) { up = true; break; } } catch { /* not up yet */ }
    await sleep(250);
  }
  assert(up, '服务启动且 /api/health 返回 200');

  if (up) {
    // ── 基本端点 ──
    const health = await (await fetch(base + '/api/health')).json();
    assert(!!health.version, '/api/health 含 version');

    const roles = await (await fetch(base + '/api/roles')).json();
    assert(Array.isArray(roles) && roles.length > 0, `/api/roles 返回非空数组(${roles.length})`);

    const cfg = await (await fetch(base + '/api/config')).json();
    assert(cfg && typeof cfg.providers === 'object', '/api/config 含 providers');

    const wfs = await (await fetch(base + '/api/workflows')).json();
    assert(Array.isArray(wfs), '/api/workflows 返回数组');

    // ── 安全守卫(最关键) ──
    assert(await post(base, '/api/run', { file: '../../../../etc/passwd' }) === 403, '/api/run 路径穿越 → 403');
    assert(await post(base, '/api/run', { file: 'workflows/__nonexistent__.yaml' }) === 404, '/api/run 不存在文件 → 404');
    assert(await post(base, '/api/run', {}) === 400, '/api/run 缺 file → 400');
    assert(await post(base, '/api/compare', { file: '../../../../etc/passwd' }) === 403, '/api/compare 路径穿越 → 403');
    const yamlTraversal = (await fetch(base + '/api/workflows/yaml?file=' + encodeURIComponent('../../../../etc/passwd'))).status;
    assert(yamlTraversal === 403, '/api/workflows/yaml 路径穿越 → 403');

    // ── SPA 兜底(#81)：非 /api 的深层路由必须返回前端 HTML，不能白屏 / 报栈 ──
    const spa = await fetch(base + '/studio/some/deep/route');
    const spaCt = spa.headers.get('content-type') || '';
    assert(spa.ok && spaCt.includes('text/html'), `SPA 深层路由返回 HTML(${spa.status})`);

    // ── 可编辑画布 graph 端点 ──
    assert((await fetch(base + '/api/workflows/graph?file=' + encodeURIComponent('../../../../etc/passwd'))).status === 403, '/api/workflows/graph 路径穿越 → 403');
    assert(await post(base, '/api/workflows/graph', { nodes: [] }) === 400, '/api/workflows/graph 空 nodes → 400');

    const baseYaml = 'name: t\nagents_dir: agency-agents-zh\nllm:\n  provider: deepseek\n  model: deepseek-chat\nsteps:\n  - id: a\n    role: x/y\n    task: t1\n';
    // 合法图：a → b，应保存成功
    const okBody = {
      name: 'canvas-test', baseYaml,
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { id: 'a', role: 'x/y', task: 't1' } },
        { id: 'b', position: { x: 200, y: 0 }, data: { id: 'b', role: 'x/y', task: 't2' } },
      ],
      edges: [{ id: 'a->b', source: 'a', target: 'b' }],
    };
    const graphSave = await fetch(base + '/api/workflows/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(okBody) });
    assert(graphSave.status === 200, '/api/workflows/graph 合法图 → 200 保存');
    const savedFile: string = graphSave.status === 200 ? (await graphSave.json()).file : '';
    // QA #6：缺 edges 数组 → 400（不静默清空依赖）
    assert(await post(base, '/api/workflows/graph', { name: 't', baseYaml, nodes: okBody.nodes }) === 400, '/api/workflows/graph 缺 edges → 400');
    // QA #14：节点缺 role → 400
    const rolelessBody = { name: 't', baseYaml, edges: [], nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { id: 'a', task: 't1' } }] };
    assert(await post(base, '/api/workflows/graph', rolelessBody) === 400, '/api/workflows/graph 节点缺 role → 400');
    // 但 approval / human_input 节点无 role 是合法形态，不能被 QA #14 守卫误杀
    const approvalBody = {
      name: 'canvas-approval-ok', baseYaml, edges: [{ id: 'a->gate', source: 'a', target: 'gate' }],
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { id: 'a', role: 'x/y', task: 't1', output: 'out_a' } },
        { id: 'gate', position: { x: 200, y: 0 }, data: { id: 'gate', type: 'approval', prompt: '确认继续？' } },
      ],
    };
    const approvalSave = await fetch(base + '/api/workflows/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(approvalBody) });
    assert(approvalSave.status === 200, '/api/workflows/graph approval 节点无 role → 200 可保存');
    if (approvalSave.status === 200) {
      const f = (await approvalSave.json()).file;
      await fetch(base + '/api/workflows?file=' + encodeURIComponent(f), { method: 'DELETE' });
    }
    // 成环：a → b → a，validateWorkflow 应拒
    const cycleBody = { ...okBody, edges: [{ id: 'a->b', source: 'a', target: 'b' }, { id: 'b->a', source: 'b', target: 'a' }] };
    assert(await post(base, '/api/workflows/graph', cycleBody) === 400, '/api/workflows/graph 成环 → 400 被校验拦截');
    // #91：变量名对但缺依赖边（b 用 {{out_a}} 却没连 a→b）→ 保存时确定性补边，200 + autoFixes
    const missingEdgeBody = {
      name: 'canvas-autofix-test', baseYaml,
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { id: 'a', role: 'x/y', task: 't1', output: 'out_a' } },
        { id: 'b', position: { x: 200, y: 0 }, data: { id: 'b', role: 'x/y', task: 'use {{out_a}}', output: 'out_b' } },
      ],
      edges: [],
    };
    const fixSave = await fetch(base + '/api/workflows/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(missingEdgeBody) });
    const fixBody = fixSave.status === 200 ? await fixSave.json() : { autoFixes: [] };
    assert(fixSave.status === 200, '/api/workflows/graph 缺依赖边 → 200 自动补边保存(#91)');
    assert(Array.isArray(fixBody.autoFixes) && fixBody.autoFixes.length === 1 && fixBody.autoFixes[0].step === 'b' && fixBody.autoFixes[0].addedDep === 'a', 'autoFixes 返回补边明细 b←a');
    if (fixBody.file) await fetch(base + '/api/workflows?file=' + encodeURIComponent(fixBody.file), { method: 'DELETE' });

    // ── 用户工作流删除 DELETE /api/workflows（#92）──
    const del = (file: string) => fetch(base + '/api/workflows?file=' + encodeURIComponent(file), { method: 'DELETE' });
    assert((await del('../../../../etc/passwd')).status === 403, 'DELETE /api/workflows 路径穿越 → 403');
    const builtin = (wfs as Array<{ file: string; private?: boolean }>).find((w) => !w.private)?.file;
    if (builtin) assert((await del(builtin)).status === 403, 'DELETE /api/workflows 内置模板 → 403 不可删');
    if (savedFile) {
      const listed = (await (await fetch(base + '/api/workflows')).json()) as Array<{ file: string; private?: boolean; deletable?: boolean; mtime?: number }>;
      const mine = listed.find((w) => w.file === savedFile);
      assert(!!mine && mine.private === true && mine.deletable === true && typeof mine.mtime === 'number', '用户工作流带 private/deletable/mtime 标记');
      assert((await del(savedFile)).status === 200, 'DELETE /api/workflows 用户工作流 → 200 删除');
      assert((await del(savedFile)).status === 404, 'DELETE /api/workflows 已删文件再删 → 404');
    }

    // ── 我的角色（用户自建）POST/DELETE /api/roles/my ──
    assert(await post(base, '/api/roles/my', { name: '测试专家' }) === 400, 'POST /api/roles/my 缺 systemPrompt → 400');
    const createRes = await fetch(base + '/api/roles/my', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '测试专家', description: '一句话描述', systemPrompt: '你是一位测试专家。' }) });
    const created = await createRes.json();
    assert(createRes.status === 200 && created.role === `my/${created.id}`, `POST /api/roles/my → 200 创建(${created.role})`);
    const rolesWithMy = (await (await fetch(base + '/api/roles')).json()) as Array<{ id: string; category: string; custom?: boolean; name: string }>;
    const myRole = rolesWithMy.find((r) => r.category === 'my' && r.id === created.id);
    assert(!!myRole && myRole.custom === true && myRole.name === '测试专家', '/api/roles 列表含「我的」分类且带 custom 标记');
    const detail = await (await fetch(base + `/api/roles/my/${created.id}`)).json();
    assert(detail.content === '你是一位测试专家。', 'GET /api/roles/my/:id 返回 system prompt 正文');
    const upd = await fetch(base + `/api/roles/my/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '测试专家改', systemPrompt: '你是改过的测试专家。' }) });
    assert(upd.status === 200 && (await upd.json()).name === '测试专家改', 'PUT /api/roles/my/:id → 200 编辑');
    const updDetail = await (await fetch(base + `/api/roles/my/${created.id}`)).json();
    assert(updDetail.name === '测试专家改' && updDetail.content === '你是改过的测试专家。' && updDetail.description === '一句话描述', 'PUT 字段级合并:改了名字与正文,没传的描述保留');
    assert((await fetch(base + '/api/roles/my/nope-xyz', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 404, 'PUT 不存在的角色 → 404');
    assert((await fetch(base + '/api/roles/my/..%2F..%2Fetc%2Fpasswd', { method: 'DELETE' })).status === 403, 'DELETE /api/roles/my 路径穿越 → 403');
    assert((await fetch(base + `/api/roles/my/${created.id}`, { method: 'DELETE' })).status === 200, 'DELETE /api/roles/my/:id → 200 删除');
    assert((await fetch(base + `/api/roles/my/${created.id}`, { method: 'DELETE' })).status === 404, 'DELETE 已删角色再删 → 404');

    // ── 多语言角色库(roleLibs / ?lang=<libId>) ──
    const cfgLibs = (await (await fetch(base + '/api/config')).json()).roleLibs as Array<{ id: string; label: string }>;
    assert(Array.isArray(cfgLibs) && cfgLibs.some((l) => l.id === 'zh') && cfgLibs.some((l) => l.id === 'en'), '/api/config roleLibs 至少含 zh/en');
    if (cfgLibs.some((l) => l.id === 'ko')) {
      const koRoles = (await (await fetch(base + '/api/roles?lang=ko')).json()) as Array<{ id: string; name: string }>;
      assert(koRoles.length > 100, `?lang=ko 返回语言包角色(${koRoles.length})`);
      assert(koRoles.some((r) => r.id === 'marketing-coupang-seller'), 'ko 库含韩国市场原创角色');
    }
    const fallback = (await (await fetch(base + '/api/roles?lang=hax')).json()) as unknown[];
    assert(Array.isArray(fallback) && fallback.length > 0, '未知 lang 回落 zh 而不是报错');

    // ── 嵌套子目录角色(递归枚举 + 带斜杠 id 的详情) ──
    const zhRoles = (await (await fetch(base + '/api/roles')).json()) as Array<{ id: string; category: string }>;
    const nested = zhRoles.find((r) => r.id.includes('/'));
    assert(!!nested, `角色列表含嵌套子目录角色(${zhRoles.length} 总数)`);
    if (nested) {
      const nd = await (await fetch(base + `/api/roles/${encodeURIComponent(nested.category)}/${encodeURIComponent(nested.id)}`)).json();
      assert(!!nd.content, '嵌套角色详情(带 %2F 的 id) → 200 + 正文');
    }

    // ── 报告导出 /api/export ──
    assert(await post(base, '/api/export', { format: 'docx' }) === 400, '/api/export 缺 markdown → 400');
    assert(await post(base, '/api/export', { markdown: '# x', format: 'rtf' }) === 400, '/api/export 非法格式 → 400');
    const expDocx = await fetch(base + '/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', format: 'docx', name: '测试报告' }) });
    assert(expDocx.status === 200 && (expDocx.headers.get('content-type') || '').includes('wordprocessingml'), `/api/export docx → 200 + docx mime(${expDocx.status})`);
    const expSkill = await fetch(base + '/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# plan', format: 'skill', name: 's' }) });
    const skillText = await expSkill.text();
    assert(expSkill.status === 200 && skillText.startsWith('---\nname:'), '/api/export skill → 200 + frontmatter');
  }
} finally {
  if (server) server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
