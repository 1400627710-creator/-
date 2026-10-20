# 卡递统一工作台 · 源码交接

**状态：尚未解决。** 用户在对话中仍频繁看到“无法打开 打开卡递统一工作台”。这份源码对应线上 1.0.3，不代表窗口故障已经修复。

- 原始源码提交：`d7b532f7cb266845723895a145e15396f787ef9f`。
- 完整应用源码、原编辑器、随附第三方依赖、迁移脚本、构建配置和测试均已保留。
- 先看 [窗口故障交接](docs/OPENING-FAILURE.md)，再看 [此前检查记录](docs/verification.md)。
- [关键接入修改差异](docs/startup-fixes-since-1.0.1.patch) 可直接对照 1.0.1 至 1.0.3 的修改。
- [文件校验表](SOURCE-MANIFEST.json) 逐文件记录原始路径、字节数和 SHA-256；应用源码与原提交逐字节一致。

这次只整理源码和交接资料；没有更改或重新发布线上应用，也没有导出用户正式项目、数据库、素材上传记录或浏览器本机档案。

## 公开交接

用户在 2026-10-20 明确授权将本项目源代码公开到原 GitHub 仓库，供任何人查看。本次只增加 `cardstudio-unified/` 源码目录，不更改原有项目，也不修改线上应用。

## 先看哪些文件

| 文件 | 查看内容 |
|---|---|
| `lib/mcp.ts` | 打开工具、资源声明、UI 元数据、资源读取、应用内部调用及日志 |
| `ui/main.mjs` | 消息监听、ui/initialize、数据通道、编辑器载入与 uiReady |
| `lib/ui-surface.mjs` | 网站/插件区分、JSON-RPC 响应识别 |
| `ui/index.html` | 窗口入口、连接失败提示、登录与插件链接 |
| `app/workbench/route.ts`、`scripts/prepare-ui.mjs` | 网站 HTML 与 MCP HTML 的生成与标记 |
| `lib/store.ts`、`app/api/service/route.ts` | 平台身份检查和私人数据读写 |
| `tests/connection.test.mjs` | 窗口接入检查；不等同于真实 ChatGPT 窗口验收 |

## 本机检查（供会编程的协作者）

需要 Node.js >=22.13、Python 3、项目的 pnpm 依赖。仓库使用 Vinext、Vite、Cloudflare 本地存储与 Sites 构建集成。预览使用本机开发身份/演示空间，不能代替真实 ChatGPT 身份和窗口。

```bash
npm run install:ci
npm run build:ui
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run dev
```

跨机器重新生成 UI 后，`lib/workbench-html.mjs` 是生成结果；请优先检查 `ui/` 和 `scripts/` 源码。原生产平台的登录、插件连接、D1/R2 绑定无法仅靠下载源码复制到另一台机器。

下载包不包含 4 张旧浏览器自检截图、node_modules、构建缓存、密钥或生产数据；4 张截图仅属于检查文档，不是运行依赖。GitHub 目录保留原始完整跟踪树；此前下载包包含其全部程序源码。说明和校验表是本次新增交接文件。
