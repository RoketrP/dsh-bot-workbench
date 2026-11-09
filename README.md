# DeepSeek Bot Workbench

[English](README.en.md) · 中文

DeepSeek Harness 社区扩展：为个人 Bot 提供任务卡、逐项验收、明确交接和中断执行核对。

**开发中的 alpha，尚未发布，也尚未申请市场收录。** 当前代码的运行验证状态见 [验证记录](docs/verification.md)。首版目标宿主为 `0.2.2-rc.1`。

## 功能

- 持久 Bot 职责，通过 Harness 原生角色预设运行。
- 任务目标、验收项、模型提交证据与用户验收分别记录。
- 明确填写的交接内容；不会自动复制其他 Bot 的私有记忆。
- 中断运行停在结果待核对，不自动重放不确定操作。
- 通过原生 Schedule 设置执行计划，停止、暂停与验收分开处理。
- Bot 私有记忆；模型只能提议，确认后才用于后续上下文。

以上为当前实现范围，不能据此推断已完成所有运行验证。电脑需保持运行；工作区和记忆划分不是账号或文件访问隔离。模型提供的引用仍需人工核对。

## 开发

需要 Node.js >=24.9.0。使用与声明一致的 Harness 版本。

```sh
npm ci --ignore-scripts
npm run check
mkdir -p dist
npm run pack:plugin
```

安装步骤、桌面版本证据和截图将在真实宿主验收后补齐。开发数据使用独立 `DSH_HOME`，不修改个人配置；不要把凭据或会话数据提交到仓库。

## 设计与来源

[实施决策](docs/decisions.md) · [许可证](LICENSE) · [第三方说明](THIRD_PARTY_NOTICES.md)

本项目使用 Harness 公开 API。研究了 DSH-Bot 的公开扩展模式并保留署名。两个项目没有隶属或官方关系。
