/**
 * openai-compatible 连接器「首字节/停顿超时」单测。
 * 起一个本地 server：接受请求但全程不吐数据（模拟 provider 卡死 / 0 token）。
 * 断言连接器在 stallMs 窗口内快速失败，且错误带 stalled + noContent 标记——
 * 而不是干等到总超时（这正是用户踩到的 22 分钟 0-token 卡死的修复）。
 */
import { createServer, type Server } from 'node:http';
import { OpenAICompatibleConnector } from '../src/connectors/openai-compatible.js';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }

console.log('\n─── connector 停顿超时 ───');

// 模式：'silent' = 接受后不发任何数据；'partial-then-silent' = 先发一点 content 再卡住
function makeServer(mode: 'silent' | 'partial-then-silent'): Promise<{ server: Server; url: string }> {
  return new Promise((res) => {
    const server = createServer((req, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (mode === 'partial-then-silent') {
        // >200 字符的部分内容，触发连接器的「断点续写」路径
        const long = '内容'.repeat(160); // 320 个汉字
        response.write(`data: {"choices":[{"delta":{"content":"${long}"}}]}\n\n`);
      }
      // 之后永不结束、永不再写 → 模拟卡死
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      res({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

process.env.AO_STREAM_STALL_MS = '400'; // 测试用极短停顿窗口

// 1) 全程 0 token：应在 ~400ms 内抛出 stalled + noContent
{
  const { server, url } = await makeServer('silent');
  const conn = new OpenAICompatibleConnector({ apiKey: 'test', baseUrl: url });
  const t0 = Date.now();
  let errAny: any = null;
  try {
    await conn.chat('sys', 'user', { provider: 'deepseek', model: 'x', timeout: 10_000 } as any);
  } catch (e) { errAny = e; }
  const elapsed = Date.now() - t0;
  assert(!!errAny, '0-token 卡死会抛错');
  assert(errAny?.stalled === true, '错误带 stalled 标记');
  assert(errAny?.noContent === true, '错误带 noContent 标记（0 token）');
  assert(elapsed < 3000, `在停顿窗口内快速失败（${elapsed}ms，远小于 10s 总超时）`);
  server.close();
}

// 2) 先发部分内容再卡住：关键保证是「不会干等到总超时」（停顿检测在续写各轮都生效）。
//    连接器收到 >200 字符会自动续写、重试同一卡死 server，最终要么返回已累计内容、要么抛错带 partial，
//    但每一轮都被 stall 快速打断 → 总耗时远小于 10s 总超时。
{
  const { server, url } = await makeServer('partial-then-silent');
  const conn = new OpenAICompatibleConnector({ apiKey: 'test', baseUrl: url });
  const t0 = Date.now();
  let result: any = null, errAny: any = null;
  try {
    result = await conn.chat('sys', 'user', { provider: 'deepseek', model: 'x', timeout: 10_000 } as any);
  } catch (e) { errAny = e; }
  const elapsed = Date.now() - t0;
  assert(elapsed < 8000, `有部分内容时也不干等总超时（${elapsed}ms < 10s）`);
  const gotPartial = (typeof result?.content === 'string' && result.content.length > 200)
    || (typeof errAny?.partialContent === 'string' && errAny.partialContent.length > 200);
  assert(gotPartial, '已生成的部分内容被保留（返回或附在错误上）');
  server.close();
}

delete process.env.AO_STREAM_STALL_MS;
console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
