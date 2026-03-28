/**
 * OpenClaw CLI Connector
 * 通过本地 `openclaw` CLI 调用，支持 OAuth 和 API key 多种认证方式
 *
 * 安装: npm install -g openclaw@latest
 * 认证: openclaw onboard --install-daemon（引导配置）
 */
import { CLIBaseConnector } from './cli-base.js';
import type { LLMConfig } from '../types.js';

export class OpenClawCLIConnector extends CLIBaseConnector {
  constructor() {
    super({
      command: 'openclaw',
      displayName: 'OpenClaw CLI',
      buildArgs: (prompt: string, _config: LLMConfig) => {
        return ['agent', '--message', prompt];
      },
    });
  }
}
