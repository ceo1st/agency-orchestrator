/**
 * Claude API Connector
 */
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConnector, LLMResult, LLMConfig } from '../types.js';

export class ClaudeConnector implements LLMConnector {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      // SDK 默认 maxRetries=2，会在 executor 的重试之外再静默重试，叠加成最多 ~18 次且不可见。
      // 重试/退避统一由 executor 负责，这里关掉 SDK 自带重试。
      maxRetries: 0,
    });

    if (!this.client.apiKey) {
      throw new Error(
        '缺少 ANTHROPIC_API_KEY\n' +
        '请设置环境变量: export ANTHROPIC_API_KEY=your-key\n' +
        '或在 workflow YAML 中配置'
      );
    }
  }

  async chat(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResult> {
    // executor 传入的 config.timeout 是 ms（每次重试会递增）。SDK 默认仅 10min，会无视该配置；
    // 这里把它作为单请求 timeout 传给 SDK。timeout=0/未设（不限时）→ 不传，退回 SDK 默认。
    const requestTimeout = config.timeout && config.timeout > 0 ? config.timeout : undefined;
    const response = await this.client.messages.create(
      {
        // 供应商专有参数（如 thinking 预算）铺底，核心字段随后覆盖
        ...(config.params ?? {}),
        model: config.model!,
        max_tokens: config.max_tokens || 4096,
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      },
      requestTimeout !== undefined ? { timeout: requestTimeout } : undefined,
    );

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n');

    return {
      content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
