/**
 * OpenAI Compatible Connector
 * 支持 DeepSeek、智谱、通义、Moonshot 等兼容 OpenAI 格式的 API
 */
import type { LLMConnector, LLMResult, LLMConfig } from '../types.js';

export class OpenAICompatibleConnector implements LLMConnector {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    // 去掉末尾的 /
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');

    if (!this.apiKey) {
      throw new Error('缺少 API Key，请通过参数或环境变量传入');
    }
  }

  async chat(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens || 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };
  }
}
