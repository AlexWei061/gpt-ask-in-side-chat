# 侧边对话助手

在 ChatGPT 对话中选中文字，打开独立的浮动窗口继续提问。扩展使用你配置的模型接口，并为每个 ChatGPT 对话保存独立的本地侧边对话记录。

## 功能

- 引用 ChatGPT 用户或助手消息中的文字，在侧边窗口中提问、继续追问。
- 拖动、调整窗口大小、最小化，并在刷新后恢复窗口与对话记录。
- 流式显示回答，支持 Markdown、代码块和数学公式。
- 发送时附带当前页面可读取的对话与附件；无法读取附件时可重新选择文件或跳过。
- 支持文本文件、可提取文字的 PDF，以及模型支持的图片输入。
- 检查上下文预算，超出限制时提示，也可手动启用旧上下文压缩。

## 安装

需要 Chrome，以及满足 `^20.19.0 || >=22.12.0` 的 Node.js 和 npm。

在项目根目录运行：

```bash
npm ci
npm run build
```

1. 在 Chrome 地址栏打开 `chrome://extensions/`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择项目中的 `dist/` 文件夹。
4. 打开或刷新已有的 ChatGPT 对话页面。

修改源码后，重新运行 `npm run build`，在扩展管理页点击扩展的刷新按钮，再刷新 ChatGPT 页面。

## 配置模型

首次安装会打开设置页；也可以从扩展的选项页或侧边窗口中的「设置」进入。

1. 阅读并同意数据使用说明。
2. 填写接口地址（Base URL）、模型名称、上下文窗口和 API 密钥。
3. 如果所选模型支持图片输入，勾选对应选项。
4. 点击「保存并授权接口访问」，授予所配置接口的访问权限。
5. 点击「测试连接」。

接口需要兼容流式 Chat Completions 协议。Base URL 应形如 `https://provider.example/v1`，扩展会自动追加 `/chat/completions`；示例地址仅用于说明格式。远程接口必须使用 HTTPS，本机的 `localhost` 和 `127.0.0.1` 可以使用 HTTP。

API 密钥仅保存在当前 Chrome 会话中，浏览器会话结束后可能需要重新填写。请按所选模型的实际能力填写上下文窗口和图片支持选项。

## 使用

1. 打开 `https://chatgpt.com/c/<会话 ID>` 形式的已有对话。
2. 选中一段用户或助手消息，点击「在侧栏中提问」。
3. 输入问题并发送，回答会显示在浮动窗口中。
4. 可以直接输入后续问题，也可以重新选择文字作为新的引文。

每个 ChatGPT 对话的侧边记录独立保存。窗口中可以清空当前记录，设置页中可以清空全部侧边对话记录或忘记本次会话的 API 密钥。

## 开发与验证

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 构建扩展到 `dist/` |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test:run` | 运行单元测试 |
| `npm test` | 以监听模式运行单元测试 |
| `npm run verify` | 依次执行类型检查、单元测试和构建 |
| `npm run e2e` | 构建测试版本并运行 Chromium 端到端测试 |
| `npm run package` | 构建生产版本并生成 ZIP 安装包 |

首次运行浏览器测试前，安装 Playwright 使用的 Chromium：

```bash
npx playwright install chromium
npm run e2e
```

端到端测试会向 `dist/` 写入专用测试权限。测试结束后，运行 `npm run build` 恢复生产构建，或直接运行 `npm run package` 生成生产安装包。

安装包输出到 `release/side-chat-companion-<版本号>.zip`，版本号取自 `public/manifest.json`。

## 目录

```text
src/background/  模型请求、设置、权限与加密历史记录
src/content/     页面读取、附件处理和浮动窗口
src/options/     扩展设置页
src/shared/      类型、消息协议与公共定义
public/         扩展清单、设置页入口与图标
scripts/        构建、图标生成和打包脚本
test/           单元测试与页面样例
e2e/            浏览器端到端测试
docs/           隐私说明、商店文案与设计文档
```

`.gitignore` 排除依赖、构建结果、发布包、测试报告、本地环境配置和系统元数据。`teach/` 没有被忽略；新文件需要加入 Git 并提交后才会随推送上传。

## 数据与限制

- 发送问题时，当前页面可读取的对话、引文、侧边历史及附件会直接发送到你配置的模型服务商。扩展没有开发者后端，也不收集使用统计。
- 侧边对话记录使用 AES-GCM 加密后保存在当前浏览器的 IndexedDB 中，不提供跨设备同步。
- 只读取当前页面中可访问的消息，不保证包含尚未加载或被页面隐藏的历史内容；目前会话识别限于 `/c/<会话 ID>` 路径。
- 单个附件最大为 20 MiB。PDF 仅提取已有文字，不提供扫描件 OCR。

更多说明见 [隐私政策](docs/privacy-policy.md)、[商店发布检查表](docs/chrome-web-store-checklist.md)和[商店介绍草稿](docs/chrome-web-store-listing.md)。本扩展是独立项目，与 OpenAI 无隶属关系。
