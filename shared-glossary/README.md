# 离线词条快照（兼容用途）

当前在线词条与素材由 [公共资料服务](https://cardstudio-community-hub.tells-route3b.chatgpt.site/community/) 持久化保存。Studio Beta 7 发布与审核后，Community 1.4.0 直接读取线上版本，无需编辑 GitHub JSON。

此目录的 glossary.json、Community/shared-glossary.json 与 glossary-data.js 保留旧格式离线快照和备份兼容。sync-glossary.mjs 可继续校验三份快照一致；当前初始快照为空，不能把它误当作线上目录。

Beta 6 的本机 shared-data 和下载社区包只属于同机/文件传递，未完成独立设备的在线互通。本次已更正：[使用与自查记录](../card-studio/CONNECTED-REPOSITORY-VERIFICATION-2026-10-05.md)。

离线维护：node shared-glossary/sync-glossary.mjs /path/to/shared-glossary.json；校验：node shared-glossary/sync-glossary.mjs --check。脚本仅提取词条白名单字段，不要提交私人项目或密钥。
