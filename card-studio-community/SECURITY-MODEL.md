# Community 安全模型

Community 不依靠“隐藏按钮、密钥、域名锁、代码混淆”保护 Studio。

真正的边界是：**Studio 核心代码根本不随 Community 发布。**

公开版浏览器只能获得 Community 专用的卡牌编辑器、词条检索、项目分享和 PNG 导出代码。即使完整复制 Community 源码，也无法从中恢复未部署的 Master Template 编辑器、Schema、Preflight、AI Provider、专业生产流水线等 Studio 模块。

## 本地数据

Community 不需要账号或 API Key。卡牌、底图和当前项目的共创词条默认保存在浏览器 IndexedDB；只有用户主动导出时才产生 `.cscard`、PNG 或词条投稿 JSON。

## 外部读取

- `file://` 直接打开：不主动发起网络请求。
- 独立 `http://` / `https://` 部署：读取同源 `shared-glossary.json`。
- 从 Studio 打开：读取页面声明的同源 `/api/glossary`；点击投稿按钮后才向同源 `/api/glossary/contributions` 提交自己的词条。没有任意外部接口地址或凭据设置。
- 在线词条读取在后台执行，有超时和大小边界，失败不阻塞主编辑器。

## 共创项目边界

`.cscard` 不是任意 JSON 容器。导入时会检查格式、版本、项目大小、卡牌数、模块结构、词条数量和图片 Data URL 类型。

项目底图只接受 PNG / JPEG / WebP Base64；不接受 SVG、外部图片 URL、脚本内容或未知 Data URL。界面中可能进入 `innerHTML` 的词条字段均经过 HTML 转义，颜色也限制为十六进制颜色。

## 共享词条

正式共享词条在 Community 中只读。投稿进入私人版独立待审队列或导出为 JSON，须在 Studio 预览、确认合并并再次发布。相同投稿去重；异常字段、重复 ID/名称、超过 5000 条或 5MB 的内容明确拒绝。词条文件仅保留白名单设计字段，不传递卡牌、素材、密钥或私人项目结构。
