# CardStudio Community 架构边界

Community 的目标只有三项：**简洁、共创、高效**。

## 主链路

`卡牌列表 → 卡面直接编辑 → 可选词条检索 → .cscard 分享 / PNG 导出`

Community 是独立静态应用，不依赖 Studio 的 Node 服务，也不包含 AI Provider、Master Template 编辑器、Schema、Preflight、专业印刷、TTS、Release 等生产代码。

## 数据层

- 卡牌与当前项目的共创词条：浏览器 IndexedDB + `.cscard`
- 正式共享词条：只读 `cardstudio-glossary-v1`
- 底图：项目内安全栅格 Data URL，导出 `.cscard` 时按资源引用去重

## 公开/私有边界

Community 公开的是“使用模板与完成卡牌”的能力，不公开 Studio 用来制造模板、维护完整项目结构、发布生产包和连接外部 AI 的内部工具链。

两个版本共享的是稳定词条数据格式，而不是完整应用代码。
