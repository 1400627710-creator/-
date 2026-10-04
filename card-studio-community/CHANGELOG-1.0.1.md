# CardStudio Community 1.0.1

这是 1.0.0 的稳定性与安全修复版，不增加复杂功能。

## 已修复

- 修复 `.modal { display:grid }` 覆盖 HTML `hidden` 状态，导致词条库和共创词条编辑器启动即显示。
- 新增全局 `[hidden]{display:none!important}` 作为 UI 隐藏契约。
- 启动前后主动关闭所有临时 UI，确保默认入口永远是制卡主界面。
- 词条库为空时不再制造“必须先发布词条”的暗示；词条属于可选增强能力。
- 词条导出改称“我的词条投稿”，与正式发布概念分离。
- 项目导入限制底图为 `data:image/*`，降低恶意/异常 URL 注入面。
- 词条颜色仅接受 `#RRGGBB`。
- 新增 `stability-check.mjs`，检查启动状态、同源网络边界、私有能力泄漏和词条 JSON 结构。

## 验证原则

1. 启动不打开任何词条/项目弹窗。
2. `shared-glossary.json` 为空仍能制卡。
3. 本地 `file://` 模式不联网。
4. 公开版只允许网页部署时读取同源 `shared-glossary.json`。
5. 公开包不包含 AI、API Key、Master Template 或 Studio 生产代码。
