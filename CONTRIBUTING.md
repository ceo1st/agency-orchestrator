# Contributing to Agency Orchestrator

感谢你对本项目的关注！欢迎通过以下方式参与贡献。

## 贡献方式

### 提交 Bug 报告
- 使用 [GitHub Issues](https://github.com/jnMetaCode/agency-orchestrator/issues) 提交
- 包含：工作流 YAML、错误信息、Node.js 版本、操作系统

### 提交工作流模板
- 在 `workflows/` 目录中添加新的 YAML 工作流
- 确保所引用的角色在 [agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) 中存在
- 运行 `ao validate your-workflow.yaml` 确认无误

### 新增 LLM Connector
- 在 `src/connectors/` 中实现 `LLMConnector` 接口
- 在 `src/index.ts` 的 `run()` 函数中注册 provider
- 添加对应的测试

### 改进代码
- Fork 仓库并创建功能分支
- 确保 `npm test` 全部通过
- 提交 Pull Request

## 开发环境

```bash
git clone https://github.com/jnMetaCode/agency-orchestrator.git
cd agency-orchestrator
npm install
npm run dev    # TypeScript watch mode
npm test       # 运行测试
```

## 代码规范

- TypeScript strict mode
- ESM（所有 import 使用 `.js` 扩展名）
- 中文注释，英文 API

## 提交规范

```
feat: 新增 Zhipu connector
fix: 修复可选输入模板崩溃
docs: 更新 README 示例
```

## License

贡献内容将按 Apache-2.0 许可证发布。
