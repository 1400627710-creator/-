# CardStudio Community 1.4.0

优先使用 [在线社区版](https://cardstudio-community-hub.tells-route3b.chatgpt.site/community/)。下载版解压后打开 index.html；离线制卡不需要 Node 或 npm。

顶部词条库和素材库分别有公共、我的、投稿状态。公共库读取线上完整设计和图片；在我的资料里创建词条或添加图片，登录后提交给私人版审核。私人版采用并发布后，两版直接取得同一公共内容。下载版提交会打开在线投稿窗口，登录后恢复资料并确认提交。

选择卡面文字模块后，词条可“用到当前卡”。图片可直接插入卡面。已有项目保留使用过的词条和图片；刷新公共库不会自动改写作品。断网使用缓存并明确显示连接失败。

首次正式发布前，公共库为空。用户私人项目不会自动上传；管理员需在 Studio beta7 打开原项目并主动发布。

项目使用 .cscard，离线词条 JSON 和素材 .csassets 保留为备份；原 1.2/1.3 项目与格式继续兼容。浏览器自动保存只属于当前地址与浏览器，跨设备请导出项目。

## 开发检查

使用 Node 22 以上，执行 npm ci、npm run check。浏览器回归执行 npx playwright install chromium、npm run check:browser，检查项目、完整设计、图片容量和离线 PNG。测试只模拟公共 API 的空目录，不访问生产投稿服务。完整服务验证源码见 ../cardstudio-public-repository/tests/。

[本版日志](CHANGELOG-1.4.0.md)。图片支持 15MB 内 PNG/JPG/WebP；我的素材总量 120MB、最多 1000 项。线上投稿有身份和频率保护，错误时保留原资料并明确提示。
