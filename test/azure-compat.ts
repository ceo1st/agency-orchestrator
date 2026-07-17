/**
 * 测试 OpenAI 兼容连接器的 Azure 兼容（issue #38）
 * Azure 的 gpt 模型只认 max_completion_tokens + api-key header。
 */
import http from 'node:http';
import { OpenAICompatibleConnector } from '../src/connectors/openai-compatible.js';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void {
  if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; }
}

console.log('\n─── OpenAI 兼容连接器 · Azure 兼容 (#38) ───');

let captured: { body: any; headers: any } | null = null;
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    captured = { body: JSON.parse(b), headers: req.headers };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
const port = (srv.address() as any).port;

const az = new OpenAICompatibleConnector({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/azure` });
assert(az.isAzure === true, 'azure base_url 识别为 Azure');
await az.chat('s', 'u', { provider: 'openai', model: 'gpt-4o', max_tokens: 100 });
assert(captured !== null && 'max_completion_tokens' in captured!.body, 'Azure 用 max_completion_tokens');
assert(captured !== null && !('max_tokens' in captured!.body), 'Azure 不再发 max_tokens');
assert(captured !== null && captured!.headers['api-key'] === 'k', 'Azure 带 api-key header');

const oa = new OpenAICompatibleConnector({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1` });
assert(oa.isAzure === false, '普通端点不判为 Azure');
await oa.chat('s', 'u', { provider: 'openai', model: 'gpt-4o', max_tokens: 100 });
assert(captured !== null && 'max_tokens' in captured!.body, '普通端点仍用 max_tokens');
assert(captured !== null && captured!.headers['api-key'] === undefined, '普通端点不带 api-key header');

// 环境变量显式覆盖（非 Azure 也能用 max_completion_tokens，覆盖 o系列推理模型）
process.env.AO_OPENAI_TOKENS_PARAM = 'max_completion_tokens';
const ov = new OpenAICompatibleConnector({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1` });
await ov.chat('s', 'u', { provider: 'openai', model: 'o1', max_tokens: 100 });
assert(captured !== null && 'max_completion_tokens' in captured!.body, 'AO_OPENAI_TOKENS_PARAM 覆盖生效');
delete process.env.AO_OPENAI_TOKENS_PARAM;

// 供应商专有参数透传（#90）：params 原样并入请求体，但不能覆盖核心字段
const pp = new OpenAICompatibleConnector({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1` });
await pp.chat('s', 'u', {
  provider: 'deepseek', model: 'deepseek-reasoner', max_tokens: 100,
  params: { reasoning_effort: 'high', top_p: 0.9, stream: false, model: '不许覆盖' },
});
assert(captured !== null && captured!.body.reasoning_effort === 'high', 'params.reasoning_effort 透传进请求体 (#90)');
assert(captured !== null && captured!.body.top_p === 0.9, 'params.top_p 透传进请求体');
assert(captured !== null && captured!.body.stream === true, 'params 不能覆盖 stream（流式解析保护）');
assert(captured !== null && captured!.body.model === 'deepseek-reasoner', 'params 不能覆盖 model');

srv.close();
console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
