/**
 * CLI Connector 通用基类
 * 通过本地 AI CLI 工具调用，使用用户的订阅���度，无需 API key
 *
 * 支持: Claude Code / Gemini CLI / Copilot CLI / Codex CLI
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LLMConnector, LLMResult, LLMConfig } from '../types.js';

const execFileAsync = promisify(execFile);

export interface CLIConnectorConfig {
  /** CLI 命令名 */
  command: string;
  /** 显示名称（用于错误消���） */
  displayName: string;
  /** 构建命令行参数 */
  buildArgs: (fullPrompt: string, config: LLMConfig) => string[];
  /** 从 stdout 提取内容（默认 trim） */
  parseOutput?: (stdout: string) => string;
}

export class CLIBaseConnector implements LLMConnector {
  constructor(private cfg: CLIConnectorConfig) {}

  async chat(systemPrompt: string, userMessage: string, config: LLMConfig): Promise<LLMResult> {
    const fullPrompt = systemPrompt
      ? `<system>\n${systemPrompt}\n</system>\n\n${userMessage}`
      : userMessage;

    const args = this.cfg.buildArgs(fullPrompt, config);
    const timeout = config.timeout || 180000;

    try {
      const { stdout } = await execFileAsync(this.cfg.command, args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });

      const content = this.cfg.parseOutput
        ? this.cfg.parseOutput(stdout)
        : stdout.trim();

      return {
        content,
        usage: {
          input_tokens: Math.ceil((systemPrompt.length + userMessage.length) / 4),
          output_tokens: Math.ceil(content.length / 4),
        },
      };
    } catch (err: any) {
      if (err.killed || err.signal === 'SIGTERM') {
        throw new Error(`${this.cfg.displayName} 超时 (${timeout}ms)`);
      }
      throw new Error(`${this.cfg.displayName} 调用失败: ${err.message}`);
    }
  }
}
