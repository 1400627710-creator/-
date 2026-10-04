# Community 安全模型

Community 不依靠“隐藏按钮、密钥、域名锁、代码混淆”保护 Studio。

真正的边界是：**Studio 核心代码根本不随 Community 发布。**

公开版浏览器只能获得 Community 专用的卡牌编辑器、词条检索、项目分享和 PNG 导出代码。即使完整复制 Community 源码，也无法从中恢复未部署的 Master Template 编辑器、Schema、Preflight、AI Provider、专业生产流水线等 Studio 模块。

## 本地数据

Community 不需要账号或 API Key。卡牌、底图和当前项目的共创词条默认保存在浏览器 IndexedDB；只有用户主动导出时才产生 `.cscard`、PNG 或词条投稿 JSON。

## 外部读取

- `file://` 直接打开：不主动发起网络请求。
- `http://` / `https://` 部署：只允许应用代码读取同源 `shared-glossary.json`。
- 在线词条读取在后台执行，有超时和大小边界，失败不阻塞主编辑器。

## 共创项目边界

`.cscard` 不是任意 JSON 容器。导入时会检查格式、版本、项目大小、卡牌数、模块结构、词条数量和图片 Data URL 类型。

项目底图只接受 PNG / JPEG / WebP Base64；不接受 SVG、外部图片 URL、脚本内容或未知 Data URL。界面中可能进入 `innerHTML` 的词条字段均经过 HTML 转义，颜色也限制为十六进制颜色。

## 共享词条

正式共享词条使用公开只读的 `shared-glossary.json`。Community 不具备把匿名修改直接写回正式词条仓库的能力；共创词条只能主动导出并交给 Studio 审核。
