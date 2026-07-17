/**
 * OpenAI Compatible Connector
 * 支持 DeepSeek、智谱、通义、Moonshot 等兼容 OpenAI 格式的 API
 *
 * 默认使用 streaming 模式，避免长生成任务被服务端 60s 超时断开（DeepSeek 等常见问题）
 */
import type { LLMConnector, LLMResult, LLMConfig } from '../types.js';

/** 估算 token 数：CJK 字符按 1.5 token/char，ASCII 按 0.25 token/char */
function estimateTokens(text: string): number {
  let cjk = 0, ascii = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) cjk++; else ascii++;
  }
  return Math.ceil(cjk * 1.5 + ascii / 4);
}

/** 构造「停顿中断」错误，带 stalled / noContent 标记，供 executor 给精准提示（不再首推增大超时）。 */
function makeStallError(stallMs: number, contentLen: number, partial?: string): Error {
  const secs = Math.max(1, Math.round(stallMs / 1000));
  const detail = contentLen === 0
    ? `provider ${secs}s 内未返回任何内容（0 token，多半输入过大或服务端卡住）`
    : `provider 停顿超过 ${secs}s 未继续输出`;
  const err = new Error(`stream stalled: ${detail}`);
  (err as { stalled?: boolean }).stalled = true;
  (err as { noContent?: boolean }).noContent = contentLen === 0;
  if (partial) (err as { partialContent?: string }).partialContent = partial;
  process.stderr.write(`\n  ⏱️  ${detail}，已主动中断（可调 AO_STREAM_STALL_MS）\n`);
  return err;
}

export class OpenAICompatibleConnector implements LLMConnector {
  private apiKey: string;
  /** 只读暴露给外部 debug / 测试用，运行时不可变 */
  readonly baseUrl: string;
  /** Azure OpenAI 端点：用 `api-key` header + `max_completion_tokens`（与原生 OpenAI 不同）。issue #38 */
  readonly isAzure: boolean;

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    // 去掉末尾的 /
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
    this.isAzure = /\.azure\.com|azure/i.test(this.baseUrl);

    if (!this.apiKey) {
      throw new Error('缺少 API Key，请通过参数或环境变量传入');
    }
  }

  /**
   * token 上限参数名。Azure 的 gpt 模型（及 OpenAI o系列推理模型）只认 `max_completion_tokens`，
   * 老式 `max_tokens` 会被拒。Azure 自动切换；其它端点可用 AO_OPENAI_TOKENS_PARAM 显式覆盖。issue #38
   */
  private get tokenParam(): 'max_tokens' | 'max_completion_tokens' {
    if (process.env.AO_OPENAI_TOKENS_PARAM === 'max_completion_tokens') return 'max_completion_tokens';
    return this.isAzure ? 'max_completion_tokens' : 'max_tokens';
  }

  async chat(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResult> {
    const maxContinuations = 3;  // 最多续写 3 次
    let fullContent = '';

    try {
    for (let continuation = 0; continuation <= maxContinuations; continuation++) {
      // 构建消息：首次用原始 prompt，续写时追加已有内容让模型接着写
      const messages: Array<{role: string; content: string}> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];
      if (continuation > 0 && fullContent) {
        messages.push(
          { role: 'assistant', content: fullContent },
          { role: 'user', content: '你的回答被中断了，请从中断处继续写完，不要重复已写的内容。' },
        );
      }

      const fetchTimeout = config.timeout || 300_000;
      // 首字节/停顿超时：provider 迟迟不吐数据（输入过大 / 服务端卡死）时快速失败，
      // 而不是干等到总超时（可被动态抬到 20+ 分钟）。可用 AO_STREAM_STALL_MS 覆盖；不超过总超时。
      // 覆盖「等响应头」+「读 body」全程：连响应头都不来也能在 stallMs 内中断（不只 token 间隙）。
      const stallMs = Math.min(Number(process.env.AO_STREAM_STALL_MS) || 90_000, fetchTimeout);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeout);
      const abortState = { stalled: false };
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const armStall = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => { abortState.stalled = true; controller.abort(); }, stallMs);
      };
      const clearStall = () => clearTimeout(stallTimer);
      armStall(); // 从发起请求就开始计时（覆盖「等响应头」阶段）

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            // Azure 用 api-key header 鉴权（Bearer 仅 AAD token 时有效）
            ...(this.isAzure ? { 'api-key': this.apiKey } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            // 供应商专有参数（thinking/reasoning 档位等）先铺底，核心字段随后覆盖——
            // params 永远不能改掉 model/stream/messages，避免把流式解析搞挂
            ...(config.params ?? {}),
            model: config.model!,
            [this.tokenParam]: config.max_tokens || 4096,
            ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
            stream: true,
            messages,
          }),
        });
      } catch (err) {
        clearTimeout(timer);
        clearStall();
        // 等响应头阶段就被停顿检测中断（provider 连头都不发）
        if (abortState.stalled) {
          throw makeStallError(stallMs, 0);
        }
        const url = `${this.baseUrl}/chat/completions`;
        const hint = !this.apiKey
          ? '\n  可能原因: 未设置 API Key，请检查环境变量（DEEPSEEK_API_KEY 或 OPENAI_API_KEY）或 .env 配置'
          : `\n  可能原因: 无法连接 ${this.baseUrl}，请检查 base_url 是否正确、网络是否可达`;
        throw new Error(`请求失败: ${url}\n  ${err instanceof Error ? err.message : err}${hint}`);
      }

      if (!response.ok) {
        clearTimeout(timer);
        clearStall();
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
      }

      let streamResult: { content: string; finishReason: string | null };
      try {
        // armStall 在 readStream 收到每段字节时被调用以重置停顿计时
        streamResult = await this.readStream(response, { onData: armStall });
      } catch (err) {
        clearTimeout(timer);
        clearStall();
        const partial = (err as any).partialContent as string | undefined;
        // 断点续写：拿到 >200 字符部分内容就续写（停顿中断也算，下一轮会重新计时）
        if (partial && partial.length > 200) {
          fullContent += partial;
          process.stderr.write(`  🔄 断点续写 (${continuation + 1}/${maxContinuations})，已累计 ${fullContent.length} 字符...\n`);
          continue;
        }
        // 停顿中断且无可用部分内容 → 抛精准 stall 错误（带 noContent，供 executor 给对的提示）
        if (abortState.stalled) {
          throw makeStallError(stallMs, fullContent.length, fullContent.length > 200 ? fullContent : undefined);
        }
        const streamErr = new Error(`streaming terminated (已收到 ${fullContent.length} 字符): ${err instanceof Error ? err.message : err}`);
        (streamErr as any).partialContent = fullContent.length > 200 ? fullContent : undefined;
        throw streamErr;
      } finally {
        clearTimeout(timer);
        clearStall();
      }

      fullContent += streamResult.content;
      // 干净结束但命中 max_tokens 上限（finish_reason=length）→ 自动续写，避免静默截断
      if (streamResult.finishReason === 'length' && continuation < maxContinuations) {
        process.stderr.write(`  🔄 输出达 max_tokens 上限，自动续写 (${continuation + 1}/${maxContinuations})，已累计 ${fullContent.length} 字符...\n`);
        continue;
      }
      break;
    }
    } catch (err) {
      // 续写循环中途若遇到非流式错误（如某轮 fetch 失败 / 503），前面已累计的 fullContent
      // 会随错误抛出而丢失。这里把已生成内容附在错误上，让 executor 的最后兜底仍能保留它。
      // （流式中断路径已自带 partialContent；取两者较长者，避免覆盖更完整的内容。）
      if (fullContent.length > 200) {
        const existing = (err as any)?.partialContent as string | undefined;
        if (!existing || existing.length < fullContent.length) {
          (err as any).partialContent = fullContent;
        }
      }
      throw err;
    }

    return {
      content: fullContent,
      usage: {
        // 流式模式下 usage 在最后一个 chunk，已在 readStream 中尝试提取
        // 兜底用字符估算（CJK 字符 ≈ 1-2 token，英文 ≈ 0.25 token/char）
        input_tokens: estimateTokens(systemPrompt + userMessage),
        output_tokens: estimateTokens(fullContent),
      },
    };
  }

  /**
   * 读取 SSE 流并拼接内容
   * 格式: data: {"choices":[{"delta":{"content":"token"}}]}\n\n
   * 结束: data: [DONE]\n\n
   */
  private async readStream(
    response: Response,
    opts?: { onData?: () => void },
  ): Promise<{ content: string; finishReason: string | null }> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let content = '';
    let buffer = '';
    let finishReason: string | null = null;
    let lastProgressTime = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        opts?.onData?.();  // 连接还在产出字节，重置外层停顿计时

        buffer += decoder.decode(value, { stream: true });

        // 每 10 秒显示接收进度，让用户知道没卡死
        const now = Date.now();
        if (now - lastProgressTime > 10_000 && content.length > 0) {
          lastProgressTime = now;
          process.stderr.write(`  📡 已生成 ${content.length} 字...\n`);
        }

        // 按行解析 SSE
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // 最后一行可能不完整，留到下次

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);  // 去掉 "data: "
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            // 检查流式错误响应
            if (chunk.error) {
              throw new Error(`API stream error: ${chunk.error.message || JSON.stringify(chunk.error)}`);
            }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) content += delta;
            const fr = chunk.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
          } catch (e) {
            // 重新抛出 API 错误，忽略 JSON 解析失败
            if (e instanceof Error && e.message.startsWith('API stream error')) throw e;
          }
        }
      }
    } catch (err) {
      reader.cancel().catch(() => {});  // 释放连接资源
      // 流被服务端断开（DeepSeek ~60s 超时）或被外层停顿检测 abort。
      // 始终抛出错误让 chat 判断（停顿 / 部分内容），部分内容附在 error 上供兜底。
      const streamErr = new Error(`streaming terminated (已收到 ${content.length} 字符): ${err instanceof Error ? err.message : err}`);
      (streamErr as { partialContent?: string }).partialContent = content.length > 200 ? content : undefined;
      process.stderr.write(`\n  ⚠️  流式连接中断 (${err instanceof Error ? err.message : err})，已收到 ${content.length} 字符\n`);
      throw streamErr;
    }

    reader.cancel().catch(() => {});  // 正常结束也释放 reader
    return { content, finishReason };
  }
}
