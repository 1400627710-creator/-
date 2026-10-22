# 卡递本地版构建源码

基于统一版 1.0.3，原始源代码快照 d7b532f7cb266845723895a145e15396f787ef9f。
本地版不会修改原线上部署。云端部署身份配置未放入交付包。

日常使用请打开压缩包根目录的 HTML，无需构建。

## 重建

安装源项目依赖后运行 `pnpm run build:local`。需要 Node 22.13 或更新版本、pnpm 与 Python 3。
生成文件：`local/dist/CardStudio-Local.html`。
源码中的 ui/engines.mjs 已生成，构建本地版无需重新生成旧引擎。

## 本次文件调整

- local/local-service.mjs：IndexedDB 本机项目、导入预览、事务保存、版本保护、30 次历史快照。
- local/sha256.mjs：导入指纹，在无 Web Crypto 的上下文中提供 SHA-256 兼容实现。
- local/ui-extra.mjs：复制原文与指令给 GPT、粘贴 JSON、引文核验后确认归档。
- local/prepare-local.py：由统一 UI 生成本地入口，移除 RPC 和远程项目 API 依赖，接入本机存储。
- local/index.html、local/main.mjs：本地入口与界面；由 prepare-local.py 生成。
- local/vite.config.mjs：把编辑器及依赖构建为单一 IIFE。
- local/finish-local.mjs：内联样式与编码后的应用，生成无需外部资源的 HTML，并验证 JS 语法。
- local/self-check.mjs、local/vite.qa.config.mjs：使用独立数据库的 13 项浏览器存储检查。
- package.json：新增 build:local 构建命令。

完整编辑器引擎和业务模型沿用原统一版；测试使用合成资料，未打包浏览器中的项目数据。
