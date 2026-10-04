# -
对于原创的卡牌设计系统开发

## 当前版本与入口

| 内容 | 版本 | 入口 |
| --- | --- | --- |
| 在线社区版及公共资料库 | Community 1.4.0 | [直接制卡、查看词条与素材](https://cardstudio-community-hub.tells-route3b.chatgpt.site/community/) |
| Community 公开源码 | 1.4.0 | [源码及开发说明](card-studio-community/README.md) |
| 私人 Studio | 3.0.0 Beta 7 | [更新日志](card-studio/changelogs/CHANGELOG-3.0.0-beta7.md)，核心保持私有 |
| 公共资料服务 | 1.0.0 | [接口、迁移和回归检查](cardstudio-public-repository/README.md) |
| 本轮自查 | 2026-10-05 | [使用与实际验证范围](card-studio/CONNECTED-REPOSITORY-VERIFICATION-2026-10-05.md) |
| 历史程序 | 2.3.0 | [历史说明](card-studio/README.md) |

[下载 Community 1.4.0 ZIP](releases/CardStudio-Community-1.4.0.zip)，解压打开 index.html 即可离线制卡。普通用户无需 Node 或 npm。

私人版在顶部词条库、素材库连接管理员，从“我的”直接发布词条或图片，也可批量发布词条。社区登录后提交同类资料，私人版从“待审核”预览并采用；发布后独立电脑读取同一份线上内容。下载版投稿会打开在线窗口带入资料，登录后恢复并确认提交。

公共库首次为空，因为用户项目属于自己的电脑，不会自动公开。管理员主动发布原项目中的真实设计后，所有客户端可以读取。已采用的词条和图片保留在本地项目中，不随公共更新自动变更。

更正：Beta 6 / Community 1.3.0 的 shared-data 和 JSON/ZIP 通道只支持本机或文件传递，此前把它描述为在线互通不准确。`shared-glossary/` 保留离线快照兼容，不承担当前线上仓库职责。[开发总记录](card-studio/DEVELOPMENT-LOG.md)。
