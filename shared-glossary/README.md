# 卡递词条快照

“再生”来自用户规则 v0.4，保留完整定义、来源和待明确的细节。新版卡递从旧浏览器保存与旧项目增量收录有效词条，空项目不清空“我的”。

线上来源：https://cardstudio-community-hub.tells-route3b.chatgpt.site/api/repository/catalog

`node shared-glossary/sync-glossary.mjs` 校验快照；传入词条 JSON 可增量合并，不修改项目或线上仓库，不按名称覆盖不同设计。日常共享只需卡递顶部词条库“共享”，不必使用 Git 或脚本。
