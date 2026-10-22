# 卡递本地版构建源码 1.1

以 GPT 初始版 1.0 中的 1.0.3-local.1 为基础。规范源码位于 legacy、lib、ui、local；ui/engines.mjs 为构建生成文件，不随源码归档。

在上层目录安装 cardstudio 依赖后执行 `node scripts/build-workbenches.mjs`，可生成两个可运行入口。
单独重建卡递：本目录执行 `pnpm run build:local`，输出 local/dist/CardStudio-Local.html。
该命令会先生成引擎，修复原源码缺少生成步骤的缺陷。运行需要 Node 22.13+ 与 Python 3。

`local/main.mjs` 与 `local/index.html` 从统一 UI 和本地适配源码生成，请修改 prepare-local.py、适配文件或统一规范源码。
共用逻辑位于上层 shared 目录。字段范围、手动互通、模板与词条变更说明见上层 docs/更新与自检报告.md。

单元与服务检查：`pnpm test`。真实 IndexedDB 检查由上层 scripts/build-self-check.mjs 生成独立页面。
测试不访问真实浏览器项目。旧插件快照不属于本地版本的发布更新。
